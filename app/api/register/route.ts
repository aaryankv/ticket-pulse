import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const csrf = assertSameOrigin(request);
  if (csrf) {
    return csrf;
  }

  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email }
  });

  if (existing) {
    return NextResponse.json({ error: "An account already exists for this email" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const userCount = await prisma.user.count();

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: userCount === 0 ? "ADMIN" : "USER",
      notificationPreference: {
        create: {
          email: parsed.data.email,
          immediateAlerts: true,
          weeklyDigest: true,
          emailNotifications: true
        }
      }
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  });

  return NextResponse.json({ user }, { status: 201 });
}
