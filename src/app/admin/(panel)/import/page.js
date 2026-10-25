import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { ImportWizard } from "@/components/admin/import-wizard";
import { ZipImport } from "@/components/admin/zip-import";

export const metadata = { title: "Bulk import" };

export default async function ImportPage() {
  const { user, features } = await adminContext({ staffOnly: true, feature: "csvImport", superBypass: true });
  const isSuper = user.role === "SUPER";
  // On a plan without import only a super admin gets here, to upgrade the client through settings.json.
  const remaining = features.csvImport ? (await api("/api/admin/import")).remaining : null;
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader title="Bulk import" description="Set up a whole site from one zip, or migrate listings from a spreadsheet." />
      <ZipImport isSuper={isSuper} />
      {features.csvImport && (
        <section>
          <h2 className="mb-4 font-heading text-xl font-semibold">Or import listings from a CSV</h2>
          <ImportWizard remaining={remaining ?? Infinity} />
        </section>
      )}
    </div>
  );
}
