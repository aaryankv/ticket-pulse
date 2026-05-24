import { GitCommitVertical } from "lucide-react";
import { StatusBadge } from "@/components/tickets/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { TimelineItem } from "@/types/ticket";

export function TicketTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[32px_1fr] gap-3">
              <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <GitCommitVertical className="size-4" />
              </div>
              <div className="rounded-lg border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {item.system ? <StatusBadge status={item.system} /> : null}
                  <span className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</span>
                </div>
                <p className="mt-3 font-medium">{item.message}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.changedField}: {item.previousValue ?? "empty"} {"->"} {item.newValue ?? "empty"}
                </p>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
              No changes have been captured yet.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

