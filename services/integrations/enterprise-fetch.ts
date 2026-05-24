import type { TicketSystem } from "@prisma/client";
import type { ExternalAuthContext, ExternalTicket } from "@/services/integrations/types";
import { assertLiveIntegrationAuth } from "@/services/integrations/auth-context";

export async function fetchEnterprisePage(url: string, context: ExternalAuthContext) {
  assertLiveIntegrationAuth(context);

  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Authorization: `Bearer ${context.accessToken}`,
      "User-Agent": "TicketPulse/0.1 internal-monitor"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000)
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`${context.system} rejected the delegated SSO token with HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`${context.system} page fetch failed with HTTP ${response.status}`);
  }

  return response.text();
}

export async function fetchJson<T>(url: string, context: ExternalAuthContext): Promise<T> {
  assertLiveIntegrationAuth(context);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${context.accessToken}`,
      "User-Agent": "TicketPulse/0.1 internal-monitor"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000)
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`${context.system} rejected the delegated SSO token with HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`${context.system} API fetch failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function parseEnterpriseHtml(input: {
  id: string;
  system: TicketSystem;
  html: string;
  webUrl: string;
  fallbackStatus?: string;
}): ExternalTicket {
  const text = collapseWhitespace(stripHtml(input.html));

  return {
    id: input.id,
    system: input.system,
    rawStatus: findField(text, ["Status", "Current Status", "Bug Status", "SR Status"]) ?? input.fallbackStatus ?? "UNKNOWN",
    priority: findField(text, ["Priority", "Severity", "Customer Severity"]),
    assignee: findField(text, ["Assignee", "Owner", "Assigned To", "Bug Owner"]),
    resolution: findField(text, ["Resolution", "Fix Resolution"]),
    slaDueAt: findDateField(text, ["SLA Due", "SLA Due Date", "Response Due"]),
    dueDate: findDateField(text, ["Due Date", "Target Date"]),
    updatedAt: new Date().toISOString(),
    comments: [],
    webUrl: input.webUrl,
    payload: {
      id: input.id,
      webUrl: input.webUrl,
      source: "sso-web-page",
      extractedTextSample: text.slice(0, 500)
    }
  };
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function findField(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*[:\\-]?\\s*([^|;]{2,80})`, "i"));
    const value = match?.[1]?.trim();
    if (value) {
      return value.replace(/\s{2,}.*/, "").trim();
    }
  }

  return null;
}

function findDateField(text: string, labels: string[]) {
  const value = findField(text, labels);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
