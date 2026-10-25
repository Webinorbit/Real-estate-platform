import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Default brand icon: a home inside a map pin (map search) circled by an orbit ring (360° tours),
 * drawn in the tenant's own colours. The back half of the ring passes behind the pin, the front half in front.
 */
export function BrandIcon({ className, spin }) {
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-[11px] bg-[var(--brand,var(--primary))] shadow-soft", className)} aria-hidden>
      <svg viewBox="0 0 150 150" className="size-[82%]" fill="none">
        <path d="M29 110a46 14 0 0 1 92 0" stroke="var(--accent)" strokeOpacity=".55" strokeWidth="9" strokeLinecap="round" />
        <path d="M75 14c-22 0-38 16-38 37 0 26 38 61 38 61s38-35 38-61c0-21-16-37-38-37z" fill="#fff" />
        <path d="M57 53 75 38l18 15" stroke="var(--brand, var(--primary))" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M66 74v-8a9 9 0 0 1 18 0v8" stroke="var(--brand, var(--primary))" strokeWidth="9" strokeLinecap="round" />
        <path d="M29 110a46 14 0 0 0 92 0" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" />
        {spin && <circle r="7" fill="var(--accent)" className="brand-orbit-dot" />}
      </svg>
    </span>
  );
}

export function BrandMark({ name, logoUrl, className, light, href = "/", compact }) {
  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-9 w-auto max-w-[9rem] object-contain" />
      ) : (
        <BrandIcon />
      )}
      {!logoUrl && !compact && (
        <span className={cn("font-heading text-xl font-semibold leading-none tracking-tight", light ? "text-white" : "text-foreground")}>{name}</span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} aria-label={`${name} home`}>
      {content}
    </Link>
  ) : (
    content
  );
}
