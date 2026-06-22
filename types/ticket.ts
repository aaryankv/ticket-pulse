import type { RiskLevel, TicketPriority, TicketSystem } from "@prisma/client";

export type DashboardTicket = {
  id: string;
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
  title: string | null;
  priority: TicketPriority;
  status: string;
  assignee: string | null;
  currentRisk: RiskLevel;
  lastSyncedAt: string | null;
  externalLinks?: unknown;
  createdAt: string;
  updatedAt: string;
  agingDays: number;
};

export type DashboardMetrics = {
  openTickets: number;
  closedTickets: number;
  highRiskTickets: number;
  slaRisks: number;
  statusDistribution: Array<{ name: string; value: number }>;
  agingBuckets: Array<{ name: string; value: number }>;
  workload: Array<{ name: string; tickets: number }>;
  openClosed: Array<{ name: string; open: number; closed: number }>;
};

export type TimelineItem = {
  id: string;
  system: string | null;
  changedField: string;
  previousValue: string | null;
  newValue: string | null;
  message: string;
  createdAt: string;
};

export type SystemComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type SystemSnapshotDetail = {
  system: TicketSystem;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  resolution: string | null;
  dueDate: string | null;
  slaDueAt: string | null;
  fetchedAt: string;
  webUrl?: string;
  source?: string;
  textSample?: string;
  comments: SystemComment[];
};
