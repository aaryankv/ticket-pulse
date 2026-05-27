import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { enterpriseSites } from "@/lib/external-links";
import type { BrowserSessionState, BrowserTrackerOptions } from "@/services/browser-tracker/types";

const defaultProfileDir = ".oracle-browser-profile";
const defaultBrowserChannel = "msedge";

export function getBrowserProfileDir() {
  return path.resolve(process.env.BROWSER_PROFILE_DIR ?? defaultProfileDir);
}

export function getBrowserSessionState(): BrowserSessionState {
  const profileDir = getBrowserProfileDir();
  return {
    profileDir,
    exists: existsSync(profileDir),
    mode: process.env.BROWSER_HEADLESS === "true" ? "headless" : "headed",
    browserHint: process.env.BROWSER_EXECUTABLE_PATH || process.env.BROWSER_CHANNEL || defaultBrowserChannel
  };
}

export async function launchPersistentOracleContext(options: BrowserTrackerOptions = {}) {
  const profileDir = getBrowserProfileDir();
  await mkdir(profileDir, { recursive: true });

  return chromium.launchPersistentContext(profileDir, {
    headless: options.headless ?? process.env.BROWSER_HEADLESS === "true",
    channel: process.env.BROWSER_EXECUTABLE_PATH ? undefined : process.env.BROWSER_CHANNEL || defaultBrowserChannel,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    viewport: { width: 1440, height: 960 },
    acceptDownloads: false,
    ignoreHTTPSErrors: true
  });
}

export async function openOracleSsoPortals() {
  const context = await launchPersistentOracleContext({ headless: false });
  const pages = await Promise.all([
    openPortal(context, enterpriseSites.supportOracle.portalUrl),
    openPortal(context, enterpriseSites.jira.portalUrl),
    openPortal(context, enterpriseSites.bugOracle.portalUrl)
  ]);

  return { context, pages };
}

async function openPortal(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch(() => undefined);
  return page;
}
