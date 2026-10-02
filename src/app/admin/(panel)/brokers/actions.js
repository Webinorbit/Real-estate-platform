"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { action, adminContext } from "@/lib/admin";

const brokerPath = (id) => `/api/admin/brokers/${encodeURIComponent(String(id ?? ""))}`;

export const saveBroker = action(async (id, input) => {
  await adminContext({ staffOnly: true });

  if (!id) {
    const res = await api("/api/admin/brokers", { method: "POST", body: input });
    revalidatePath("/admin/brokers");
    return { id: res.id, tempPassword: res.tempPassword ?? null };
  }

  await api(brokerPath(id), { method: "PUT", body: input });
  revalidatePath("/admin/brokers");
  revalidatePath("/brokers");
  return { id };
});

export const setBrokerActive = action(async (id, active) => {
  await adminContext({ staffOnly: true });
  await api(`${brokerPath(id)}/active`, { method: "POST", body: { active: Boolean(active) } });
  revalidatePath("/admin/brokers");
  revalidatePath("/brokers");
});

export const deleteBroker = action(async (id) => {
  await adminContext({ staffOnly: true });
  const res = await api(brokerPath(id), { method: "DELETE" });
  revalidatePath("/admin", "layout");
  revalidatePath("/brokers");
  return { orphaned: res.orphaned };
});
