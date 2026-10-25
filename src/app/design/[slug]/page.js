import { notFound } from "next/navigation";
import { apiOrNull } from "@/lib/api";
import { getTenant } from "@/lib/tenant";
import { buildLayout, generateLayout } from "@/lib/layout3d";
import { DesignerLoader } from "@/components/layout3d/designer-loader";

export const dynamic = "force-dynamic";

async function loadProperty(slug) {
  const detail = await apiOrNull(`/api/public/properties/${encodeURIComponent(slug)}`);
  const p = detail?.property;
  return p && p.status !== "DRAFT" ? p : null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await loadProperty(slug);
  if (!p) return { title: "3D layout not found" };
  return {
    title: `3D layout & interior designer: ${p.title}`,
    description: `Explore ${p.roomLayout?.rooms?.length ? "the" : "an indicative"} 3D layout of ${p.title} in ${p.locality}, ${p.city}, then furnish and style it.`,
    robots: { index: false },
  };
}

export default async function DesignPage({ params }) {
  const { slug } = await params;
  await getTenant();
  const p = await loadProperty(slug);
  if (!p) notFound();
  // The agency's real floor plan when it entered one, else an indicative layout from the listing details.
  const layout = p.roomLayout?.rooms?.length
    ? buildLayout(p.roomLayout, { type: p.type })
    : generateLayout({ type: p.type, beds: p.beds, baths: p.baths, areaSqft: p.areaSqft });
  const property = { slug: p.slug, title: p.title, type: p.type, city: p.city, locality: p.locality };
  return <DesignerLoader property={property} layout={layout} backHref={`/properties/${p.slug}`} />;
}
