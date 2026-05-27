import type { Prisma, TicketPriority, TicketSystem } from "@prisma/client";
import type { BrowserContext } from "playwright";
import { buildExternalLinks, buildExternalLinksJson } from "@/lib/external-links";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/utils";
import { pageToExternalTicket, BrowserSsoRequiredError } from "@/services/browser-tracker/parser";
import { openOracleBrowserConnection } from "@/services/browser-tracker/session";
import { detectTicketChanges, type TicketChange } from "@/services/change-detection";
import { hashComments } from "@/services/integrations/hash";
import type { NormalizedTicket } from "@/services/integrations/types";
import { notifyTicketChanges } from "@/services/notifications";
import { calculateRisk } from "@/services/risk";

type LinkedBrowserTarget = {
  system: TicketSystem;
  externalId: string;
  url: string;
};

export async function refreshTrackedTicketWithBrowser(ticketId: string) {
  const connection = await openOracleBrowserConnection({ headless: process.env.BROWSER_HEADLESS === "true" });
  try {
    return await refreshTrackedTicketWithBrowserContext(ticketId, connection.context);
  } finally {
    await connection.close();
  }
}

export async function refreshDueBrowserJobs(limit = 10) {
  const jobs = await prisma.pollingJob.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }]
    },
    orderBy: { nextRunAt: "asc" },
    take: limit
  });

  if (jobs.length === 0) {
    return [];
  }

  const connection = await openOracleBrowserConnection({ headless: process.env.BROWSER_HEADLESS === "true" });
  const results = [];

  try {
    for (const job of jobs) {
      try {
        results.push(await refreshTrackedTicketWithBrowserContext(job.ticketId, connection.context));
      } catch (error) {
        await prisma.pollingJob.update({
          where: { id: job.id },
          data: {
            status: "ACTIVE",
            lastRunAt: new Date(),
            nextRunAt: new Date(Date.now() + job.intervalMinutes * 60_000),
            errorMessage: error instanceof Error ? error.message : "Unknown browser tracker failure"
          }
        });
      }
    }
  } finally {
    await connection.close();
  }

  return results;
}

