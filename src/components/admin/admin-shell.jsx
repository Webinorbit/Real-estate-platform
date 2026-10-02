"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, Building2, ChevronsLeft, ChevronsRight, CreditCard, ExternalLink, FileUp, Inbox, KanbanSquare, Lock, LogOut, Menu, Moon, Route, Settings, Sun, Users, View, Globe2,
} from "lucide-react";
import { logoutAction } from "@/app/admin/login/actions";
import { useTheme } from "@/components/providers";
import { BrandMark } from "@/components/site/brand";
import { Avatar, Badge } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/leads", label: "Leads", icon: Inbox, badgeKey: "newLeads" },
  { href: "/admin/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/admin/properties", label: "Properties", icon: Building2, staff: true },
  { href: "/admin/tours", label: "Virtual tours", icon: View, staff: true, feature: "tours" },
  { href: "/admin/routing", label: "Routing engine", icon: Route, staff: true, feature: "routingRules" },
  { href: "/admin/brokers", label: "Team", icon: Users, staff: true },
  { href: "/admin/import", label: "CSV import", icon: FileUp, staff: true, feature: "csvImport" },
  { href: "/admin/settings", label: "Branding & settings", icon: Settings, staff: true },
  { href: "/admin/plan", label: "Plan & billing", icon: CreditCard, staff: true },
  { href: "/admin/tenants", label: "Clients", icon: Globe2, superOnly: true },
];

function NavList({ items, pathname, collapsed, badges, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Admin">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        const badge = item.badgeKey ? badges?.[item.badgeKey] : 0;
        return (
          <Link
            key={item.href}
            href={item.locked ? `/admin/plan?locked=${item.feature}` : item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {active && <motion.span layoutId="admin-active" className="absolute inset-0 rounded-xl bg-primary shadow-soft" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <Icon className="relative size-5 shrink-0" />
            {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
            {!collapsed && item.locked && <Lock className="relative size-3.5 opacity-70" />}
            {!collapsed && badge > 0 && <span className="relative grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">{badge}</span>}
            {collapsed && badge > 0 && <span className="absolute right-2 top-1.5 size-2.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ user, tenant, features, badges, children }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("admin:collapsed") === "1");
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem("admin:collapsed", c ? "0" : "1");
      return !c;
    });

  const isStaff = user.role === "SUPER" || user.role === "OWNER" || user.role === "ADMIN";
  const items = NAV.filter((n) => (isStaff || !n.staff) && (!n.superOnly || user.role === "SUPER")).map((n) => ({ ...n, locked: n.feature && !features[n.feature] }));

  const sidebar = (compact, onNavigate) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center px-5", compact && "justify-center px-0")}>
        <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} compact={compact} href="/admin" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        <NavList items={items} pathname={pathname} collapsed={compact} badges={badges} onNavigate={onNavigate} />
      </div>
      <div className={cn("border-t border-border p-3", compact && "px-2")}>
        {!compact && (
          <div className="mb-3 rounded-xl bg-muted p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan</span>
              <Badge tone="primary">{features.label}</Badge>
            </div>
            <Link href="/admin/plan" onClick={onNavigate} className="mt-1 block text-xs text-primary hover:underline">Compare plans →</Link>
          </div>
        )}
        <a href="/" target="_blank" rel="noreferrer" className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground", compact && "justify-center px-0")} title="Open public site">
          <ExternalLink className="size-5 shrink-0" />
          {!compact && "View public site"}
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/40">
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-card transition-[width] duration-300 lg:block", collapsed ? "w-[4.5rem]" : "w-64")}>
        {sidebar(collapsed)}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3.5 top-20 grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:text-foreground"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </aside>

      <Sheet open={mobile} onOpenChange={setMobile} side="left" title={tenant.name}>
        {sidebar(false, () => setMobile(false))}
      </Sheet>

      <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setMobile(true)} className="grid size-10 place-items-center rounded-full hover:bg-muted lg:hidden" aria-label="Open menu">
            <Menu className="size-6" />
          </button>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Signed in to <span className="font-semibold text-foreground">{tenant.name}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggle} className="grid size-10 place-items-center rounded-full hover:bg-muted" aria-label="Toggle dark mode">
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <div className="flex items-center gap-3 rounded-full border border-border bg-card py-1 pl-1 pr-4">
              <Avatar name={user.name} src={user.broker?.photoUrl} size={34} />
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{user.role.toLowerCase()}</p>
              </div>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger" aria-label="Sign out" title="Sign out">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-[88rem] p-4 sm:p-6 lg:p-8">
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
