"use client";

import { CheckCircle2, KeyRound, Loader2, Save, Trash2, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type JiraProfileState = {
  connected: boolean;
  username: string;
  baseUrl: string;
  updatedAt: string | null;
};

export function JiraProfileForm({ initialProfile }: { initialProfile: JiraProfileState }) {
  const [profile, setProfile] = useState(initialProfile);
  const [username, setUsername] = useState(initialProfile.username);
  const [personalAccessToken, setPersonalAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const response = await fetch("/api/integrations/jira/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        personalAccessToken
      })
    });

    const payload = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok) {
      toast.error(payload?.error ?? "Jira profile could not be saved");
      return;
    }

    setProfile(payload.profile);
    setUsername(payload.profile.username ?? username);
    setPersonalAccessToken("");
    toast.success("Jira API profile saved");
  }

  async function disconnectProfile() {
    if (!profile.connected || !window.confirm("Disconnect the saved Jira API profile?")) {
      return;
    }

    setDisconnecting(true);
    const response = await fetch("/api/integrations/jira/profile", { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    setDisconnecting(false);

    if (!response.ok) {
      toast.error(payload?.error ?? "Jira profile could not be disconnected");
      return;
    }

    setProfile(payload.profile);
    setUsername("");
    setPersonalAccessToken("");
    toast.success("Jira API profile disconnected");
  }

  const updatedLabel = profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : "Not saved";

  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <KeyRound className="size-5" />
        </div>
        <CardTitle>Jira API profile</CardTitle>
        <CardDescription>Jira refreshes use the REST API with an encrypted personal access token.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {profile.connected ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <TriangleAlert className="size-4 text-amber-600" />
              )}
              <span className="font-medium">{profile.connected ? "Connected" : "Connection needed"}</span>
            </div>
            <div className="text-muted-foreground">Last updated: {updatedLabel}</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="jira-username">Jira username</Label>
              <Input
                id="jira-username"
                name="username"
                type="email"
                autoComplete="username"
                placeholder="name@oracle.com"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jira-pat">Personal access token</Label>
              <Input
                id="jira-pat"
                name="personalAccessToken"
                type="password"
                autoComplete="new-password"
                placeholder={profile.connected ? "Paste a new token to rotate" : "Paste Jira PAT"}
                value={personalAccessToken}
                onChange={(event) => setPersonalAccessToken(event.target.value)}
                required={!profile.connected}
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            API base: <span className="break-all font-medium">{profile.baseUrl}</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={saving || disconnecting}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save Jira profile
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!profile.connected || saving || disconnecting}
              onClick={disconnectProfile}
            >
              {disconnecting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Disconnect
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
