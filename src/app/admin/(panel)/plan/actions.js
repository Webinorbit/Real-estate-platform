"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/admin";
import { api } from "@/lib/api";

export const changePlan = action(async (plan) => {
  await api("/api/admin/plan", { method: "PUT", body: { plan } });
  revalidatePath("/", "layout");
});
