import "./globals.css";
import { fontClassFor } from "@/lib/fonts";
import { getOrigin, getTenantOrNull, themeVars } from "@/lib/tenant";
import { Providers, themeInitScript } from "@/components/providers";

export async function generateMetadata() {
  const tenant = await getTenantOrNull();
  const name = tenant?.name || process.env.NEXT_PUBLIC_APP_NAME || "Real Estate";
  return {
    metadataBase: new URL(await getOrigin()),
    title: { default: tenant?.tagline ? `${name} | ${tenant.tagline}` : name, template: `%s | ${name}` },
    description: tenant?.about || `Discover homes, take virtual tours and talk to the right broker with ${name}.`,
    applicationName: name,
    openGraph: { siteName: name, type: "website" },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

export default async function RootLayout({ children }) {
  const tenant = await getTenantOrNull();
  return (
    <html lang="en" suppressHydrationWarning className={fontClassFor(tenant?.fontHeading, tenant?.fontBody)} style={themeVars(tenant)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
