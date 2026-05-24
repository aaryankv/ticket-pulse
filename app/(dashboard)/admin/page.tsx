import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const session = await auth();

  if (session?.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Administrative controls</p>
        <h2 className="text-2xl font-semibold">Admin</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <AdminStat label="Users" value={stats.users} />
        <AdminStat label="Tracked tickets" value={stats.tickets} />
        <AdminStat label="Polling jobs" value={stats.jobs} />
        <AdminStat label="Events" value={stats.events} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Operational notes</CardTitle>
          <CardDescription>Admin tools are intentionally conservative in this first phase.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border bg-background p-3">Review failed polling jobs before escalating tickets.</div>
          <div className="rounded-lg border bg-background p-3">Rotate external OAuth tokens through encrypted credential records.</div>
          <div className="rounded-lg border bg-background p-3">Move to BullMQ workers when polling volume grows beyond a single node.</div>
          <div className="rounded-lg border bg-background p-3">Use SSO providers through NextAuth before production rollout.</div>
        </CardContent>
      </Card>
    </div>
  );
}

async function getStats() {
  if (!process.env.DATABASE_URL) {
    return { users: 1, tickets: 4, jobs: 4, events: 12 };
  }

  try {
    const [users, tickets, jobs, events] = await Promise.all([
      prisma.user.count(),
      prisma.trackedTicket.count(),
      prisma.pollingJob.count(),
      prisma.ticketEvent.count()
    ]);

    return { users, tickets, jobs, events };
  } catch {
    return { users: 1, tickets: 4, jobs: 4, events: 12 };
  }
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>Current workspace</CardDescription>
      </CardHeader>
      <CardContent className="text-3xl font-semibold">{value}</CardContent>
    </Card>
  );
}
