import { NextResponse } from "next/server";

const SESSION_COOKIE = "re_session";
const TENANT_COOKIE = "tenant_override";

const switchAllowed = () =>
  process.env.NODE_ENV !== "production" || process.env.ALLOW_TENANT_SWITCH === "true";

/**
 * 1. Forwards the original host so server code can resolve the tenant (custom domain / subdomain).
 * 2. Lets demo deployments switch brand with ?tenant=<slug> (stored in a cookie).
 * 3. Cheap auth gate for /admin (full verification happens in the admin layout).
 */
export function proxy(request) {
  const { nextUrl } = request;
  const host = request.headers.get("host") || nextUrl.host;

  const switchTo = nextUrl.searchParams.get("tenant");
  if (switchTo !== null && switchAllowed()) {
    const clean = nextUrl.clone();
    clean.searchParams.delete("tenant");
    const res = NextResponse.redirect(clean);
    if (switchTo === "") res.cookies.delete(TENANT_COOKIE);
    else res.cookies.set(TENANT_COOKIE, switchTo.toLowerCase().replace(/[^a-z0-9-]/g, ""), { path: "/", maxAge: 60 * 60 * 24 });
    return res;
  }

  const path = nextUrl.pathname;
  if (path.startsWith("/admin") && path !== "/admin/login" && !request.cookies.get(SESSION_COOKIE)) {
    const url = nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set("x-tenant-host", host);
  headers.set("x-pathname", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/|demo/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|mp4|woff2?)$).*)"],
};
