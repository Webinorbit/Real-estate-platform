import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { RoutingConsole } from "@/components/admin/routing-console";

export const metadata = { title: "Routing engine" };

const iso = (d) => (d instanceof Date ? d.toISOString() : d);

export default async function RoutingPage() {
  await adminContext({ staffOnly: true, feature: "routingRules" });
  let data;
  try {
    data = await api("/api/admin/routing");
  } catch (err) {
    if (err instanceof ApiError && err.code === "plan_locked") redirect(`/admin/plan?locked=${err.body?.feature || "routingRules"}`);
    throw err;
  }
  const { rules, brokers, properties, audit, mapCenter, currency, locale, allowSla, slaMinutes, maxReassigns } = data;

  return (
    <div>
      <PageHeader
        title="Routing engine"
        description="Decide who gets every lead, automatically, and prove why."
        actions={
          <Link href="/admin/settings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-medium hover:bg-muted">
            <Clock className="size-4" /> SLA: {slaMinutes} min · {maxReassigns} reassigns
          </Link>
        }
      />
      <RoutingConsole
        rules={rules}
        brokers={brokers}
        properties={properties}
        audit={audit.map((a) => ({ ...a, createdAt: iso(a.createdAt) }))}
        mapCenter={mapCenter}
        currency={currency}
        locale={locale}
        allowSla={allowSla}
      />
    </div>
  );
}
