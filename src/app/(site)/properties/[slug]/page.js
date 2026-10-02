import { cache } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bath, BedDouble, Calendar, Car, Check, Compass, Layers, MapPin, Maximize2, Sofa, View } from "lucide-react";
import { apiOrNull } from "@/lib/api";
import { getOrigin, getTenant, tenantFeatures } from "@/lib/tenant";
import { cardTenant, formatNumber, formatPrice, pricePerArea, titleCase } from "@/lib/format";
import { PropertyGallery } from "@/components/site/property-gallery";
import { PropertyActions, MobileEnquiryBar } from "@/components/site/property-actions";
import { MortgageCalculator } from "@/components/site/mortgage-calculator";
import { NeighbourhoodMap } from "@/components/site/neighbourhood-map";
import { LeadForm } from "@/components/site/lead-form";
import { PropertyCard } from "@/components/site/property-card";
import { Avatar, Badge, Card } from "@/components/ui/misc";
import { Reveal } from "@/components/site/motion";

const loadDetail = cache(async (slug, view) => apiOrNull(`/api/public/properties/${encodeURIComponent(slug)}`, { query: view ? { view: 1 } : undefined }));

async function load(slug, { view = false } = {}) {
  const tenant = await getTenant();
  const detail = await loadDetail(slug, view);
  return { tenant, property: detail?.property ?? null, similar: detail?.similar ?? [] };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { tenant, property } = await load(slug);
  if (!property || property.status === "DRAFT") return { title: "Property not found" };
  const images = Array.isArray(property.images) ? property.images : [];
  const price = formatPrice(property.price, { currency: tenant.currency, listingType: property.listingType, priceUnit: property.priceUnit });
  const title = `${property.title} · ${price}`;
  const description = `${property.beds ? `${property.beds} bed ` : ""}${titleCase(property.type)} in ${property.locality}, ${property.city}. ${property.description.slice(0, 140)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: images[0] ? [{ url: images[0].url }] : [], type: "website" },
    alternates: { canonical: `/properties/${property.slug}` },
  };
}

function Fact({ icon: Icon, label, value }) {
  if (value == null || value === "" || value === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-semibold">{value}</p>
      </div>
    </div>
  );
}

export default async function PropertyPage({ params }) {
  const { slug } = await params;
  const { tenant, property, similar } = await load(slug, { view: true });
  if (!property || property.status === "DRAFT") notFound();
  const features = tenantFeatures(tenant);

  const images = Array.isArray(property.images) ? property.images : [];
  const tour = features.tours ? property.tours[0] : null;
  const priceLabel = formatPrice(property.price, { currency: tenant.currency, listingType: property.listingType, priceUnit: property.priceUnit });
  const ct = cardTenant(tenant);
  const origin = await getOrigin();
  const abs = (u) => new URL(u, origin).toString();

  const broker = property.listingBroker;
  const sold = property.status === "SOLD" || property.status === "RENTED";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.title,
    description: property.description,
    url: abs(`/properties/${property.slug}`),
    image: images.map((i) => abs(i.url)),
    datePosted: property.createdAt.toISOString(),
    offers: { "@type": "Offer", price: property.price, priceCurrency: tenant.currency, availability: sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock" },
    about: {
      "@type": property.type === "APARTMENT" ? "Apartment" : "House",
      numberOfRooms: property.beds,
      numberOfBathroomsTotal: property.baths,
      floorSize: { "@type": "QuantitativeValue", value: property.areaSqft, unitText: tenant.areaUnit },
      address: { "@type": "PostalAddress", streetAddress: property.address, addressLocality: property.locality, addressRegion: property.city, postalCode: property.postalCode },
      geo: { "@type": "GeoCoordinates", latitude: property.lat, longitude: property.lng },
    },
  };

  return (
    <div className="pt-[4.5rem]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:pb-16">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>/
          <Link href={`/properties?lt=${property.listingType}`} className="hover:text-foreground">{property.listingType === "RENT" ? "Rent" : "Buy"}</Link>/
          <Link href={`/properties?lt=${property.listingType}&q=${encodeURIComponent(property.locality)}`} className="hover:text-foreground">{property.locality}</Link>
        </nav>

        <PropertyGallery images={images} title={property.title} tourHref={tour ? `/tour/${tour.id}` : null} />

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
          <div className="min-w-0 space-y-12">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge tone="primary">{property.listingType === "RENT" ? "For rent" : "For sale"}</Badge>
                  <Badge>{titleCase(property.type)}</Badge>
                  {property.featured && <Badge tone="accent">Featured</Badge>}
                  {sold && <Badge tone="danger">{property.status === "SOLD" ? "Sold" : "Rented"}</Badge>}
                </div>
                <h1 className="font-heading text-3xl font-semibold leading-tight sm:text-4xl">{property.title}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4 shrink-0" />
                  {[property.address, property.locality, property.city]
                    .filter(Boolean)
                    .reduce((acc, part) => (acc.join(", ").toLowerCase().includes(part.toLowerCase()) ? acc : [...acc, part]), [])
                    .join(", ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading text-4xl font-semibold text-primary">{priceLabel}</p>
                {property.listingType === "SALE" && pricePerArea(property.price, property.areaSqft, tenant.currency) && (
                  <p className="text-sm text-muted-foreground">{pricePerArea(property.price, property.areaSqft, tenant.currency)} / {tenant.areaUnit}</p>
                )}
              </div>
            </header>

            <PropertyActions id={property.id} title={property.title} />

            <section aria-labelledby="facts" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <h2 id="facts" className="sr-only">Key facts</h2>
              <Fact icon={BedDouble} label="Bedrooms" value={property.beds} />
              <Fact icon={Bath} label="Bathrooms" value={property.baths} />
              <Fact icon={Maximize2} label="Built-up area" value={`${formatNumber(property.areaSqft, tenant.locale)} ${tenant.areaUnit}`} />
              <Fact icon={Car} label="Parking" value={property.parking ? `${property.parking} space${property.parking > 1 ? "s" : ""}` : null} />
              <Fact icon={Layers} label="Floor" value={property.floor != null ? `${property.floor}${property.totalFloors ? ` of ${property.totalFloors}` : ""}` : null} />
              <Fact icon={Compass} label="Facing" value={property.facing} />
              <Fact icon={Sofa} label="Furnishing" value={property.furnishing} />
              <Fact icon={Calendar} label="Year built" value={property.yearBuilt} />
            </section>

            <Reveal>
              <h2 className="mb-3 font-heading text-2xl font-semibold">About this home</h2>
              <div className="space-y-3 leading-relaxed text-foreground/85">
                {property.description.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </Reveal>

            {tour && (
              <Reveal>
                <Link href={`/tour/${tour.id}`} className="group relative block overflow-hidden rounded-3xl">
                  <div className="relative aspect-[21/9] min-h-56 w-full bg-muted">
                    <Image src={tour.scenes[0]?.panoramaUrl || images[0]?.url || "/demo/photos/int-01.jpg"} alt="" fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                    <div className="absolute inset-0 flex flex-col justify-center gap-3 p-6 text-white sm:p-10">
                      <Badge tone="dark" className="w-fit"><View className="size-3.5" /> Immersive 360° tour</Badge>
                      <p className="max-w-md font-heading text-2xl font-semibold sm:text-3xl">Step inside before you visit</p>
                      <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition group-hover:brightness-110">Start the tour →</span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            )}

            {property.amenities.length > 0 && (
              <Reveal>
                <h2 className="mb-4 font-heading text-2xl font-semibold">Amenities</h2>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  {property.amenities.map((a) => (
                    <li key={a} className="flex items-center gap-2.5 text-sm">
                      <span className="grid size-6 place-items-center rounded-full bg-success/15 text-success"><Check className="size-3.5" strokeWidth={3} /></span>
                      {a}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            <Reveal>
              <h2 className="mb-1 font-heading text-2xl font-semibold">What is nearby</h2>
              <p className="mb-4 text-sm text-muted-foreground">Schools, transit, shopping and more around {property.locality}.</p>
              <NeighbourhoodMap lat={property.lat} lng={property.lng} title={property.title} />
            </Reveal>

            {property.listingType === "SALE" && (
              <Reveal>
                <h2 className="mb-4 font-heading text-2xl font-semibold">Mortgage calculator</h2>
                <MortgageCalculator price={property.price} currency={tenant.currency} locale={tenant.locale} />
              </Reveal>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card id="contact" className="scroll-mt-24 p-6">
              {broker && (
                <div className="mb-5 flex items-center gap-3 border-b border-border pb-5">
                  <Avatar name={broker.name} src={broker.photoUrl} size={56} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Listing agent</p>
                    <p className="truncate font-heading text-lg font-semibold">{broker.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{broker.title}</p>
                  </div>
                </div>
              )}
              <h2 className="mb-4 font-heading text-xl font-semibold">Interested in this home?</h2>
              <LeadForm propertyId={property.id} propertyTitle={property.title} />
            </Card>
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="mt-16" aria-labelledby="similar">
            <h2 id="similar" className="mb-6 font-heading text-2xl font-semibold">Similar homes you may like</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((p) => (
                <PropertyCard key={p.id} p={p} tenant={ct} />
              ))}
            </div>
          </section>
        )}
      </div>
      <MobileEnquiryBar price={priceLabel} />
    </div>
  );
}
