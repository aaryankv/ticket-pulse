import type { TicketSystem } from "@prisma/client";
import type { NormalizedTicket } from "@/services/integrations/types";

export type SnapshotLike = {
  system: TicketSystem;
  status?: string | null;
  priority?: string | null;
  assignee?: string | null;
  resolution?: string | null;
  commentsHash?: string | null;
  slaDueAt?: Date | string | null;
  dueDate?: Date | string | null;
};

export type TicketChange = {
  system: TicketSystem;
  eventType: string;
  changedField: string;
  previousValue: string | null;
  newValue: string | null;
  message: string;
};

const trackedFields = [
  "status",
  "priority",
  "assignee",
  "resolution",
  "slaDueAt",
  "dueDate",
  "commentsHash"
] as const;

export function detectTicketChanges(
  previous: SnapshotLike | null,
  current: NormalizedTicket
): TicketChange[] {
  if (!previous) {
    return [
      {
        system: current.system,
        eventType: "SNAPSHOT_CREATED",
        changedField: "snapshot",
        previousValue: null,
        newValue: current.status,
        message: `${formatSystem(current.system)} snapshot captured with status ${current.status}`
      }
    ];
  }

  return trackedFields.flatMap((field) => {
    const previousValue = stringifyValue(previous[field]);
    const newValue = stringifyValue(current[field]);

    if (previousValue === newValue) {
      return [];
    }

    return {
      system: current.system,
      eventType: eventTypeFor(field),
      changedField: field,
      previousValue,
      newValue,
      message: buildChangeMessage(current.system, field, previousValue, newValue)
    };
  });
}

export function buildChangeMessage(
  system: TicketSystem,
  field: string,
  previousValue: string | null,
  newValue: string | null
) {
  const label = formatSystem(system);

  if (field === "commentsHash") {
    return `${label} has new comments`;
  }

  if (field === "status") {
    return `${label} issue moved from ${previousValue ?? "empty"} to ${newValue ?? "empty"}`;
  }

  if (field === "assignee") {
    return `${label} owner changed from ${previousValue ?? "unassigned"} to ${newValue ?? "unassigned"}`;
  }

  return `${label} ${field} changed from ${previousValue ?? "empty"} to ${newValue ?? "empty"}`;
}

function eventTypeFor(field: string) {
  if (field === "commentsHash") {
    return "COMMENT_ADDED";
  }

  return `${field.toUpperCase()}_CHANGED`;
}

function stringifyValue(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? null;
}

function formatSystem(system: TicketSystem) {
  switch (system) {
    case "SUPPORT_ORACLE":
      return "Support ticket";
    case "BUG_ORACLE":
      return "Bug";
    case "JIRA":
      return "Jira";
    default:
      return system;
  }
}
