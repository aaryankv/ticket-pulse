import type { TicketPriority, TicketSystem } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { buildExternalLinksJson } from "@/lib/external-links";
import {
  getLocalTicketRecord,
  toDashboardTicket,
  updateLocalTicket,
  type LocalTicketChange,
  type LocalTicketRecord
} from "@/lib/local-ticket-store";
import { getLocalJiraAccessToken } from "@/lib/local-jira-profile-store";
import { daysBetween } from "@/lib/utils";
import { BrowserSsoRequiredError, pageToExternalTicket } from "@/services/browser-tracker/parser";
import { openOracleBrowserConnection } from "@/services/browser-tracker/session";
import { jiraAdapter } from "@/services/jira";
import { calculateRisk } from "@/services/risk";

type LocalBrowserTarget = {
  system: TicketSystem;
  externalId: string;
  url: string;
  urls: string[];
};

type BrowserObservedTicket = {
  system: TicketSystem;
  title?: string | null;
  status: string;
  priority: string | null | undefined;
  assignee: string | null | undefined;
  resolution: string | null | undefined;
  slaDueAt: string | null | undefined;
  dueDate: string | null | undefined;
};

type TargetRefreshResult =
  | { observed: BrowserObservedTicket; failure?: never }
  | { observed?: never; failure: string };

export async function refreshLocalTicketWithBrowser(id: string, ownerId: string) {
  const ticket = await getLocalTicketRecord(id, ownerId);
  if (!ticket) {
    return null;
  }

  const results: TargetRefreshResult[] = [];
  if (ticket.jiraId) {
    results.push(await refreshLocalJiraTarget(ticket.jiraId, ownerId));
  }

  const targets = getLocalBrowserTargets(ticket);
  const missingLinkFailures = getMissingLocalBrowserLinkFailures(ticket, targets);
  results.push(...missingLinkFailures.map((failure) => ({ failure })));

  if (targets.length > 0) {
    const connection = await openOracleBrowserConnection({ headless: false });

    try {
      for (const target of targets) {
        results.push(await refreshTarget(connection.context, target, connection.source !== "existing-edge"));
      }
    } finally {
      await connection.close();
    }
  }

  const observed = results.flatMap((result) => (result.observed ? [result.observed] : []));
  const failures = results.flatMap((result) => (result.failure ? [result.failure] : []));
  const aggregate = aggregateLocalTicketState(observed, ticket);
  const changes = buildLocalChanges(ticket, aggregate);
  const failureChanges = failures.map((message): LocalTicketChange => ({
    system: null,
    changedField: "refresh",
    previousValue: null,
    newValue: "FETCH_FAILED",
    message
  }));

  const updated = await updateLocalTicket({
    id: ticket.id,
    ownerId,
    patch: {
      status: aggregate.status,
      title: aggregate.title,
      priority: aggregate.priority,
      assignee: aggregate.assignee,
      resolution: aggregate.resolution,
      slaDueAt: aggregate.slaDueAt,
      dueDate: aggregate.dueDate,
      currentRisk: calculateRisk({
        priority: aggregate.priority,
        agingDays: daysBetween(new Date(ticket.createdAt)),
        slaDueAt: aggregate.slaDueAt ? new Date(aggregate.slaDueAt) : undefined,
        status: aggregate.status
      }),
      lastSyncedAt: observed.length > 0 ? new Date().toISOString() : ticket.lastSyncedAt,
      externalLinks: ticket.externalLinks ?? buildExternalLinksJson(ticket)
    },
    changes: changes.length > 0 || failureChanges.length > 0
      ? [...changes, ...failureChanges]
      : [
          {
            system: null,
            changedField: "refresh",
            previousValue: null,
            newValue: "NO_CHANGES",
            message: "Refresh completed with no detected ticket changes"
          }
        ]
  });

  if (!updated) {
    return null;
  }

  return {
    ticket: toDashboardTicket(updated),
    changes,
    failures,
    storage: "local-file"
  };
}

