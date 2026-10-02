import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers, MapPin, View } from "lucide-react";
import { api } from "@/lib/api";
import { getTenant, tenantFeatures } from "@/lib/tenant";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/misc";
import { Reveal } from "@/components/site/motion";

export const metadata = { title: "360° virtual tours", description: "Walk through our homes in immersive 360° tours from anywhere." };

export default async function ToursPage() {
  const tenant = await getTenant();
  if (!tenantFeatures(tenant).tours) notFound();
  const { tours } = await api("/api/public/tours");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6">
      <Reveal>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Virtual tours</p>
        <h1 className="font-heading text-4xl font-semibold sm:text-5xl">Step inside before you visit</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Look around every room in 360°, follow the floor plan as you move, and book a visit only for the homes you love.</p>
      </Reveal>

      {tours.length === 0 ? (
        <p className="mt-12 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Tours are coming soon.</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((t, i) => {
            const cover = t.scenes[0]?.thumbUrl || (Array.isArray(t.property.images) ? t.property.images[0]?.url : null) || "/demo/photos/int-01.jpg";
            return (
              <Reveal key={t.id} delay={(i % 3) * 0.08}>
                <Link href={`/tour/${t.id}`} className="group relative block overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image src={cover} alt={t.property.title} fill sizes="(max-width: 768px) 92vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                      <View className="size-3.5" /> {t.kind === "PANORAMA" ? "360° tour" : "3D walkthrough"}
                    </span>
                    <span className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black opacity-90 shadow-lift transition-transform group-hover:scale-110">
                      <View className="size-7" />
                    </span>
                    <p className="absolute bottom-4 left-4 font-heading text-xl font-semibold text-white">{formatPrice(t.property.price, { currency: tenant.currency, listingType: t.property.listingType, priceUnit: t.property.priceUnit })}</p>
                  </div>
                  <div className="p-5">
                    <h2 className="line-clamp-1 font-heading text-lg font-semibold">{t.property.title}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5" /> {t.property.locality}, {t.property.city}
                    </p>
                    {t.scenes.length > 0 && (
                      <Badge className="mt-3">
                        <Layers className="size-3.5" /> {t.scenes.length} rooms
                      </Badge>
                    )}
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
