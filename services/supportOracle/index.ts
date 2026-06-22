import type {
  ExternalAuthContext,
  ExternalComment,
  ExternalTicket,
  TicketAdapter
} from "@/services/integrations/types";
import { enterpriseSites, normalizeSupportTicketId } from "@/lib/external-links";
import { IntegrationAuthRequiredError } from "@/services/integrations/auth-context";
import { fetchEnterprisePage, parseEnterpriseHtml } from "@/services/integrations/enterprise-fetch";
import { hashComments } from "@/services/integrations/hash";

const comments: ExternalComment[] = [
  {
    id: "support-comment-1",
    author: "Support Engineer",
    body: "Customer impact confirmed and workaround shared.",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  }
];

export const supportOracleAdapter: TicketAdapter = {
  system: "SUPPORT_ORACLE",
  portalUrl: enterpriseSites.supportOracle.portalUrl,
  getTicketUrl: enterpriseSites.supportOracle.ticketUrl,
  parseTicketId: normalizeSupportTicketId,

  async authenticate(context: ExternalAuthContext) {
    if (context.mode === "auth-required") {
      throw new IntegrationAuthRequiredError("SUPPORT_ORACLE");
    }

    return true;
  },

  async fetchTicket(ticketId: string, context: ExternalAuthContext): Promise<ExternalTicket> {
    const normalizedTicketId = normalizeSupportTicketId(ticketId);
    const webUrl = enterpriseSites.supportOracle.ticketUrl(normalizedTicketId);

    if (context.mode === "live") {
      const html = await fetchEnterprisePage(webUrl, context);
      return parseEnterpriseHtml({
        id: normalizedTicketId,
        system: "SUPPORT_ORACLE",
        html,
        webUrl,
        fallbackStatus: "UNKNOWN"
      });
    }

    return {
      id: normalizedTicketId,
      system: "SUPPORT_ORACLE",
      rawStatus: normalizedTicketId.endsWith("9") ? "CUSTOMER UPDATE NEEDED" : "IN PROGRESS",
      priority: normalizedTicketId.endsWith("8") ? "CRITICAL" : "HIGH",
      assignee: "Support Duty Queue",
      resolution: null,
      slaDueAt: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
      dueDate: null,
      updatedAt: new Date().toISOString(),
      comments,
      webUrl,
      payload: {
        supportTicketNumber: normalizedTicketId,
        customerSeverity: "S2",
        channel: "Oracle Support",
        portalUrl: enterpriseSites.supportOracle.portalUrl,
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
      system: "SUPPORT_ORACLE",
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
        webUrl: ticket.webUrl
      }
    };
  }
};