async function refreshLocalJiraTarget(jiraId: string, ownerId: string): Promise<TargetRefreshResult> {
  try {
    const accessToken = await getLocalJiraAccessToken(ownerId);
    if (!accessToken) {
      return { failure: "Oracle Jira API profile is not connected" };
    }

    const context = {
      userId: ownerId,
      system: "JIRA" as TicketSystem,
      mode: "live" as const,
      authSource: "external-credential" as const,
      accessToken,
      scopes: ["jira:read"]
    };
    const externalTicket = await jiraAdapter.fetchTicket(jiraId, context);
    const comments = await jiraAdapter.fetchComments(jiraId, context);
    const normalized = jiraAdapter.normalizeResponse({
      ...externalTicket,
      comments: comments.length > 0 ? comments : externalTicket.comments
    });

    return {
      observed: {
        system: "JIRA",
        status: normalized.status,
        title: readNormalizedTitle(normalized.payload),
        priority: normalized.priority,
        assignee: normalized.assignee,
        resolution: normalized.resolution,
        slaDueAt: normalized.slaDueAt,
        dueDate: normalized.dueDate
      }
    };
  } catch (error) {
    return { failure: `Oracle Jira API refresh failed: ${error instanceof Error ? error.message : "Unknown error"}` };
  }
}

async function refreshTarget(context: BrowserContext, target: LocalBrowserTarget, allowNewPage: boolean): Promise<TargetRefreshResult> {
  const { page, shouldClose, atTargetUrl } = await getTargetPage(context, target, allowNewPage);

  try {
    await forceRefreshTargetPage(page, target, atTargetUrl);
    const currentPage = findExactTargetPage(context, target) ?? page;
    const externalTicket = await readExternalTicketFromPage(context, target, currentPage);

    return {
      observed: {
        system: target.system,
        status: externalTicket.rawStatus,
        priority: externalTicket.priority,
        assignee: externalTicket.assignee,
        resolution: externalTicket.resolution,
        slaDueAt: externalTicket.slaDueAt,
        dueDate: externalTicket.dueDate
      }
    };
  } catch (error) {
    return { failure: formatBrowserFailure(target.system, error) };
  } finally {
    if (shouldClose) {
      await page.close().catch(() => undefined);
    }
  }
}

