"use server";

import { revalidatePath } from "next/cache";
import { action, adminContext } from "@/lib/admin";
import { api } from "@/lib/api";

const ctxTours = () => adminContext({ staffOnly: true, feature: "tours" });
const enc = encodeURIComponent;

function refresh(tourId) {
  revalidatePath("/admin/tours");
  if (tourId) {
    revalidatePath(`/admin/tours/${tourId}`);
    revalidatePath(`/tour/${tourId}`);
  }
  revalidatePath("/tours");
  revalidatePath("/properties", "layout");
}

export const createTour = action(async ({ propertyId, title, kind }) => {
  await ctxTours();
  const { id } = await api("/api/admin/tours", { method: "POST", body: { propertyId, title, kind } });
  refresh();
  return { id };
});

export const saveTourSettings = action(async (tourId, input) => {
  await ctxTours();
  await api(`/api/admin/tours/${enc(tourId)}`, { method: "PUT", body: input });
  refresh(tourId);
});

export const deleteTour = action(async (tourId) => {
  await ctxTours();
  await api(`/api/admin/tours/${enc(tourId)}`, { method: "DELETE" });
  refresh();
});

export const addScenes = action(async (tourId, items) => {
  await ctxTours();
  const { scenes } = await api(`/api/admin/tours/${enc(tourId)}/scenes`, { method: "POST", body: { items } });
  refresh(tourId);
  return { scenes };
});

export const updateScene = action(async (sceneId, patch) => {
  await ctxTours();
  await api(`/api/admin/scenes/${enc(sceneId)}`, { method: "PATCH", body: patch });
  revalidatePath("/admin/tours", "layout");
  revalidatePath("/tour", "layout");
  revalidatePath("/tours");
  revalidatePath("/properties", "layout");
});

export const reorderScenes = action(async (tourId, ids) => {
  await ctxTours();
  await api(`/api/admin/tours/${enc(tourId)}/scenes/order`, { method: "PUT", body: { ids } });
  refresh(tourId);
});

export const deleteScene = action(async (sceneId) => {
  await ctxTours();
  const { startSceneId, published } = await api(`/api/admin/scenes/${enc(sceneId)}`, { method: "DELETE" });
  revalidatePath("/admin/tours", "layout");
  revalidatePath("/tour", "layout");
  revalidatePath("/tours");
  revalidatePath("/properties", "layout");
  return { startSceneId, published };
});

export const saveHotspot = action(async (sceneId, hotspotId, input) => {
  await ctxTours();
  const path = `/api/admin/scenes/${enc(sceneId)}/hotspots`;
  const { hotspot } = hotspotId
    ? await api(`${path}/${enc(hotspotId)}`, { method: "PUT", body: input })
    : await api(path, { method: "POST", body: input });
  revalidatePath("/admin/tours", "layout");
  revalidatePath("/tour", "layout");
  revalidatePath("/tours");
  revalidatePath("/properties", "layout");
  return { hotspot };
});

export const deleteHotspot = action(async (hotspotId) => {
  await ctxTours();
  await api(`/api/admin/hotspots/${enc(hotspotId)}`, { method: "DELETE" });
  revalidatePath("/admin/tours", "layout");
  revalidatePath("/tour", "layout");
  revalidatePath("/tours");
  revalidatePath("/properties", "layout");
});
