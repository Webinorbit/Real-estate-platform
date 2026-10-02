import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { apiOrNull } from "@/lib/api";
import { TourEditor } from "@/components/admin/tour-editor";

export const metadata = { title: "Edit tour" };

export default async function EditTourPage({ params }) {
  const { id } = await params;
  await adminContext({ staffOnly: true, feature: "tours" });
  const data = await apiOrNull(`/api/admin/tours/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { tour, initialScenes, property } = data;

  return (
    <div>
      <Link href="/admin/tours" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All tours</Link>
      <TourEditor
        key={tour.id}
        tour={{ id: tour.id, title: tour.title, kind: tour.kind, externalUrl: tour.externalUrl, published: tour.published, autoRotate: tour.autoRotate, startSceneId: tour.startSceneId, floorPlanUrl: tour.floorPlanUrl, plan: tour.plan }}
        initialScenes={initialScenes}
        property={property}
      />
    </div>
  );
}
