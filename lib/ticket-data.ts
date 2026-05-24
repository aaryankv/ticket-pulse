import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { demoMetrics, demoTickets, demoTimeline, findDemoTicket } from "@/lib/demo-data";
import { daysBetween } from "@/lib/utils";
import type { DashboardMetrics, DashboardTicket, TimelineItem } from "@/types/ticket";

export async function getDashboardData(userId?: string): Promise<{
  tickets: DashboardTicket[];
  metrics: DashboardMetrics;
}> {
  if (!process.env.DATABASE_URL || !userId) {
    return { tickets: demoTickets, metrics: demoMetrics };
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
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      agingDays: daysBetween(ticket.createdAt)
    }));

    return {
      tickets: dashboardTickets,
      metrics: buildMetrics(dashboardTickets)
    };
  } catch {
    return { tickets: demoTickets, metrics: demoMetrics };
  }
}

export async function getTicketDetails(id: string, userId?: string) {
  if (!process.env.DATABASE_URL || !userId) {
    return {
      ticket: findDemoTicket(id),
      timeline: demoTimeline
    };
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
      }))
    };
  } catch {
    return {
      ticket: findDemoTicket(id),
      timeline: demoTimeline
    };
  }
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
