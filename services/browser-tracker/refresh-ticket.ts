import type { Prisma, TicketPriority, TicketSystem } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { buildExternalLinksJson } from "@/lib/external-links";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/utils";
import { pageToExternalTicket, BrowserSsoRequiredError } from "@/services/browser-tracker/parser";
import { openOracleBrowserConnection } from "@/services/browser-tracker/session";
import { detectTicketChanges, type TicketChange } from "@/services/change-detection";
import { hashComments } from "@/services/integrations/hash";
import type { NormalizedTicket } from "@/services/integrations/types";
import { notifyTicketChanges } from "@/services/notifications";
import { calculateRisk } from "@/services/risk";

type LinkedBrowserTarget = {
  system: TicketSystem;
  externalId: string;
  url: string;
  urls: string[];
};

export async function refreshTrackedTicketWithBrowser(ticketId: string) {
  const connection = await openOracleBrowserConnection({ headless: process.env.BROWSER_HEADLESS === "true" });
  try {
    return await refreshTrackedTicketWithBrowserContext(ticketId, connection.context, {
      openInTicketPulseWindow: connection.source === "existing-edge"
    });
  } finally {
    await connection.close();
  }
}

export async function refreshDueBrowserJobs(limit = 10) {
  const jobs = await prisma.pollingJob.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }]
    },
    orderBy: { nextRunAt: "asc" },
    take: limit
  });

  if (jobs.length === 0) {
    return [];
  }

  const connection = await openOracleBrowserConnection({ headless: process.env.BROWSER_HEADLESS === "true" });
  const results = [];

  try {
    for (const job of jobs) {
      try {
        results.push(await refreshTrackedTicketWithBrowserContext(job.ticketId, connection.context, {
          openInTicketPulseWindow: connection.source === "existing-edge"
        }));
      } catch (error) {
        await prisma.pollingJob.update({
          where: { id: job.id },
          data: {
            status: "ACTIVE",
            lastRunAt: new Date(),
            nextRunAt: new Date(Date.now() + job.intervalMinutes * 60_000),
            errorMessage: error instanceof Error ? error.message : "Unknown browser tracker failure"
          }
        });
      }
    }
  } finally {
    await connection.close();
  }

  return results;
}

async function refreshTrackedTicketWithBrowserContext(
  ticketId: string,
  context: BrowserContext,
  options: { openInTicketPulseWindow?: boolean } = {}
) {
  const ticket = await prisma.trackedTicket.findUnique({
    where: { id: ticketId },
    include: {
      owner: {
        include: {
          notificationPreference: true
        }
      }
    }
  });

  if (!ticket) {
    throw new Error(`Tracked ticket ${ticketId} not found`);
  }

  const targets = getBrowserTargets(ticket);
  const normalizedTickets: NormalizedTicket[] = [];
  const changes: TicketChange[] = getMissingBrowserLinkFailures(ticket, targets);
  const failures: string[] = changes.map((change) => change.message);

  for (const target of targets) {
    const { page, shouldClose, atTargetUrl } = await getTargetPage(context, target, Boolean(options.openInTicketPulseWindow));
    try {
      await forceRefreshTargetPage(page, target, atTargetUrl);
      const externalTicket = await pageToExternalTicket({
        page,
        system: target.system,
        id: target.externalId,
        webUrl: target.url
      });
      const normalized = normalizeBrowserTicket(externalTicket);
      normalizedTickets.push(normalized);

      const previous = await prisma.ticketSnapshot.findFirst({
        where: {
          ticketId: ticket.id,
          system: target.system
        },
        orderBy: { fetchedAt: "desc" }
      });

      const detected = detectTicketChanges(previous, normalized);
      changes.push(...detected);

      await prisma.ticketSnapshot.create({
        data: {
          ticketId: ticket.id,
          system: target.system,
          payload: normalized.payload as Prisma.InputJsonValue,
          normalized: normalized.normalized as Prisma.InputJsonValue,
          status: normalized.status,
          priority: normalized.priority,
          assignee: normalized.assignee,
          resolution: normalized.resolution,
          commentsHash: normalized.commentsHash,
          slaDueAt: normalized.slaDueAt ? new Date(normalized.slaDueAt) : null,
          dueDate: normalized.dueDate ? new Date(normalized.dueDate) : null
        }
      });
    } catch (error) {
      const failure = buildBrowserFailure(target.system, error);
      failures.push(failure.message);
      changes.push(failure);
    } finally {
      if (shouldClose) {
        await page.close().catch(() => undefined);
      }
    }
  }

  if (changes.length > 0) {
    await prisma.ticketEvent.createMany({
      data: changes.map((change) => ({
        ticketId: ticket.id,
        system: change.system,
        eventType: change.eventType,
        changedField: change.changedField,
        previousValue: change.previousValue,
        newValue: change.newValue,
        message: change.message
      }))
    });
  }

  const aggregate = aggregateTicketState(normalizedTickets, ticket);
  const updatedTicket = await prisma.trackedTicket.update({
    where: { id: ticket.id },
    data: {
      title: aggregate.title ?? ticket.title,
      status: aggregate.status,
      priority: aggregate.priority,
      assignee: aggregate.assignee,
      resolution: aggregate.resolution,
      slaDueAt: aggregate.slaDueAt,
      dueDate: aggregate.dueDate,
      externalLinks: ticket.externalLinks ?? buildExternalLinksJson(ticket),
      currentRisk: calculateRisk({
        priority: aggregate.priority,
        agingDays: daysBetween(ticket.createdAt),
        slaDueAt: aggregate.slaDueAt,
        status: aggregate.status
      }),
      lastSyncedAt: normalizedTickets.length > 0 ? new Date() : ticket.lastSyncedAt
    }
  });

  await prisma.pollingJob.updateMany({
    where: { ticketId: ticket.id },
    data: {
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + Number(process.env.BROWSER_WORKER_INTERVAL_MINUTES ?? process.env.POLLING_INTERVAL_MINUTES ?? 60) * 60_000),
      status: "ACTIVE",
      errorMessage: failures.length > 0 ? failures.join(" | ") : null
    }
  });

  if (changes.length > 0) {
    await notifyTicketChanges({
      ticket: updatedTicket,
      user: ticket.owner,
      changes
    });
  }

  return { ticket: updatedTicket, changes, failures };
}

