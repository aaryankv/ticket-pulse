import type { Prisma } from "@prisma/client";

export const enterpriseSites = {
  supportOracle: {
    name: "Oracle Support",
    portalUrl: "https://support.oracle.com/support/?page=sptemplate&sptemplate=service-request",
    ticketUrl: (supportTicketId: string) => supportOracleTicketUrls(supportTicketId)[0]
  },
  jira: {
    name: "Oracle Jira",
    portalUrl: "https://jira.oraclecorp.com/",
    ticketUrl: (jiraId: string) => `https://jira.oraclecorp.com/jira/browse/${encodeURIComponent(jiraId)}`
  },
  bugOracle: {
    name: "Bug Oracle",
    portalUrl: "https://bug.oraclecorp.com/ords/bug/bugui/home",
    ticketUrl: (bugId: string) => bugOracleTicketUrls(bugId)[0]
  }
} as const;

export type ExternalLinks = {
  supportOracle?: {
    portalUrl: string;
    ticketUrl: string;
    source?: "generated" | "user-provided";
  };
  jira?: {
    portalUrl: string;
    ticketUrl: string;
    source?: "generated" | "user-provided";
  };
  bugOracle?: {
    portalUrl: string;
    ticketUrl: string;
    source?: "generated" | "user-provided";
  };
};

export function normalizeSupportTicketId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const fromUrl = readUrlParam(trimmed, "SR") || readFirstMatch(trimmed, /\b\d+-\d+\b/);
  return fromUrl || trimmed;
}

export function normalizeJiraId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const fromBrowseUrl = readUrlPathMatch(trimmed, /\/browse\/([^/?#]+)/i);
  return (fromBrowseUrl || trimmed).toUpperCase();
}

export function normalizeBugId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const fromUrl = readUrlParam(trimmed, "rptno");
  return fromUrl || readFirstMatch(trimmed, /\b\d{5,}\b/) || trimmed;
}

export function buildExternalLinks(input: {
  supportTicketId?: string | null;
  jiraId?: string | null;
  bugId?: string | null;
  externalLinks?: unknown;
}): ExternalLinks {
  const supportInput = input.supportTicketId?.trim();
  const jiraInput = input.jiraId?.trim();
  const bugInput = input.bugId?.trim();
  const supportTicketId = normalizeSupportTicketId(input.supportTicketId);
  const jiraId = normalizeJiraId(input.jiraId);
  const bugId = normalizeBugId(input.bugId);
  const storedSupportUrl = readStoredTicketUrl(input.externalLinks, "supportOracle");
  const storedJiraUrl = readStoredTicketUrl(input.externalLinks, "jira");
  const storedBugUrl = readStoredTicketUrl(input.externalLinks, "bugOracle");
  const pastedSupportUrl = readUrlForHost(supportInput, "support.oracle.com");
  const pastedJiraUrl = readUrlForHost(jiraInput, "jira.oraclecorp.com");
  const pastedBugUrl = readUrlForHost(bugInput, "bug.oraclecorp.com");

  return {
    ...(supportTicketId
      ? {
          supportOracle: {
            portalUrl: enterpriseSites.supportOracle.portalUrl,
            ticketUrl: storedSupportUrl || pastedSupportUrl || enterpriseSites.supportOracle.ticketUrl(supportTicketId),
            source: storedSupportUrl || pastedSupportUrl ? "user-provided" as const : "generated" as const
          }
        }
      : {}),
    ...(jiraId
      ? {
          jira: {
            portalUrl: enterpriseSites.jira.portalUrl,
            ticketUrl: storedJiraUrl || pastedJiraUrl || enterpriseSites.jira.ticketUrl(jiraId),
            source: storedJiraUrl || pastedJiraUrl ? "user-provided" as const : "generated" as const
          }
        }
      : {}),
    ...(bugId
      ? {
          bugOracle: {
            portalUrl: enterpriseSites.bugOracle.portalUrl,
            ticketUrl: storedBugUrl || pastedBugUrl || enterpriseSites.bugOracle.ticketUrl(bugId),
            source: storedBugUrl || pastedBugUrl ? "user-provided" as const : "generated" as const
          }
        }
      : {})
  };
}

export function buildExternalLinksJson(input: {
  supportTicketId?: string | null;
  jiraId?: string | null;
  bugId?: string | null;
  externalLinks?: unknown;
}) {
  return buildExternalLinks(input) as Prisma.InputJsonValue;
}

export function supportOracleTicketUrls(supportTicketId: string) {
  const id = encodeURIComponent(normalizeSupportTicketId(supportTicketId));
  return [
    `https://support.oracle.com/epmos/faces/SrDetail?srNumber=${id}`,
    `https://support.oracle.com/support/?page=sptemplate&sptemplate=sr-activities&SR=${id}`,
    `https://support.oracle.com/support/?SR=${id}&page=sptemplate&sptemplate=sr-activities`
  ];
}

export function bugOracleTicketUrls(bugId: string) {
  const id = encodeURIComponent(normalizeBugId(bugId));
  return [
    `https://bug.oraclecorp.com/ords/bug/bugui/bugdetails?bugno=${id}`,
    `https://bug.oraclecorp.com/ords/bug/bugui/bugdetails?rptno=${id}`,
    `https://bug.oraclecorp.com/pls/bug/webbug_edit.edit_info_top?rptno=${id}`
  ];
}

function readUrlParam(value: string, paramName: string) {
  try {
    const url = new URL(value);
    const expected = paramName.toLowerCase();
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (key.toLowerCase() === expected) {
        return paramValue.trim();
      }
    }
    return "";
  } catch {
    return "";
  }
}

function readFirstMatch(value: string, pattern: RegExp) {
  try {
    // Only pull IDs out of larger text/URLs. Plain IDs should be returned unchanged above.
    new URL(value);
    return value.match(pattern)?.[0] ?? "";
  } catch {
    return "";
  }
}

function readUrlPathMatch(value: string, pattern: RegExp) {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.match(pattern)?.[1] ?? "").trim();
  } catch {
    return "";
  }
}

function readUrlForHost(value: string | undefined, host: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().includes(host) ? url.toString() : "";
  } catch {
    return "";
  }
}

function readStoredTicketUrl(externalLinks: unknown, key: "supportOracle" | "jira" | "bugOracle") {
  if (!externalLinks || typeof externalLinks !== "object" || Array.isArray(externalLinks)) {
    return "";
  }

  const value = (externalLinks as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const ticketUrl = (value as Record<string, unknown>).ticketUrl;
  return typeof ticketUrl === "string" && ticketUrl.trim() ? ticketUrl.trim() : "";
}
