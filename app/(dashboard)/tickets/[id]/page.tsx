import type { TicketPriority } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { ExternalTicketLink } from "@/components/tickets/external-ticket-link";
import { PriorityBadge, RiskBadge, StatusBadge } from "@/components/tickets/status-badge";
import { TicketTimeline } from "@/components/tickets/ticket-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { buildExternalLinks } from "@/lib/external-links";
import { getTicketDetails } from "@/lib/ticket-data";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TicketDetailsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const details = await getTicketDetails(id, session?.user.id);

  if (!details) {
    notFound();
  }

  const { ticket, timeline } = details;
  const links = buildExternalLinks(ticket);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Ticket details</p>
        <h2 className="text-2xl font-semibold">{ticket.title ?? ticket.jiraId ?? ticket.bugId ?? ticket.supportTicketId}</h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <TicketTimeline items={timeline} />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Detail label="Support Ticket ID">
                <ExternalTicketLink href={links.supportOracle?.ticketUrl} label={ticket.supportTicketId} />
              </Detail>
              <Detail label="Bug ID">
                <ExternalTicketLink href={links.bugOracle?.ticketUrl} label={ticket.bugId} />
              </Detail>
              <Detail label="Jira ID">
                <ExternalTicketLink href={links.jira?.ticketUrl} label={ticket.jiraId} />
              </Detail>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Priority</span>
                <PriorityBadge priority={ticket.priority} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Risk</span>
                <RiskBadge risk={ticket.currentRisk} />
              </div>
              <Detail label="Assignee">{ticket.assignee ?? "Unassigned"}</Detail>
              <Detail label="Last updated">{formatDate(ticket.lastSyncedAt ?? ticket.updatedAt)}</Detail>
              <Detail label="Aging">{ticket.agingDays} days</Detail>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Linked system details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SystemDetail
                id="support-oracle"
                name="Oracle Support"
                identifier={ticket.supportTicketId}
                href={links.supportOracle?.ticketUrl}
                status={ticket.status}
                priority={ticket.priority}
                assignee={ticket.assignee}
                lastUpdated={ticket.lastSyncedAt ?? ticket.updatedAt}
              />
              <SystemDetail
                id="bug-db"
                name="Bug DB"
                identifier={ticket.bugId}
                href={links.bugOracle?.ticketUrl}
                status={ticket.status}
                priority={ticket.priority}
                assignee={ticket.assignee}
                lastUpdated={ticket.lastSyncedAt ?? ticket.updatedAt}
              />
              <SystemDetail
                id="jira"
                name="Jira"
                identifier={ticket.jiraId}
                href={links.jira?.ticketUrl}
                status={ticket.status}
                priority={ticket.priority}
                assignee={ticket.assignee}
                lastUpdated={ticket.lastSyncedAt ?? ticket.updatedAt}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>SSO deep links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PortalButton href={links.supportOracle?.ticketUrl} label="Open Oracle Support SR" />
              <PortalButton href={links.jira?.ticketUrl} label="Open Oracle Jira issue" />
              <PortalButton href={links.bugOracle?.ticketUrl} label="Open Bug Oracle record" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

function SystemDetail({
  id,
  name,
  identifier,
  href,
  status,
  priority,
  assignee,
  lastUpdated
}: {
  id: string;
  name: string;
  identifier: string | null;
  href?: string;
  status: string;
  priority: TicketPriority;
  assignee: string | null;
  lastUpdated: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b pb-4 last:border-0 last:pb-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{identifier ?? "Not linked"}</p>
        </div>
        <Button asChild variant="outline" size="sm" disabled={!href}>
          <a href={href ?? "#"} target="_blank" rel="noreferrer">
            Open
            <ExternalLink />
          </a>
        </Button>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Status</span>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Priority</span>
          <PriorityBadge priority={priority} />
        </div>
        <Detail label="Assignee">{assignee ?? "Unassigned"}</Detail>
        <Detail label="Last checked">{formatDate(lastUpdated)}</Detail>
      </div>
    </section>
  );
}

function PortalButton({ href, label }: { href?: string; label: string }) {
  return (
    <Button asChild variant="outline" className="w-full justify-between" disabled={!href}>
      <a href={href ?? "#"} target="_blank" rel="noreferrer">
        {label}
        <ExternalLink />
      </a>
    </Button>
  );
}
