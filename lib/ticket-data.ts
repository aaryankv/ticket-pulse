import type { Prisma, TicketSnapshot, TicketSystem } from "@prisma/client";
import { isDatabaseReachable } from "@/lib/database-status";
import { prisma } from "@/lib/prisma";
import { getLocalTicketDetails, isDatabaseUnavailable, listLocalTickets } from "@/lib/local-ticket-store";
import { demoMetrics, demoTickets, demoTimeline, findDemoTicket } from "@/lib/demo-data";
import { daysBetween } from "@/lib/utils";
import type { DashboardMetrics, DashboardTicket, SystemComment, SystemSnapshotDetail, TimelineItem } from "@/types/ticket";

export async function getDashboardData(userId?: string): Promise<{
  tickets: DashboardTicket[];
  metrics: DashboardMetrics;
}> {
  if (!userId) {
    return fallbackDashboardData();
  }

  if (!(await isDatabaseReachable())) {
    const local = await listLocalTickets(userId);
    return { tickets: local.tickets, metrics: buildMetrics(local.tickets) };
  }

  try {
    const tickets = await prisma.trackedTicket.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      take: 100
    });

    const dashboardTickets = tickets.map((ticket) => ({
      id: ticket.id,
      supportTicketId: ticket.supportTicketId,
      bugId: ticket.bugId,
      jiraId: ticket.jiraId,
      title: ticket.title,
      priority: ticket.priority,
      status: ticket.status,
      assignee: ticket.assignee,
      currentRisk: ticket.currentRisk,
      lastSyncedAt: ticket.lastSyncedAt?.toISOString() ?? null,
      externalLinks: ticket.externalLinks,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      agingDays: daysBetween(ticket.createdAt)
    }));

    return {
      tickets: dashboardTickets,
      metrics: buildMetrics(dashboardTickets)
    };
  } catch (error) {
    if (isDatabaseUnavailable(error) && userId) {
      const local = await listLocalTickets(userId);
      return { tickets: local.tickets, metrics: buildMetrics(local.tickets) };
    }

    return fallbackDashboardData();
  }
}

export async function getTicketDetails(id: string, userId?: string) {
  if (!userId) {
    return fallbackTicketDetails(id);
  }

  if (!(await isDatabaseReachable())) {
    return getLocalTicketDetails(id, userId);
  }

  try {
    const ticket = await prisma.trackedTicket.findFirst({
      where: { id, ownerId: userId },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 100
        },
        snapshots: {
          orderBy: { fetchedAt: "desc" },
          take: 12
        }
      }
    });

    if (!ticket) {
      return null;
    }

    return {
      ticket: {
        id: ticket.id,
        supportTicketId: ticket.supportTicketId,
        bugId: ticket.bugId,
        jiraId: ticket.jiraId,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        assignee: ticket.assignee,
        currentRisk: ticket.currentRisk,
        lastSyncedAt: ticket.lastSyncedAt?.toISOString() ?? null,
        externalLinks: ticket.externalLinks,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        agingDays: daysBetween(ticket.createdAt)
      },
      timeline: ticket.events.map((event): TimelineItem => ({
        id: event.id,
        system: event.system,
        changedField: event.changedField,
        previousValue: event.previousValue,
        newValue: event.newValue,
        message: event.message,
        createdAt: event.createdAt.toISOString()
      })),
      systemDetails: buildSystemDetails(ticket.snapshots)
    };
  } catch (error) {
    if (isDatabaseUnavailable(error) && userId) {
      return getLocalTicketDetails(id, userId);
    }

    return fallbackTicketDetails(id);
  }
}

