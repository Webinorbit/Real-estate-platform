import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata = { title: "Branding & settings" };

export default async function SettingsPage() {
  await adminContext({ staffOnly: true });
  const { initial, features, rootDomain } = await api("/api/admin/settings");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Branding & settings" description="Everything here changes your public site instantly." />
      <SettingsForm
        initial={initial}
        features={{ slaAutomation: features.slaAutomation, webhooks: features.webhooks, customDomain: features.customDomain }}
        rootDomain={rootDomain}
      />
    </div>
  );
}
