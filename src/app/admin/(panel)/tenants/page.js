import { requireUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { TenantsConsole } from "@/components/admin/tenants-console";

export const metadata = { title: "Clients" };

const iso = (d) => (d instanceof Date ? d.toISOString() : d);

export default async function TenantsPage() {
  await requireUser(["SUPER"]);
  const { root, tenants } = await api("/api/admin/tenants");

  return (
    <div>
      <PageHeader title="Clients" description="Every white-label site on this platform. Visible to WebInOrbit staff only." />
      <TenantsConsole cities={{ root }} tenants={tenants.map((t) => ({ ...t, createdAt: iso(t.createdAt) }))} />
    </div>
  );
}