async function refreshTrackedTicketWithBrowserContext(ticketId: string, context: BrowserContext) {
  const ticket = await prisma.trackedTicket.findUnique({
    where: { id: ticketId },
    include: {
      owner: {
        include: {
          notificationPreference: true
        }
      }
    }
  });

  if (!ticket) {
    throw new Error(`Tracked ticket ${ticketId} not found`);
  }

  const targets = getBrowserTargets(ticket);
  const normalizedTickets: NormalizedTicket[] = [];
  const changes: TicketChange[] = [];
  const failures: string[] = [];

  for (const target of targets) {
    const page = await context.newPage();
    try {
      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      const externalTicket = await pageToExternalTicket({
        page,
        system: target.system,
        id: target.externalId,
        webUrl: target.url
      });
      const normalized = normalizeBrowserTicket(externalTicket);
      normalizedTickets.push(normalized);

      const previous = await prisma.ticketSnapshot.findFirst({
        where: {
          ticketId: ticket.id,
          system: target.system
        },
        orderBy: { fetchedAt: "desc" }
      });

      const detected = detectTicketChanges(previous, normalized);
      changes.push(...detected);

      await prisma.ticketSnapshot.create({
        data: {
          ticketId: ticket.id,
          system: target.system,
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
      const failure = buildBrowserFailure(target.system, error);
      failures.push(failure.message);
      changes.push(failure);
    } finally {
      await page.close().catch(() => undefined);
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
      status: aggregate.status,
      priority: aggregate.priority,
      assignee: aggregate.assignee,
      resolution: aggregate.resolution,
      slaDueAt: aggregate.slaDueAt,
      dueDate: aggregate.dueDate,
      externalLinks: buildExternalLinksJson(ticket),
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
      nextRunAt: new Date(Date.now() + Number(process.env.BROWSER_WORKER_INTERVAL_MINUTES ?? process.env.POLLING_INTERVAL_MINUTES ?? 30) * 60_000),
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

  return { ticket: updatedTicket, changes, failures };
}

function getBrowserTargets(ticket: {
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
}): LinkedBrowserTarget[] {
  const links = buildExternalLinks(ticket);
  return [
    ticket.supportTicketId && links.supportOracle?.ticketUrl
      ? { system: "SUPPORT_ORACLE" as TicketSystem, externalId: ticket.supportTicketId, url: links.supportOracle.ticketUrl }
      : null,
    ticket.bugId && links.bugOracle?.ticketUrl
      ? { system: "BUG_ORACLE" as TicketSystem, externalId: ticket.bugId, url: links.bugOracle.ticketUrl }
      : null,
    ticket.jiraId && links.jira?.ticketUrl
      ? { system: "JIRA" as TicketSystem, externalId: ticket.jiraId, url: links.jira.ticketUrl }
      : null
  ].filter(Boolean) as LinkedBrowserTarget[];
}

function normalizeBrowserTicket(ticket: {
  id: string;
  system: TicketSystem;
  rawStatus: string;
  priority?: string | null;
  assignee?: string | null;
  resolution?: string | null;
  slaDueAt?: string | null;
  dueDate?: string | null;
  comments: Array<{ id: string; author: string; body: string; createdAt: string }>;
  payload: Record<string, unknown>;
  webUrl?: string;
}): NormalizedTicket {
  return {
    externalId: ticket.id,
    system: ticket.system,
    status: ticket.rawStatus,
    priority: ticket.priority,
    assignee: ticket.assignee,
    resolution: ticket.resolution,
    slaDueAt: ticket.slaDueAt,
    dueDate: ticket.dueDate,
    commentsHash: hashComments(ticket.comments),
    payload: ticket.payload,
    webUrl: ticket.webUrl,
    normalized: {
      status: ticket.rawStatus,
      priority: ticket.priority,
      assignee: ticket.assignee,
      resolution: ticket.resolution,
      slaDueAt: ticket.slaDueAt,
      dueDate: ticket.dueDate,
      commentCount: ticket.comments.length,
      webUrl: ticket.webUrl,
      source: "local-browser-session"
    }
  };
}

function aggregateTicketState(
  normalizedTickets: NormalizedTicket[],
  currentTicket: {
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

  return {
    status: primary?.status ?? currentTicket.status,
    priority: highestPriority(normalizedTickets.map((ticket) => normalizePriority(ticket.priority)).concat(currentTicket.priority)),
    assignee: jira?.assignee ?? bug?.assignee ?? support?.assignee ?? currentTicket.assignee,
    resolution: jira?.resolution ?? bug?.resolution ?? support?.resolution ?? currentTicket.resolution,
    slaDueAt: firstDate(normalizedTickets.map((ticket) => ticket.slaDueAt)) ?? currentTicket.slaDueAt,
    dueDate: firstDate(normalizedTickets.map((ticket) => ticket.dueDate)) ?? currentTicket.dueDate
  };
}

function buildBrowserFailure(system: TicketSystem, error: unknown): TicketChange {
  const ssoRequired = error instanceof BrowserSsoRequiredError;
  return {
    system,
    eventType: ssoRequired ? "BROWSER_SSO_REQUIRED" : "BROWSER_FETCH_FAILED",
    changedField: "browserSession",
    previousValue: null,
    newValue: ssoRequired ? "SSO_REQUIRED" : "FETCH_FAILED",
    message: ssoRequired
      ? `${formatSystem(system)} browser tracker needs you to complete Oracle unified login`
      : `${formatSystem(system)} browser tracker failed: ${error instanceof Error ? error.message : "Unknown error"}`
  };
}

function normalizePriority(value?: string | null): TicketPriority {
  const normalized = value?.toUpperCase();
  if (normalized === "P1" || normalized === "BLOCKER") return "BLOCKER";
  if (normalized === "P2" || normalized === "CRITICAL") return "CRITICAL";
  if (normalized === "P3" || normalized === "HIGH") return "HIGH";
  if (normalized === "LOW") return "LOW";
  return "MEDIUM";
}

function highestPriority(values: TicketPriority[]): TicketPriority {
  const rank: Record<TicketPriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, BLOCKER: 5 };
  return values.reduce<TicketPriority>((highest, current) => (rank[current] > rank[highest] ? current : highest), "LOW");
}

function firstDate(values: Array<string | null | undefined>) {
  const dates = values.filter(Boolean).map((value) => new Date(value as string));
  return dates.length > 0 ? dates.sort((a, b) => a.getTime() - b.getTime())[0] : null;
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
