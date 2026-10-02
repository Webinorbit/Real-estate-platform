import { apiBase } from "@/lib/api";

/**
 * Browser -> FastAPI bridge. Client components call same-origin `/api/*`; this forwards the request
 * (with the public host so the backend can pick the tenant) and streams the answer back.
 */
export const dynamic = "force-dynamic";

const PASS_REQUEST = ["content-type", "cookie", "authorization", "accept", "accept-language", "user-agent"];
const PASS_RESPONSE = ["content-type", "cache-control", "content-disposition", "etag", "retry-after"];

async function forward(request, { params }) {
  const { path } = await params;
  const url = new URL(request.url);
  const target = `${apiBase()}/api/${path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers();
  for (const name of PASS_REQUEST) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  headers.set("x-tenant-host", request.headers.get("x-tenant-host") || request.headers.get("host") || "");
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) headers.set("x-forwarded-proto", proto);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let res;
  try {
    res = await fetch(target, { method: request.method, headers, body: hasBody ? request.body : undefined, duplex: hasBody ? "half" : undefined, redirect: "manual", cache: "no-store" });
  } catch {
    return Response.json({ error: "The service is unavailable. Please try again in a moment." }, { status: 502 });
  }

  const out = new Headers();
  for (const name of PASS_RESPONSE) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  for (const cookie of res.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
