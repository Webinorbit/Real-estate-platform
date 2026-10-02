"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { buildStyle } from "@/components/map/map-styles";
import { loadMapLibre } from "@/lib/maplibre-loader";

const ringOf = (poly) => (poly?.coordinates?.[0] || []).slice(0, -1);
const toPolygon = (pts) => (pts.length >= 3 ? { type: "Polygon", coordinates: [[...pts, pts[0]]] } : null);

/** Click to add vertices, drag to adjust. Emits a GeoJSON Polygon (or null while fewer than 3 points). */
export function PolygonEditor({ value, onChange, center, zoom = 11, className = "h-80" }) {
  const el = useRef(null);
  const state = useRef({ map: null, ml: null, markers: [], pts: ringOf(value) });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [count, setCount] = useState(ringOf(value).length);

  const sync = () => {
    const { map, pts } = state.current;
    setCount(pts.length);
    const src = map?.getSource("poly");
    if (src) {
      const closed = pts.length >= 3 ? [...pts, pts[0]] : pts;
      src.setData({
        type: "FeatureCollection",
        features: [
          ...(pts.length >= 3 ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closed] } }] : []),
          ...(pts.length >= 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: closed } }] : []),
        ],
      });
    }
    onChangeRef.current(toPolygon(pts));
  };

  const renderMarkers = () => {
    const s = state.current;
    s.markers.forEach((m) => m.remove());
    s.markers = s.pts.map((p, i) => {
      const dot = document.createElement("div");
      dot.style.cssText = "width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--primary);box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:grab";
      const m = new s.ml.Marker({ element: dot, draggable: true }).setLngLat(p).addTo(s.map);
      m.on("drag", () => {
        const ll = m.getLngLat();
        s.pts[i] = [Number(ll.lng.toFixed(6)), Number(ll.lat.toFixed(6))];
        sync();
      });
      return m;
    });
  };

  useEffect(() => {
    let disposed = false;
    (async () => {
      const ml = await loadMapLibre();
      if (disposed || !el.current) return;
      const s = state.current;
      s.ml = ml;
      const pts = s.pts;
      const first = pts[0];
      const map = new ml.Map({ container: el.current, style: buildStyle("streets"), center: first || center, zoom: first ? 12 : zoom, attributionControl: { compact: true }, dragRotate: false });
      s.map = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("load", () => {
        map.addSource("poly", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "poly-fill", type: "fill", source: "poly", filter: ["==", "$type", "Polygon"], paint: { "fill-color": "#0f766e", "fill-opacity": 0.22 } });
        map.addLayer({ id: "poly-line", type: "line", source: "poly", filter: ["==", "$type", "LineString"], paint: { "line-color": "#0f766e", "line-width": 3, "line-dasharray": [2, 1] } });
        if (pts.length >= 3) {
          const b = new ml.LngLatBounds(pts[0], pts[0]);
          pts.forEach((p) => b.extend(p));
          map.fitBounds(b, { padding: 60, duration: 0, maxZoom: 14 });
        }
        sync();
        renderMarkers();
      });
      map.on("click", (e) => {
        s.pts.push([Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))]);
        sync();
        renderMarkers();
      });
      map.getCanvas().style.cursor = "crosshair";
    })();
    return () => {
      disposed = true;
      state.current.markers.forEach((m) => m.remove());
      state.current.map?.remove();
      state.current.map = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className={`relative overflow-hidden rounded-2xl border border-border ${className}`}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
        <div className="absolute left-3 top-3 z-10 flex gap-2">
          <button
            type="button"
            disabled={!count}
            onClick={() => {
              state.current.pts.pop();
              sync();
              renderMarkers();
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-medium shadow-soft disabled:opacity-50"
          >
            <Undo2 className="size-3.5" /> Undo point
          </button>
          <button
            type="button"
            disabled={!count}
            onClick={() => {
              state.current.pts.length = 0;
              sync();
              renderMarkers();
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-medium shadow-soft disabled:opacity-50"
          >
            <Eraser className="size-3.5" /> Clear
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {count < 3 ? `Click the map to outline the area (${count}/3 points minimum).` : `${count} points. Drag a point to adjust, click the map to add more.`}
      </p>
    </div>
  );
}
