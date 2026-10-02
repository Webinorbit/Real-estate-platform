import Script from "next/script";
import { getDemoTenants, getTenant, tenantFeatures } from "@/lib/tenant";
import { SiteShell } from "@/components/site/site-shell";
import { SiteFooter } from "@/components/site/site-footer";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }) {
  const [tenant, demoTenants] = await Promise.all([getTenant(), getDemoTenants()]);
  const features = tenantFeatures(tenant);

  const publicTenant = {
    slug: tenant.slug,
    name: tenant.name,
    logoUrl: tenant.logoUrl,
    tagline: tenant.tagline,
    whatsapp: tenant.whatsapp,
    currency: tenant.currency,
    locale: tenant.locale,
    toursEnabled: features.tours,
  };

  const analyticsSrc = process.env.NEXT_PUBLIC_ANALYTICS_SRC;

  return (
    <>
      <SiteShell tenant={publicTenant}>
        {children}
        <SiteFooter tenant={tenant} features={{ tours: features.tours, removeBranding: features.removeBranding }} demoTenants={demoTenants} />
      </SiteShell>
      {tenant.analyticsSiteId && analyticsSrc && (
        <Script src={analyticsSrc} data-site-id={tenant.analyticsSiteId} strategy="afterInteractive" defer />
      )}
    </>
  );
}
