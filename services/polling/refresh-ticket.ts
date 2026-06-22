import type { Prisma, TicketPriority, TicketSystem } from "@prisma/client";
import { buildExternalLinksJson } from "@/lib/external-links";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/utils";
import { detectTicketChanges, type TicketChange } from "@/services/change-detection";
import {
  buildIntegrationAuthContext,
  IntegrationAuthRequiredError
} from "@/services/integrations/auth-context";
import { adapterFor } from "@/services/integrations/registry";
import type { NormalizedTicket } from "@/services/integrations/types";
import { notifyTicketChanges } from "@/services/notifications";
import { calculateRisk } from "@/services/risk";

type LinkedSystem = {
  system: TicketSystem;
  externalId: string;
};

export async function createPollingJobForTicket(ticketId: string, intervalMinutes?: number) {
  const interval = intervalMinutes ?? Number(process.env.POLLING_INTERVAL_MINUTES ?? 60);

  return prisma.pollingJob.upsert({
    where: { jobKey: `ticket:${ticketId}` },
    update: {
      status: "ACTIVE",
      intervalMinutes: interval,
      nextRunAt: new Date(Date.now() + interval * 60_000)
    },
    create: {
      ticketId,
      jobKey: `ticket:${ticketId}`,
      status: "ACTIVE",
      intervalMinutes: interval,
      nextRunAt: new Date(Date.now() + interval * 60_000)
    }
  });
}

export async function refreshTrackedTicket(ticketId: string) {
  const ticket = await prisma.trackedTicket.findUnique({
    where: { id: ticketId },
    include: {
      owner: {
        include: {
          notificationPreference: true,
          externalCredentials: true
        }
      }
    }
  });

  if (!ticket) {
    throw new Error(`Tracked ticket ${ticketId} not found`);
  }

  const linkedSystems = getLinkedSystems(ticket);
  const normalizedTickets: NormalizedTicket[] = [];
  const changes: TicketChange[] = [];
  const failures: string[] = [];

  for (const linkedSystem of linkedSystems) {
    const adapter = adapterFor(linkedSystem.system);
    const credential = ticket.owner.externalCredentials.find((item) => item.system === linkedSystem.system);
    const context = await buildIntegrationAuthContext({
      userId: ticket.ownerId,
      system: linkedSystem.system,
      credential
    });

    try {
      await adapter.authenticate(context);

      const externalTicket = await adapter.fetchTicket(linkedSystem.externalId, context);
      const comments = await adapter.fetchComments(linkedSystem.externalId, context);
      const normalized = adapter.normalizeResponse({
        ...externalTicket,
        comments: comments.length > 0 ? comments : externalTicket.comments
      });
      normalizedTickets.push(normalized);

      const previous = await prisma.ticketSnapshot.findFirst({
        where: {
          ticketId: ticket.id,
          system: linkedSystem.system
        },
        orderBy: {
          fetchedAt: "desc"
        }
      });

      const detected = detectTicketChanges(previous, normalized);
      changes.push(...detected);

      await prisma.ticketSnapshot.create({
        data: {
          ticketId: ticket.id,
          system: linkedSystem.system,
          payload: normalized.payload as Prisma.InputJsonValue,
          normalized: normalized.normalized as Prisma.InputJsonValue,
          status: normalized.status,
          priority: normalized.priority,
          assignee: normalized.assignee,
          resolution: normalized.resolution,
          commentsHash: normalized.commentsHash,
          slaDueAt: normalized.slaDueAt ? new Date(normalized.slaDueAt) : null,
          dueDate: normalized.dueDate ? new Date(normalized.dueDate) : null
        }
      });
    } catch (error) {
      const failure = buildIntegrationFailure(linkedSystem.system, error);
      failures.push(failure.message);
      changes.push(failure);
    }
  }

  if (changes.length > 0) {
    await prisma.ticketEvent.createMany({
      data: changes.map((change) => ({
        ticketId: ticket.id,
        system: change.system,
        eventType: change.eventType,
        changedField: change.changedField,
        previousValue: change.previousValue,
        newValue: change.newValue,
        message: change.message
      }))
    });
  }

  const aggregate = aggregateTicketState(normalizedTickets, ticket);

  const updatedTicket = await prisma.trackedTicket.update({
    where: { id: ticket.id },
    data: {
      title: aggregate.title ?? ticket.title,
      status: aggregate.status,
      priority: aggregate.priority,
      assignee: aggregate.assignee,
      resolution: aggregate.resolution,
      slaDueAt: aggregate.slaDueAt,
      dueDate: aggregate.dueDate,
      externalLinks: ticket.externalLinks ?? buildExternalLinksJson(ticket),
      currentRisk: calculateRisk({
        priority: aggregate.priority,
        agingDays: daysBetween(ticket.createdAt),
        slaDueAt: aggregate.slaDueAt,
        status: aggregate.status
      }),
      lastSyncedAt: normalizedTickets.length > 0 ? new Date() : ticket.lastSyncedAt
    }
  });

  await prisma.pollingJob.updateMany({
    where: { ticketId: ticket.id },
    data: {
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + Number(process.env.POLLING_INTERVAL_MINUTES ?? 60) * 60_000),
      status: "ACTIVE",
      errorMessage: failures.length > 0 ? failures.join(" | ") : null
    }
  });

  if (changes.length > 0) {
    await notifyTicketChanges({
      ticket: updatedTicket,
      user: ticket.owner,
      changes
    });
  }

  return {
    ticket: updatedTicket,
    changes,
    failures
  };
}

