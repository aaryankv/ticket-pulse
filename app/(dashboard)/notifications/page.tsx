import { BellRing, Mail, MessageSquare } from "lucide-react";
import { NotificationPreferenceForm } from "@/components/notifications/notification-preference-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Alert routing</p>
        <h2 className="text-2xl font-semibold">Notifications</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <NotificationPreferenceForm />
        <div className="space-y-4">
          <InfoCard icon={BellRing} title="Immediate alerts" description="Status, owner, priority, SLA, due date, and comment changes can alert instantly." />
          <InfoCard icon={Mail} title="Digest emails" description="Daily and weekly summaries use the same change history captured by polling." />
          <InfoCard icon={MessageSquare} title="Slack webhooks" description="Team channels can receive concise change messages without exposing credentials." />
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  description
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <Icon className="size-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
