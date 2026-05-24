import type {
  ExternalAuthContext,
  ExternalComment,
  ExternalTicket,
  TicketAdapter
} from "@/services/integrations/types";
import { enterpriseSites, normalizeJiraId } from "@/lib/external-links";
import { IntegrationAuthRequiredError } from "@/services/integrations/auth-context";
import { fetchEnterprisePage, fetchJson, parseEnterpriseHtml } from "@/services/integrations/enterprise-fetch";
import { hashComments } from "@/services/integrations/hash";

const comments: ExternalComment[] = [
  {
    id: "jira-comment-1",
    author: "Jira Assignee",
    body: "Deployment validation scheduled with QE.",
    createdAt: new Date(Date.now() - 24 * 60 * 1000).toISOString()
  }
];

type JiraIssueResponse = {
  id?: string;
  key?: string;
  fields?: {
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string; name?: string; emailAddress?: string } | null;
    resolution?: { name?: string } | null;
    updated?: string;
    duedate?: string | null;
    comment?: {
      comments?: Array<{
        id?: string;
        author?: { displayName?: string; name?: string };
        body?: string;
        created?: string;
      }>;
    };
  };
};

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
        const issue = await fetchJson<JiraIssueResponse>(
          `https://jira.oraclecorp.com/rest/api/2/issue/${encodeURIComponent(
            normalizedTicketId
          )}?fields=status,priority,assignee,resolution,updated,duedate,comment`,
          context
        );

        return mapJiraIssue(issue, normalizedTicketId, webUrl);
      } catch {
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

  async fetchComments(_ticketId: string, context: ExternalAuthContext) {
    return context.mode === "live" ? [] : comments;
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
      payload: ticket.payload,
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

function mapJiraIssue(issue: JiraIssueResponse, fallbackId: string, webUrl: string): ExternalTicket {
  const fields = issue.fields ?? {};
  const issueComments = fields.comment?.comments?.map((comment) => ({
    id: comment.id ?? crypto.randomUUID(),
    author: comment.author?.displayName ?? comment.author?.name ?? "Jira",
    body: comment.body ?? "",
    createdAt: comment.created ?? new Date().toISOString()
  })) ?? [];

  return {
    id: issue.key ?? fallbackId,
    system: "JIRA",
    rawStatus: fields.status?.name ?? "UNKNOWN",
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName ?? fields.assignee?.name ?? fields.assignee?.emailAddress ?? null,
    resolution: fields.resolution?.name ?? null,
    slaDueAt: null,
    dueDate: fields.duedate ? new Date(fields.duedate).toISOString() : null,
    updatedAt: fields.updated ?? new Date().toISOString(),
    comments: issueComments,
    webUrl,
    payload: {
      issue,
      webUrl,
      source: "jira-rest-api"
    }
  };
}
