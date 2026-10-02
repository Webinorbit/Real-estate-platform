import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin";
import { apiOrNull } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { BrokerForm } from "@/components/admin/broker-form";

export const metadata = { title: "Edit team member" };

export default async function EditBrokerPage({ params }) {
  const { id } = await params;
  await adminContext({ staffOnly: true });
  const data = await apiOrNull(`/api/admin/brokers/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { broker: b, initial, mapCenter, isSelf, lockedRole } = data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={b.name} description={b.title || b.email} />
      <BrokerForm id={b.id} initial={initial} mapCenter={mapCenter} isSelf={isSelf} lockedRole={lockedRole} />
    </div>
  );
}
