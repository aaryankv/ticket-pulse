import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import { enterpriseSites } from "@/lib/external-links";
import type { BrowserSessionState, BrowserTrackerOptions, OracleBrowserConnection } from "@/services/browser-tracker/types";

const defaultProfileDir = ".oracle-browser-profile";
const defaultBrowserChannel = "msedge";
const defaultCdpUrl = "http://127.0.0.1:9222";

function getPortalUrls() {
  return [
    enterpriseSites.supportOracle.portalUrl,
    enterpriseSites.jira.portalUrl,
    enterpriseSites.bugOracle.portalUrl
  ];
}

export function getBrowserProfileDir() {
  return path.resolve(process.env.BROWSER_PROFILE_DIR ?? defaultProfileDir);
}

export function getBrowserCdpUrl() {
  return process.env.BROWSER_CDP_URL?.trim() || null;
}

export function getBrowserSessionState(): BrowserSessionState {
  const profileDir = getBrowserProfileDir();
  const cdpUrl = getBrowserCdpUrl();

  return {
    profileDir,
    exists: existsSync(profileDir),
    mode: process.env.BROWSER_HEADLESS === "true" ? "headless" : "headed",
    browserHint: cdpUrl ? `Microsoft Edge via ${cdpUrl}` : process.env.BROWSER_EXECUTABLE_PATH || process.env.BROWSER_CHANNEL || defaultBrowserChannel,
    connectionMode: cdpUrl ? "existing-edge" : "managed-profile",
    cdpUrl: cdpUrl ?? undefined
  };
}

export async function prepareBrowserSession() {
  const cdpUrl = getBrowserCdpUrl();
  if (cdpUrl) {
    await ensureEdgeCdpAvailable(cdpUrl);
    return;
  }

  await mkdir(getBrowserProfileDir(), { recursive: true });
}

export async function openOracleBrowserConnection(options: BrowserTrackerOptions = {}): Promise<OracleBrowserConnection> {
  const cdpUrl = getBrowserCdpUrl();
  if (cdpUrl) {
    return connectToExistingEdge(cdpUrl);
  }

  const profileDir = getBrowserProfileDir();
  await mkdir(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: options.headless ?? process.env.BROWSER_HEADLESS === "true",
    channel: process.env.BROWSER_EXECUTABLE_PATH ? undefined : process.env.BROWSER_CHANNEL || defaultBrowserChannel,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    viewport: { width: 1440, height: 960 },
    acceptDownloads: false,
    ignoreHTTPSErrors: true
  });

  return {
    context,
    close: () => context.close(),
    source: "managed-profile"
  };
}

export async function openOracleSsoPortals() {
  const connection = await openOracleBrowserConnection({ headless: false });
  const pages: Page[] = [];

  for (const url of getPortalUrls()) {
    pages.push(await openPortal(connection.context, url));
  }

  return { ...connection, pages };
}

async function connectToExistingEdge(cdpUrl: string): Promise<OracleBrowserConnection> {
  await ensureEdgeCdpAvailable(cdpUrl);
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0];

  if (!context) {
    throw new Error("Connected to Edge, but no default browser context was available.");
  }

  return {
    context,
    close: async () => undefined,
    source: "existing-edge"
  };
}

export async function ensureEdgeCdpAvailable(cdpUrl: string) {
  if (await isCdpAvailable(cdpUrl)) {
    return;
  }

  if (process.env.BROWSER_CDP_LAUNCH === "false") {
    throw new Error(buildCdpUnavailableMessage(cdpUrl));
  }

  launchEdgeForCdp(cdpUrl);

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await delay(500);
    if (await isCdpAvailable(cdpUrl)) {
      return;
    }
  }

  throw new Error(buildCdpUnavailableMessage(cdpUrl));
}

