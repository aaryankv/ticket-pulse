import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { isDatabaseReachable } from "@/lib/database-status";
import { deleteLocalTicket, getLocalTicketDetails, isDatabaseUnavailable } from "@/lib/local-ticket-store";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/api-auth";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  const { id } = await params;
  if (!(await isDatabaseReachable())) {
    return getLocalTicketResponse(id, user.id);
  }

  let ticket;
  try {
    ticket = await prisma.trackedTicket.findFirst({
      where: {
        id,
        ownerId: user.id
      },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 100
        },
        snapshots: {
          orderBy: { fetchedAt: "desc" },
          take: 20
        }
      }
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return getLocalTicketResponse(id, user.id);
  }

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}

export async function DELETE(request: NextRequest, { params }: Params) {
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

  const { id } = await params;

  if (!(await isDatabaseReachable())) {
    return deleteLocalTicketResponse(id, user.id);
  }

  try {
    const ticket = await prisma.trackedTicket.findFirst({
      where: {
        id,
        ownerId: user.id
      },
      select: { id: true }
    });

    if (!ticket) {
      return deleteLocalTicketResponse(id, user.id);
    }

    await prisma.$transaction([
      prisma.pollingJob.deleteMany({ where: { ticketId: id } }),
      prisma.ticketEvent.deleteMany({ where: { ticketId: id } }),
      prisma.ticketSnapshot.deleteMany({ where: { ticketId: id } }),
      prisma.trackedTicket.delete({ where: { id } })
    ]);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return deleteLocalTicketResponse(id, user.id);
  }
}

async function getLocalTicketResponse(id: string, ownerId: string) {
  const details = await getLocalTicketDetails(id, ownerId);
  if (!details) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ...details, storage: "local-file" });
}

async function deleteLocalTicketResponse(id: string, ownerId: string) {
  const deleted = await deleteLocalTicket(id, ownerId);
  if (!deleted) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, storage: "local-file" });
}
