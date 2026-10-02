"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Building2, Heart, Home, Key, MapPin, Moon, Phone, Search, Users, View } from "lucide-react";
import { useTheme } from "@/components/providers";
import { formatPriceCompact } from "@/lib/format";

const item =
  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground";

export function CommandPalette({ open, onOpenChange, tenant }) {
  const router = useRouter();
  const { toggle } = useTheme();
  const [q, setQ] = useState("");
  const [data, setData] = useState({ localities: [], properties: [] });

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }, q ? 160 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = (href) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm data-[state=open]:animate-[fadeIn_0.15s_ease-out]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-[90] w-[min(94vw,40rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-lift data-[state=open]:animate-[dialogIn_0.2s_ease-out] focus:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Quick search</DialogPrimitive.Title>
          <Command shouldFilter={false} loop label="Quick search">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 text-muted-foreground" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder={`Search ${tenant.name} listings, areas, pages...`}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[56vh] overflow-y-auto p-2">
              <Command.Empty className="px-4 py-10 text-center text-sm text-muted-foreground">No matches. Press Enter to search all listings.</Command.Empty>

              {q && (
                <Command.Group heading="Search" className="px-1 pb-1 text-xs font-semibold text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  <Command.Item value={`search-${q}`} className={item} onSelect={() => go(`/properties?q=${encodeURIComponent(q)}`)}>
                    <Search className="size-4 text-primary" /> Search all listings for &ldquo;{q}&rdquo;
                  </Command.Item>
                </Command.Group>
              )}

              {data.localities.length > 0 && (
                <Command.Group heading={q ? "Areas" : "Popular areas"} className="px-1 pb-1 text-xs font-semibold text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {data.localities.map((l) => (
                    <Command.Item key={l.label} value={`loc-${l.label}`} className={item} onSelect={() => go(`/properties?q=${encodeURIComponent(l.label)}`)}>
                      <MapPin className="size-4 text-primary" />
                      <span className="font-medium text-foreground">{l.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{l.count} listings</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {data.properties.length > 0 && (
                <Command.Group heading="Properties" className="px-1 pb-1 text-xs font-semibold text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {data.properties.map((p) => (
                    <Command.Item key={p.slug} value={`prop-${p.slug}`} className={item} onSelect={() => go(`/properties/${p.slug}`)}>
                      <Building2 className="size-4 text-primary" />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.locality} · {formatPriceCompact(p.price, tenant.currency)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {!q && (
                <Command.Group heading="Go to" className="px-1 pb-1 text-xs font-semibold text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  <Command.Item value="go-home" className={item} onSelect={() => go("/")}><Home className="size-4 text-primary" /> Home</Command.Item>
                  <Command.Item value="go-buy" className={item} onSelect={() => go("/properties?lt=SALE")}><Building2 className="size-4 text-primary" /> Buy: map search</Command.Item>
                  <Command.Item value="go-rent" className={item} onSelect={() => go("/properties?lt=RENT")}><Key className="size-4 text-primary" /> Rent: map search</Command.Item>
                  {tenant.toursEnabled && <Command.Item value="go-tours" className={item} onSelect={() => go("/tours")}><View className="size-4 text-primary" /> Virtual tours</Command.Item>}
                  <Command.Item value="go-fav" className={item} onSelect={() => go("/favorites")}><Heart className="size-4 text-primary" /> My favourites</Command.Item>
                  <Command.Item value="go-team" className={item} onSelect={() => go("/brokers")}><Users className="size-4 text-primary" /> Meet our advisors</Command.Item>
                  <Command.Item value="go-contact" className={item} onSelect={() => go("/contact")}><Phone className="size-4 text-primary" /> Contact us</Command.Item>
                  <Command.Item value="go-theme" className={item} onSelect={() => { toggle(); onOpenChange(false); }}><Moon className="size-4 text-primary" /> Toggle dark mode</Command.Item>
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>Navigate with ↑ ↓, open with Enter</span>
              <span>Esc to close</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
