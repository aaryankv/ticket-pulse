"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeleteTicketButtonProps = Pick<ButtonProps, "className" | "size" | "variant"> & {
  ticketId: string;
  ticketLabel?: string | null;
  redirectTo?: string;
};

export function DeleteTicketButton({
  ticketId,
  ticketLabel,
  redirectTo,
  className,
  size = "sm",
  variant = "destructive"
}: DeleteTicketButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!confirming) {
      return;
    }

    const timer = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  async function handleDelete() {
    if (deleting) {
      return;
    }

    if (!confirming) {
      setConfirming(true);
      return;
    }

    setDeleting(true);
    const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
      method: "DELETE",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    }).catch(() => null);

    setDeleting(false);
    setConfirming(false);

    if (!response) {
      toast.error("Delete failed. The app could not reach the API.");
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(payload?.error ?? `Delete failed (${response.status})`);
      return;
    }

    toast.success("Ticket deleted");
    if (redirectTo) {
      router.push(redirectTo);
      router.refresh();
      return;
    }

    router.refresh();
  }

  const accessibleLabel = confirming
    ? `Confirm delete ${ticketLabel ?? "tracked ticket"}`
    : `Delete ${ticketLabel ?? "tracked ticket"}`;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleDelete}
      disabled={deleting}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={cn("min-w-24", confirming ? "ring-2 ring-destructive/30" : null, className)}
    >
      {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
      {deleting ? "Deleting" : confirming ? "Confirm" : "Delete"}
    </Button>
  );
}
