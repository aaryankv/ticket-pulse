import type {
  ExternalAuthContext,
  ExternalComment,
  ExternalTicket,
  TicketAdapter
} from "@/services/integrations/types";
import { enterpriseSites, normalizeBugId } from "@/lib/external-links";
import { IntegrationAuthRequiredError } from "@/services/integrations/auth-context";
import { fetchEnterprisePage, parseEnterpriseHtml } from "@/services/integrations/enterprise-fetch";
import { hashComments } from "@/services/integrations/hash";

const comments: ExternalComment[] = [
  {
    id: "bug-comment-1",
    author: "Bug Owner",
    body: "Fix candidate attached to review branch.",
    createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString()
  }
];

export const bugOracleAdapter: TicketAdapter = {
  system: "BUG_ORACLE",
  portalUrl: enterpriseSites.bugOracle.portalUrl,
  getTicketUrl: enterpriseSites.bugOracle.ticketUrl,
  parseTicketId: normalizeBugId,

  async authenticate(context: ExternalAuthContext) {
    if (context.mode === "auth-required") {
      throw new IntegrationAuthRequiredError("BUG_ORACLE");
    }

    return true;
  },

  async fetchTicket(ticketId: string, context: ExternalAuthContext): Promise<ExternalTicket> {
    const normalizedTicketId = normalizeBugId(ticketId);
    const webUrl = enterpriseSites.bugOracle.ticketUrl(normalizedTicketId);

    if (context.mode === "live") {
      const html = await fetchEnterprisePage(webUrl, context);
      return parseEnterpriseHtml({
        id: normalizedTicketId,
        system: "BUG_ORACLE",
        html,
        webUrl,
        fallbackStatus: "UNKNOWN"
      });
    }

    return {
      id: normalizedTicketId,
      system: "BUG_ORACLE",
      rawStatus: normalizedTicketId.endsWith("1") ? "FIX IN REVIEW" : "ASSIGNED",
      priority: normalizedTicketId.endsWith("2") ? "P1" : "P2",
      assignee: normalizedTicketId.endsWith("1") ? "Priya Nair" : "Miguel Santos",
      resolution: null,
      slaDueAt: null,
      dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      updatedAt: new Date().toISOString(),
      comments,
      webUrl,
      payload: {
        bugNumber: normalizedTicketId,
        product: "Fusion Operations",
        ownerTeam: "Platform Reliability",
        portalUrl: enterpriseSites.bugOracle.portalUrl,
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
      system: "BUG_ORACLE",
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
