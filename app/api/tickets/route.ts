import { NextRequest, NextResponse } from "next/server";
import type { Prisma, RiskLevel, TicketPriority } from "@prisma/client";
import { assertSameOrigin } from "@/lib/csrf";
import { isDatabaseReachable } from "@/lib/database-status";
import { buildExternalLinksJson, normalizeBugId, normalizeJiraId, normalizeSupportTicketId } from "@/lib/external-links";
import { prisma } from "@/lib/prisma";
import { createLocalTicket, isDatabaseUnavailable, listLocalTickets } from "@/lib/local-ticket-store";
import { rateLimit } from "@/lib/rate-limit";
import { ticketCreateSchema, ticketFilterSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/api-auth";
import { refreshLocalTicketWithBrowser } from "@/services/browser-tracker/refresh-local-ticket";
import { refreshTrackedTicketWithBrowser } from "@/services/browser-tracker/refresh-ticket";
import { createPollingJobForTicket, refreshTrackedTicket } from "@/services/polling/refresh-ticket";
import { calculateRisk } from "@/services/risk";

type InitialTrackingResult =
  | Awaited<ReturnType<typeof refreshTrackedTicket>>
  | Awaited<ReturnType<typeof refreshTrackedTicketWithBrowser>>
  | null;

export async function GET(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = ticketFilterSchema.parse(params);
  const where: Prisma.TrackedTicketWhereInput = {
    ownerId: user.id,
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.priority ? { priority: parsed.priority as TicketPriority } : {}),
    ...(parsed.risk ? { currentRisk: parsed.risk as RiskLevel } : {}),
    ...(parsed.query
      ? {
          OR: [
            { supportTicketId: { contains: parsed.query, mode: "insensitive" } },
            { bugId: { contains: parsed.query, mode: "insensitive" } },
            { jiraId: { contains: parsed.query, mode: "insensitive" } },
            { title: { contains: parsed.query, mode: "insensitive" } }
          ]
        }
      : {})
  };

  if (!(await isDatabaseReachable())) {
    const local = await listLocalTickets(user.id, parsed);
    return NextResponse.json({ ...local, page: parsed.page, pageSize: parsed.pageSize, storage: "local-file" });
  }

  try {
    const [tickets, total] = await Promise.all([
      prisma.trackedTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize
      }),
      prisma.trackedTicket.count({ where })
    ]);

    return NextResponse.json({ tickets, total, page: parsed.page, pageSize: parsed.pageSize });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    const local = await listLocalTickets(user.id, parsed);
    return NextResponse.json({ ...local, page: parsed.page, pageSize: parsed.pageSize, storage: "local-file" });
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const csrf = assertSameOrigin(request);
  if (csrf) {
    return csrf;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  const body = await request.json();
  const parsed = ticketCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supportTicketId = normalizeSupportTicketId(parsed.data.supportTicketId) || null;
  const bugId = normalizeBugId(parsed.data.bugId) || null;
  const jiraId = normalizeJiraId(parsed.data.jiraId) || null;

  const externalLinks = buildExternalLinksJson({
    supportTicketId: parsed.data.supportTicketId || supportTicketId,
    bugId: parsed.data.bugId || bugId,
    jiraId: parsed.data.jiraId || jiraId
  });
  const currentRisk = calculateRisk({
    priority: parsed.data.priority,
    agingDays: 0,
    status: "MONITORING"
  });

  if (!(await isDatabaseReachable())) {
    const ticket = await createLocalTicket({
      ownerId: user.id,
      supportTicketId,
      bugId,
      jiraId,
      notes: parsed.data.notes || null,
      priority: parsed.data.priority,
      currentRisk,
      externalLinks
    });

    const refreshed = await startInitialLocalTracking(ticket.id, user.id, { supportTicketId, bugId, jiraId });
    if (refreshed) {
      return NextResponse.json({ ticket: refreshed.ticket, refresh: refreshed, storage: "local-file" }, { status: 201 });
    }

    return NextResponse.json({ ticket, storage: "local-file" }, { status: 201 });
  }

  try {
    const ticket = await prisma.trackedTicket.create({
      data: {
        ownerId: user.id,
        supportTicketId,
        bugId,
        jiraId,
        notes: parsed.data.notes || null,
        priority: parsed.data.priority,
        status: "MONITORING",
        externalLinks,
        currentRisk
      }
    });

    await createPollingJobForTicket(ticket.id);

    const refreshed = await startInitialTracking(ticket.id, { supportTicketId, bugId, jiraId });
    if (refreshed) {
      return NextResponse.json({ ticket: refreshed.ticket, refresh: refreshed }, { status: 201 });
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    const ticket = await createLocalTicket({
      ownerId: user.id,
      supportTicketId,
      bugId,
      jiraId,
      notes: parsed.data.notes || null,
      priority: parsed.data.priority,
      currentRisk,
      externalLinks
    });

    const refreshed = await startInitialLocalTracking(ticket.id, user.id, { supportTicketId, bugId, jiraId });
    if (refreshed) {
      return NextResponse.json({ ticket: refreshed.ticket, refresh: refreshed, storage: "local-file" }, { status: 201 });
    }

    return NextResponse.json({ ticket, storage: "local-file" }, { status: 201 });
  }
}

async function startInitialTracking(
  ticketId: string,
  input: {
    supportTicketId: string | null;
    bugId: string | null;
    jiraId: string | null;
  }
) {
  let result: InitialTrackingResult = null;

  if (hasBrowserTargets(input)) {
    result = await refreshTrackedTicketWithBrowser(ticketId).catch(() => null);
  }

  if (input.jiraId) {
    result = await refreshTrackedTicket(ticketId).catch(() => result);
  }

  return result;
}

async function startInitialLocalTracking(
  ticketId: string,
  ownerId: string,
  input: {
    supportTicketId: string | null;
    bugId: string | null;
    jiraId: string | null;
  }
) {
  if (!input.jiraId && !hasBrowserTargets(input)) {
    return null;
  }

  return refreshLocalTicketWithBrowser(ticketId, ownerId).catch(() => null);
}

function hasBrowserTargets(input: {
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
}) {
  return Boolean(input.supportTicketId || input.bugId);
}
