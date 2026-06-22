import type { TicketPriority } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { DeleteTicketButton } from "@/components/tickets/delete-ticket-button";
import { ExternalTicketLink } from "@/components/tickets/external-ticket-link";
import { PriorityBadge, RiskBadge, StatusBadge } from "@/components/tickets/status-badge";
import { TicketTimeline } from "@/components/tickets/ticket-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { buildExternalLinks } from "@/lib/external-links";
import { getTicketDetails } from "@/lib/ticket-data";
import { formatDate } from "@/lib/utils";
import type { SystemSnapshotDetail } from "@/types/ticket";

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
  const systemDetails = "systemDetails" in details ? details.systemDetails : [];
  const links = buildExternalLinks(ticket);
  const ticketLabel = ticket.jiraId ?? ticket.bugId ?? ticket.supportTicketId ?? ticket.title ?? "tracked ticket";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Ticket details</p>
        <h2 className="text-2xl font-semibold">{ticket.title ?? ticket.jiraId ?? ticket.bugId ?? ticket.supportTicketId}</h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <TicketTimeline items={timeline} />
          <SystemSnapshots details={systemDetails} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.supportTicketId ? (
                <Detail label="Support Ticket ID">
                  <ExternalTicketLink href={links.supportOracle?.ticketUrl} label={ticket.supportTicketId} />
                </Detail>
              ) : null}
              {ticket.bugId ? (
                <Detail label="Bug ID">
                  <ExternalTicketLink href={links.bugOracle?.ticketUrl} label={ticket.bugId} />
                </Detail>
              ) : null}
              {ticket.jiraId ? (
                <Detail label="Jira ID">
                  <ExternalTicketLink href={links.jira?.ticketUrl} label={ticket.jiraId} />
                </Detail>
              ) : null}
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
              {ticket.supportTicketId ? (
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
              ) : null}
              {ticket.bugId ? (
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
              ) : null}
              {ticket.jiraId ? (
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
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>External links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticket.supportTicketId ? <PortalButton href={links.supportOracle?.ticketUrl} label="Open Oracle Support SR" /> : null}
              {ticket.jiraId ? <PortalButton href={links.jira?.ticketUrl} label="Open Oracle Jira issue" /> : null}
              {ticket.bugId ? <PortalButton href={links.bugOracle?.ticketUrl} label="Open Bug Oracle record" /> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <DeleteTicketButton
                ticketId={ticket.id}
                ticketLabel={ticketLabel}
                redirectTo="/dashboard"
                className="w-full"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SystemSnapshots({ details }: { details: SystemSnapshotDetail[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Captured system details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {details.map((detail) => (
          <section key={detail.system} className="rounded-lg border bg-background p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{formatSystemName(detail.system)}</p>
                <p className="text-xs text-muted-foreground">
                  {detail.source ?? "tracked"} / checked {formatDate(detail.fetchedAt)}
                </p>
              </div>
              {detail.webUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={detail.webUrl} target="_blank" rel="noreferrer">
                    Open
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SnapshotField label="Status" value={detail.status} />
              <SnapshotField label="Priority" value={detail.priority} />
              <SnapshotField label="Assignee" value={detail.assignee} />
              <SnapshotField label="Resolution" value={detail.resolution} />
              <SnapshotField label="Due date" value={detail.dueDate ? formatDate(detail.dueDate) : null} />
              <SnapshotField label="SLA due" value={detail.slaDueAt ? formatDate(detail.slaDueAt) : null} />
            </div>
            {detail.textSample ? (
              <p className="mt-4 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                {detail.textSample}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium">Comments</p>
              {detail.comments.length > 0 ? (
                detail.comments.map((comment) => (
                  <div key={comment.id} className="rounded-md border p-3">
                    <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                      <span>{comment.author}</span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">No comments captured yet.</p>
              )}
            </div>
          </section>
        ))}
        {details.length === 0 ? (
          <p className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
            No system snapshots have been captured yet. Tracking starts automatically after ticket creation.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SnapshotField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value ?? "Not captured"}</p>
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

function formatSystemName(system: string) {
  switch (system) {
    case "SUPPORT_ORACLE":
      return "Oracle Support";
    case "BUG_ORACLE":
      return "Bug DB";
    case "JIRA":
      return "Jira";
    default:
      return system;
  }
}
