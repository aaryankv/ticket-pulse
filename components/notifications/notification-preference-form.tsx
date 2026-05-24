"use client";

import { BellRing, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const fields = ["status", "priority", "assignee", "resolution", "slaDueAt", "dueDate", "commentsHash"];

export function NotificationPreferenceForm() {
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const mutedFields = fields.filter((field) => formData.get(`mute-${field}`) === "on");

    const response = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        frequency: String(formData.get("frequency")),
        immediateAlerts: formData.get("immediateAlerts") === "on",
        dailyDigest: formData.get("dailyDigest") === "on",
        weeklyDigest: formData.get("weeklyDigest") === "on",
        emailNotifications: formData.get("emailNotifications") === "on",
        slackNotifications: formData.get("slackNotifications") === "on",
        email: String(formData.get("email") ?? ""),
        slackWebhookUrl: String(formData.get("slackWebhookUrl") ?? ""),
        mutedFields
      })
    });

    setLoading(false);

    if (!response.ok) {
      toast.error("Preferences could not be saved");
      return;
    }

    toast.success("Notification preferences saved");
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <BellRing className="size-5" />
        </div>
        <CardTitle>Delivery preferences</CardTitle>
        <CardDescription>Choose how Ticket Pulse routes change events and digest summaries.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="frequency">Default cadence</Label>
            <Select id="frequency" name="frequency" defaultValue="IMMEDIATE" className="w-full">
              <option value="IMMEDIATE">Immediate</option>
              <option value="DAILY">Daily digest</option>
              <option value="WEEKLY">Weekly digest</option>
              <option value="DISABLED">Disabled</option>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox name="immediateAlerts" label="Immediate alerts" defaultChecked />
            <Checkbox name="dailyDigest" label="Daily digest" />
            <Checkbox name="weeklyDigest" label="Weekly digest" defaultChecked />
            <Checkbox name="emailNotifications" label="Email notifications" defaultChecked />
            <Checkbox name="slackNotifications" label="Slack notifications" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Alert email</Label>
              <Input id="email" name="email" type="email" placeholder="engineer@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slackWebhookUrl">Slack webhook</Label>
              <Input id="slackWebhookUrl" name="slackWebhookUrl" type="url" placeholder="https://hooks.slack.com/..." />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Muted fields</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <Checkbox key={field} name={`mute-${field}`} label={field} />
              ))}
            </div>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Save />}
            Save preferences
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked = false
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}