async function readExternalTicketFromPage(context: BrowserContext, target: LocalBrowserTarget, page: Page) {
  try {
    return await pageToExternalTicket({
      page,
      system: target.system,
      id: target.externalId,
      webUrl: target.url
    });
  } catch (error) {
    if (!isRecoverableNavigationAbort(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const replacementPage = findExactTargetPage(context, target);
    if (!replacementPage) {
      throw error;
    }

    return pageToExternalTicket({
      page: replacementPage,
      system: target.system,
      id: target.externalId,
      webUrl: target.url
    });
  }
}

async function getTargetPage(context: BrowserContext, target: LocalBrowserTarget, allowNewPage: boolean): Promise<{ page: Page; shouldClose: boolean; atTargetUrl: boolean }> {
  const exactTicketPage = findExactTargetPage(context, target);
  if (exactTicketPage) {
    return { page: exactTicketPage, shouldClose: false, atTargetUrl: true };
  }

  if (!allowNewPage) {
    return { page: await context.newPage(), shouldClose: false, atTargetUrl: false };
  }

  return { page: await context.newPage(), shouldClose: true, atTargetUrl: false };
}

async function forceRefreshTargetPage(page: Page, target: LocalBrowserTarget, atTargetUrl: boolean) {
  let lastError: unknown;

  if (atTargetUrl) {
    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
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
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
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

async function pageLooksLikeTarget(page: Page, target: LocalBrowserTarget) {
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

function isRecoverableNavigationAbort(error: unknown) {
  return error instanceof Error && /ERR_ABORTED|frame was detached|Target page, context or browser has been closed/i.test(error.message);
}

function findExactTargetPage(context: BrowserContext, target: LocalBrowserTarget) {
  return context.pages().find((page) => urlMatchesTarget(page.url(), target));
}

function urlMatchesTarget(currentUrl: string, target: LocalBrowserTarget) {
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

function getLocalBrowserTargets(ticket: Pick<LocalTicketRecord, "supportTicketId" | "bugId" | "jiraId" | "externalLinks">): LocalBrowserTarget[] {
  const supportUrl = ticket.supportTicketId ? readStoredTicketUrl(ticket.externalLinks, "supportOracle") : null;
  const bugUrl = ticket.bugId ? readStoredTicketUrl(ticket.externalLinks, "bugOracle") : null;

  return [
    ticket.supportTicketId && supportUrl
      ? { system: "SUPPORT_ORACLE" as TicketSystem, externalId: ticket.supportTicketId, url: supportUrl, urls: [supportUrl] }
      : null,
    ticket.bugId && bugUrl
      ? { system: "BUG_ORACLE" as TicketSystem, externalId: ticket.bugId, url: bugUrl, urls: [bugUrl] }
      : null
  ].filter(Boolean) as LocalBrowserTarget[];
}

function getMissingLocalBrowserLinkFailures(
  ticket: Pick<LocalTicketRecord, "supportTicketId" | "bugId" | "externalLinks">,
  targets: LocalBrowserTarget[]
) {
  const targetSystems = new Set(targets.map((target) => target.system));
  return [
    ticket.supportTicketId && !targetSystems.has("SUPPORT_ORACLE")
      ? `${formatSystem("SUPPORT_ORACLE")} browser refresh needs the exact URL pasted during ticket creation. This older ticket does not have a saved user-provided link, so Ticket Pulse will not open a generated portal URL.`
      : null,
    ticket.bugId && !targetSystems.has("BUG_ORACLE")
      ? `${formatSystem("BUG_ORACLE")} browser refresh needs the exact URL pasted during ticket creation. This older ticket does not have a saved user-provided link, so Ticket Pulse will not open a generated portal URL.`
      : null
  ].filter(Boolean) as string[];
}

function readStoredTicketUrl(externalLinks: unknown, key: "supportOracle" | "bugOracle") {
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

function aggregateLocalTicketState(observed: BrowserObservedTicket[], current: LocalTicketRecord) {
  const jira = observed.find((ticket) => ticket.system === "JIRA");
  const bug = observed.find((ticket) => ticket.system === "BUG_ORACLE");
  const support = observed.find((ticket) => ticket.system === "SUPPORT_ORACLE");
  const primary = jira ?? bug ?? support;

  const statusSource = [jira, bug, support].find((ticket) => ticket?.status && ticket.status !== "UNKNOWN");
  const primaryStatus = primary?.status;

  return {
    title: jira?.title ?? current.title,
    status: statusSource?.status ?? (primaryStatus && primaryStatus !== "UNKNOWN" ? primaryStatus : current.status),
    priority: highestPriority(observed.map((ticket) => normalizePriority(ticket.priority)).concat(current.priority)),
    assignee: jira?.assignee ?? bug?.assignee ?? support?.assignee ?? current.assignee,
    resolution: jira?.resolution ?? bug?.resolution ?? support?.resolution ?? current.resolution,
    slaDueAt: firstDate(observed.map((ticket) => ticket.slaDueAt)) ?? current.slaDueAt,
    dueDate: firstDate(observed.map((ticket) => ticket.dueDate)) ?? current.dueDate
  };
}

function buildLocalChanges(current: LocalTicketRecord, next: ReturnType<typeof aggregateLocalTicketState>): LocalTicketChange[] {
  const fields: Array<keyof typeof next> = ["title", "status", "priority", "assignee", "resolution", "slaDueAt", "dueDate"];

  return fields.flatMap((field) => {
    const previousValue = current[field] ? String(current[field]) : null;
    const newValue = next[field] ? String(next[field]) : null;

    if (previousValue === newValue) {
      return [];
    }

    return [
      {
        system: null,
        changedField: field,
        previousValue,
        newValue,
        message: `Refresh changed ${formatField(field)} from ${previousValue ?? "empty"} to ${newValue ?? "empty"}`
      }
    ];
  });
}

function formatBrowserFailure(system: TicketSystem, error: unknown) {
  const name = formatSystem(system);
  if (error instanceof BrowserSsoRequiredError) {
    return `${name} needs Oracle unified login in Edge`;
  }

  return `${name} browser refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`;
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
  const dates = values.filter(Boolean).map((value) => new Date(value as string)).filter((date) => !Number.isNaN(date.getTime()));
  return dates.length > 0 ? dates.sort((a, b) => a.getTime() - b.getTime())[0].toISOString() : null;
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

function formatField(value: string) {
  return value.replace(/([A-Z])/g, " $1").toLowerCase();
}

function readNormalizedTitle(payload: Record<string, unknown>) {
  return typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim() : null;
}
