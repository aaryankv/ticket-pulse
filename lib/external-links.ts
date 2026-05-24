import type { Prisma } from "@prisma/client";

export const enterpriseSites = {
  supportOracle: {
    name: "Oracle Support",
    portalUrl: "https://support.oracle.com/support/?page=sptemplate&sptemplate=service-request",
    ticketUrl: (supportTicketId: string) =>
      `https://support.oracle.com/support/?SR=${encodeURIComponent(
        supportTicketId
      )}&page=sptemplate&sptemplate=sr-activities`
  },
  jira: {
    name: "Oracle Jira",
    portalUrl: "https://jira.oraclecorp.com/",
    ticketUrl: (jiraId: string) => `https://jira.oraclecorp.com/jira/browse/${encodeURIComponent(jiraId)}`
  },
  bugOracle: {
    name: "Bug Oracle",
    portalUrl: "https://bug.oraclecorp.com/ords/bug/bugui/home",
    ticketUrl: (bugId: string) =>
      `https://bug.oraclecorp.com/pls/bug/webbug_edit.edit_info_top?rptno=${encodeURIComponent(bugId)}`
  }
} as const;

export type ExternalLinks = {
  supportOracle?: {
    portalUrl: string;
    ticketUrl: string;
  };
  jira?: {
    portalUrl: string;
    ticketUrl: string;
  };
  bugOracle?: {
    portalUrl: string;
    ticketUrl: string;
  };
};

export function normalizeSupportTicketId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const fromUrl = readUrlParam(trimmed, "SR");
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
  return fromUrl || trimmed;
}

export function buildExternalLinks(input: {
  supportTicketId?: string | null;
  jiraId?: string | null;
  bugId?: string | null;
}): ExternalLinks {
  const supportTicketId = normalizeSupportTicketId(input.supportTicketId);
  const jiraId = normalizeJiraId(input.jiraId);
  const bugId = normalizeBugId(input.bugId);

  return {
    ...(supportTicketId
      ? {
          supportOracle: {
            portalUrl: enterpriseSites.supportOracle.portalUrl,
            ticketUrl: enterpriseSites.supportOracle.ticketUrl(supportTicketId)
          }
        }
      : {}),
    ...(jiraId
      ? {
          jira: {
            portalUrl: enterpriseSites.jira.portalUrl,
            ticketUrl: enterpriseSites.jira.ticketUrl(jiraId)
          }
        }
      : {}),
    ...(bugId
      ? {
          bugOracle: {
            portalUrl: enterpriseSites.bugOracle.portalUrl,
            ticketUrl: enterpriseSites.bugOracle.ticketUrl(bugId)
          }
        }
      : {})
  };
}

export function buildExternalLinksJson(input: {
  supportTicketId?: string | null;
  jiraId?: string | null;
  bugId?: string | null;
}) {
  return buildExternalLinks(input) as Prisma.InputJsonValue;
}

function readUrlParam(value: string, paramName: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get(paramName)?.trim() ?? "";
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