async function getTargetPage(
  context: BrowserContext,
  target: LinkedBrowserTarget,
  openInTicketPulseWindow: boolean
): Promise<{ page: Page; shouldClose: boolean; atTargetUrl: boolean }> {
  const exactTicketPage = findExactTargetPage(context, target);
  if (exactTicketPage) {
    return { page: exactTicketPage, shouldClose: false, atTargetUrl: true };
  }

  if (openInTicketPulseWindow) {
    return {
      page: await context.newPage(),
      shouldClose: false,
      atTargetUrl: false
    };
  }

  return { page: await context.newPage(), shouldClose: true, atTargetUrl: false };
}

async function forceRefreshTargetPage(page: Page, target: LinkedBrowserTarget, atTargetUrl: boolean) {
  let lastError: unknown;

  if (atTargetUrl) {
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      if (await pageLooksLikeTarget(page, target)) {
        return;
      }
    } catch (error) {
      if (!isRecoverableNavigationAbort(error) || !urlMatchesTarget(page.url(), target)) {
        lastError = error;
      }
    }
  }

  for (const url of target.urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      if (await pageLooksLikeTarget(page, target) || isLoginUrl(page.url())) {
        return;
      }
    } catch (error) {
      if (!isRecoverableNavigationAbort(error) || !urlMatchesTarget(page.url(), target)) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function pageLooksLikeTarget(page: Page, target: LinkedBrowserTarget) {
  if (urlMatchesTarget(page.url(), target)) {
    return true;
  }

  const id = target.externalId.toLowerCase();
  const title = (await page.title().catch(() => "")).toLowerCase();
  if (title.includes(id)) {
    return true;
  }

  const text = (await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "")).toLowerCase();
  return text.includes(id);
}

function isLoginUrl(url: string) {
  const current = url.toLowerCase();
  return current.includes("login") || current.includes("signin") || current.includes("/oauth2/") || current.includes("identity.oraclecloud.com");
}

