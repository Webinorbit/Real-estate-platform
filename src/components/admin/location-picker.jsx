"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { buildStyle } from "@/components/map/map-styles";
import { Input } from "@/components/ui/form";
import { loadMapLibre } from "@/lib/maplibre-loader";

/** Click or drag the pin to set coordinates; the search box geocodes through OpenStreetMap Nominatim. */
export function LocationPicker({ lat, lng, zoom = 13, onChange, className = "h-72" }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await loadMapLibre();
      if (disposed || !el.current) return;
      const map = new ml.Map({ container: el.current, style: buildStyle("streets"), center: [lng, lat], zoom, attributionControl: { compact: true }, dragRotate: false });
      mapRef.current = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      const pin = document.createElement("div");
      pin.style.cssText = "width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--primary);border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.4);cursor:grab";
      const wrap = document.createElement("div");
      wrap.appendChild(pin);
      const marker = new ml.Marker({ element: wrap, draggable: true, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
      markerRef.current = marker;
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        onChangeRef.current({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
      });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        onChangeRef.current({ lat: Number(e.lngLat.lat.toFixed(6)), lng: Number(e.lngLat.lng.toFixed(6)) });
      });
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = markerRef.current;
    if (m && Number.isFinite(lat) && Number.isFinite(lng)) {
      const cur = m.getLngLat();
      if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) m.setLngLat([lng, lat]);
    }
  }, [lat, lng]);

  const search = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      setResults((await res.json()).results || []);
    } finally {
      setBusy(false);
    }
  };

  const pick = (r) => {
    setResults([]);
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: 900 });
    markerRef.current?.setLngLat([r.lng, r.lat]);
    onChange({ lat: Number(r.lat.toFixed(6)), lng: Number(r.lng.toFixed(6)) });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search(e)} placeholder="Search an address or landmark to drop the pin" className="pl-10" aria-label="Search location" />
          </div>
          <button type="button" onClick={search} className="grid h-11 w-24 place-items-center rounded-xl bg-muted text-sm font-medium hover:bg-border">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Find"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-xl border border-border bg-card shadow-lift">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> <span className="line-clamp-2">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={`relative overflow-hidden rounded-2xl border border-border ${className}`}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
      </div>
      <p className="text-xs text-muted-foreground">Click the map or drag the pin. Coordinates: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</p>
    </div>
  );
}
