import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Building2,
  CalendarRange,
  Landmark,
  Presentation,
  ReceiptIndianRupee,
  MessageSquare,
  Bell,
  Bot,
  Menu,
  X,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getNotifications, me, type AuthUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogoutConfirmDialog } from "@/components/logout-confirm";
import { GateLoading, GateError } from "@/components/load-state";
import { ClientChatRail } from "@/components/dash/ClientChatRail";

const NAV = [
  { to: "/students", label: "Students", icon: GraduationCap },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/drives", label: "Drives", icon: CalendarRange },
  { to: "/placement-cell", label: "Placement Cell", icon: Landmark },
  { to: "/ld-training", label: "L&D Training", icon: Presentation },
  { to: "/institute-billing", label: "Institute Billing", icon: ReceiptIndianRupee },
] as const;

export function Shell({
  title,
  subtitle,
  actions,
  fullBleed,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  // Chat-style pages drop the title block and the page padding and take the whole
  // viewport under the top bar, the way the student chat screen does.
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // The badge is the real inbox count for this account, not a local tally.
  const { data: inbox } = useQuery({
    queryKey: ["client-notifications"],
    queryFn: getNotifications,
    refetchInterval: 60_000,
  });
  const unread = inbox?.unread ?? 0;

  useEffect(() => {
    let cancelled = false;
    me()
      .then((current) => {
        if (cancelled) return;
        if (current) {
          setUser(current);
          setStatus("ready");
        } else {
          void navigate({
            to: "/institution-auth",
            search: { mode: "login" },
            replace: true,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : null);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (status === "loading") {
    return <GateLoading />;
  }

  if (status === "error" || !user) {
    return <GateError message={errorMessage} />;
  }

  const initials = user.name
    ? user.name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] ?? "")
        .join("")
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="dash-root min-h-screen bg-background">
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {user.institution_logo ? (
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white">
                <img
                  src={user.institution_logo}
                  alt={user.institution || "Institution"}
                  className="size-7 object-contain"
                />
              </span>
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <Bot className="size-4" />
              </span>
            )}
            <span className="truncate text-[15px] font-normal tracking-tight text-sidebar-primary">
              {user.institution || "Institution Dashboard"}
            </span>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <nav className="space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {active && <ChevronRight className="size-3.5" />}
              </Link>
            );
          })}
        </nav>

        {/* Tapping a chat row on mobile should behave like a nav link and dismiss
            the drawer; on desktop setOpen is a no-op. */}
        <div onClick={() => setOpen(false)} className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <ClientChatRail />
        </div>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-1 rounded-md transition-colors hover:bg-sidebar-accent/50">
            <Link
              to="/client-profile"
              aria-label="Open profile"
              title="Open profile"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5"
            >
              <Avatar className="size-8 rounded-md">
                {user.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.name || "Profile"} />
                ) : null}
                <AvatarFallback className="rounded-md bg-sidebar-primary font-display text-xs font-bold text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-primary">
                  {user.name || user.email}
                </p>
                {/* The designation rather than the college: everyone signed in here
                    works at the same institution and already knows which one, while
                    the title is the thing that differs between the officers on the
                    roster. Staff with no designation on record still get a label. */}
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {user.designation ||
                    (user.institution ? `TPO · ${user.institution}` : user.email)}
                </p>
              </div>
            </Link>
            <LogoutConfirmDialog>
              <button
                type="button"
                aria-label="Sign out"
                title="Sign out"
                className="mr-1 shrink-0 cursor-pointer rounded p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </LogoutConfirmDialog>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle className="size-9" />
              <Link
                to="/notifications"
                className="relative grid size-9 place-items-center rounded-md border border-border bg-card transition-colors hover:bg-accent"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary font-mono text-[9px] font-bold text-primary-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </header>

        <main
          className={cn(
            fullBleed ? "h-[calc(100svh-4rem)] overflow-hidden" : "px-4 py-6 sm:px-6 lg:px-8",
          )}
        >
          {!fullBleed && (
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              {title && (
                <div>
                  <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
                  {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
                </div>
              )}
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
