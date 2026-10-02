import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { PropertyForm } from "@/components/admin/property-form";

export const metadata = { title: "New property" };

export default async function NewPropertyPage() {
  await adminContext({ staffOnly: true });
  const { atCap, brokers, initial, tenant } = await api("/api/admin/properties/new");
  if (atCap) redirect("/admin/plan?locked=maxListings");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New property" description="Save as a draft first, publish when the photos and pin are right." />
      <PropertyForm initial={initial} brokers={brokers} tenant={tenant} />
    </div>
  );
}
