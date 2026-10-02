"use server";

import { revalidatePath } from "next/cache";
import { action, adminContext } from "@/lib/admin";
import { api } from "@/lib/api";

/** Imports up to 12 rows per call so the client can show progress and Nominatim's 1 req/sec limit is respected. */
export const importBatch = action(async (rows) => {
  await adminContext({ staffOnly: true, feature: "csvImport" });
  const { results } = await api("/api/admin/import/batch", { method: "POST", body: { rows } });
  revalidatePath("/admin/properties");
  revalidatePath("/properties", "layout");
  return { results };
});
