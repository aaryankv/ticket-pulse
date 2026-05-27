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

  try {
    const child = spawnBrowserConnect(cwd, out, err);
    child.unref();
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not open browser session",
        detail: error instanceof Error ? error.message : "Unknown launch error"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ started: true, session: getBrowserSessionState() });
}

function spawnBrowserConnect(cwd: string, stdoutPath: string, stderrPath: string) {
  const env = {
    ...process.env,
    BROWSER_CONNECT_STDOUT: stdoutPath,
    BROWSER_CONNECT_STDERR: stderrPath
  };

  if (process.platform === "win32") {
    // Windows cannot spawn npm.cmd directly from Node without going through cmd.exe.
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd run browser:connect"], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env
    });
  }

  return spawn("npm", ["run", "browser:connect"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env
  });
}