export async function refreshDuePollingJobs(limit = 25) {
  const now = new Date();
  const jobs = await prisma.pollingJob.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }]
    },
    orderBy: {
      nextRunAt: "asc"
    },
    take: limit
  });

  const results = [];

  for (const job of jobs) {
    try {
      results.push(await refreshTrackedTicket(job.ticketId));
    } catch (error) {
      await prisma.pollingJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + job.intervalMinutes * 60_000),
          errorMessage: error instanceof Error ? error.message : "Unknown polling failure"
        }
      });
    }
  }

  return results;
}

function getLinkedSystems(ticket: {
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
}): LinkedSystem[] {
  return [
    ticket.jiraId ? { system: "JIRA" as TicketSystem, externalId: ticket.jiraId } : null
  ].filter(Boolean) as LinkedSystem[];
}

function aggregateTicketState(
  normalizedTickets: NormalizedTicket[],
  currentTicket: {
    title: string | null;
    priority: TicketPriority;
    status: string;
    assignee: string | null;
    resolution: string | null;
    slaDueAt: Date | null;
    dueDate: Date | null;
  }
) {
  const jira = normalizedTickets.find((ticket) => ticket.system === "JIRA");
  const bug = normalizedTickets.find((ticket) => ticket.system === "BUG_ORACLE");
  const support = normalizedTickets.find((ticket) => ticket.system === "SUPPORT_ORACLE");
  const primary = jira ?? bug ?? support;
  const priority = highestPriority(
    normalizedTickets.map((ticket) => normalizePriority(ticket.priority)).concat(currentTicket.priority)
  );

  return {
    title: readNormalizedTitle(jira) ?? currentTicket.title,
    status: primary?.status ?? currentTicket.status,
    priority,
    assignee: jira?.assignee ?? bug?.assignee ?? support?.assignee ?? currentTicket.assignee,
    resolution: jira?.resolution ?? bug?.resolution ?? support?.resolution ?? currentTicket.resolution,
    slaDueAt: firstDate(normalizedTickets.map((ticket) => ticket.slaDueAt)) ?? currentTicket.slaDueAt,
    dueDate: firstDate(normalizedTickets.map((ticket) => ticket.dueDate)) ?? currentTicket.dueDate
  };
}

function readNormalizedTitle(ticket?: NormalizedTicket) {
  const summary = ticket?.payload.summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

function buildIntegrationFailure(system: TicketSystem, error: unknown): TicketChange {
  const authRequired = error instanceof IntegrationAuthRequiredError;
  const message = authRequired
    ? `${formatSystem(system)} automatic sync needs an Oracle SSO/API token connection`
    : `${formatSystem(system)} automatic sync failed: ${error instanceof Error ? error.message : "Unknown error"}`;

  return {
    system,
    eventType: authRequired ? "INTEGRATION_AUTH_REQUIRED" : "INTEGRATION_FETCH_FAILED",
    changedField: "integration",
    previousValue: null,
    newValue: authRequired ? "AUTH_REQUIRED" : "FETCH_FAILED",
    message
  };
}

function normalizePriority(value?: string | null): TicketPriority {
  const normalized = value?.toUpperCase();

  if (normalized === "P1" || normalized === "BLOCKER") {
    return "BLOCKER";
  }

  if (normalized === "P2" || normalized === "CRITICAL") {
    return "CRITICAL";
  }

  if (normalized === "P3" || normalized === "HIGH") {
    return "HIGH";
  }

  if (normalized === "LOW") {
    return "LOW";
  }

  return "MEDIUM";
}

function highestPriority(values: TicketPriority[]): TicketPriority {
  const rank: Record<TicketPriority, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
    BLOCKER: 5
  };

  return values.reduce<TicketPriority>((highest, current) => (rank[current] > rank[highest] ? current : highest), "LOW");
}

function firstDate(values: Array<string | null | undefined>) {
  const dates = values.filter(Boolean).map((value) => new Date(value as string));

  if (dates.length === 0) {
    return null;
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())[0];
}

function formatSystem(system: TicketSystem) {
  switch (system) {
    case "SUPPORT_ORACLE":
      return "Oracle Support";
    case "BUG_ORACLE":
      return "Bug Oracle";
    case "JIRA":
      return "Oracle Jira";
    default:
      return system;
  }
}
