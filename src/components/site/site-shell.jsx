"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { CompareBar } from "@/components/site/compare-bar";
import { VisitorProvider } from "@/components/site/stores";

const CommandPalette = dynamic(() => import("@/components/site/command-palette").then((m) => m.CommandPalette), { ssr: false });

export function SiteShell({ tenant, children }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);

  const setOpen = (value) => {
    setPaletteLoaded(true);
    setSearchOpen(value);
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteLoaded(true);
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <VisitorProvider tenantSlug={tenant.slug}>
      <a href="#main" className="sr-only z-[100] rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <SiteHeader tenant={tenant} onOpenSearch={() => setOpen(true)} />
      {paletteLoaded && <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} tenant={tenant} />}
      <div id="main">{children}</div>
      <CompareBar />
      {tenant.whatsapp && (
        <a
          href={`https://wa.me/${String(tenant.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${tenant.name}, I'd like help finding a property.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          className="fixed bottom-5 right-5 z-30 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-110 max-sm:bottom-20"
        >
          <MessageCircle className="size-7" />
        </a>
      )}
    </VisitorProvider>
  );
}
