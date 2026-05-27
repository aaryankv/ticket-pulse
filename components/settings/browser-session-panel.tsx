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

    if (!response.ok) {
      toast.error("Could not open browser session");
      return;
    }

    const payload = await response.json();
    setSession(payload.session);
    toast.success("Oracle browser opened. Complete SSO in the browser window.");
  }

  useEffect(() => {
    void loadSession();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <MonitorCheck className="size-5" />
        </div>
        <CardTitle>Local browser tracker</CardTitle>
        <CardDescription>
          Opens Oracle Support, Jira, and Bug Oracle in a persistent local browser profile so scheduled checks can reuse your unified login session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-background p-3 text-sm">
          <p className="font-medium">Session profile</p>
          <p className="mt-1 break-all text-muted-foreground">{session?.profileDir ?? "Not checked yet"}</p>
          <p className="mt-2 text-muted-foreground">
            Status: {session?.exists ? "Profile exists" : "Profile not created"} / {session?.mode ?? "headed"}
          </p>
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
