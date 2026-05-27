import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/api-auth";
import { refreshTrackedTicketWithBrowser } from "@/services/browser-tracker/refresh-ticket";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const { response, user } = await requireApiUser();
  if (response) return response;

  const { id } = await params;
  const ticket = await prisma.trackedTicket.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true }
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const result = await refreshTrackedTicketWithBrowser(id);
  return NextResponse.json(result);
}
