import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/components/admin/settings-form";
import { DangerZone } from "@/components/admin/danger-zone";

export const metadata = { title: "Branding & settings" };

export default async function SettingsPage() {
  const { user, tenant } = await adminContext({ staffOnly: true });
  const { initial, features, rootDomain } = await api("/api/admin/settings");
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader title="Branding & settings" description="Everything here changes your public site instantly." />
      <SettingsForm
        initial={initial}
        features={{ slaAutomation: features.slaAutomation, webhooks: features.webhooks, customDomain: features.customDomain }}
        rootDomain={rootDomain}
      />
      {["OWNER", "SUPER"].includes(user.role) && <DangerZone tenantName={tenant.name} />}
    </div>
  );
}
