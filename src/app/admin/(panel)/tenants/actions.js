"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/admin";
import { api } from "@/lib/api";

export const createTenant = action(async (input) => {
  const { slug, email, password } = await api("/api/admin/tenants", { method: "POST", body: input });
  revalidatePath("/admin/tenants");
  return { slug, email, password };
});

export const setTenantActive = action(async (id, active) => {
  await api(`/api/admin/tenants/${encodeURIComponent(id)}/active`, { method: "PUT", body: { active: Boolean(active) } });
  revalidatePath("/admin/tenants");
});

export const setTenantPlan = action(async (id, plan) => {
  await api(`/api/admin/tenants/${encodeURIComponent(id)}/plan`, { method: "PUT", body: { plan } });
  revalidatePath("/admin/tenants");
});
