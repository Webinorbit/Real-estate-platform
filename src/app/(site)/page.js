import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Map, Route, View, Play, Search, Sparkles, KeyRound, MapPin } from "lucide-react";
import { getTenant, tenantFeatures } from "@/lib/tenant";
import { api } from "@/lib/api";
import { cardTenant, formatPriceCompact } from "@/lib/format";
import { heroImages } from "@/lib/utils";
import { Hero } from "@/components/site/hero";
import { CountUp, Carousel, GlowCard, Marquee, Reveal, SectionHeading } from "@/components/site/motion";
import { PropertyCard } from "@/components/site/property-card";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/misc";

export default async function HomePage() {
  const tenant = await getTenant();
  const features = tenantFeatures(tenant);
  const { stats, localities, featured, tiles, team: allTeam, tours } = await api("/api/public/home");
  const team = allTeam.slice(0, 4);
  const ct = cardTenant(tenant);
  const spotlight = tours[0];

  return (
    <>
      <Hero tenant={{ tagline: tenant.tagline, currency: tenant.currency }} images={heroImages(tenant)} localities={localities} stats={stats} />

      <section className="relative z-10 -mt-14 px-4 sm:px-6">
        <Reveal className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border shadow-lift md:grid-cols-4">
          {[
            ["Verified listings", stats.properties, "+"],
            ["Expert advisors", stats.brokers, ""],
            ["360° virtual tours", stats.tours, ""],
            ["Cities covered", stats.cities, ""],
          ].map(([label, n, suffix]) => (
            <div key={label} className="bg-card px-6 py-8 text-center">
              <div className="text-gradient font-heading text-4xl font-semibold sm:text-5xl">
                <CountUp to={n} suffix={suffix} />
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </Reveal>
      </section>

      {localities.length > 0 && (
        <section className="mt-16" aria-label="Popular areas">
          <Marquee>
            {localities.slice(0, 12).map((l) => (
              <Link key={l.label} href={`/properties?q=${encodeURIComponent(l.label)}`} className="group mx-3 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-2.5 text-sm shadow-soft transition hover:border-primary">
                <MapPin className="size-4 text-primary" />
                <span className="font-heading text-lg font-semibold">{l.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">{l.count} homes</span>
              </Link>
            ))}
          </Marquee>
        </section>
      )}

      <section id="featured" className="mx-auto mt-20 max-w-[90rem] scroll-mt-24 px-4 sm:px-6">
        <SectionHeading
          eyebrow="Handpicked"
          title="Featured homes"
          description="Standout properties our advisors personally recommend this week."
          action={
            <ButtonLink href="/properties" variant="outline">
              Explore on the map <ArrowRight className="size-4" />
            </ButtonLink>
          }
        />
        <Carousel>
          {featured.map((p, i) => (
            <PropertyCard key={p.id} p={p} tenant={ct} priority={i < 3} />
          ))}
        </Carousel>
      </section>

      {tiles.length > 0 && (
        <section className="mx-auto mt-20 max-w-[90rem] px-4 sm:px-6">
          <SectionHeading eyebrow="Neighbourhoods" title="Explore by area" description="Jump straight into the map for the areas people search most." />
          <div className="grid auto-rows-[13rem] gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {tiles.map((t, i) => (
              <Reveal key={t.label} delay={i * 0.06} className={i === 0 ? "sm:col-span-2 lg:col-span-3 lg:row-span-2" : i === 1 ? "lg:col-span-3" : "lg:col-span-2"}>
                <Link href={`/properties?q=${encodeURIComponent(t.label)}`} className="group relative block h-full overflow-hidden rounded-3xl">
                  <Image src={t.image} alt={t.label} fill sizes="(max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white">
                    <div>
                      <h3 className="font-heading text-2xl font-semibold">{t.label}</h3>
                      <p className="text-sm text-white/80">{t.count} homes{t.city ? ` · ${t.city}` : ""}</p>
                    </div>
                    <span className="grid size-10 place-items-center rounded-full bg-white/25 transition group-hover:bg-accent group-hover:text-accent-foreground">
                      <ArrowRight className="size-5" />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {spotlight && (
        <section className="mx-auto mt-24 max-w-[90rem] px-4 sm:px-6">
          <Reveal className="relative isolate overflow-hidden rounded-[2rem] bg-black text-white">
            <Image
              src={spotlight.scenes[0]?.panoramaUrl || "/demo/photos/int-01.jpg"}
              alt=""
              fill
              sizes="100vw"
              className="-z-10 object-cover opacity-60"
              style={{ animation: "kenburns 24s ease-in-out infinite alternate", willChange: "transform" }}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/55 to-transparent" />
            <div className="grid grid-cols-1 gap-10 p-6 sm:p-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div>
                <Badge tone="dark" className="border border-white/25">
                  <View className="size-3.5" /> Virtual tours
                </Badge>
                <h2 className="mt-5 font-heading text-4xl font-semibold leading-tight sm:text-5xl">Walk through your next home before you visit.</h2>
                <p className="mt-4 max-w-xl text-lg text-white/80">
                  Immersive 360° tours with a live floor-plan map. Look around, hop room to room, and see exactly where you are standing.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href={`/tour/${spotlight.id}`} variant="accent" size="lg">
                    <Play className="size-5 fill-current" /> Start 3D tour
                  </ButtonLink>
                  <ButtonLink href="/tours" variant="glass" size="lg">
                    Browse all tours
                  </ButtonLink>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3">
                {tours.map((t) => (
                  <Link key={t.id} href={`/tour/${t.id}`} className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-black/30 p-3 transition hover:bg-white/20">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl">
                      <Image src={t.property.images?.[0]?.url || "/demo/photos/ext-01.jpg"} alt="" fill sizes="64px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.property.title}</p>
                      <p className="text-sm text-white/70">
                        {t.kind === "EXTERNAL" ? "3D walkthrough" : `${t.scenes.length} rooms`} · {formatPriceCompact(t.property.price, tenant.currency)}
                      </p>
                    </div>
                    <span className="grid size-10 place-items-center rounded-full bg-white/15 transition group-hover:bg-accent group-hover:text-accent-foreground">
                      <Play className="size-4 fill-current" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      )}

      <section className="mx-auto mt-24 max-w-[90rem] px-4 sm:px-6">
        <SectionHeading eyebrow="Why choose us" title="A smarter way to find home" description="Three things that make the search faster, clearer and far less stressful." />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Map, title: "Search where it matters", body: "Pan the map, draw your own area or look near you. Results update live, with prices at a glance." },
            { icon: View, title: "Tour from your sofa", body: "Immersive 360° walkthroughs with a live floor plan. Shortlist with confidence and visit only what you love." },
            { icon: Route, title: "Matched to the right advisor", body: "Every enquiry is routed to the broker who covers your area, speaks your language and is available right now." },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 0.1} className="h-full">
              <GlowCard className="group h-full shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift" innerClassName="relative overflow-hidden p-8">
                <span className="pointer-events-none absolute -right-4 -top-6 font-heading text-[7rem] font-semibold leading-none text-foreground/[0.04]">0{i + 1}</span>
                <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-soft transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-110">
                  <f.icon className="size-7" />
                </div>
                <h3 className="font-heading text-2xl font-semibold">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{f.body}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[90rem] px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card px-6 py-14 shadow-soft sm:px-12">
          <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-0 size-80 rounded-full bg-accent/15 blur-3xl" />
          <SectionHeading className="relative mx-auto justify-center text-center [&>div]:mx-auto" eyebrow="How it works" title="From first search to keys in hand" description="A guided journey that keeps you in control at every step." />
          <div className="relative">
            <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-8 hidden h-px bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 md:block" aria-hidden />
            <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
              {[
                { icon: Search, title: "Discover", body: "Search the live map, draw your own area or browse curated picks." },
                { icon: View, title: "Tour virtually", body: "Walk through every room in 360° before you book a visit." },
                { icon: Sparkles, title: "Get matched", body: "Your enquiry reaches the advisor who knows that neighbourhood." },
                { icon: KeyRound, title: "Move in", body: "Visits, paperwork and negotiation handled end-to-end." },
              ].map((step, i) => (
                <Reveal as="li" key={step.title} delay={i * 0.12} className="group relative text-center">
                  <div className="relative mx-auto grid size-16 place-items-center rounded-2xl border border-border bg-background shadow-soft transition duration-300 group-hover:-translate-y-1 group-hover:border-primary group-hover:shadow-lift">
                    <step.icon className="size-7 text-primary" />
                    <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-heading text-xl font-semibold">{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {team.length > 0 && (
        <section className="mx-auto mt-24 max-w-[90rem] px-4 sm:px-6">
          <SectionHeading
            eyebrow="Our people"
            title="Advisors who know your neighbourhood"
            action={<ButtonLink href="/brokers" variant="outline">Meet the whole team <ArrowRight className="size-4" /></ButtonLink>}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((b, i) => (
              <Reveal key={b.id} delay={i * 0.07}>
                <Link href="/brokers" className="group block rounded-3xl border border-border bg-card p-6 text-center shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
                  <Avatar name={b.name} src={b.photoUrl} size={96} className="mx-auto ring-4 ring-primary/10 transition group-hover:ring-primary/30" />
                  <h3 className="mt-4 flex items-center justify-center gap-1.5 font-heading text-xl font-semibold">
                    {b.name} <BadgeCheck className="size-4 text-primary" />
                  </h3>
                  <p className="text-sm text-muted-foreground">{b.title}</p>
                  <p className="mt-3 line-clamp-1 text-xs text-muted-foreground">{b.languages.join(" · ")}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-24 max-w-[90rem] px-4 sm:px-6">
        <Reveal className="grain relative isolate overflow-hidden rounded-[2rem] bg-primary px-8 py-20 text-center text-primary-foreground sm:px-16">
          <div className="aurora-blob pointer-events-none absolute -right-24 -top-24 -z-10 size-96 rounded-full bg-accent/40 blur-3xl" />
          <div className="aurora-blob pointer-events-none absolute -bottom-32 -left-20 -z-10 size-96 rounded-full bg-white/15 blur-3xl" style={{ animationDelay: "-6s" }} />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,transparent_30%,rgb(0_0_0/0.25))]" />
          <h2 className="relative mx-auto max-w-2xl font-heading text-4xl font-semibold sm:text-5xl">Ready to find, or sell, your next home?</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg opacity-85">Tell us what you are looking for and the right advisor will reach out within minutes.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact" variant="accent" size="lg">Talk to an advisor</ButtonLink>
            <ButtonLink href="/properties" variant="glass" size="lg">Browse listings</ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
