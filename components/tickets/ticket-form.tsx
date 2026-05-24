"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function TicketForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        supportTicketId: String(formData.get("supportTicketId") ?? ""),
        bugId: String(formData.get("bugId") ?? ""),
        jiraId: String(formData.get("jiraId") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        priority: String(formData.get("priority") ?? "MEDIUM")
      })
    });

    setLoading(false);

    if (!response.ok) {
      toast.error("Ticket could not be created");
      return;
    }

    toast.success("Ticket monitoring started");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Track a linked ticket</CardTitle>
        <CardDescription>Enter bare IDs or paste the Oracle Support, Bug Oracle, and Jira URLs. Ticket Pulse creates the polling job automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="supportTicketId">Support ticket number</Label>
            <Input id="supportTicketId" name="supportTicketId" placeholder="4-0002701146 or Oracle Support URL" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bugId">Bug ID</Label>
            <Input id="bugId" name="bugId" placeholder="39342735 or Bug Oracle URL" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jiraId">Jira ID</Label>
            <Input id="jiraId" name="jiraId" placeholder="OFCL-35376 or Jira URL" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select id="priority" name="priority" defaultValue="MEDIUM" className="w-full">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
              <option value="BLOCKER">Blocker</option>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Customer impact, handoff notes, linked incident details" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Save />}
              Start monitoring
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

