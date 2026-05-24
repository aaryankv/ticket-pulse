import { GenerateReportButton } from "@/components/reports/generate-report-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/ticket-data";

export default async function ReportsPage() {
  const session = await auth();
  const { metrics } = await getDashboardData(session?.user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Weekly summary</p>
          <h2 className="text-2xl font-semibold">Reports</h2>
        </div>
        <GenerateReportButton />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Tickets opened</CardTitle>
            <CardDescription>This week</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{metrics.openTickets}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tickets closed</CardTitle>
            <CardDescription>This week</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{metrics.closedTickets}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>SLA risks</CardTitle>
            <CardDescription>Needs attention</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{metrics.slaRisks}</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Report contents</CardTitle>
          <CardDescription>Generated emails include the sections engineering managers expect every Friday.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            {[
              "Tickets opened",
              "Tickets closed",
              "Tickets still pending",
              "Aging tickets",
              "High priority blockers",
              "SLA risks",
              "Status movement timeline"
            ].map((item) => (
              <div key={item} className="rounded-lg border bg-background p-3">
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
