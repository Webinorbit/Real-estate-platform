"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { Map as MapIcon, LayoutPanelTop } from "lucide-react";
import { buildStyle } from "@/components/map/map-styles";
import { loadMapLibre } from "@/lib/maplibre-loader";
import { cn } from "@/lib/utils";

const RAD = 180 / Math.PI;

function useHeading(viewer, northYaw, apply) {
  useEffect(() => {
    if (!viewer) return;
    const update = () => {
      const yaw = viewer.getPosition().yaw * RAD;
      apply(yaw - (northYaw || 0));
    };
    update();
    viewer.addEventListener("position-updated", update);
    return () => viewer.removeEventListener("position-updated", update);
  }, [viewer, northYaw, apply]);
}

const coneStyle = {
  clipPath: "polygon(50% 50%, 8% 0, 92% 0)",
  background: "radial-gradient(circle at 50% 100%, var(--accent) 0%, color-mix(in oklab, var(--accent) 10%, transparent) 100%)",
};

function PlanView({ tour, scenes, current, onSelect, viewer }) {
  const cone = useRef(null);
  const apply = useRef((deg) => {
    if (cone.current) cone.current.style.transform = `rotate(${deg}deg)`;
  }).current;
  useHeading(viewer, current?.northYaw, apply);
  const ratio = tour.plan ? tour.plan.width / tour.plan.height : 1.54;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-white" style={{ aspectRatio: ratio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tour.floorPlanUrl} alt={`${tour.plan?.label || "Floor"} plan`} className="absolute inset-0 size-full select-none object-contain" draggable={false} />
      {scenes.filter((s) => s.planX != null && s.planY != null).map((s) => {
        const active = s.id === current?.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-label={`Go to ${s.name}`}
            aria-current={active}
            title={s.name}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.planX * 100}%`, top: `${s.planY * 100}%` }}
          >
            {active && <span ref={cone} className="pointer-events-none absolute left-1/2 top-1/2 -ml-[34px] -mt-[34px] size-[68px] origin-center" style={coneStyle} />}
            <span className={cn("relative block rounded-full border-2 border-white shadow transition-all", active ? "size-4 bg-primary ring-4 ring-primary/30" : "size-3 bg-neutral-500 hover:scale-125 hover:bg-primary")} />
          </button>
        );
      })}
    </div>
  );
}

function GeoView({ scenes, current, onSelect, viewer }) {
  const el = useRef(null);
  const state = useRef({ map: null, ml: null, markers: new Map(), cone: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    const located = scenes.filter((s) => s.lat != null && s.lng != null);
    if (!located.length) return;
    (async () => {
      const ml = await loadMapLibre();
      if (disposed || !el.current) return;
      const start = located.find((s) => s.id === current?.id) || located[0];
      const map = new ml.Map({ container: el.current, style: buildStyle("clean"), center: [start.lng, start.lat], zoom: 19, maxZoom: 19.5, attributionControl: false, dragRotate: false, interactive: true });
      state.current.map = map;
      state.current.ml = ml;
      located.forEach((s) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.title = s.name;
        dot.setAttribute("aria-label", `Go to ${s.name}`);
        dot.style.cssText = "width:14px;height:14px;border-radius:99px;background:#6b7280;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer;transition:all .2s";
        dot.addEventListener("click", () => onSelect(s.id));
        state.current.markers.set(s.id, { dot, marker: new ml.Marker({ element: dot }).setLngLat([s.lng, s.lat]).addTo(map) });
      });
      const wrap = document.createElement("div");
      wrap.style.cssText = "width:80px;height:80px;pointer-events:none;z-index:0";
      const cone = document.createElement("div");
      cone.style.cssText = "width:80px;height:80px;transition:transform .08s linear";
      Object.assign(cone.style, coneStyle);
      wrap.appendChild(cone);
      state.current.cone = new ml.Marker({ element: wrap }).setLngLat([start.lng, start.lat]).addTo(map);
      state.current.coneEl = cone;
      setReady(true);
    })();
    return () => {
      disposed = true;
      state.current.map?.remove();
      state.current = { map: null, ml: null, markers: new Map(), cone: null };
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  useEffect(() => {
    const s = state.current;
    if (!ready || !s.map || !current || current.lat == null) return;
    s.markers.forEach(({ dot }, id) => {
      const on = id === current.id;
      dot.style.background = on ? "var(--primary)" : "#6b7280";
      dot.style.width = dot.style.height = on ? "18px" : "14px";
      dot.style.zIndex = on ? "2" : "1";
    });
    s.cone.setLngLat([current.lng, current.lat]);
    s.map.easeTo({ center: [current.lng, current.lat], duration: 700 });
  }, [ready, current]);

  const apply = useRef((deg) => {
    const c = state.current.coneEl;
    if (c) c.style.transform = `rotate(${deg}deg)`;
  }).current;
  useHeading(ready ? viewer : null, current?.northYaw, apply);

  return <div ref={el} className="relative aspect-[16/11] w-full overflow-hidden rounded-lg bg-muted [&_.maplibregl-map]:!absolute [&_.maplibregl-map]:inset-0" style={{ position: "relative" }} />;
}

export function MiniMap({ tour, current, onSelect, viewer }) {
  const hasPlan = Boolean(tour.floorPlanUrl);
  const hasGeo = tour.scenes.some((s) => s.lat != null && s.lng != null);
  const [mode, setMode] = useState(hasPlan ? "plan" : "map");
  if (!hasPlan && !hasGeo) return null;

  return (
    <div className="w-[min(17rem,70vw)] rounded-2xl border border-white/15 bg-black/55 p-2 text-white shadow-lift backdrop-blur-md">
      {hasPlan && hasGeo && (
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-white/10 p-0.5 text-xs font-medium" role="tablist" aria-label="Map type">
          {[
            ["plan", "Floor plan", LayoutPanelTop],
            ["map", "Map", MapIcon],
          ].map(([key, label, Icon]) => (
            <button key={key} role="tab" aria-selected={mode === key} onClick={() => setMode(key)} className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors", mode === key ? "bg-white text-black" : "text-white/75 hover:text-white")}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      )}
      {mode === "plan" && hasPlan ? (
        <PlanView tour={tour} scenes={tour.scenes} current={current} onSelect={onSelect} viewer={viewer} />
      ) : (
        <GeoView scenes={tour.scenes} current={current} onSelect={onSelect} viewer={viewer} />
      )}
      <p className="mt-1.5 truncate px-1 text-xs font-medium text-white/85">{current?.roomLabel || current?.name}</p>
    </div>
  );
}
