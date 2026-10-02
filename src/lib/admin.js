import { cache } from "react";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { planOf } from "@/lib/plans";
import { UserError } from "@/lib/user-error";

const loadContext = cache(async () => {
  try {
    return await api("/api/auth/context");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) redirect("/admin/login");
    throw err;
  }
});

/** Shared context for admin pages and actions. Redirects to login if there is no valid session. */
export async function adminContext({ staffOnly = false, feature } = {}) {
  const { user, tenant, isStaff, brokerId, photoUrl, newLeads } = await loadContext();
  const features = planOf(tenant);
  if (staffOnly && !isStaff) redirect("/admin?denied=1");
  if (feature && !features[feature]) redirect(`/admin/plan?locked=${feature}`);
  return { user, tenant, features, isStaff, brokerId, photoUrl, newLeads };
}

/** Wraps a server action so thrown errors become `{ ok:false, error }` for the UI. */
export function action(handler) {
  return async (...args) => {
    try {
      const result = await handler(...args);
      return { ok: true, ...(result || {}) };
    } catch (err) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT") || err?.digest === "NEXT_NOT_FOUND") throw err;
      if (err instanceof ApiError && err.status === 401) redirect("/admin/login");
      if (!err?.userMessage) console.error("[action]", err);
      return { ok: false, error: err?.userMessage || "Something went wrong" };
    }
  };
}

export { UserError };
