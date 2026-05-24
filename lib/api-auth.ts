import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

type ApiAuthResult =
  | { response: NextResponse; user: null }
  | { response: null; user: Session["user"] };

export async function requireApiUser(): Promise<ApiAuthResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null
    };
  }

  return {
    response: null,
    user: session.user
  };
}

export async function requireAdmin(): Promise<ApiAuthResult> {
  const result = await requireApiUser();

  if (result.response) {
    return result;
  }

  if (result.user?.role !== "ADMIN") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null
    };
  }

  return result;
}
