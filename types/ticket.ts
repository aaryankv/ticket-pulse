import type { RiskLevel, TicketPriority } from "@prisma/client";

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
