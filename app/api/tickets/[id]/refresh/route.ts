import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { isDatabaseUnavailable } from "@/lib/local-ticket-store";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/api-auth";
import { refreshLocalTicketWithBrowser } from "@/services/browser-tracker/refresh-local-ticket";
import { refreshTrackedTicket } from "@/services/polling/refresh-ticket";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
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

  try {
    const ticket = await prisma.trackedTicket.findFirst({
      where: {
        id,
        ownerId: user.id
      },
      select: {
        id: true
      }
    });

    if (!ticket) {
      return refreshLocalOrNotFound(id, user.id);
    }

    const result = await refreshTrackedTicket(id);
    return NextResponse.json(result);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw error;
    }

    return refreshLocalOrNotFound(id, user.id);
  }
}

async function refreshLocalOrNotFound(id: string, ownerId: string) {
  const result = await refreshLocalTicketWithBrowser(id, ownerId);
  if (!result) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}