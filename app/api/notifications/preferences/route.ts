import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/api-auth";
import { notificationPreferenceSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  const preferences = await prisma.notificationPreference.findUnique({
    where: { userId: user.id }
  });

  return NextResponse.json({ preferences });
}

export async function PUT(request: NextRequest) {
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
  const parsed = notificationPreferenceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const preferences = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: parsed.data,
    create: {
      userId: user.id,
      ...parsed.data
    }
  });

  return NextResponse.json({ preferences });
}
