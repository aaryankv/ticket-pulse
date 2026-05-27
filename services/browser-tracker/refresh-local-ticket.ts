import type { TicketPriority, TicketSystem } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { buildExternalLinks, buildExternalLinksJson } from "@/lib/external-links";
import {
  getLocalTicketRecord,
  toDashboardTicket,
  updateLocalTicket,
  type LocalTicketChange,
  type LocalTicketRecord
} from "@/lib/local-ticket-store";
import { daysBetween } from "@/lib/utils";
import { pageToExternalTicket, BrowserSsoRequiredError } from "@/services/browser-tracker/parser";
import { openOracleBrowserConnection } from "@/services/browser-tracker/session";
import { calculateRisk } from "@/services/risk";

type LocalBrowserTarget = {
  system: TicketSystem;
  externalId: string;
  url: string;
};

type BrowserObservedTicket = {
  system: TicketSystem;
  status: string;
  priority: string | null | undefined;
  assignee: string | null | undefined;
  resolution: string | null | undefined;
  slaDueAt: string | null | undefined;
  dueDate: string | null | undefined;
};

export async function refreshLocalTicketWithBrowser(id: string, ownerId: string) {
  const ticket = await getLocalTicketRecord(id, ownerId);
  if (!ticket) {
    return null;
  }

  const targets = getLocalBrowserTargets(ticket);
  const observed: BrowserObservedTicket[] = [];
  const failures: string[] = [];

  const connection = await openOracleBrowserConnection({ headless: false });
  try {
    for (const target of targets) {
      const { page, shouldClose } = await getTargetPage(connection.context, target);
      try {
        const externalTicket = await pageToExternalTicket({
          page,
          system: target.system,
          id: target.externalId,
          webUrl: target.url
        });

        observed.push({
          system: target.system,
          status: externalTicket.rawStatus,
          priority: externalTicket.priority,
          assignee: externalTicket.assignee,
          resolution: externalTicket.resolution,
          slaDueAt: externalTicket.slaDueAt,
          dueDate: externalTicket.dueDate
        });
      } catch (error) {
        failures.push(formatBrowserFailure(target.system, error));
      } finally {
        if (shouldClose) {
          await page.close().catch(() => undefined);
        }
      }
    }
  } finally {
    await connection.close();
  }

  const aggregate = aggregateLocalTicketState(observed, ticket);
  const changes = buildLocalChanges(ticket, aggregate);
  const failureChanges = failures.map((message): LocalTicketChange => ({
    system: null,
    changedField: "browserSession",
    previousValue: null,
    newValue: "FETCH_FAILED",
    message
  }));

  const updated = await updateLocalTicket({
    id: ticket.id,
    ownerId,
    patch: {
      status: aggregate.status,
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
      externalLinks: buildExternalLinksJson(ticket)
    },
    changes: changes.length > 0 || failureChanges.length > 0
      ? [...changes, ...failureChanges]
      : [
          {
            system: null,
            changedField: "refresh",
            previousValue: null,
            newValue: "NO_CHANGES",
            message: "Browser refresh completed with no detected ticket changes"
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

async function getTargetPage(context: BrowserContext, target: LocalBrowserTarget): Promise<{ page: Page; shouldClose: boolean }> {
  const existing = context.pages().find((page) => urlMatchesTarget(page.url(), target));
  if (existing) {
    return { page: existing, shouldClose: false };
  }

  const page = await context.newPage();
  await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  return { page, shouldClose: true };
}

function urlMatchesTarget(currentUrl: string, target: LocalBrowserTarget) {
  const current = currentUrl.toLowerCase();
  const id = encodeURIComponent(target.externalId).toLowerCase();

  switch (target.system) {
    case "SUPPORT_ORACLE":
      return current.includes("support.oracle.com") && current.includes(`sr=${id}`);
    case "BUG_ORACLE":
      return current.includes("bug.oraclecorp.com") && current.includes(`rptno=${id}`);
    case "JIRA":
      return current.includes("jira.oraclecorp.com") && current.includes(`/browse/${id}`);
    default:
      return false;
  }
}

function getLocalBrowserTargets(ticket: Pick<LocalTicketRecord, "supportTicketId" | "bugId" | "jiraId">): LocalBrowserTarget[] {
  const links = buildExternalLinks(ticket);
  return [
    ticket.supportTicketId && links.supportOracle?.ticketUrl
      ? { system: "SUPPORT_ORACLE" as TicketSystem, externalId: ticket.supportTicketId, url: links.supportOracle.ticketUrl }
      : null,
    ticket.bugId && links.bugOracle?.ticketUrl
      ? { system: "BUG_ORACLE" as TicketSystem, externalId: ticket.bugId, url: links.bugOracle.ticketUrl }
      : null,
    ticket.jiraId && links.jira?.ticketUrl
      ? { system: "JIRA" as TicketSystem, externalId: ticket.jiraId, url: links.jira.ticketUrl }
      : null
  ].filter(Boolean) as LocalBrowserTarget[];
}

function aggregateLocalTicketState(observed: BrowserObservedTicket[], current: LocalTicketRecord) {
  const jira = observed.find((ticket) => ticket.system === "JIRA");
  const bug = observed.find((ticket) => ticket.system === "BUG_ORACLE");
  const support = observed.find((ticket) => ticket.system === "SUPPORT_ORACLE");
  const primary = jira ?? bug ?? support;

  return {
    status: primary?.status ?? current.status,
    priority: highestPriority(observed.map((ticket) => normalizePriority(ticket.priority)).concat(current.priority)),
    assignee: jira?.assignee ?? bug?.assignee ?? support?.assignee ?? current.assignee,
    resolution: jira?.resolution ?? bug?.resolution ?? support?.resolution ?? current.resolution,
    slaDueAt: firstDate(observed.map((ticket) => ticket.slaDueAt)) ?? current.slaDueAt,
    dueDate: firstDate(observed.map((ticket) => ticket.dueDate)) ?? current.dueDate
  };
}

function buildLocalChanges(current: LocalTicketRecord, next: ReturnType<typeof aggregateLocalTicketState>): LocalTicketChange[] {
  const fields: Array<keyof typeof next> = ["status", "priority", "assignee", "resolution", "slaDueAt", "dueDate"];

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
        message: `Browser refresh changed ${formatField(field)} from ${previousValue ?? "empty"} to ${newValue ?? "empty"}`
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