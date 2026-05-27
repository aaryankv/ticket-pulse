"use client";

import { ArrowDownUp, ChevronLeft, ChevronRight, MonitorCheck, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalTicketLink } from "@/components/tickets/external-ticket-link";
import { PriorityBadge, RiskBadge, StatusBadge } from "@/components/tickets/status-badge";
import { buildExternalLinks } from "@/lib/external-links";
import { formatDate } from "@/lib/utils";
import type { DashboardTicket } from "@/types/ticket";

type SortKey = "updatedAt" | "agingDays" | "priority" | "status";

export function TicketTable({ tickets }: { tickets: DashboardTicket[] }) {
  const router = useRouter();
  const autoRefreshStarted = useRef(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [page, setPage] = useState(1);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [browserRefreshingId, setBrowserRefreshingId] = useState<string | null>(null);
  const pageSize = 8;

  const filtered = useMemo(() => {
    const source = tickets.filter((ticket) => {
      const haystack = [
        ticket.supportTicketId,
        ticket.bugId,
        ticket.jiraId,
        ticket.title,
        ticket.status,
        ticket.assignee
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        haystack.includes(query.toLowerCase()) &&
        (status === "ALL" || ticket.status === status) &&
        (priority === "ALL" || ticket.priority === priority)
      );
    });

    return source.sort((a, b) => {
      if (sortKey === "agingDays") {
        return b.agingDays - a.agingDays;
      }

      if (sortKey === "updatedAt") {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }

      return String(a[sortKey]).localeCompare(String(b[sortKey]));
    });
  }, [priority, query, sortKey, status, tickets]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const statuses = Array.from(new Set(tickets.map((ticket) => ticket.status)));
  const priorities = Array.from(new Set(tickets.map((ticket) => ticket.priority)));

  useEffect(() => {
    if (autoRefreshStarted.current || tickets.length === 0) {
      return;
    }

    autoRefreshStarted.current = true;
    const controller = new AbortController();

    void (async () => {
      for (const ticket of tickets) {
        const response = await fetch(`/api/tickets/${ticket.id}/refresh-browser`, {
          method: "POST",
          signal: controller.signal
        }).catch(() => null);

        if (!response?.ok) {
          continue;
        }
      }

      router.refresh();
    })();

    return () => controller.abort();
  }, [router, tickets]);

  async function refreshTicket(ticketId: string) {
    setRefreshingId(ticketId);
    const response = await fetch(`/api/tickets/${ticketId}/refresh`, {
      method: "POST"
    });

    setRefreshingId(null);

    if (!response.ok) {
      toast.error("Refresh failed");
      return;
    }

    const payload = await response.json();
    if (payload.failures?.length) {
      toast.warning(`Refresh finished with ${payload.failures.length} integration issue(s)`);
      router.refresh();
      return;
    }

    toast.success(`Refresh complete: ${payload.changes?.length ?? 0} change(s) detected`);
    router.refresh();
  }

  async function browserRefreshTicket(ticketId: string) {
    setBrowserRefreshingId(ticketId);
    const response = await fetch(`/api/tickets/${ticketId}/refresh-browser`, {
      method: "POST"
    });

    setBrowserRefreshingId(null);

    if (!response.ok) {
      toast.error("Browser refresh failed");
      return;
    }

    const payload = await response.json();
    if (payload.failures?.length) {
      toast.warning(`Browser refresh finished with ${payload.failures.length} issue(s)`);
      router.refresh();
      return;
    }

    toast.success(`Browser refresh complete: ${payload.changes?.length ?? 0} change(s) detected`);
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_180px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            className="pl-9"
            placeholder="Search linked IDs, owner, status"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by priority"
        >
          <option value="ALL">All priorities</option>
          {priorities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="Sort tickets">
          <option value="updatedAt">Last updated</option>
          <option value="agingDays">Aging</option>
          <option value="priority">Priority</option>
          <option value="status">Status</option>
        </Select>
        <Button variant="outline" onClick={() => setSortKey(sortKey)} title="Sort tickets">
          <ArrowDownUp />
          Sort
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Support Ticket ID</TableHead>
              <TableHead>Bug ID</TableHead>
              <TableHead>Jira ID</TableHead>
              <TableHead>Current Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead>Aging</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((ticket) => {
              const links = buildExternalLinks(ticket);

              return (
              <TableRow key={ticket.id}>
                <TableCell className="font-medium">
                  <ExternalTicketLink href={links.supportOracle?.ticketUrl} label={ticket.supportTicketId} />
                  <Link href={`/tickets/${ticket.id}`} className="mt-1 block text-xs text-muted-foreground hover:text-foreground">
                    Details
                  </Link>
                </TableCell>
                <TableCell>
                  <ExternalTicketLink href={links.bugOracle?.ticketUrl} label={ticket.bugId} />
                  {ticket.bugId ? (
                    <Link href={`/tickets/${ticket.id}#bug-db`} className="mt-1 block text-xs text-muted-foreground hover:text-foreground">
                      Details
                    </Link>
                  ) : null}
                </TableCell>
                <TableCell>
                  <ExternalTicketLink href={links.jira?.ticketUrl} label={ticket.jiraId} />
                  {ticket.jiraId ? (
                    <Link href={`/tickets/${ticket.id}#jira`} className="mt-1 block text-xs text-muted-foreground hover:text-foreground">
                      Details
                    </Link>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell>{ticket.assignee ?? "Unassigned"}</TableCell>
                <TableCell>{formatDate(ticket.lastSyncedAt ?? ticket.updatedAt)}</TableCell>
                <TableCell>{ticket.agingDays}d</TableCell>
                <TableCell>
                  <RiskBadge risk={ticket.currentRisk} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => refreshTicket(ticket.id)}
                      disabled={refreshingId === ticket.id}
                      aria-label={`Refresh ${ticket.jiraId ?? ticket.supportTicketId ?? ticket.id}`}
                      title="Refresh with API/token adapter"
                    >
                      <RefreshCw className={refreshingId === ticket.id ? "animate-spin" : ""} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => browserRefreshTicket(ticket.id)}
                      disabled={browserRefreshingId === ticket.id}
                      aria-label={`Browser refresh ${ticket.jiraId ?? ticket.supportTicketId ?? ticket.id}`}
                      title="Refresh with local Oracle browser session"
                    >
                      <MonitorCheck className={browserRefreshingId === ticket.id ? "animate-pulse" : ""} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                  No tickets match the current filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {visible.length} of {filtered.length} tickets
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
            <ChevronLeft />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page === totalPages}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}





