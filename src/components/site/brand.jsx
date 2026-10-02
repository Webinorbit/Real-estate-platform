import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ name, logoUrl, className, light, href = "/", compact }) {
  const content = (
    <span className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} className="h-9 w-auto max-w-[9rem] object-contain" />
      ) : (
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
          <svg viewBox="0 0 32 32" className="size-6" fill="none" aria-hidden>
            <path d="M5 21 16 8l11 13" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="12.5" y="19" width="7" height="8" rx="1.5" fill="var(--accent)" />
          </svg>
        </span>
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
