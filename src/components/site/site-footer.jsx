import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { BrandMark } from "@/components/site/brand";

export function SiteFooter({ tenant, features, demoTenants }) {
  const socials = tenant.socials || {};
  return (
    <footer className="mt-24 border-t border-border bg-card">
      <div className="mx-auto grid max-w-[90rem] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{tenant.about || tenant.tagline}</p>
        </div>
        <div>
          <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">Explore</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link className="hover:text-primary" href="/properties?lt=SALE">Homes for sale</Link></li>
            <li><Link className="hover:text-primary" href="/properties?lt=RENT">Homes for rent</Link></li>
            {features.tours && <li><Link className="hover:text-primary" href="/tours">Virtual tours</Link></li>}
            <li><Link className="hover:text-primary" href="/brokers">Our advisors</Link></li>
            <li><Link className="hover:text-primary" href="/favorites">Saved homes</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link className="hover:text-primary" href="/contact">Contact</Link></li>
            {socials.instagram && <li><a className="hover:text-primary" href={socials.instagram} target="_blank" rel="noopener noreferrer">Instagram</a></li>}
            {socials.facebook && <li><a className="hover:text-primary" href={socials.facebook} target="_blank" rel="noopener noreferrer">Facebook</a></li>}
            {socials.linkedin && <li><a className="hover:text-primary" href={socials.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>}
          </ul>
        </div>
        <div>
          <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">Get in touch</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {tenant.contactPhone && <li className="flex gap-2.5"><Phone className="mt-0.5 size-4 text-primary" /><a href={`tel:${tenant.contactPhone}`}>{tenant.contactPhone}</a></li>}
            {tenant.contactEmail && <li className="flex gap-2.5"><Mail className="mt-0.5 size-4 text-primary" /><a href={`mailto:${tenant.contactEmail}`}>{tenant.contactEmail}</a></li>}
            {tenant.address && <li className="flex gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{tenant.address}</li>}
          </ul>
        </div>
      </div>

      {demoTenants?.length > 1 && (
        <div className="border-t border-border bg-muted/50">
          <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3 px-4 py-3 text-xs sm:px-6">
            <span className="font-semibold text-muted-foreground">Demo: see the same platform with another client&apos;s brand</span>
            {demoTenants.map((t) => (
              <a key={t.slug} href={`/?tenant=${t.slug}`} className={`rounded-full border px-3 py-1 font-medium transition hover:border-primary hover:text-primary ${t.slug === tenant.slug ? "border-primary text-primary" : "border-border"}`}>
                {t.name} <span className="text-muted-foreground">({t.plan.toLowerCase()})</span>
              </a>
            ))}
            <a href="/admin" className="ml-auto font-semibold text-primary hover:underline">Open admin dashboard →</a>
          </div>
        </div>
      )}

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</span>
          {!features.removeBranding && (
            <a href="https://webinorbit.com/products" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              Powered by WebInOrbit Real Estate
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
