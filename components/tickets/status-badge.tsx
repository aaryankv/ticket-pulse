import type { RiskLevel, TicketPriority } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const value = status.toUpperCase();
  const variant =
    value.includes("CLOSED") || value.includes("RESOLVED")
      ? "success"
      : value.includes("BLOCK") || value.includes("CUSTOMER")
        ? "warning"
        : value.includes("REVIEW")
          ? "info"
          : "neutral";

  return <Badge variant={variant}>{status}</Badge>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const variant = risk === "CRITICAL" ? "danger" : risk === "HIGH" ? "warning" : risk === "MEDIUM" ? "info" : "success";
  return <Badge variant={variant}>{risk}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const variant =
    priority === "BLOCKER" || priority === "CRITICAL"
      ? "danger"
      : priority === "HIGH"
        ? "warning"
        : priority === "LOW"
          ? "success"
          : "neutral";

  return <Badge variant={variant}>{priority}</Badge>;
}
