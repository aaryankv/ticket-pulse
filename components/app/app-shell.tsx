import type { Session } from "next-auth";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { initials } from "@/lib/utils";

export function AppShell({
  user,
  children
}: {
  user: Session["user"];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar role={user.role} />
      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Operations workspace</p>
              <h1 className="text-lg font-semibold">Ticket Pulse</h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(user.name ?? user.email)}
                </div>
                <div className="hidden text-sm sm:block">
                  <p className="font-medium leading-none">{user.name ?? "Team member"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{user.role}</p>
                </div>
              </div>
              <LogoutButton />
            </div>
          </div>
        </header>
        <MobileNav role={user.role} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
