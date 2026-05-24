import { Bell, ChartNoAxesCombined, Gauge, Plus, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Role } from "@prisma/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/tickets/new", label: "Track", icon: Plus },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function MobileNav({ role }: { role: Role }) {
  return (
    <nav className="border-b bg-card px-4 py-2 lg:hidden">
      <div className="flex gap-2 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
        {role === "ADMIN" ? (
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ShieldCheck className="size-4" />
            Admin
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
