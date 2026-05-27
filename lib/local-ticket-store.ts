import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RiskLevel, TicketPriority } from "@prisma/client";
import { daysBetween } from "@/lib/utils";
import type { DashboardTicket, TimelineItem } from "@/types/ticket";

export type LocalTicketRecord = {
  id: string;
  ownerId: string;
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
  title: string | null;
  notes: string | null;
  priority: TicketPriority;
  status: string;
  assignee: string | null;
  resolution: string | null;
  slaDueAt: string | null;
  dueDate: string | null;
  currentRisk: RiskLevel;
  lastSyncedAt: string | null;
  externalLinks: unknown;
  createdAt: string;
  updatedAt: string;
};

export type LocalTicketChange = {
  system: string | null;
  changedField: string;
  previousValue: string | null;
  newValue: string | null;
  message: string;
};

type LocalTicketEvent = LocalTicketChange & {
  id: string;
  ticketId: string;
  createdAt: string;
};

type LocalTicketStore = {
  tickets: LocalTicketRecord[];
  events: LocalTicketEvent[];
};

type LocalTicketFilters = {
  query?: string;
  status?: string;
  priority?: string;
  risk?: string;
  page: number;
  pageSize: number;
};

const emptyStore: LocalTicketStore = { tickets: [], events: [] };

export function isDatabaseUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Can't reach database server") || message.includes("ECONNREFUSED") || message.includes("P1001");
}

export async function createLocalTicket(input: {
  ownerId: string;
  supportTicketId: string | null;
  bugId: string | null;
  jiraId: string | null;
  notes: string | null;
  priority: TicketPriority;
  currentRisk: RiskLevel;
  externalLinks: unknown;
}) {
  const store = await readStore();
  const now = new Date().toISOString();
  const ticket: LocalTicketRecord = {
    id: `local-${randomUUID()}`,
    ownerId: input.ownerId,
    supportTicketId: input.supportTicketId,
    bugId: input.bugId,
    jiraId: input.jiraId,
    title: input.jiraId ?? input.bugId ?? input.supportTicketId,
    notes: input.notes,
    priority: input.priority,
    status: "MONITORING",
    assignee: null,
    resolution: null,
    slaDueAt: null,
    dueDate: null,
    currentRisk: input.currentRisk,
    lastSyncedAt: null,
    externalLinks: input.externalLinks,
    createdAt: now,
    updatedAt: now
  };

  store.tickets.unshift(ticket);
  store.events.unshift(toEvent(ticket.id, {
    system: null,
    changedField: "ticket",
    previousValue: null,
    newValue: "MONITORING",
    message: "Ticket monitoring started in local fallback storage"
  }, now));

  await writeStore(store);
  return ticket;
}

export async function listLocalTickets(ownerId: string, filters?: LocalTicketFilters) {
  const store = await readStore();
  let tickets = store.tickets.filter((ticket) => ticket.ownerId === ownerId);

  if (filters?.query) {
    const query = filters.query.toLowerCase();
    tickets = tickets.filter((ticket) =>
      [ticket.supportTicketId, ticket.bugId, ticket.jiraId, ticket.title, ticket.status, ticket.assignee]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }

  if (filters?.status) {
    tickets = tickets.filter((ticket) => ticket.status === filters.status);
  }

  if (filters?.priority) {
    tickets = tickets.filter((ticket) => ticket.priority === filters.priority);
  }

  if (filters?.risk) {
    tickets = tickets.filter((ticket) => ticket.currentRisk === filters.risk);
  }

  tickets = tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const total = tickets.length;

  if (filters) {
    tickets = tickets.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize);
  }

  return {
    tickets: tickets.map(toDashboardTicket),
    total
  };
}

export async function getLocalTicketRecord(id: string, ownerId: string) {
  const store = await readStore();
  return store.tickets.find((item) => item.id === id && item.ownerId === ownerId) ?? null;
}

export async function getLocalTicketDetails(id: string, ownerId: string) {
  const store = await readStore();
  const ticket = store.tickets.find((item) => item.id === id && item.ownerId === ownerId);

  if (!ticket) {
    return null;
  }

  return {
    ticket: toDashboardTicket(ticket),
    timeline: store.events
      .filter((event) => event.ticketId === ticket.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((event): TimelineItem => ({
        id: event.id,
        system: event.system,
        changedField: event.changedField,
        previousValue: event.previousValue,
        newValue: event.newValue,
        message: event.message,
        createdAt: event.createdAt
      }))
  };
}

export async function updateLocalTicket(input: {
  id: string;
  ownerId: string;
  patch: Partial<Pick<LocalTicketRecord, "status" | "priority" | "assignee" | "resolution" | "slaDueAt" | "dueDate" | "currentRisk" | "lastSyncedAt" | "externalLinks">>;
  changes: LocalTicketChange[];
}) {
  const store = await readStore();
  const index = store.tickets.findIndex((ticket) => ticket.id === input.id && ticket.ownerId === input.ownerId);

  if (index < 0) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: LocalTicketRecord = {
    ...store.tickets[index],
    ...input.patch,
    updatedAt: now
  };

  store.tickets[index] = updated;
  store.events.unshift(...input.changes.map((change) => toEvent(updated.id, change, now)));
  await writeStore(store);

  return updated;
}

export function toDashboardTicket(ticket: LocalTicketRecord): DashboardTicket {
  return {
    id: ticket.id,
    supportTicketId: ticket.supportTicketId,
    bugId: ticket.bugId,
    jiraId: ticket.jiraId,
    title: ticket.title,
    priority: ticket.priority,
    status: ticket.status,
    assignee: ticket.assignee,
    currentRisk: ticket.currentRisk,
    lastSyncedAt: ticket.lastSyncedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    agingDays: daysBetween(new Date(ticket.createdAt))
  };
}

async function readStore(): Promise<LocalTicketStore> {
  try {
    const content = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(content) as Partial<LocalTicketStore>;
    return {
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch (error) {
    if (isFileMissing(error)) {
      return emptyStore;
    }
    throw error;
  }
}

async function writeStore(store: LocalTicketStore) {
  const storePath = getStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function toEvent(ticketId: string, change: LocalTicketChange, createdAt: string): LocalTicketEvent {
  return {
    id: `local-event-${randomUUID()}`,
    ticketId,
    createdAt,
    ...change
  };
}

function getStorePath() {
  return path.resolve(process.env.LOCAL_TICKET_STORE_PATH ?? ".local-data/tickets.json");
}

function isFileMissing(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}