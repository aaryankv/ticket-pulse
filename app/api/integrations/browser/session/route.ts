import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/api-auth";
import { getBrowserSessionState } from "@/services/browser-tracker/session";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const { response } = await requireApiUser();
  if (response) return response;

  return NextResponse.json({ session: getBrowserSessionState() });
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const { response } = await requireApiUser();
  if (response) return response;

  const cwd = process.cwd();
  const out = path.join(cwd, "browser-connect.stdout.log");
  const err = path.join(cwd, "browser-connect.stderr.log");
  const child = spawn("npm.cmd", ["run", "browser:connect"], {
    cwd,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: false,
    env: {
      ...process.env,
      BROWSER_CONNECT_STDOUT: out,
      BROWSER_CONNECT_STDERR: err
    }
  });

  child.unref();
  return NextResponse.json({ started: true, session: getBrowserSessionState() });
}
