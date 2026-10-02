"use server";

import { revalidatePath } from "next/cache";
import { action, adminContext } from "@/lib/admin";
import { api } from "@/lib/api";

const enc = encodeURIComponent;

export const saveProperty = action(async (id, input) => {
  await adminContext({ staffOnly: true });
  if (!id) {
    const { id: created } = await api("/api/admin/properties", { method: "POST", body: input });
    revalidatePath("/admin/properties");
    revalidatePath("/properties");
    return { id: created };
  }
  await api(`/api/admin/properties/${enc(id)}`, { method: "PUT", body: input });
  revalidatePath("/admin/properties");
  revalidatePath("/properties", "layout");
  return { id };
});

export const deleteProperty = action(async (id) => {
  await adminContext({ staffOnly: true });
  await api(`/api/admin/properties/${enc(id)}`, { method: "DELETE" });
  revalidatePath("/admin/properties");
  revalidatePath("/properties", "layout");
});

export const setPropertyStatus = action(async (id, status) => {
  await adminContext({ staffOnly: true });
  await api(`/api/admin/properties/${enc(id)}/status`, { method: "POST", body: { status } });
  revalidatePath("/admin/properties");
  revalidatePath("/properties", "layout");
});

export const toggleFeatured = action(async (id, featured) => {
  await adminContext({ staffOnly: true });
  await api(`/api/admin/properties/${enc(id)}/featured`, { method: "POST", body: { featured: Boolean(featured) } });
  revalidatePath("/admin/properties");
  revalidatePath("/");
});
