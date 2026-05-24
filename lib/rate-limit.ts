import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

type Counter = {
  count: number;
  resetAt: number;
};

const counters = new Map<string, Counter>();

export function rateLimit(request: NextRequest) {
  const env = getEnv();
  const key =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const current = counters.get(key);

  if (!current || current.resetAt < now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  current.count += 1;

  if (current.count > env.RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((current.resetAt - now) / 1000))
        }
      }
    );
  }

  return null;
}
