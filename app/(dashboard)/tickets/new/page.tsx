import { TicketForm } from "@/components/tickets/ticket-form";

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Manual entry</p>
        <h2 className="text-2xl font-semibold">Add a tracked ticket</h2>
      </div>
      <TicketForm />
    </div>
  );
}
