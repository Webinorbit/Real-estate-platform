"use client";

import { useEffect } from "react";
import { Check, GitCompare, Printer, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HeartButton } from "@/components/site/property-card";
import { useVisitor } from "@/components/site/stores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PropertyActions({ id, title }) {
  const v = useVisitor();
  const [copied, setCopied] = useState(false);
  const compared = v?.isCompared(id);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <HeartButton id={id} title={title} size="lg" className="border border-border bg-card shadow-none" />
      <Button variant="outline" size="icon" onClick={share} aria-label="Share this property" className="size-12 rounded-full">
        {copied ? <Check className="size-5" /> : <Share2 className="size-5" />}
      </Button>
      <Button variant={compared ? "primary" : "outline"} size="icon" onClick={() => v?.toggleCompare(id)} aria-pressed={!!compared} aria-label="Compare" className="size-12 rounded-full">
        <GitCompare className="size-5" />
      </Button>
      <Button variant="outline" size="icon" onClick={() => window.print()} aria-label="Print" className="size-12 rounded-full max-sm:hidden">
        <Printer className="size-5" />
      </Button>
    </div>
  );
}

/** Pins a CTA to the bottom on small screens until the contact form scrolls into view. */
export function MobileEnquiryBar({ price, label = "Enquire now" }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const target = document.getElementById("contact");
    if (!target) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0.2 });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur transition-transform lg:hidden print:hidden", hidden && "translate-y-full")}>
      <p className="font-heading text-xl font-semibold">{price}</p>
      <Button onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{label}</Button>
    </div>
  );
}
