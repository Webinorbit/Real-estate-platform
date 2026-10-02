import Image from "next/image";
import { Languages, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { getTenant } from "@/lib/tenant";
import { initials } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/site/motion";

export const metadata = { title: "Our advisors", description: "Meet the advisors who know every neighbourhood." };

export default async function BrokersPage() {
  const tenant = await getTenant();
  const data = await api("/api/public/brokers");
  const brokers = data.brokers;
  const listings = new Map(Object.entries(data.listings));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6">
      <Reveal className="max-w-2xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Our team</p>
        <h1 className="font-heading text-4xl font-semibold sm:text-5xl">Advisors who know the neighbourhood</h1>
        <p className="mt-3 text-muted-foreground">Every enquiry is matched to the advisor with the right language, area expertise and availability, so you hear back fast from someone who can actually help.</p>
      </Reveal>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {brokers.map((b, i) => (
          <Reveal key={b.id} delay={(i % 3) * 0.08}>
            <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift">
              <div className="relative aspect-[5/4] overflow-hidden bg-muted">
                {b.photoUrl ? (
                  <Image src={b.photoUrl} alt={b.name} fill sizes="(max-width: 768px) 92vw, 33vw" className="object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="grid size-full place-items-center bg-primary/10 font-heading text-6xl text-primary">{initials(b.name)}</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 text-white">
                  <h2 className="font-heading text-2xl font-semibold">{b.name}</h2>
                  <p className="text-sm text-white/85">{b.title}</p>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                {b.bio && <p className="line-clamp-3 text-sm text-muted-foreground">{b.bio}</p>}
                {b.languages.length > 0 && (
                  <p className="flex items-start gap-2 text-sm"><Languages className="mt-0.5 size-4 shrink-0 text-primary" />{b.languages.join(", ")}</p>
                )}
                {b.areas.length > 0 && (
                  <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{b.areas.slice(0, 4).join(", ")}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>{listings.get(b.id) || 0} active listings</span>
                  <ButtonLink href="/contact" size="sm" variant="outline">Get in touch</ButtonLink>
                </div>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
