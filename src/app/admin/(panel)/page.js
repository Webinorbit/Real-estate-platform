import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { DashboardView } from "@/components/admin/dashboard-view";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard({ searchParams }) {
  const sp = await searchParams;
  await adminContext();
  const { isStaff, firstName, tenantName, ...data } = await api("/api/admin/dashboard");
  return (
    <>
      {sp.denied && <p className="mb-4 rounded-xl bg-warning/15 px-4 py-3 text-sm text-warning">You do not have access to that section.</p>}
      <DashboardView data={data} isStaff={isStaff} firstName={firstName} tenantName={tenantName} />
    </>
  );
}
