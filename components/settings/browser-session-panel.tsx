"use client";

import { ExternalLink, Loader2, MonitorCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BrowserSessionState = {
  profileDir: string;
  exists: boolean;
  mode: "headed" | "headless";
  browserHint: string;
  connectionMode: "existing-edge" | "managed-profile";
  cdpUrl?: string;
};

export function BrowserSessionPanel() {
  const [session, setSession] = useState<BrowserSessionState | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadSession() {
    const response = await fetch("/api/integrations/browser/session");
    if (!response.ok) return;
    const payload = await response.json();
    setSession(payload.session);
  }

  async function connectSession() {
    setLoading(true);
    const response = await fetch("/api/integrations/browser/session", { method: "POST" });
    setLoading(false);

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(payload?.detail ?? payload?.error ?? "Could not open browser session");
      return;
    }

    setSession(payload.session);
    toast.success("Edge session connected. Ticket Pulse will reuse your saved Oracle login.");
    window.setTimeout(() => void loadSession(), 1500);
  }

  useEffect(() => {
    void loadSession();
  }, []);

  const usesExistingEdge = session?.connectionMode === "existing-edge";

  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <MonitorCheck className="size-5" />
        </div>
        <CardTitle>Local browser tracker</CardTitle>
        <CardDescription>
          Attaches to Microsoft Edge so scheduled checks can reuse your saved Oracle unified login session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-background p-3 text-sm">
          <p className="font-medium">Session source</p>
          <p className="mt-1 break-all text-muted-foreground">
            {usesExistingEdge ? session?.cdpUrl ?? "Existing Edge window" : session?.profileDir ?? "Not checked yet"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Status: {usesExistingEdge ? "Existing Edge attach" : session?.exists ? "Profile exists" : "Profile not created"} / {session?.mode ?? "headed"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Browser: {session?.browserHint ?? "Microsoft Edge"}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={connectSession} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <MonitorCheck />}
            Connect Oracle session
          </Button>
          <Button asChild variant="outline">
            <a href="https://support.oracle.com/support/?page=sptemplate&sptemplate=service-request" target="_blank" rel="noreferrer">
              Oracle Support
              <ExternalLink />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}