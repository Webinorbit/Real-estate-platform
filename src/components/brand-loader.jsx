"use client";

import { useBrand } from "@/components/providers";
import { BrandIcon } from "@/components/site/brand";
import { cn } from "@/lib/utils";

/**
 * Branded loading screen: the site's logo with an orbiting dot, its name and a progress bar.
 * `inline` fills the nearest positioned parent (maps, 360° viewer) instead of the whole window.
 */
export function BrandLoader({ inline, label, className }) {
  const { name, logoUrl } = useBrand();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label || `Loading ${name}`.trim()}
      className={cn(
        "brand-loader z-[100] grid place-items-center",
        inline ? "absolute inset-0 bg-muted/90" : "fixed inset-0 bg-background",
        className,
      )}
    >
      <div className="flex flex-col items-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="brand-loader-pop h-14 w-auto max-w-[12rem] object-contain" />
        ) : (
          <span className="brand-loader-pop relative">
            <span className="brand-loader-halo absolute -inset-2 rounded-[24px] border-2 border-accent/50" />
            <BrandIcon spin className={cn(inline ? "size-14 rounded-[16px]" : "size-[4.5rem] rounded-[20px]", "shadow-lift")} />
          </span>
        )}
        {name && !logoUrl && (
          <p className={cn("brand-loader-name mt-5 font-heading font-semibold tracking-tight text-foreground", inline ? "text-xl" : "text-3xl")}>{name}</p>
        )}
        <div className="mt-5 h-1 w-36 overflow-hidden rounded-full bg-foreground/10">
          <div className="brand-loader-bar h-full w-1/2 rounded-full bg-gradient-to-r from-primary to-accent" />
        </div>
        {label && <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>}
      </div>
    </div>
  );
}
