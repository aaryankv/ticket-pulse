import { daysBetween } from "@/lib/utils";
import type { DashboardMetrics, DashboardTicket, TimelineItem } from "@/types/ticket";

const now = new Date();

export const demoTickets: DashboardTicket[] = [
  {
    id: "demo-ticket-1",
    supportTicketId: "4-0002701146",
    bugId: "39342735",
    jiraId: "OFCL-35376",
    title: "Intermittent export failure during month close",
    priority: "HIGH",
    status: "IN PROGRESS",
    assignee: "Priya Nair",
    currentRisk: "HIGH",
    lastSyncedAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
    createdAt: new Date(now.getTime() - 9 * 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
    agingDays: 9
  },
  {
    id: "demo-ticket-2",
    supportTicketId: "SR-9938508",
    bugId: "BUG-35630112",
    jiraId: "JIRA-OPS-1905",
    title: "Patch validation blocked by environment drift",
    priority: "BLOCKER",
    status: "FIX IN REVIEW",
    assignee: "Miguel Santos",
    currentRisk: "CRITICAL",
    lastSyncedAt: new Date(now.getTime() - 42 * 60 * 1000).toISOString(),
    createdAt: new Date(now.getTime() - 15 * 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - 42 * 60 * 1000).toISOString(),
    agingDays: 15
  },
  {
    id: "demo-ticket-3",
    supportTicketId: "SR-9938619",
    bugId: "BUG-35635489",
    jiraId: "JIRA-OPS-1918",
    title: "Customer escalation awaiting root cause",
    priority: "CRITICAL",
    status: "CUSTOMER UPDATE NEEDED",
    assignee: "Ava Chen",
    currentRisk: "HIGH",
    lastSyncedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(now.getTime() - 21 * 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    agingDays: 21
  },
  {
    id: "demo-ticket-4",
    supportTicketId: "SR-9938760",
    bugId: null,
    jiraId: "JIRA-OPS-1930",
    title: "Documentation correction for known workaround",
    priority: "MEDIUM",
    status: "CLOSED",
    assignee: "Ravi Menon",
    currentRisk: "LOW",
    lastSyncedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
    agingDays: 3
  }
];

export const demoTimeline: TimelineItem[] = [
  {
    id: "event-1",
    system: "JIRA",
    changedField: "status",
    previousValue: "OPEN",
    newValue: "IN PROGRESS",
    message: "Jira issue moved from OPEN to IN PROGRESS",
    createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "event-2",
    system: "BUG_ORACLE",
    changedField: "assignee",
    previousValue: "Alice Rao",
    newValue: "Priya Nair",
    message: "Bug owner changed from Alice Rao to Priya Nair",
    createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "event-3",
    system: "SUPPORT_ORACLE",
    changedField: "priority",
    previousValue: "MEDIUM",
    newValue: "HIGH",
    message: "Support ticket priority changed from MEDIUM to HIGH",
    createdAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString()
  }
];

export const demoMetrics: DashboardMetrics = {
  openTickets: 3,
  closedTickets: 1,
  highRiskTickets: 3,
  slaRisks: 2,
  statusDistribution: [
    { name: "In progress", value: 1 },
    { name: "Review", value: 1 },
    { name: "Customer", value: 1 },
    { name: "Closed", value: 1 }
  ],
  agingBuckets: [
    { name: "0-7d", value: 1 },
    { name: "8-14d", value: 1 },
    { name: "15-21d", value: 2 },
    { name: "22d+", value: 0 }
  ],
  workload: [
    { name: "Priya", tickets: 1 },
    { name: "Miguel", tickets: 1 },
    { name: "Ava", tickets: 1 },
    { name: "Ravi", tickets: 1 }
  ],
  openClosed: [
    { name: "Mon", open: 11, closed: 3 },
    { name: "Tue", open: 13, closed: 4 },
    { name: "Wed", open: 12, closed: 5 },
    { name: "Thu", open: 15, closed: 6 },
    { name: "Fri", open: 14, closed: 7 }
  ]
};

export function findDemoTicket(id: string) {
  return demoTickets.find((ticket) => ticket.id === id) ?? demoTickets[0];
}

export function normalizeDemoAging() {
  return demoTickets.map((ticket) => ({
    ...ticket,
    agingDays: daysBetween(ticket.createdAt)
  }));
}

