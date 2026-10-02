import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata = { title: "CSV import" };

export default async function ImportPage() {
  await adminContext({ staffOnly: true, feature: "csvImport" });
  const { remaining } = await api("/api/admin/import");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Bulk import" description="Migrate hundreds of listings from a spreadsheet in minutes." />
      <ImportWizard remaining={remaining ?? Infinity} />
    </div>
  );
}
