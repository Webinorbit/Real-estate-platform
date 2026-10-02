import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { loadPublicTour } from "@/lib/tours";
import { TourViewer } from "@/components/tour/tour-viewer";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function EmbedTourPage({ params }) {
  const { id } = await params;
  const tenant = await getTenant();
  const tour = await loadPublicTour(tenant, id);
  if (!tour) notFound();
  return <TourViewer tour={tour} embed tenantName={tenant.name} />;
}
