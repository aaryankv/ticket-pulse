import type { TicketSystem } from "@prisma/client";

export type IntegrationAuthMode = "live" | "mock" | "auth-required";
export type IntegrationAuthSource = "external-credential" | "oracle-sso" | "none";

export type ExternalAuthContext = {
  userId: string;
  system: TicketSystem;
  mode: IntegrationAuthMode;
  authSource: IntegrationAuthSource;
  accessToken?: string;
  encryptedAccessToken?: string | null;
  scopes?: string[];
};

export type ExternalComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type ExternalTicket = {
  id: string;
  system: TicketSystem;
  rawStatus: string;
  priority?: string | null;
  assignee?: string | null;
  resolution?: string | null;
  slaDueAt?: string | null;
  dueDate?: string | null;
  updatedAt: string;
  comments: ExternalComment[];
  payload: Record<string, unknown>;
  webUrl?: string;
};

export type NormalizedTicket = {
  externalId: string;
  system: TicketSystem;
  status: string;
  priority?: string | null;
  assignee?: string | null;
  resolution?: string | null;
  slaDueAt?: string | null;
  dueDate?: string | null;
  commentsHash: string;
  payload: Record<string, unknown>;
  normalized: Record<string, unknown>;
  webUrl?: string;
};

export type TicketAdapter = {
  system: TicketSystem;
  portalUrl: string;
  getTicketUrl(ticketId: string): string;
  parseTicketId(value: string): string;
  authenticate(context: ExternalAuthContext): Promise<boolean>;
  fetchTicket(ticketId: string, context: ExternalAuthContext): Promise<ExternalTicket>;
  fetchComments(ticketId: string, context: ExternalAuthContext): Promise<ExternalComment[]>;
  normalizeResponse(ticket: ExternalTicket): NormalizedTicket;
};
