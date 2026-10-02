"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { action } from "@/lib/admin";
import { api, ApiError } from "@/lib/api";

async function call(path, opts) {
  try {
    return await api(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.code === "plan_locked") redirect(`/admin/plan?locked=${err.body?.feature || "routingRules"}`);
    throw err;
  }
}

export const saveRule = action(async (id, input) => {
  const res = id
    ? await call(`/api/admin/routing/rules/${encodeURIComponent(id)}`, { method: "PUT", body: input })
    : await call("/api/admin/routing/rules", { method: "POST", body: input });
  revalidatePath("/admin/routing");
  return { id: res.id };
});

export const toggleRule = action(async (id, enabled) => {
  await call(`/api/admin/routing/rules/${encodeURIComponent(id)}/enabled`, { method: "PUT", body: { enabled: Boolean(enabled) } });
  revalidatePath("/admin/routing");
});

export const deleteRule = action(async (id) => {
  await call(`/api/admin/routing/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
  revalidatePath("/admin/routing");
});

export const reorderRules = action(async (ids) => {
  await call("/api/admin/routing/rules/reorder", { method: "POST", body: { ids } });
  revalidatePath("/admin/routing");
});

export const runSimulation = action(async (input) => {
  const res = await call("/api/admin/routing/simulate", {
    method: "POST",
    body: {
      propertyId: input.propertyId || "",
      source: input.source,
      language: input.language || "",
      budget: input.budget === "" || input.budget == null ? null : input.budget,
      now: input.now || null,
    },
  });
  return { result: JSON.parse(JSON.stringify(res.result)) };
});
