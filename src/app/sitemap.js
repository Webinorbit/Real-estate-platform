import { api } from "@/lib/api";
import { getOrigin, getTenantOrNull } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const tenant = await getTenantOrNull();
  if (!tenant) return [];
  const origin = await getOrigin();
  const { properties, tours, toursEnabled } = await api("/api/public/sitemap");
  const features = { tours: toursEnabled };
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/properties?lt=SALE`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/properties?lt=RENT`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...(features.tours ? [{ url: `${origin}/tours`, lastModified: now, changeFrequency: "weekly", priority: 0.7 }] : []),
    { url: `${origin}/brokers`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...properties.map((p) => ({ url: `${origin}/properties/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.8 })),
    ...tours.map((t) => ({ url: `${origin}/tour/${t.id}`, lastModified: t.updatedAt, changeFrequency: "monthly", priority: 0.6 })),
  ];
}
