import { NextRequest, NextResponse } from "next/server";

export function assertSameOrigin(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return null;
  }

  const originHost = new URL(origin).host;
  if (originHost !== host) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  return null;
}
