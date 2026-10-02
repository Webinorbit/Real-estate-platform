import Script from "next/script";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getCurrentUser } from "@/lib/auth";
import { getTenant, tenantFeatures } from "@/lib/tenant";
import { SiteShell } from "@/components/site/site-shell";
import { SiteFooter } from "@/components/site/site-footer";

export const dynamic = "force-dynamic";

async function isSignedIn() {
  if (!(await cookies()).get(SESSION_COOKIE)) return false;
  try {
    return !!(await getCurrentUser());
  } catch {
    return false;
  }
}

export default async function SiteLayout({ children }) {
  const [tenant, staff] = await Promise.all([getTenant(), isSignedIn()]);
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
    staff,
  };

  const analyticsSrc = process.env.NEXT_PUBLIC_ANALYTICS_SRC;

  return (
    <>
      <SiteShell tenant={publicTenant}>
        {children}
        <SiteFooter tenant={tenant} features={{ tours: features.tours }} />
      </SiteShell>
      {tenant.analyticsSiteId && analyticsSrc && (
        <Script src={analyticsSrc} data-site-id={tenant.analyticsSiteId} strategy="afterInteractive" defer />
      )}
    </>
  );
}