function buildSystemDetails(snapshots: TicketSnapshot[]): SystemSnapshotDetail[] {
  const latestBySystem = new Map<TicketSystem, TicketSnapshot>();

  for (const snapshot of snapshots) {
    if (!latestBySystem.has(snapshot.system)) {
      latestBySystem.set(snapshot.system, snapshot);
    }
  }

  return Array.from(latestBySystem.values()).map((snapshot) => {
    const payload = asRecord(snapshot.payload);
    const normalized = asRecord(snapshot.normalized);

    return {
      system: snapshot.system,
      status: snapshot.status,
      priority: snapshot.priority,
      assignee: snapshot.assignee,
      resolution: snapshot.resolution,
      slaDueAt: snapshot.slaDueAt?.toISOString() ?? null,
      dueDate: snapshot.dueDate?.toISOString() ?? null,
      fetchedAt: snapshot.fetchedAt.toISOString(),
      webUrl: stringValue(payload.webUrl) ?? stringValue(normalized.webUrl) ?? undefined,
      source: stringValue(payload.source) ?? stringValue(normalized.source) ?? undefined,
      textSample: stringValue(payload.extractedTextSample) ?? undefined,
      comments: readComments(payload.comments)
    };
  });
}

function readComments(value: unknown): SystemComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const comment = asRecord(item);
    const body = stringValue(comment.body);
    if (!body) {
      return [];
    }

    return {
      id: stringValue(comment.id) ?? `comment-${index}`,
      author: stringValue(comment.author) ?? "Unknown",
      body,
      createdAt: stringValue(comment.createdAt) ?? new Date().toISOString()
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fallbackDashboardData() {
  if (process.env.DEMO_MODE === "true") {
    return { tickets: demoTickets, metrics: demoMetrics };
  }

  return { tickets: [], metrics: buildMetrics([]) };
}

function fallbackTicketDetails(id: string) {
  if (process.env.DEMO_MODE === "true") {
    return {
      ticket: findDemoTicket(id),
      timeline: demoTimeline
    };
  }

  return null;
}

function buildMetrics(tickets: DashboardTicket[]): DashboardMetrics {
  const closedStatuses = new Set(["CLOSED", "RESOLVED", "DONE"]);
  const closedTickets = tickets.filter((ticket) => closedStatuses.has(ticket.status.toUpperCase())).length;
  const statusMap = new Map<string, number>();
  const workloadMap = new Map<string, number>();

  for (const ticket of tickets) {
    statusMap.set(ticket.status, (statusMap.get(ticket.status) ?? 0) + 1);
    const assignee = ticket.assignee ?? "Unassigned";
    workloadMap.set(assignee, (workloadMap.get(assignee) ?? 0) + 1);
  }

  return {
    openTickets: tickets.length - closedTickets,
    closedTickets,
    highRiskTickets: tickets.filter((ticket) => ["HIGH", "CRITICAL"].includes(ticket.currentRisk)).length,
    slaRisks: tickets.filter((ticket) => ticket.currentRisk === "CRITICAL").length,
    statusDistribution: Array.from(statusMap.entries()).map(([name, value]) => ({ name, value })),
    agingBuckets: [
      { name: "0-7d", value: tickets.filter((ticket) => ticket.agingDays <= 7).length },
      { name: "8-14d", value: tickets.filter((ticket) => ticket.agingDays >= 8 && ticket.agingDays <= 14).length },
      { name: "15-21d", value: tickets.filter((ticket) => ticket.agingDays >= 15 && ticket.agingDays <= 21).length },
      { name: "22d+", value: tickets.filter((ticket) => ticket.agingDays >= 22).length }
    ],
    workload: Array.from(workloadMap.entries()).map(([name, tickets]) => ({ name, tickets })),
    openClosed: buildOpenClosedSeries(tickets)
  };
}

function buildOpenClosedSeries(tickets: DashboardTicket[]) {
  const byDay = new Map<string, { name: string; open: number; closed: number }>();

  for (let offset = 4; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    byDay.set(key, {
      name: date.toLocaleDateString("en", { weekday: "short" }),
      open: 0,
      closed: 0
    });
  }

  for (const ticket of tickets) {
    const key = new Date(ticket.updatedAt).toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (!bucket) {
      continue;
    }

    if (["CLOSED", "RESOLVED", "DONE"].includes(ticket.status.toUpperCase())) {
      bucket.closed += 1;
    } else {
      bucket.open += 1;
    }
  }

  return Array.from(byDay.values());
}

export type TicketCreateInput = Prisma.TrackedTicketCreateInput;
