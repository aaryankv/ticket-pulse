import type { RiskLevel, TicketPriority } from "@prisma/client";

export function calculateRisk(input: {
  priority: TicketPriority | string;
  agingDays: number;
  slaDueAt?: Date | string | null;
  status?: string | null;
}): RiskLevel {
  const priority = input.priority.toString().toUpperCase();
  const status = input.status?.toUpperCase() ?? "";
  const slaDueAt = input.slaDueAt ? new Date(input.slaDueAt) : null;
  const hoursToSla = slaDueAt ? (slaDueAt.getTime() - Date.now()) / 3_600_000 : Number.POSITIVE_INFINITY;

  if (status.includes("CLOSED") || status.includes("RESOLVED")) {
    return "LOW";
  }

  if (priority === "BLOCKER" || hoursToSla <= 8 || input.agingDays >= 21) {
    return "CRITICAL";
  }

  if (priority === "CRITICAL" || priority === "HIGH" || hoursToSla <= 24 || input.agingDays >= 14) {
    return "HIGH";
  }

  if (input.agingDays >= 7) {
    return "MEDIUM";
  }

  return "LOW";
}
