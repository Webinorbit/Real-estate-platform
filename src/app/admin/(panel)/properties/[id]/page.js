import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, View } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { apiOrNull } from "@/lib/api";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { PropertyForm } from "@/components/admin/property-form";

export const metadata = { title: "Edit property" };

export default async function EditPropertyPage({ params }) {
  const { id } = await params;
  const { features } = await adminContext({ staffOnly: true });
  const data = await apiOrNull(`/api/admin/properties/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { property: p, initial, brokers, tours, tenant } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={p.title}
        description={`${p.locality}, ${p.city} · ${p.views} views`}
        actions={
          <>
            {features.tours && (
              <ButtonLink href={tours[0] ? `/admin/tours/${tours[0].id}` : `/admin/tours?property=${p.id}`} variant="outline">
                <View className="size-4" /> {tours[0] ? "Edit 360° tour" : "Add 360° tour"}
              </ButtonLink>
            )}
            <Link href={`/properties/${p.slug}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
              <ExternalLink className="size-4" /> View live
            </Link>
          </>
        }
      />
      <PropertyForm id={p.id} initial={initial} brokers={brokers} tenant={{ currency: tenant.currency, areaUnit: tenant.areaUnit, mapLat: tenant.mapLat, mapLng: tenant.mapLng, mapZoom: tenant.mapZoom }} />
    </div>
  );
}
