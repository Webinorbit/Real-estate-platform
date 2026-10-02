import { adminContext } from "@/lib/admin";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }) {
  const { user, tenant, features: plan, brokerId, photoUrl, newLeads } = await adminContext();
  const features = {
    label: plan.label,
    tours: plan.tours,
    routingRules: plan.routingRules,
    csvImport: plan.csvImport,
    customDomain: plan.customDomain,
  };
  return (
    <AdminShell
      user={{ name: user.name, role: user.role, broker: brokerId ? { photoUrl } : null }}
      tenant={{ name: tenant.name, logoUrl: tenant.logoUrl }}
      features={features}
      badges={{ newLeads }}
    >
      {children}
    </AdminShell>
  );
}
