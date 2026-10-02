import { getOrigin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function robots() {
  const origin = await getOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/embed", "/favorites", "/compare"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
