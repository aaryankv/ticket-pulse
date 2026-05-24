import type { TrackedTicket, User } from "@prisma/client";
import { sendEmail } from "@/services/notifications/email";
import { sendSlackMessage } from "@/services/notifications/slack";
import type { TicketChange } from "@/services/change-detection";

type UserWithPreferences = User & {
  notificationPreference?: {
    immediateAlerts: boolean;
    emailNotifications: boolean;
    slackNotifications: boolean;
    email: string | null;
    slackWebhookUrl: string | null;
    mutedFields: string[];
  } | null;
};

export async function notifyTicketChanges(input: {
  ticket: TrackedTicket;
  user: UserWithPreferences;
  changes: TicketChange[];
}) {
  const preferences = input.user.notificationPreference;
  if (!preferences?.immediateAlerts) {
    return;
  }

  const relevantChanges = input.changes.filter(
    (change) => !preferences.mutedFields.includes(change.changedField)
  );

  if (relevantChanges.length === 0) {
    return;
  }

  const subject = `Ticket Pulse: ${input.ticket.jiraId ?? input.ticket.bugId ?? input.ticket.supportTicketId} changed`;
  const html = renderChangeEmail(input.ticket, relevantChanges);
  const text = relevantChanges.map((change) => change.message).join("\n");

  if (preferences.emailNotifications) {
    await sendEmail({
      to: preferences.email ?? input.user.email,
      subject,
      html,
      text
    });
  }

  if (preferences.slackNotifications) {
    await sendSlackMessage({
      webhookUrl: preferences.slackWebhookUrl,
      text: `${subject}\n${text}`
    });
  }
}

function renderChangeEmail(ticket: TrackedTicket, changes: TicketChange[]) {
  const title = escapeHtml(ticket.title ?? ticket.jiraId ?? ticket.bugId ?? ticket.supportTicketId ?? "Tracked ticket");
  const rows = changes
    .map(
      (change) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.system)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.changedField)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.previousValue ?? "")}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(change.newValue ?? "")}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#111827;">
      <h1 style="font-size:20px;margin-bottom:4px;">${title}</h1>
      <p style="color:#4b5563;">Ticket Pulse detected ${changes.length} change(s).</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <thead>
          <tr>
            <th align="left" style="padding:8px;border-bottom:1px solid #d1d5db;">System</th>
            <th align="left" style="padding:8px;border-bottom:1px solid #d1d5db;">Field</th>
            <th align="left" style="padding:8px;border-bottom:1px solid #d1d5db;">Previous</th>
            <th align="left" style="padding:8px;border-bottom:1px solid #d1d5db;">Current</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
