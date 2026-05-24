import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/utils";
import { sendEmail } from "@/services/notifications/email";

export async function generateWeeklyReport(userId: string, weekStart = startOfWeek(new Date())) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [tickets, events] = await Promise.all([
    prisma.trackedTicket.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.ticketEvent.findMany({
      where: {
        ticket: { ownerId: userId },
        createdAt: {
          gte: weekStart,
          lt: weekEnd
        }
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const closedStatuses = new Set(["CLOSED", "RESOLVED", "DONE"]);
  const opened = tickets.filter((ticket) => ticket.createdAt >= weekStart && ticket.createdAt < weekEnd);
  const closed = tickets.filter((ticket) => closedStatuses.has(ticket.status.toUpperCase()));
  const aging = tickets.filter((ticket) => daysBetween(ticket.createdAt) >= 14);
  const blockers = tickets.filter((ticket) => ["BLOCKER", "CRITICAL"].includes(ticket.priority));
  const slaRisks = tickets.filter((ticket) => ["HIGH", "CRITICAL"].includes(ticket.currentRisk));

  const summary = {
    ticketsOpened: opened.length,
    ticketsClosed: closed.length,
    ticketsPending: tickets.length - closed.length,
    agingTickets: aging.length,
    highPriorityBlockers: blockers.length,
    slaRisks: slaRisks.length,
    statusMovementTimeline: events.map((event) => ({
      at: event.createdAt.toISOString(),
      message: event.message
    }))
  };

  const html = renderWeeklyReportHtml(summary);

  return prisma.weeklyReport.upsert({
    where: {
      userId_weekStart: {
        userId,
        weekStart
      }
    },
    update: {
      weekEnd,
      summary: summary as Prisma.InputJsonValue,
      html
    },
    create: {
      userId,
      weekStart,
      weekEnd,
      summary: summary as Prisma.InputJsonValue,
      html
    }
  });
}

export async function generateWeeklyReportsForEligibleUsers() {
  const users = await prisma.user.findMany({
    where: {
      notificationPreference: {
        weeklyDigest: true
      }
    },
    include: {
      notificationPreference: true
    }
  });

  const reports = [];

  for (const user of users) {
    const report = await generateWeeklyReport(user.id);
    reports.push(report);

    if (user.notificationPreference?.emailNotifications && report.html) {
      await sendEmail({
        to: user.notificationPreference.email ?? user.email,
        subject: "Ticket Pulse weekly summary",
        html: report.html
      });
    }
  }

  return reports;
}

export function renderWeeklyReportHtml(summary: {
  ticketsOpened: number;
  ticketsClosed: number;
  ticketsPending: number;
  agingTickets: number;
  highPriorityBlockers: number;
  slaRisks: number;
  statusMovementTimeline: Array<{ at: string; message: string }>;
}) {
  const timeline = summary.statusMovementTimeline
    .map((item) => `<li><strong>${new Date(item.at).toLocaleString()}</strong> - ${escapeHtml(item.message)}</li>`)
    .join("");

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#111827;">
      <h1 style="font-size:22px;">Ticket Pulse Weekly Summary</h1>
      <table style="border-collapse:collapse;width:100%;max-width:680px;">
        <tbody>
          <tr><td>Tickets opened</td><td><strong>${summary.ticketsOpened}</strong></td></tr>
          <tr><td>Tickets closed</td><td><strong>${summary.ticketsClosed}</strong></td></tr>
          <tr><td>Tickets still pending</td><td><strong>${summary.ticketsPending}</strong></td></tr>
          <tr><td>Aging tickets</td><td><strong>${summary.agingTickets}</strong></td></tr>
          <tr><td>High priority blockers</td><td><strong>${summary.highPriorityBlockers}</strong></td></tr>
          <tr><td>SLA risks</td><td><strong>${summary.slaRisks}</strong></td></tr>
        </tbody>
      </table>
      <h2 style="font-size:18px;margin-top:24px;">Status movement timeline</h2>
      <ul>${timeline || "<li>No status movement recorded this week.</li>"}</ul>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startOfWeek(date: Date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = clone.getDate() - day + (day === 0 ? -6 : 1);
  clone.setDate(diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}
