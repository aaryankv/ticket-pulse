import { NextRequest, NextResponse } from "next/server";
import type { Prisma, RiskLevel, TicketPriority } from "@prisma/client";
import { assertSameOrigin } from "@/lib/csrf";
import { buildExternalLinksJson, normalizeBugId, normalizeJiraId, normalizeSupportTicketId } from "@/lib/external-links";
import { prisma } from "@/lib/prisma";
import { createLocalTicket, isDatabaseUnavailable, listLocalTickets } from "@/lib/local-ticket-store";
import { rateLimit } from "@/lib/rate-limit";
import { ticketCreateSchema, ticketFilterSchema } from "@/lib/validations";
import { requireApiUser } from "@/lib/api-auth";
import { createPollingJobForTicket } from "@/services/polling/refresh-ticket";
import { calculateRisk } from "@/services/risk";

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

  const externalLinks = buildExternalLinksJson({ supportTicketId, bugId, jiraId });
  const currentRisk = calculateRisk({
    priority: parsed.data.priority,
    agingDays: 0,
    status: "MONITORING"
  });

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

    return NextResponse.json({ ticket, storage: "local-file" }, { status: 201 });
  }
}
