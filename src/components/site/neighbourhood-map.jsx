"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bus, GraduationCap, HeartPulse, Loader2, ShoppingBag, Trees, Utensils } from "lucide-react";
import { MAP_STYLES, buildStyle } from "@/components/map/map-styles";
import { Chip } from "@/components/ui/form";
import { loadMapLibre } from "@/lib/maplibre-loader";
import { cn } from "@/lib/utils";

const ICONS = { school: GraduationCap, health: HeartPulse, food: Utensils, shop: ShoppingBag, transit: Bus, park: Trees };
const COLORS = { school: "#2563eb", health: "#dc2626", food: "#ea580c", shop: "#9333ea", transit: "#0891b2", park: "#16a34a" };

export function NeighbourhoodMap({ lat, lng, title }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const mlRef = useRef(null);
  const markersRef = useRef([]);
  const [places, setPlaces] = useState(null);
  const [categories, setCategories] = useState({});
  const [active, setActive] = useState(() => new Set(["school", "transit", "shop"]));
  const [style, setStyle] = useState("streets");
  const [focus, setFocus] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/nearby?lat=${lat}&lng=${lng}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => {
        setPlaces(d.places || []);
        setCategories(d.categories || {});
      })
      .catch(() => setPlaces([]));
    return () => ctl.abort();
  }, [lat, lng]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await loadMapLibre();
      if (disposed || !el.current) return;
      mlRef.current = ml;
      const map = new ml.Map({ container: el.current, style: buildStyle("streets"), center: [lng, lat], zoom: 14.2, attributionControl: { compact: true }, dragRotate: false, cooperativeGestures: true });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      const pin = document.createElement("div");
      pin.setAttribute("role", "img");
      pin.setAttribute("aria-label", title);
      pin.style.cssText = "width:22px;height:22px;border-radius:99px;background:var(--primary);border:4px solid #fff;box-shadow:0 0 0 8px color-mix(in oklab, var(--primary) 30%, transparent),0 6px 16px rgba(0,0,0,.35)";
      new ml.Marker({ element: pin }).setLngLat([lng, lat]).addTo(map);
      setReady(true);
    })();
    return () => {
      disposed = true;
      setReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, title]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(style));
  }, [style]);

  const visible = useMemo(() => (places || []).filter((p) => active.has(p.cat)), [places, active]);

  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = visible.map((p) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `${p.name}, ${p.km} km`);
      dot.title = `${p.name} · ${p.km} km`;
      dot.dataset.focus = focus === p.id ? "true" : "false";
      const size = focus === p.id ? 20 : 12;
      dot.style.cssText = `width:${size}px;height:${size}px;border-radius:99px;background:${COLORS[p.cat]};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:all .2s;cursor:pointer`;
      dot.addEventListener("click", () => setFocus(p.id));
      return new ml.Marker({ element: dot }).setLngLat([p.lng, p.lat]).addTo(map);
    });
  }, [visible, focus, ready]);

  const toggle = (c) =>
    setActive((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  const list = visible.slice(0, 12);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(categories).map(([key, label]) => {
            const Icon = ICONS[key];
            return (
              <Chip key={key} active={active.has(key)} onClick={() => toggle(key)} className="py-1.5 text-xs">
                {Icon && <Icon className="size-3.5" />} {label}
              </Chip>
            );
          })}
          {places === null && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Finding places nearby…
            </span>
          )}
        </div>
        <div className="relative h-[24rem] overflow-hidden rounded-2xl border border-border">
          <div ref={el} data-invert={MAP_STYLES[style].darkInvert ? "true" : "false"} style={{ position: "absolute", inset: 0 }} />
          <div className="absolute left-3 top-3 z-10 flex rounded-lg bg-card/95 p-0.5 text-xs shadow-soft backdrop-blur">
            {Object.entries(MAP_STYLES).map(([k, s]) => (
              <button key={k} onClick={() => setStyle(k)} aria-pressed={style === k} className={cn("rounded-md px-2.5 py-1.5 font-medium transition-colors", style === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ul className="max-h-[27rem] space-y-1 overflow-y-auto pr-1" aria-label="Nearby places">
        {places && !list.length && <li className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{places.length ? "Select a category to see places." : "Nearby places are unavailable right now."}</li>}
        {list.map((p) => {
          const Icon = ICONS[p.cat];
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setFocus(p.id);
                  mapRef.current?.easeTo({ center: [p.lng, p.lat], duration: 600 });
                }}
                className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted", focus === p.id && "bg-muted")}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: COLORS[p.cat] }}>
                  {Icon && <Icon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.km} km</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
