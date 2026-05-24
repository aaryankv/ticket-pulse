import { NextRequest, NextResponse } from "next/server";
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
  const ticket = await prisma.trackedTicket.findFirst({
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

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ticket });
}
