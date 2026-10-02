import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { BrandMark } from "@/components/site/brand";

export function SiteFooter({ tenant, features }) {
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
            <li><Link className="hover:text-primary" href="/admin">Admin login</Link></li>
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

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} {tenant.name}. All rights reserved.</span>
          <a href="https://webinorbit.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary" aria-label="Powered by WebInOrbit">
            <span>Powered by</span>
            <Image src="/brand/webinorbit-logo.png" alt="WebInOrbit" width={480} height={135} className="h-9 w-auto dark:invert" />
          </a>
        </div>
      </div>
    </footer>
  );
}