function urlMatchesTarget(currentUrl: string, target: LinkedBrowserTarget) {
  try {
    const current = new URL(currentUrl);
    const host = current.hostname.toLowerCase();
    const id = target.externalId.toLowerCase();

    switch (target.system) {
      case "SUPPORT_ORACLE":
        return host.includes("support.oracle.com") && (
          readSearchParam(current, "SR") === id ||
          readSearchParam(current, "srNumber") === id ||
          current.pathname.toLowerCase().includes(id)
        );
      case "BUG_ORACLE":
        return host.includes("bug.oraclecorp.com") && (
          readSearchParam(current, "rptno") === id ||
          readSearchParam(current, "bugno") === id ||
          current.pathname.toLowerCase().includes(id)
        );
      default:
        return false;
    }
  } catch {
    const current = currentUrl.toLowerCase();
    const id = encodeURIComponent(target.externalId).toLowerCase();

    switch (target.system) {
      case "SUPPORT_ORACLE":
        return current.includes("support.oracle.com") && (current.includes(`sr=${id}`) || current.includes(`srnumber=${id}`));
      case "BUG_ORACLE":
        return current.includes("bug.oraclecorp.com") && (current.includes(`rptno=${id}`) || current.includes(`bugno=${id}`));
      default:
        return false;
    }
  }
}

function readSearchParam(url: URL, name: string) {
  const expected = name.toLowerCase();
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === expected) {
      return value.trim().toLowerCase();
    }
  }

  return "";
}

function findExactTargetPage(context: BrowserContext, target: LinkedBrowserTarget) {
  return context.pages().find((page) => urlMatchesTarget(page.url(), target));
}

function isRecoverableNavigationAbort(error: unknown) {
  return error instanceof Error && /ERR_ABORTED|frame was detached|Target page, context or browser has been closed/i.test(error.message);
}

function getBrowserTargets(ticket: {
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
  externalLinks: Prisma.JsonValue | null;
}): LinkedBrowserTarget[] {
  const supportUrl = ticket.supportTicketId ? readStoredTicketUrl(ticket.externalLinks, "supportOracle") : null;
  const bugUrl = ticket.bugId ? readStoredTicketUrl(ticket.externalLinks, "bugOracle") : null;

  return [
    ticket.supportTicketId && supportUrl
      ? {
          system: "SUPPORT_ORACLE" as TicketSystem,
          externalId: ticket.supportTicketId,
          url: supportUrl,
          urls: [supportUrl]
        }
      : null,
    ticket.bugId && bugUrl
      ? {
          system: "BUG_ORACLE" as TicketSystem,
          externalId: ticket.bugId,
          url: bugUrl,
          urls: [bugUrl]
        }
      : null
  ].filter(Boolean) as LinkedBrowserTarget[];
}

function getMissingBrowserLinkFailures(
  ticket: {
    supportTicketId: string | null;
    bugId: string | null;
    externalLinks: Prisma.JsonValue | null;
  },
  targets: LinkedBrowserTarget[]
): TicketChange[] {
  const targetSystems = new Set(targets.map((target) => target.system));
  return [
    ticket.supportTicketId && !targetSystems.has("SUPPORT_ORACLE")
      ? buildBrowserLinkMissingFailure("SUPPORT_ORACLE")
      : null,
    ticket.bugId && !targetSystems.has("BUG_ORACLE")
      ? buildBrowserLinkMissingFailure("BUG_ORACLE")
      : null
  ].filter(Boolean) as TicketChange[];
}

