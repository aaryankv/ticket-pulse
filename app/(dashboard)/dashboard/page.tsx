import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { MetricsCharts } from "@/components/metrics/metrics-charts";
import { TicketTable } from "@/components/tickets/ticket-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/ticket-data";

export default async function DashboardPage() {
  const session = await auth();
  const { tickets, metrics } = await getDashboardData(session?.user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Live monitoring overview</p>
          <h2 className="text-2xl font-semibold tracking-normal">Tracked tickets</h2>
        </div>
        <Button asChild>
          <Link href="/tickets/new">Track ticket</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label="Open tickets" value={metrics.openTickets} />
        <MetricCard icon={CheckCircle2} label="Closed tickets" value={metrics.closedTickets} />
        <MetricCard icon={AlertTriangle} label="High risk" value={metrics.highRiskTickets} tone="warning" />
        <MetricCard icon={Clock} label="SLA risks" value={metrics.slaRisks} tone="danger" />
      </div>

      <MetricsCharts metrics={metrics} />

      <Card>
        <CardHeader>
          <CardTitle>All tracked work</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketTable tickets={tickets} />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default"
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        : "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300";

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
        </div>
        <div className={`flex size-11 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}
