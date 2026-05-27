import type { TicketSystem } from "@prisma/client";
import type { Page } from "playwright";
import type { ExternalTicket } from "@/services/integrations/types";

export class BrowserSsoRequiredError extends Error {
  constructor(system: TicketSystem, url: string) {
    super(`${formatSystem(system)} needs Oracle unified login in the local browser profile: ${url}`);
    this.name = "BrowserSsoRequiredError";
  }
}

export class BrowserPageUnavailableError extends Error {
  constructor(system: TicketSystem, url: string, reason: string) {
    super(`${formatSystem(system)} page is unavailable in Edge: ${url}. ${reason}`);
    this.name = "BrowserPageUnavailableError";
  }
}

export async function pageToExternalTicket(input: {
  page: Page;
  system: TicketSystem;
  id: string;
  webUrl: string;
}): Promise<ExternalTicket> {
  await waitForTicketPageAfterRedirect(input.page, input.webUrl);
  await assertLoggedIn(input.page, input.system, input.webUrl);

  const title = await input.page.title().catch(() => "");
  const text = normalizeText(await input.page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""));

  return {
    id: input.id,
    system: input.system,
    rawStatus: extractStatus(input.system, text) ?? "UNKNOWN",
    priority: extractField(text, ["Priority", "Severity", "Customer Severity", "Severity Level"]),
    assignee: extractField(text, ["Assignee", "Assigned To", "Owner", "Bug Owner", "Engineer"]),
    resolution: extractField(text, ["Resolution", "Fix Resolution"]),
    slaDueAt: extractDateField(text, ["SLA Due", "SLA Due Date", "Response Due"]),
    dueDate: extractDateField(text, ["Due Date", "Target Date", "Planned Date"]),
    updatedAt: new Date().toISOString(),
    comments: extractComments(text),
    webUrl: input.webUrl,
    payload: {
      id: input.id,
      title,
      webUrl: input.webUrl,
      source: "local-browser-session",
      extractedTextSample: text.slice(0, 800)
    }
  };
}

async function waitForTicketPageAfterRedirect(page: Page, webUrl: string) {
  const expectedHost = new URL(webUrl).hostname.toLowerCase();
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const url = page.url().toLowerCase();
    if (url.includes(expectedHost) && !isLoginUrl(url) && !url.startsWith("chrome-error://")) {
      return;
    }
    await page.waitForTimeout(500);
  }
}

async function assertLoggedIn(page: Page, system: TicketSystem, webUrl: string) {
  const url = page.url().toLowerCase();
  const title = (await page.title().catch(() => "")).toLowerCase();
  const text = normalizeText(await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).toLowerCase();

  const browserErrorPage = url.startsWith("chrome-error://") || text.includes("this site can\'t be reached") || text.includes("dns_probe") || text.includes("err_name_not_resolved");
  const loginUrl = isLoginUrl(url);
  const passwordPrompt = text.includes("password") && (text.includes("username") || text.includes("user id") || text.includes("oracle account") || text.includes("sign in"));
  const idcsPrompt = text.includes("identity cloud service") && (text.includes("password") || text.includes("sign in"));
  const loginTitle = title.includes("sign in") || title.includes("login");

  if (browserErrorPage) {
    throw new BrowserPageUnavailableError(system, webUrl, "Edge showed a network/error page instead of the ticket");
  }

  if (loginUrl && (passwordPrompt || idcsPrompt || loginTitle)) {
    throw new BrowserSsoRequiredError(system, webUrl);
  }
}

function isLoginUrl(url: string) {
  return url.includes("login") || url.includes("signin") || url.includes("/oauth2/") || url.includes("identity.oraclecloud.com");
}

function extractStatus(system: TicketSystem, text: string) {
  const labelsBySystem: Record<TicketSystem, string[]> = {
    SUPPORT_ORACLE: ["Status", "Current Status", "SR Status", "Service Request Status"],
    BUG_ORACLE: ["Status", "Bug Status", "State"],
    JIRA: ["Status", "Workflow Status"]
  };

  return extractField(text, labelsBySystem[system]);
}

function extractField(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const patterns = [
      new RegExp(`${escaped}\\s*[:\\-]\\s*([^\\n|;]{2,120})`, "i"),
      new RegExp(`${escaped}\\s+([^\\n|;]{2,80})`, "i")
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = cleanupValue(match?.[1]);
      if (value && !looksLikeLabel(value)) {
        return value;
      }
    }
  }

  return null;
}

function extractDateField(text: string, labels: string[]) {
  const value = extractField(text, labels);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractComments(text: string) {
  const commentMatch = text.match(/(?:Comments|Activities|Activity)\s*[:\-]?\s*([\s\S]{0,1200})/i);
  const body = cleanupValue(commentMatch?.[1]);

  if (!body) {
    return [];
  }

  return [
    {
      id: `browser-comment-${hashText(body)}`,
      author: "Browser tracker",
      body: body.slice(0, 500),
      createdAt: new Date().toISOString()
    }
  ];
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanupValue(value?: string) {
  return value?.replace(/\s+/g, " ").trim().replace(/^(is|:)\s+/i, "").slice(0, 160) || null;
}

function looksLikeLabel(value: string) {
  return /^(priority|assignee|owner|resolution|updated|created|comments?)\b/i.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
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
