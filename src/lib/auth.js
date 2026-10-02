import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export const SESSION_COOKIE = "re_session";
export const STAFF = ["OWNER", "ADMIN"];
export const ANY_STAFF = ["OWNER", "ADMIN", "BROKER"];

/** Re-issues the backend's session cookie to the browser (the backend is the only place that signs sessions). */
export async function adoptSessionCookie(res) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!raw) return;
  const [pair, ...attrs] = raw.split(";").map((p) => p.trim());
  const value = pair.slice(SESSION_COOKIE.length + 1);
  const maxAge = Number(attrs.find((a) => a.toLowerCase().startsWith("max-age="))?.split("=")[1]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(Number.isFinite(maxAge) ? { maxAge } : {}),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user for the current tenant host, or null. */
export const getCurrentUser = cache(async () => {
  try {
    return (await api("/api/auth/me")).user;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
});

export async function requireUser(roles) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (roles && !roles.includes(user.role) && user.role !== "SUPER") redirect("/admin?denied=1");
  return user;
}
