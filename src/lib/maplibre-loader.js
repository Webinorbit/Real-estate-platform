let pending;

/** Lazy-loads MapLibre and points it at a statically served worker (Turbopack can't bundle it). */
export function loadMapLibre() {
  if (!pending) {
    pending = import("maplibre-gl").then((mod) => {
      const ml = mod.default || mod;
      if (typeof ml.setWorkerUrl === "function") ml.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      return ml;
    });
  }
  return pending;
}
