"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, LayoutDashboard, Menu, Moon, Search, Sun, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/site/brand";
import { useTheme } from "@/components/providers";
import { useVisitor } from "@/components/site/stores";
import { Sheet } from "@/components/ui/dialog";
import { ButtonLink } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function SiteHeader({ tenant, onOpenSearch }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const visitor = useVisitor();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const overlay = pathname === "/" && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "/properties?lt=SALE", label: "Buy", match: (p, s) => p.startsWith("/properties") && !s.includes("RENT") },
    { href: "/properties?lt=RENT", label: "Rent", match: (p, s) => p.startsWith("/properties") && s.includes("RENT") },
    ...(tenant.toursEnabled ? [{ href: "/tours", label: "Virtual tours", match: (p) => p.startsWith("/tour") }] : []),
    { href: "/brokers", label: "Our team", match: (p) => p.startsWith("/brokers") },
    { href: "/contact", label: "Contact", match: (p) => p.startsWith("/contact") },
  ];

  const [search, setSearch] = useState("");
  useEffect(() => setSearch(window.location.search), [pathname]);

  const iconBtn = cn(
    "relative grid size-10 place-items-center rounded-full transition-colors",
    overlay ? "text-white hover:bg-white/15" : "text-foreground hover:bg-muted",
  );

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          overlay ? "bg-gradient-to-b from-black/50 to-transparent" : "glass border-b border-border/70 shadow-soft",
        )}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-[90rem] items-center gap-4 px-4 sm:px-6">
          <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} light={overlay} />

          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Primary">
            {links.map((l) => {
              const active = l.match(pathname, search);
              return (
                <Link
                  key={l.label}
                  href={l.href}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    overlay ? "text-white/90 hover:text-white" : "text-muted-foreground hover:text-foreground",
                    active && (overlay ? "text-white" : "text-foreground"),
                  )}
                >
                  {l.label}
                  {active && <motion.span layoutId="nav-pill" className={cn("absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full", overlay ? "bg-accent" : "bg-primary")} />}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={onOpenSearch}
              className={cn(
                "hidden items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors md:flex",
                overlay ? "border-white/30 text-white/85 hover:bg-white/10" : "border-border bg-card/70 text-muted-foreground hover:text-foreground",
              )}
              aria-label="Open quick search"
            >
              <Search className="size-4" />
              Quick search
              <Kbd>⌘K</Kbd>
            </button>
            <button onClick={onOpenSearch} className={cn(iconBtn, "md:hidden")} aria-label="Search">
              <Search className="size-5" />
            </button>
            <Link href="/favorites" className={iconBtn} aria-label={`Favourites (${visitor?.favs.length || 0})`}>
              <Heart className="size-5" />
              {visitor?.favs.length > 0 && (
                <motion.span
                  key={visitor.favs.length}
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground"
                >
                  {visitor.favs.length}
                </motion.span>
              )}
            </Link>
            <button onClick={toggle} className={iconBtn} aria-label="Toggle dark mode">
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            {tenant.staff && (
              <ButtonLink href="/admin" variant={overlay ? "glass" : "outline"} size="sm" className="ml-1 hidden md:inline-flex">
                <LayoutDashboard className="size-4" /> Dashboard
              </ButtonLink>
            )}
            <ButtonLink href="/contact" variant={overlay ? "accent" : "primary"} size="sm" className={cn("hidden sm:inline-flex", !tenant.staff && "ml-1")}>
              <Phone className="size-4" /> Talk to an advisor
            </ButtonLink>
            <button onClick={() => setMenu(true)} className={cn(iconBtn, "lg:hidden")} aria-label="Open menu">
              <Menu className="size-6" />
            </button>
          </div>
        </div>
      </motion.header>

      <Sheet open={menu} onOpenChange={setMenu} side="left" title={tenant.name}>
        <nav className="flex flex-col p-3" aria-label="Mobile">
          {links.map((l) => (
            <Link key={l.label} href={l.href} onClick={() => setMenu(false)} className="rounded-xl px-4 py-3.5 text-lg font-medium hover:bg-muted">
              {l.label}
            </Link>
          ))}
          <Link href="/favorites" onClick={() => setMenu(false)} className="rounded-xl px-4 py-3.5 text-lg font-medium hover:bg-muted">
            Favourites
          </Link>
          <div className="mt-4 space-y-2 px-4">
            <ButtonLink href="/contact" className="w-full" onClick={() => setMenu(false)}>
              Talk to an advisor
            </ButtonLink>
            {tenant.staff && (
              <ButtonLink href="/admin" variant="outline" className="w-full" onClick={() => setMenu(false)}>
                <LayoutDashboard className="size-4" /> Dashboard
              </ButtonLink>
            )}
          </div>
        </nav>
      </Sheet>
    </>
  );
}