async function isCdpAvailable(cdpUrl: string) {
  try {
    const response = await fetch(new URL("/json/version", cdpUrl), { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

function launchEdgeForCdp(cdpUrl: string) {
  const executable = resolveEdgeExecutable();
  const port = new URL(cdpUrl || defaultCdpUrl).port || "9222";
  const args = [
    `--remote-debugging-port=${port}`,
    `--profile-directory=${process.env.EDGE_PROFILE_DIRECTORY || "Default"}`,
    ...getPortalUrls()
  ];

  spawn(executable, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  }).unref();
}

function resolveEdgeExecutable() {
  const configured = process.env.EDGE_EXECUTABLE_PATH || process.env.BROWSER_EXECUTABLE_PATH;
  if (configured) {
    return configured;
  }

  if (process.platform !== "win32") {
    return "msedge";
  }

  const candidates = [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Microsoft Edge executable was not found. Set EDGE_EXECUTABLE_PATH to msedge.exe.");
  }

  return found;
}

function buildCdpUnavailableMessage(cdpUrl: string) {
  const port = new URL(cdpUrl || defaultCdpUrl).port || "9222";
  return `Ticket Pulse could not attach to the existing Edge session at ${cdpUrl}. Keep the Edge window started with --remote-debugging-port=${port} open, then refresh Settings and try again.`;
}

async function openPortal(context: BrowserContext, url: string): Promise<Page> {
  const existing = findPageForHost(context, url);
  if (existing) {
    return existing;
  }

  return openUrlInTicketPulseWindow(context, url);
}

export async function openUrlInTicketPulseWindow(context: BrowserContext, url: string): Promise<Page> {
  const opener = findTicketPulsePage(context);

  if (!opener) {
    throw new Error("Ticket Pulse is not open in the attached Edge session, so missing Oracle tabs cannot be opened in the same window.");
  }

  const linkId = `ticket-pulse-open-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await opener.evaluate(
    ({ targetUrl, id }) => {
      const link = document.createElement("a");
      link.id = id;
      link.href = targetUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open";
      link.style.position = "fixed";
      link.style.left = "0";
      link.style.bottom = "0";
      link.style.width = "1px";
      link.style.height = "1px";
      link.style.opacity = "0.01";
      link.style.zIndex = "2147483647";
      document.body.appendChild(link);
    },
    { targetUrl: url, id: linkId }
  );

  const popupPromise = opener.waitForEvent("popup", { timeout: 8_000 }).catch(() => null);
  await opener.locator(`#${linkId}`).click({ timeout: 5_000 }).catch(() => undefined);
  await opener.evaluate((id) => document.getElementById(id)?.remove(), linkId).catch(() => undefined);

  const popup = await popupPromise;
  let page = popup ?? findPageForHost(context, url);

  if (!page) {
    await openUrlAsTabWithCdp(context, opener, url);
    page = await waitForPageForHost(context, url);
  }

  if (!page) {
    throw new Error(`Edge did not open ${url} from the Ticket Pulse tab.`);
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 90_000 }).catch(() => undefined);
  return page;
}

async function openUrlAsTabWithCdp(context: BrowserContext, opener: Page, url: string) {
  const session = await context.newCDPSession(opener);
  try {
    await session.send("Target.createTarget", { url, newWindow: false, background: false });
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function waitForPageForHost(context: BrowserContext, url: string) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const page = findPageForHost(context, url);
    if (page) {
      return page;
    }
    await delay(250);
  }

  return undefined;
}

function findPageForHost(context: BrowserContext, url: string) {
  const host = new URL(url).hostname.toLowerCase();
  return context.pages().find((page) => {
    const pageUrl = page.url().toLowerCase();
    return pageUrl.includes(host);
  });
}

function findTicketPulsePage(context: BrowserContext) {
  const configuredHosts = [process.env.APP_BASE_URL, process.env.NEXTAUTH_URL]
    .filter(Boolean)
    .flatMap((value) => {
      try {
        return [new URL(value as string).host.toLowerCase()];
      } catch {
        return [];
      }
    });

  const hosts = new Set(["localhost:3000", "127.0.0.1:3000", ...configuredHosts]);

  return context.pages().find((page) => {
    try {
      const pageUrl = page.url();
      if (hosts.has(new URL(pageUrl).host.toLowerCase())) {
        return true;
      }
    } catch {
      // Fall through to the title check below.
    }

    return false;
  });
}