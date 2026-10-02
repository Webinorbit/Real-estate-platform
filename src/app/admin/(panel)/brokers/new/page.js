import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { BrokerForm } from "@/components/admin/broker-form";

export const metadata = { title: "Add team member" };

export default async function NewBrokerPage() {
  await adminContext({ staffOnly: true });
  const { initial, mapCenter, atCap } = await api("/api/admin/brokers/new");
  if (atCap) redirect("/admin/plan?locked=maxBrokers");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Add team member" description="They get a login and start receiving routed leads right away." />
      <BrokerForm initial={initial} mapCenter={mapCenter} />
    </div>
  );
}