function readStoredTicketUrl(externalLinks: Prisma.JsonValue | null, key: "supportOracle" | "bugOracle") {
  if (!externalLinks || typeof externalLinks !== "object" || Array.isArray(externalLinks)) {
    return null;
  }

  const value = (externalLinks as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const ticketUrl = (value as Record<string, unknown>).ticketUrl;
  return typeof ticketUrl === "string" && ticketUrl.trim() ? ticketUrl.trim() : null;
}

function buildBrowserLinkMissingFailure(system: TicketSystem): TicketChange {
  return {
    system,
    eventType: "BROWSER_LINK_MISSING",
    changedField: "browserSession",
    previousValue: null,
    newValue: "EXACT_LINK_REQUIRED",
    message: `${formatSystem(system)} browser refresh needs the exact URL pasted during ticket creation. This older ticket does not have a saved user-provided link, so Ticket Pulse will not open a generated portal URL.`
  };
}

function normalizeBrowserTicket(ticket: {
  id: string;
  system: TicketSystem;
  rawStatus: string;
  priority?: string | null;
  assignee?: string | null;
  resolution?: string | null;
  slaDueAt?: string | null;
  dueDate?: string | null;
  comments: Array<{ id: string; author: string; body: string; createdAt: string }>;
  payload: Record<string, unknown>;
  webUrl?: string;
}): NormalizedTicket {
  return {
    externalId: ticket.id,
    system: ticket.system,
    status: ticket.rawStatus,
    priority: ticket.priority,
    assignee: ticket.assignee,
    resolution: ticket.resolution,
    slaDueAt: ticket.slaDueAt,
    dueDate: ticket.dueDate,
    commentsHash: hashComments(ticket.comments),
    payload: {
      ...ticket.payload,
      comments: ticket.comments
    },
    webUrl: ticket.webUrl,
    normalized: {
      status: ticket.rawStatus,
      priority: ticket.priority,
      assignee: ticket.assignee,
      resolution: ticket.resolution,
      slaDueAt: ticket.slaDueAt,
      dueDate: ticket.dueDate,
      commentCount: ticket.comments.length,
      webUrl: ticket.webUrl,
      source: "local-browser-session"
    }
  };
}

function aggregateTicketState(
  normalizedTickets: NormalizedTicket[],
  currentTicket: {
    title: string | null;
    priority: TicketPriority;
    status: string;
    assignee: string | null;
    resolution: string | null;
    slaDueAt: Date | null;
    dueDate: Date | null;
  }
) {
  const jira = normalizedTickets.find((ticket) => ticket.system === "JIRA");
  const bug = normalizedTickets.find((ticket) => ticket.system === "BUG_ORACLE");
  const support = normalizedTickets.find((ticket) => ticket.system === "SUPPORT_ORACLE");
  const primary = jira ?? bug ?? support;
  const statusSource = [jira, bug, support].find((ticket) => ticket?.status && ticket.status !== "UNKNOWN");
  const primaryStatus = primary?.status;

  return {
    title: currentTicket.title,
    status: statusSource?.status ?? (primaryStatus && primaryStatus !== "UNKNOWN" ? primaryStatus : currentTicket.status),
    priority: highestPriority(normalizedTickets.map((ticket) => normalizePriority(ticket.priority)).concat(currentTicket.priority)),
    assignee: jira?.assignee ?? bug?.assignee ?? support?.assignee ?? currentTicket.assignee,
    resolution: jira?.resolution ?? bug?.resolution ?? support?.resolution ?? currentTicket.resolution,
    slaDueAt: firstDate(normalizedTickets.map((ticket) => ticket.slaDueAt)) ?? currentTicket.slaDueAt,
    dueDate: firstDate(normalizedTickets.map((ticket) => ticket.dueDate)) ?? currentTicket.dueDate
  };
}

function buildBrowserFailure(system: TicketSystem, error: unknown): TicketChange {
  const ssoRequired = error instanceof BrowserSsoRequiredError;
  return {
    system,
    eventType: ssoRequired ? "BROWSER_SSO_REQUIRED" : "BROWSER_FETCH_FAILED",
    changedField: "browserSession",
    previousValue: null,
    newValue: ssoRequired ? "SSO_REQUIRED" : "FETCH_FAILED",
    message: ssoRequired
      ? `${formatSystem(system)} browser tracker needs you to complete Oracle unified login`
      : `${formatSystem(system)} browser tracker failed: ${error instanceof Error ? error.message : "Unknown error"}`
  };
}

function normalizePriority(value?: string | null): TicketPriority {
  const normalized = value?.toUpperCase();
  if (normalized === "P1" || normalized === "BLOCKER") return "BLOCKER";
  if (normalized === "P2" || normalized === "CRITICAL") return "CRITICAL";
  if (normalized === "P3" || normalized === "HIGH") return "HIGH";
  if (normalized === "LOW") return "LOW";
  return "MEDIUM";
}

function highestPriority(values: TicketPriority[]): TicketPriority {
  const rank: Record<TicketPriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, BLOCKER: 5 };
  return values.reduce<TicketPriority>((highest, current) => (rank[current] > rank[highest] ? current : highest), "LOW");
}

function firstDate(values: Array<string | null | undefined>) {
  const dates = values.filter(Boolean).map((value) => new Date(value as string));
  return dates.length > 0 ? dates.sort((a, b) => a.getTime() - b.getTime())[0] : null;
}

function formatSystem(system: TicketSystem) {
  switch (system) {
    case "SUPPORT_ORACLE":
      return "Oracle Support";
    case "BUG_ORACLE":
      return "Bug Oracle";
    case "JIRA":
      return "Oracle Jira";
    default:
      return system;
  }
}
