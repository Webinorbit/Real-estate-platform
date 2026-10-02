import { cookies, headers } from "next/headers";

/**
 * Server-side client for the FastAPI backend. It forwards what the backend needs to act on behalf of the
 * visitor: the public host (tenant resolution), the session / visitor cookies and the client IP.
 */
const FORWARDED_COOKIES = ["re_session", "tenant_override", "vid"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export const apiBase = () => (process.env.API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, body) {
    const message = body?.error || (status >= 500 ? "Something went wrong" : `Request failed (${status})`);
    super(message);
    this.status = status;
    this.body = body;
    this.code = body?.code;
    this.userMessage = status < 500 ? message : undefined;
  }
}

const revive = (_key, value) => (typeof value === "string" && ISO.test(value) ? new Date(value) : value);

async function forwardHeaders() {
  const h = await headers();
  const c = await cookies();
  const cookie = FORWARDED_COOKIES.map((n) => [n, c.get(n)?.value]).filter(([, v]) => v).map(([n, v]) => `${n}=${v}`).join("; ");
  const out = { accept: "application/json", "x-tenant-host": h.get("x-tenant-host") || h.get("host") || "" };
  if (cookie) out.cookie = cookie;
  const xff = h.get("x-forwarded-for");
  if (xff) out["x-forwarded-for"] = xff;
  const proto = h.get("x-forwarded-proto");
  if (proto) out["x-forwarded-proto"] = proto;
  return out;
}

function withQuery(path, query) {
  if (!query) return path;
  const qs = query instanceof URLSearchParams ? query : new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ""));
  const s = qs.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}

/** Raw fetch to the backend; returns the Response (use `api` for JSON). */
export async function apiRaw(path, { method = "GET", body, query, signal } = {}) {
  const headers = await forwardHeaders();
  const init = { method, headers, cache: "no-store", signal };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return fetch(`${apiBase()}${withQuery(path, query)}`, init);
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text, revive);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/** JSON call. Throws `ApiError` on any non-2xx response. */
export async function api(path, opts) {
  const res = await apiRaw(path, opts);
  const data = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Like `api`, but returns null instead of throwing when the resource does not exist. */
export async function apiOrNull(path, opts) {
  try {
    return await api(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
