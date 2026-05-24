import {
  Bell,
  ChartNoAxesCombined,
  Gauge,
  Plus,
  Settings,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/tickets/new", label: "Track ticket", icon: Plus },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppSidebar({ role }: { role: Role }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-card lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b p-6">
          <div className="flex items-center gap-3">
            <Image src="/ticket-pulse.svg" alt="Ticket Pulse" width={40} height={40} className="rounded-md" />
            <div>
              <p className="text-base font-semibold">Ticket Pulse</p>
              <p className="text-xs text-muted-foreground">Support flow monitor</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          {role === "ADMIN" ? (
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ShieldCheck className="size-4" />
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="border-t p-4 text-xs text-muted-foreground">
          Mock adapters are active until enterprise API credentials are connected.
        </div>
      </div>
    </aside>
  );
}
