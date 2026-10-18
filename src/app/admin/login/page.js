import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { heroImages } from "@/lib/utils";
import { BrandMark } from "@/components/site/brand";
import { LoginForm } from "@/app/admin/login/login-form";

export const metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const tenant = await getTenant();
  const user = await getCurrentUser();
  const next = typeof sp.next === "string" && sp.next.startsWith("/admin") ? sp.next : "/admin";
  if (user) redirect(next);

  const bg = heroImages(tenant)[0];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <Image src={bg} alt="" fill priority sizes="55vw" className="animate-[kenburns_28s_ease-in-out_infinite_alternate] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/35 to-primary/60" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} light href={null} />
          <div className="max-w-lg">
            <h2 className="font-heading text-5xl font-semibold leading-[1.08]">Every lead to the right broker, in minutes.</h2>
            <p className="mt-4 text-lg text-white/80">Manage listings, publish immersive tours and watch your routing engine assign enquiries automatically.</p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ["< 60s", "Lead routing"],
                ["360°", "Virtual tours"],
                ["Live", "Map search"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-2xl border border-white/15 bg-black/30 p-4">
                  <p className="font-heading text-2xl font-semibold">{v}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-wider text-white/70">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandMark name={tenant.name} logoUrl={tenant.logoUrl} href={null} />
          </div>
          <h1 className="font-heading text-3xl font-semibold">Welcome back</h1>
          <p className="mb-8 mt-2 text-muted-foreground">Sign in to the {tenant.name} workspace.</p>
          <LoginForm next={next} />
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <a href="/" className="hover:text-foreground hover:underline">← Back to website</a>
          </p>
        </div>
      </div>
    </div>
  );
}
