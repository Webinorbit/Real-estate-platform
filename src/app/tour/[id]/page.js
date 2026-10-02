import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { loadPublicTour } from "@/lib/tours";
import { TourViewer } from "@/components/tour/tour-viewer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const tenant = await getTenant();
  const tour = await loadPublicTour(tenant, id);
  if (!tour) return { title: "Tour not found" };
  const cover = tour.scenes[0]?.thumbUrl;
  return {
    title: `360° tour: ${tour.property.title}`,
    description: `Walk through ${tour.property.title} in ${tour.property.locality}, ${tour.property.city} from anywhere.`,
    openGraph: cover ? { images: [{ url: cover }] } : undefined,
  };
}

export default async function TourPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = await getTenant();
  const tour = await loadPublicTour(tenant, id, { allowDraft: Boolean(sp.preview) });
  if (!tour) notFound();
  return <TourViewer tour={tour} tenantName={tenant.name} />;
}
