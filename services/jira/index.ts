import { randomUUID } from "crypto";
import type {
  ExternalAuthContext,
  ExternalComment,
  ExternalTicket,
  TicketAdapter
} from "@/services/integrations/types";
import { enterpriseSites, normalizeJiraId } from "@/lib/external-links";
import {
  assertLiveIntegrationAuth,
  IntegrationAuthRequiredError
} from "@/services/integrations/auth-context";
import { fetchEnterprisePage, parseEnterpriseHtml } from "@/services/integrations/enterprise-fetch";
import { hashComments } from "@/services/integrations/hash";

const JIRA_BASE_URL = (process.env.JIRA_API_BASE_URL ?? "https://jira.oraclecorp.com/jira").replace(/\/$/, "");
const JIRA_REQUEST_TIMEOUT_MS = Number(process.env.JIRA_REQUEST_TIMEOUT_MS ?? 45_000);
const JIRA_RETRY_ATTEMPTS = Number(process.env.JIRA_RETRY_ATTEMPTS ?? 3);
const JIRA_ISSUE_FIELDS = [
  "summary",
  "status",
  "priority",
  "assignee",
  "reporter",
  "creator",
  "resolution",
  "updated",
  "created",
  "duedate",
  "description",
  "comment",
  "issuelinks",
  "attachment",
  "subtasks",
  "labels",
  "components",
  "fixVersions",
  "versions"
];

const comments: ExternalComment[] = [
  {
    id: "jira-comment-1",
    author: "Jira Assignee",
    body: "Deployment validation scheduled with QE.",
    createdAt: new Date(Date.now() - 24 * 60 * 1000).toISOString()
  }
];

type JiraUser = {
  displayName?: string;
  name?: string;
  emailAddress?: string;
};

type JiraIssueComment = {
  id?: string;
  author?: JiraUser;
  body?: unknown;
  created?: string;
  updated?: string;
};

type JiraIssueResponse = {
  id?: string;
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    creator?: JiraUser | null;
    resolution?: { name?: string } | null;
    updated?: string;
    created?: string;
    duedate?: string | null;
    comment?: {
      comments?: JiraIssueComment[];
    };
  };
};

type JiraCommentsPage = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  comments?: JiraIssueComment[];
};

class JiraHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "JiraHttpError";
  }
}

export const jiraAdapter: TicketAdapter = {
  system: "JIRA",
  portalUrl: enterpriseSites.jira.portalUrl,
  getTicketUrl: enterpriseSites.jira.ticketUrl,
  parseTicketId: normalizeJiraId,

  async authenticate(context: ExternalAuthContext) {
    if (context.mode === "auth-required") {
      throw new IntegrationAuthRequiredError("JIRA");
    }

    return true;
  },

  async fetchTicket(ticketId: string, context: ExternalAuthContext): Promise<ExternalTicket> {
    const normalizedTicketId = normalizeJiraId(ticketId);
    const webUrl = enterpriseSites.jira.ticketUrl(normalizedTicketId);

    if (context.mode === "live") {
      try {
        const params = new URLSearchParams({
          fields: JIRA_ISSUE_FIELDS.join(",")
        });
        const issue = await fetchJiraJson<JiraIssueResponse>(
          `/issue/${encodeURIComponent(normalizedTicketId)}?${params.toString()}`,
          context
        );

        return mapJiraIssue(issue, normalizedTicketId, webUrl);
      } catch (error) {
        if (context.authSource === "external-credential") {
          throw error;
        }

        const html = await fetchEnterprisePage(webUrl, context);
        return parseEnterpriseHtml({
          id: normalizedTicketId,
          system: "JIRA",
          html,
          webUrl,
          fallbackStatus: "UNKNOWN"
        });
      }
    }

    return {
      id: normalizedTicketId,
      system: "JIRA",
      rawStatus: normalizedTicketId.endsWith("2") ? "FIX IN REVIEW" : "IN PROGRESS",
      priority: normalizedTicketId.endsWith("5") ? "Blocker" : "High",
      assignee: normalizedTicketId.endsWith("2") ? "Miguel Santos" : "Ava Chen",
      resolution: null,
      slaDueAt: null,
      dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      updatedAt: new Date().toISOString(),
      comments,
      webUrl,
      payload: {
        issueKey: normalizedTicketId,
        project: normalizedTicketId.split("-")[0] ?? "OPS",
        issueType: "Bug",
        portalUrl: enterpriseSites.jira.portalUrl,
        webUrl,
        source: "mock"
      }
    };
  },

  async fetchComments(ticketId: string, context: ExternalAuthContext) {
    if (context.mode !== "live") {
      return comments;
    }

    return fetchJiraIssueComments(normalizeJiraId(ticketId), context);
  },

  normalizeResponse(ticket: ExternalTicket) {
    return {
      externalId: ticket.id,
      system: "JIRA",
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
        dueDate: ticket.dueDate,
        commentCount: ticket.comments.length,
        webUrl: ticket.webUrl
      }
    };
  }
};

