"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/admin";
import { api } from "@/lib/api";

export const saveSettings = action(async (input) => {
  await api("/api/admin/settings", { method: "PUT", body: input });
  revalidatePath("/", "layout");
});
