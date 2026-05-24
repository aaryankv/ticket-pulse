import { ExternalLink } from "lucide-react";

export function ExternalTicketLink({ href, label }: { href?: string; label?: string | null }) {
  if (!label) {
    return <span className="text-muted-foreground">Unlinked</span>;
  }

  if (!href) {
    return <span>{label}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}
