"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowUpDown, Crosshair, Flame, GripVertical, Layers, List, Loader2, Map as MapIcon, PenLine, RefreshCw, SearchX, Trash2, X,
} from "lucide-react";
import { FilterBar } from "@/components/map/filter-bar";
import { MAP_STYLES, buildStyle } from "@/components/map/map-styles";
import { createCluster, createPill, popupHtml, setPillState } from "@/components/map/markers";
import { PropertyCard, PropertyCardSkeleton } from "@/components/site/property-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/form";
import { DEFAULT_FILTERS, SORTS, filtersToQuery } from "@/lib/filters";
import { circlePolygon, pointInPolygon } from "@/lib/geo";
import { loadMapLibre } from "@/lib/maplibre-loader";
import { cn, debounce } from "@/lib/utils";

const PAGE = 24;

export function MapSearch({ tenant, initialFilters, initialItems, localities }) {
  const [filters, setFilters] = useState(initialFilters);
  const filtersRef = useRef(initialFilters);
  const [items, setItems] = useState(initialItems);
  const itemsRef = useRef(initialItems);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [searchAsMove, setSearchAsMove] = useState(true);
  const searchAsMoveRef = useRef(true);
  const [areaDirty, setAreaDirty] = useState(false);
  const [mapStyle, setMapStyle] = useState("streets");
  const [heat, setHeat] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawCount, setDrawCount] = useState(null);
  const [mobileView, setMobileView] = useState("map");
  const [visible, setVisible] = useState(PAGE);
  const [ratio, setRatio] = useState(0.42);
  const [ready, setReady] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [nearOpen, setNearOpen] = useState(false);
  const [styleMenu, setStyleMenu] = useState(false);

  const wrapRef = useRef(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const mlRef = useRef(null);
  const markersRef = useRef(new Map());
  const indexRef = useRef(null);
  const popupRef = useRef(null);
  const abortRef = useRef(null);
  const programmatic = useRef(false);
  const drawRef = useRef({ active: false, pts: [] });
  const stateRefs = useRef({ hoverId: null, selectedId: null, heat: false, style: "streets" });
  const sentinelRef = useRef(null);
  const listRef = useRef(null);

  stateRefs.current = { hoverId, selectedId, heat, style: mapStyle };
  searchAsMoveRef.current = searchAsMove;

  const prices = useMemo(() => items.map((i) => i.price), [items]);
  const selectedItem = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  /* ---------- URL + data ---------- */

  const syncUrl = useCallback((f) => {
    const qs = filtersToQuery(f, { includeViewport: searchAsMoveRef.current && !!f.bbox });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  const fitToItems = useCallback((list) => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !list.length) return;
    const b = new ml.LngLatBounds();
    list.forEach((p) => b.extend([p.lng, p.lat]));
    programmatic.current = true;
    const pad = { top: 80, bottom: 80, left: 60, right: 60 };
    if (list.length === 1) map.easeTo({ center: [list[0].lng, list[0].lat], zoom: 14, duration: 700 });
    else map.fitBounds(b, { padding: pad, maxZoom: 15, duration: 800 });
  }, []);

  const load = useCallback(
    async (f, { fit = false } = {}) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/properties?${filtersToQuery(f)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        itemsRef.current = data.items;
        setItems(data.items);
        setTruncated(data.truncated);
        setVisible(PAGE);
        listRef.current?.scrollTo({ top: 0 });
        setAreaDirty(false);
        if (fit) fitToItems(data.items);
      } catch (e) {
        if (e.name !== "AbortError") toast.error("Couldn't refresh results", { description: "Check your connection and try again." });
      } finally {
        if (abortRef.current === ctrl) setLoading(false);
      }
    },
    [fitToItems],
  );

  const loadSoon = useMemo(() => debounce((f, o) => load(f, o), 220), [load]);

  const update = useCallback(
    (patch) => {
      const resetsViewport = ["q", "near", "poly", "lt"].some((k) => k in patch);
      const next = { ...filtersRef.current, ...patch, ...(resetsViewport && !("bbox" in patch) ? { bbox: null } : {}) };
      filtersRef.current = next;
      setFilters(next);
      setSelectedId(null);
      popupRef.current?.remove();
      syncUrl(next);
      loadSoon(next, { fit: resetsViewport && !("bbox" in patch) });
    },
    [loadSoon, syncUrl],
  );

  const reset = useCallback(() => {
    const next = { ...DEFAULT_FILTERS, lt: filtersRef.current.lt };
    filtersRef.current = next;
    setFilters(next);
    syncUrl(next);
    loadSoon(next, { fit: true });
  }, [loadSoon, syncUrl]);

  /* ---------- map custom layers ---------- */

  const emptyFC = { type: "FeatureCollection", features: [] };

  const syncOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const f = filtersRef.current;
    const poly = f.poly ? { type: "Feature", geometry: { type: "Polygon", coordinates: [[...f.poly, f.poly[0]]] } } : null;
    const near = f.near ? { type: "Feature", geometry: circlePolygon(f.near[1], f.near[0], f.near[2]) } : null;
    map.getSource("poly")?.setData(poly || emptyFC);
    map.getSource("near")?.setData(near || emptyFC);
    const maxPpsf = Math.max(1, ...itemsRef.current.map((i) => (i.areaSqft ? i.price / i.areaSqft : 0)));
    map.getSource("heat")?.setData({
      type: "FeatureCollection",
      features: itemsRef.current.map((i) => ({
        type: "Feature",
        properties: { w: i.areaSqft ? i.price / i.areaSqft / maxPpsf : 0.2 },
        geometry: { type: "Point", coordinates: [i.lng, i.lat] },
      })),
    });
    map.setLayoutProperty("heat-layer", "visibility", stateRefs.current.heat ? "visible" : "none");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addOverlayLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#0f766e";
    const empty = { type: "geojson", data: emptyFC };
    if (!map.getSource("poly")) map.addSource("poly", empty);
    if (!map.getSource("near")) map.addSource("near", empty);
    if (!map.getSource("draw")) map.addSource("draw", empty);
    if (!map.getSource("heat")) map.addSource("heat", empty);
    const add = (layer) => !map.getLayer(layer.id) && map.addLayer(layer);
    add({ id: "heat-layer", type: "heatmap", source: "heat", layout: { visibility: "none" }, paint: { "heatmap-weight": ["get", "w"], "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 15, 2], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 28, 15, 70], "heatmap-opacity": 0.75, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#38bdf8", 0.45, "#a3e635", 0.7, "#fbbf24", 1, "#ef4444"] } });
    add({ id: "poly-fill", type: "fill", source: "poly", paint: { "fill-color": primary, "fill-opacity": 0.14 } });
    add({ id: "poly-line", type: "line", source: "poly", paint: { "line-color": primary, "line-width": 3, "line-dasharray": [2, 1.5] } });
    add({ id: "near-fill", type: "fill", source: "near", paint: { "fill-color": primary, "fill-opacity": 0.1 } });
    add({ id: "near-line", type: "line", source: "near", paint: { "line-color": primary, "line-width": 2.5 } });
    add({ id: "draw-fill", type: "fill", source: "draw", paint: { "fill-color": primary, "fill-opacity": 0.2 } });
    add({ id: "draw-line", type: "line", source: "draw", paint: { "line-color": primary, "line-width": 3 } });
    syncOverlays();
  }, [syncOverlays]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- markers ---------- */

  const refreshPillStates = useCallback(() => {
    const { hoverId: h, selectedId: s } = stateRefs.current;
    markersRef.current.forEach((m, key) => {
      if (key.startsWith("p:")) {
        const id = key.slice(2);
        setPillState(m.pill, { active: id === h, selected: id === s });
      }
    });
  }, []);

  const selectItem = useCallback(
    (item, { scroll = true } = {}) => {
      const map = mapRef.current;
      const ml = mlRef.current;
      if (!map || !ml) return;
      setSelectedId(item.id);
      popupRef.current?.remove();
      const popup = new ml.Popup({ offset: 26, maxWidth: "280px", closeButton: true, focusAfterOpen: false })
        .setLngLat([item.lng, item.lat])
        .setHTML(popupHtml(item, tenant))
        .addTo(map);
      popup.on("close", () => setSelectedId((cur) => (cur === item.id ? null : cur)));
      popupRef.current = popup;
      if (scroll) document.getElementById(`card-${item.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [tenant],
  );

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    const index = indexRef.current;
    if (!map || !ml || !index) return;
    const b = map.getBounds();
    const clusters = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.round(map.getZoom()));
    const wanted = new Set();
    for (const c of clusters) {
      const [lng, lat] = c.geometry.coordinates;
      const isCluster = !!c.properties.cluster;
      const key = isCluster ? `c:${c.id}:${c.properties.point_count}` : `p:${c.properties.item.id}`;
      wanted.add(key);
      if (markersRef.current.has(key)) continue;
      const wrap = document.createElement("div");
      let pill;
      if (isCluster) {
        pill = createCluster(c.properties.point_count);
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          const zoom = Math.min(index.getClusterExpansionZoom(c.id), 17);
          programmatic.current = false;
          map.easeTo({ center: [lng, lat], zoom, duration: 600 });
        });
      } else {
        const item = c.properties.item;
        pill = createPill(item, tenant.currency);
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          selectItem(item);
        });
        pill.addEventListener("mouseenter", () => {
          setHoverId(item.id);
          document.getElementById(`card-${item.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        pill.addEventListener("mouseleave", () => setHoverId(null));
      }
      wrap.appendChild(pill);
      const marker = new ml.Marker({ element: wrap, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
      markersRef.current.set(key, { marker, pill });
    }
    markersRef.current.forEach((m, key) => {
      if (!wanted.has(key)) {
        m.marker.remove();
        markersRef.current.delete(key);
      }
    });
    refreshPillStates();
  }, [refreshPillStates, selectItem, tenant.currency]);

  /* rebuild cluster index when results change */
  useEffect(() => {
    const index = new Supercluster({ radius: 54, maxZoom: 15, minPoints: 3 });
    index.load(items.map((item) => ({ type: "Feature", properties: { item }, geometry: { type: "Point", coordinates: [item.lng, item.lat] } })));
    indexRef.current = index;
    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current.clear();
    renderMarkers();
    syncOverlays();
  }, [items, renderMarkers, syncOverlays]);

  useEffect(() => {
    refreshPillStates();
  }, [hoverId, selectedId, refreshPillStates]);

  useEffect(() => {
    syncOverlays();
  }, [heat, filters.poly, filters.near, syncOverlays]);

  /* ---------- map lifecycle ---------- */

  useEffect(() => {
    let disposed = false;
    let ro;
    (async () => {
      const ml = await loadMapLibre();
      if (disposed || !mapEl.current) return;
      mlRef.current = ml;
      const f0 = filtersRef.current;
      const map = new ml.Map({
        container: mapEl.current,
        style: buildStyle("streets"),
        center: [tenant.mapLng, tenant.mapLat],
        zoom: tenant.mapZoom,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxZoom: 18.5,
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");

      map.on("style.load", () => {
        addOverlayLayers();
        renderMarkers();
      });
      map.on("load", () => {
        setReady(true);
        if (f0.bbox) {
          programmatic.current = true;
          map.fitBounds([[f0.bbox[0], f0.bbox[1]], [f0.bbox[2], f0.bbox[3]]], { duration: 0 });
        } else {
          fitToItems(itemsRef.current);
        }
      });
      map.on("moveend", () => {
        renderMarkers();
        if (programmatic.current) {
          programmatic.current = false;
          return;
        }
        if (drawRef.current.active) return;
        const b = map.getBounds();
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        if (searchAsMoveRef.current) {
          update({ bbox });
        } else {
          filtersRef.current = { ...filtersRef.current, bbox };
          setAreaDirty(true);
        }
      });
      map.on("click", () => {
        popupRef.current?.remove();
        setSelectedId(null);
      });

      ro = new ResizeObserver(() => map.resize());
      ro.observe(mapEl.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      popupRef.current?.remove();
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* style switching */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(buildStyle(mapStyle));
  }, [mapStyle, ready]);

  /* ---------- draw area ---------- */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const container = map.getCanvasContainer();
    drawRef.current.active = drawing;
    if (!drawing) {
      map.dragPan.enable();
      map.getSource("draw")?.setData(emptyFC);
      container.classList.remove("map-draw-active");
      container.style.touchAction = "";
      setDrawCount(null);
      return;
    }
    popupRef.current?.remove();
    map.dragPan.disable();
    container.classList.add("map-draw-active");
    container.style.touchAction = "none";
    let down = false;
    let pts = [];

    const toLngLat = (e) => {
      const r = container.getBoundingClientRect();
      const p = map.unproject([e.clientX - r.left, e.clientY - r.top]);
      return [p.lng, p.lat];
    };
    const render = (closed) => {
      const ring = closed ? [...pts, pts[0]] : pts;
      map.getSource("draw")?.setData(
        pts.length > 2
          ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] } }, { type: "Feature", geometry: { type: "LineString", coordinates: ring } }] }
          : { type: "FeatureCollection", features: pts.length > 1 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: pts } }] : [] },
      );
      if (pts.length > 2) {
        const poly = { type: "Polygon", coordinates: [[...pts, pts[0]]] };
        setDrawCount(itemsRef.current.filter((i) => pointInPolygon(i.lng, i.lat, poly)).length);
      }
    };
    const onDown = (e) => {
      if (e.button > 0) return;
      down = true;
      pts = [toLngLat(e)];
      container.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!down) return;
      const last = pts[pts.length - 1];
      const a = map.project(last);
      const r = container.getBoundingClientRect();
      if (Math.hypot(a.x - (e.clientX - r.left), a.y - (e.clientY - r.top)) < 5) return;
      pts.push(toLngLat(e));
      render(false);
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      if (pts.length < 8) {
        toast.info("Draw a larger shape around the area you want");
        pts = [];
        map.getSource("draw")?.setData(emptyFC);
        return;
      }
      const step = Math.ceil(pts.length / 80);
      const ring = pts.filter((_, i) => i % step === 0).map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);
      setDrawing(false);
      update({ poly: ring });
      const ml = mlRef.current;
      const b = new ml.LngLatBounds();
      ring.forEach((p) => b.extend(p));
      programmatic.current = true;
      map.fitBounds(b, { padding: 90, maxZoom: 16, duration: 700 });
    };
    container.addEventListener("pointerdown", onDown);
    container.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    const onKey = (e) => e.key === "Escape" && setDrawing(false);
    window.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [drawing, ready, update]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- near me ---------- */

  const nearMe = (km) => {
    if (!navigator.geolocation) return toast.error("Location isn't available in this browser");
    toast.loading("Finding your location...", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss("geo");
        setNearOpen(false);
        update({ near: [Number(pos.coords.latitude.toFixed(5)), Number(pos.coords.longitude.toFixed(5)), km] });
        programmatic.current = true;
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: km <= 3 ? 14 : km <= 8 ? 12.5 : 11, duration: 900 });
      },
      () => toast.error("We couldn't get your location", { id: "geo", description: "Allow location access in your browser." }),
      { timeout: 9000 },
    );
  };

  /* ---------- list behaviours ---------- */

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setVisible((v) => v + PAGE), { root: listRef.current, rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, mobileView]);

  /* resizable split */
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("split-ratio"));
      if (saved >= 0.3 && saved <= 0.65) setRatio(saved);
    } catch {}
  }, []);
  const startDrag = (e) => {
    e.preventDefault();
    const wrap = wrapRef.current;
    const move = (ev) => {
      const r = wrap.getBoundingClientRect();
      const next = Math.min(0.65, Math.max(0.3, (ev.clientX - r.left) / r.width));
      setRatio(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRatio((r) => {
        try {
          localStorage.setItem("split-ratio", String(r));
        } catch {}
        return r;
      });
      mapRef.current?.resize();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    if (mobileView === "map") setTimeout(() => mapRef.current?.resize(), 50);
  }, [mobileView]);

  const searchThisArea = () => {
    update({ bbox: filtersRef.current.bbox });
    setAreaDirty(false);
  };

  const hasResults = items.length > 0;
  const shown = items.slice(0, visible);

  return (
    <div className="flex h-dvh flex-col pt-[4.5rem]">
      <FilterBar
        filters={filters}
        onChange={update}
        onReset={reset}
        localities={localities}
        prices={prices}
        currency={tenant.currency}
        areaUnit={tenant.areaUnit}
        toursEnabled={tenant.toursEnabled}
        resultCount={items.length}
        onSaveSearch={() => setSaveOpen(true)}
      />

      <div ref={wrapRef} className="relative flex min-h-0 flex-1" style={{ "--list-w": `${ratio * 100}%` }}>
        {/* ---------- List ---------- */}
        <section
          className={cn("min-h-0 flex-col bg-background max-lg:w-full lg:flex lg:w-[var(--list-w)] lg:flex-none", mobileView === "list" ? "flex w-full" : "hidden")}
          aria-label="Search results"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div>
              <h1 className="font-heading text-xl font-semibold">
                {loading && !hasResults ? "Searching..." : `${items.length}${truncated ? "+" : ""} ${items.length === 1 ? "home" : "homes"}`}
                {filters.q && <span className="font-sans text-base font-normal text-muted-foreground"> for &ldquo;{filters.q}&rdquo;</span>}
              </h1>
              <p className="text-xs text-muted-foreground">{filters.bbox && searchAsMove ? "In the current map view" : filters.poly ? "Inside your drawn area" : filters.near ? `Within ${filters.near[2]} km of you` : "Matching your filters"}</p>
            </div>
            <div className="flex items-center gap-2 xl:hidden">
              <ArrowUpDown className="size-4 text-muted-foreground" />
              <Select aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className="h-9 w-40 rounded-full text-xs">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div ref={listRef} className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 transition-opacity sm:px-6", loading && hasResults && "opacity-60")}>
            {loading && !hasResults ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <PropertyCardSkeleton key={i} />
                ))}
              </div>
            ) : hasResults ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                  {shown.map((p, i) => (
                    <div id={`card-${p.id}`} key={p.id} className="scroll-mt-4">
                      <PropertyCard p={p} tenant={tenant} priority={i < 2} active={hoverId === p.id || selectedId === p.id} onHover={setHoverId} />
                    </div>
                  ))}
                </div>
                {visible < items.length && <div ref={sentinelRef} className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
                {truncated && <p className="py-6 text-center text-sm text-muted-foreground">Showing the first 500 matches. Zoom in or add filters to narrow down.</p>}
              </>
            ) : (
              <EmptyState
                icon={SearchX}
                title="No homes match here"
                description="Try zooming out the map, removing a filter, or searching a different area."
                action={<Button onClick={reset}><RefreshCw className="size-4" /> Reset filters</Button>}
                className="mt-6"
              />
            )}
          </div>
        </section>

        {/* ---------- divider (desktop) ---------- */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize list and map"
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setRatio((r) => Math.max(0.3, r - 0.03));
            if (e.key === "ArrowRight") setRatio((r) => Math.min(0.65, r + 0.03));
          }}
          className="group relative z-10 hidden w-2 shrink-0 cursor-col-resize items-center justify-center bg-border/60 transition hover:bg-primary/40 lg:flex"
        >
          <GripVertical className="size-4 text-muted-foreground group-hover:text-primary-foreground" />
        </div>

        {/* ---------- Map ---------- */}
        <section className={cn("relative min-h-0 flex-1 max-lg:w-full", mobileView === "map" ? "block" : "hidden lg:block")} aria-label="Map">
          <div ref={mapEl} data-invert={MAP_STYLES[mapStyle].darkInvert ? "true" : "false"} className="bg-muted" style={{ position: "absolute", inset: 0 }} />

          {!ready && <div className="skeleton absolute inset-0 grid place-items-center"><MapIcon className="size-10 animate-pulse text-muted-foreground" /></div>}

          {loading && (
            <div className="absolute inset-x-0 top-0 z-10 h-1 bg-primary/15" role="progressbar" aria-label="Loading results">
              <div className="h-full" style={{ animation: "shimmer 1s linear infinite", backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, transparent, var(--primary), transparent)" }} />
            </div>
          )}

          {/* top controls */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-wrap items-start justify-between gap-2 px-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-4 pr-2 shadow-soft backdrop-blur">
              <label htmlFor="sam" className="cursor-pointer text-xs font-semibold">Search as I move the map</label>
              <Switch id="sam" checked={searchAsMove} onCheckedChange={(v) => { setSearchAsMove(v); if (!v) { filtersRef.current = { ...filtersRef.current, bbox: null }; update({ bbox: null }); } }} label="Search as I move the map" hideLabel />
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <Button variant="outline" size="sm" className={cn("rounded-full bg-card/95 shadow-soft backdrop-blur", drawing && "border-primary bg-primary text-primary-foreground hover:bg-primary")} onClick={() => { if (!drawing && filtersRef.current.poly) update({ poly: null }); setDrawing((d) => !d); }} aria-pressed={drawing}>
                <PenLine className="size-4" /> {drawing ? "Cancel drawing" : "Draw area"}
              </Button>
              <div className="relative">
                <Button variant="outline" size="sm" className={cn("rounded-full bg-card/95 shadow-soft backdrop-blur", filters.near && "border-primary text-primary")} onClick={() => setNearOpen((o) => !o)}>
                  <Crosshair className="size-4" /> Near me
                </Button>
                <AnimatePresence>
                  {nearOpen && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-border bg-card p-3 shadow-lift">
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">Homes within</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[2, 5, 10, 25].map((km) => (
                          <button key={km} onClick={() => nearMe(km)} className="rounded-lg border border-input py-2 text-sm font-semibold transition hover:border-primary hover:bg-primary/10 hover:text-primary">{km} km</button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* search this area */}
          <AnimatePresence>
            {areaDirty && !searchAsMove && (
              <motion.div initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} className="absolute left-1/2 top-16 z-10 -translate-x-1/2">
                <Button onClick={searchThisArea} className="rounded-full shadow-lift"><RefreshCw className="size-4" /> Search this area</Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* drawing hint */}
          <AnimatePresence>
            {drawing && (
              <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-2xl border border-border bg-card px-5 py-3 text-center shadow-lift lg:bottom-8">
                <p className="text-sm font-semibold">Press and drag to draw around the area you want</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{drawCount === null ? "Release to search. Esc to cancel." : <><span className="font-bold text-primary">{drawCount}</span> homes inside so far</>}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* style + heat controls */}
          <div className="absolute bottom-6 left-3 z-10 flex flex-col items-start gap-2 max-lg:bottom-24">
            <AnimatePresence>
              {styleMenu && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-lift">
                  {Object.entries(MAP_STYLES).map(([k, s]) => (
                    <button key={k} onClick={() => { setMapStyle(k); setStyleMenu(false); }} className={cn("rounded-xl px-3.5 py-2 text-xs font-semibold transition", mapStyle === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{s.label}</button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full bg-card/95 shadow-soft backdrop-blur" onClick={() => setStyleMenu((o) => !o)} aria-expanded={styleMenu}>
                <Layers className="size-4" /> {MAP_STYLES[mapStyle].label}
              </Button>
              <Button variant="outline" size="sm" className={cn("rounded-full bg-card/95 shadow-soft backdrop-blur", heat && "border-primary bg-primary text-primary-foreground hover:bg-primary")} onClick={() => setHeat((h) => !h)} aria-pressed={heat}>
                <Flame className="size-4" /> Price heatmap
              </Button>
            </div>
            {heat && (
              <div className="rounded-xl border border-border bg-card/95 px-3 py-2 shadow-soft backdrop-blur">
                <div className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg,#38bdf8,#a3e635,#fbbf24,#ef4444)" }} />
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground"><span>Lower price / {tenant.areaUnit}</span><span>Higher</span></div>
              </div>
            )}
          </div>

          {/* active overlay chips */}
          <div className="absolute left-3 top-16 z-10 flex flex-col gap-2 max-lg:top-[4.25rem]">
            {filters.poly && (
              <button onClick={() => update({ poly: null })} className="flex items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lift">
                <Trash2 className="size-3.5" /> Clear drawn area
              </button>
            )}
            {filters.near && (
              <button onClick={() => update({ near: null })} className="flex items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lift">
                <X className="size-3.5" /> Clear {filters.near[2]} km radius
              </button>
            )}
          </div>

          {/* mobile selected card */}
          <AnimatePresence>
            {selectedItem && (
              <motion.div initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }} className="absolute inset-x-3 bottom-20 z-10 lg:hidden">
                <div className="relative">
                  <PropertyCard p={selectedItem} tenant={tenant} compact />
                  <button onClick={() => { setSelectedId(null); popupRef.current?.remove(); }} aria-label="Close preview" className="absolute -right-1 -top-3 grid size-8 place-items-center rounded-full bg-foreground text-background shadow-lift"><X className="size-4" /></button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* mobile map / list toggle */}
        <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 lg:hidden">
          <Button onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))} size="lg" className="rounded-full px-6 shadow-lift">
            {mobileView === "map" ? (<><List className="size-5" /> List ({items.length})</>) : (<><MapIcon className="size-5" /> Map</>)}
          </Button>
        </div>
      </div>

      <SaveSearchDialog open={saveOpen} onOpenChange={setSaveOpen} filters={filters} />
    </div>
  );
}

function SaveSearchDialog({ open, onOpenChange, filters }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "My search", email: email || undefined, query: filtersToQuery(filters, { includeViewport: false }) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Search saved", { description: email ? "We'll email you when new matches appear." : "Find it any time under Favourites." });
      onOpenChange(false);
      setName("");
    } catch {
      toast.error("Couldn't save this search");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Save this search" description="Come back to it any time, or get an email when new homes match.">
        <form onSubmit={save} className="space-y-4">
          <Field label="Name" htmlFor="ss-name"><Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 3BHK near the lake" maxLength={60} /></Field>
          <Field label="Email (optional)" htmlFor="ss-email" hint="Only used to send new matches."><Input id="ss-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
          <Button type="submit" loading={busy} className="w-full">Save search</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
