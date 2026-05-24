import type { RiskLevel, TicketPriority } from "@prisma/client";

export function priorityLabel(priority: TicketPriority) {
  return priority.toLowerCase().replace(/^\w/, (value) => value.toUpperCase());
}

export function riskLabel(risk: RiskLevel) {
  return risk.toLowerCase().replace(/^\w/, (value) => value.toUpperCase());
}