async function fetchJiraIssueComments(ticketId: string, context: ExternalAuthContext): Promise<ExternalComment[]> {
  const issueComments: ExternalComment[] = [];
  const maxResults = 100;
  let startAt = 0;

  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(maxResults),
      orderBy: "created"
    });
    const response = await fetchJiraJson<JiraCommentsPage>(
      `/issue/${encodeURIComponent(ticketId)}/comment?${params.toString()}`,
      context
    );
    const pageComments = response.comments ?? [];

    issueComments.push(...pageComments.map(mapJiraComment));

    const total = response.total ?? issueComments.length;
    if (pageComments.length === 0 || issueComments.length >= total) {
      break;
    }

    startAt += pageComments.length;
  }

  return issueComments;
}

async function fetchJiraJson<T>(path: string, context: ExternalAuthContext): Promise<T> {
  assertLiveIntegrationAuth(context);

  let lastError: unknown;
  for (let attempt = 1; attempt <= JIRA_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJiraJsonOnce<T>(path, context);
    } catch (error) {
      lastError = error;
      if (attempt >= JIRA_RETRY_ATTEMPTS || !isRetryableJiraError(error)) {
        throw error;
      }

      await wait(attempt * 1_000);
    }
  }

  throw lastError;
}

async function fetchJiraJsonOnce<T>(path: string, context: ExternalAuthContext): Promise<T> {
  const response = await fetch(`${JIRA_BASE_URL}/rest/api/2${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${context.accessToken}`,
      "User-Agent": "TicketPulse/0.1 internal-monitor"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(JIRA_REQUEST_TIMEOUT_MS)
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`JIRA rejected the saved personal access token with HTTP ${response.status}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body ? `: ${body.slice(0, 240)}` : "";
    throw new JiraHttpError(response.status, `JIRA API fetch failed with HTTP ${response.status}${detail}`);
  }

  return response.json() as Promise<T>;
}

function isRetryableJiraError(error: unknown) {
  if (error instanceof JiraHttpError) {
    return error.status === 429 || error.status >= 500;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /aborted due to timeout|timeout|AbortError|ECONNRESET|ETIMEDOUT|fetch failed/i.test(`${error.name} ${error.message}`);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapJiraIssue(issue: JiraIssueResponse, fallbackId: string, webUrl: string): ExternalTicket {
  const fields = issue.fields ?? {};
  const issueComments = fields.comment?.comments?.map(mapJiraComment) ?? [];

  return {
    id: issue.key ?? fallbackId,
    system: "JIRA",
    rawStatus: fields.status?.name ?? "UNKNOWN",
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? fields.assignee?.name ?? fields.assignee?.emailAddress ?? null,
    resolution: fields.resolution?.name ?? null,
    slaDueAt: null,
    dueDate: fields.duedate ? new Date(fields.duedate).toISOString() : null,
    updatedAt: fields.updated ?? fields.created ?? new Date().toISOString(),
    comments: issueComments,
    webUrl,
    payload: {
      issue,
      summary: fields.summary ?? null,
      reporter: fields.reporter?.displayName ?? fields.reporter?.name ?? fields.reporter?.emailAddress ?? null,
      creator: fields.creator?.displayName ?? fields.creator?.name ?? fields.creator?.emailAddress ?? null,
      webUrl,
      apiBaseUrl: JIRA_BASE_URL,
      source: "jira-rest-api"
    }
  };
}

function mapJiraComment(comment: JiraIssueComment): ExternalComment {
  return {
    id: comment.id ?? randomUUID(),
    author: comment.author?.displayName ?? comment.author?.name ?? comment.author?.emailAddress ?? "Jira",
    body: jiraBodyToText(comment.body),
    createdAt: comment.created ?? comment.updated ?? new Date().toISOString()
  };
}

function jiraBodyToText(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  if (!body || typeof body !== "object") {
    return "";
  }

  const chunks: string[] = [];
  collectJiraText(body, chunks);

  if (chunks.length > 0) {
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  }

  try {
    return JSON.stringify(body);
  } catch {
    return "";
  }
}

function collectJiraText(node: unknown, chunks: string[]) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectJiraText(item, chunks));
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === "string") {
    chunks.push(record.text);
  }

  collectJiraText(record.content, chunks);
}
