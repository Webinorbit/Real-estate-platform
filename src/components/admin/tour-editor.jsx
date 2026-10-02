"use client";

import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { ArrowUpRight, Check, Compass, ExternalLink, GripVertical, Info, Loader2, MapPin, MousePointerClick, Navigation, Plus, Trash2, View } from "lucide-react";
import {
  addScenes, deleteHotspot, deleteScene, deleteTour, reorderScenes, saveHotspot, saveTourSettings, updateScene,
} from "@/app/admin/(panel)/tours/actions";
import { DropZone, useUploader } from "@/components/admin/image-uploader";
import { LocationPicker } from "@/components/admin/location-picker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger, Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, SegmentedControl, Textarea } from "@/components/ui/form";
import { Badge, Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const RAD = 180 / Math.PI;
const normDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const round1 = (n) => Math.round(n * 10) / 10;
const titleFromFile = (n) => n.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);

function markerFor(h, sceneName) {
  const position = { yaw: `${h.yaw}deg`, pitch: `${h.pitch || 0}deg` };
  const label = String(h.label || sceneName || "").replace(/[<>&"]/g, "");
  if (h.type === "INFO") return { id: h.id, position, html: '<div class="tour-info">i</div>', size: { width: 34, height: 34 }, anchor: "center center", data: h };
  return { id: h.id, position, html: `<div class="tour-hotspot">${ARROW}${label ? `<span class="tour-hotspot-label">${label}</span>` : ""}</div>`, size: { width: 54, height: 54 }, anchor: "center center", data: h };
}

function SceneRow({ scene, active, isStart, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("group flex items-center gap-2 rounded-xl border bg-card p-1.5", active ? "border-primary ring-2 ring-primary/25" : "border-border", isDragging && "z-10 shadow-lift")}>
      <button type="button" aria-label={`Reorder ${scene.name}`} className="grid size-8 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          <Image src={scene.thumbUrl || scene.panoramaUrl} alt="" fill sizes="48px" className="object-cover" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{scene.name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {scene.hotspots.length} hotspot{scene.hotspots.length === 1 ? "" : "s"}
            {isStart && <Badge tone="primary" className="px-1.5 py-0 text-[10px]">Start</Badge>}
          </span>
        </span>
      </button>
      <button type="button" onClick={onDelete} aria-label={`Delete ${scene.name}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function PlanPlacer({ plan, url, scenes, selectedId, onSelect, onPlace }) {
  const box = useRef(null);
  const drag = useRef(null);
  const toNorm = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  return (
    <div>
      <div
        ref={box}
        className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-border bg-white"
        style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !e.target.dataset.plan) return;
          const p = toNorm(e);
          onPlace(selectedId, p.x, p.y);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img data-plan src={url} alt="Floor plan" draggable={false} className="absolute inset-0 size-full select-none object-contain" />
        {scenes.filter((s) => s.planX != null && s.planY != null).map((s) => {
          const sel = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              title={s.name}
              aria-label={`${s.name} position`}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = s.id;
                onSelect(s.id);
              }}
              onPointerMove={(e) => {
                if (drag.current !== s.id) return;
                const p = toNorm(e);
                onPlace(s.id, p.x, p.y, { silent: true });
              }}
              onPointerUp={(e) => {
                if (drag.current !== s.id) return;
                drag.current = null;
                const p = toNorm(e);
                onPlace(s.id, p.x, p.y);
              }}
              className={cn("absolute grid size-6 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full border-2 border-white text-[10px] font-bold shadow-lg", sel ? "z-10 scale-125 cursor-grab bg-accent text-accent-foreground ring-4 ring-accent/40" : "bg-primary text-primary-foreground")}
              style={{ left: `${s.planX * 100}%`, top: `${s.planY * 100}%` }}
            >
              {scenes.indexOf(s) + 1}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Click the plan to place the selected scene, or drag its marker. Numbers match the scene order.</p>
    </div>
  );
}

export function TourEditor({ tour, initialScenes, property }) {
  const router = useRouter();
  const [scenes, setScenes] = useState(initialScenes);
  const [selectedId, setSelectedId] = useState(tour.startSceneId || initialScenes[0]?.id || null);
  const [settings, setSettings] = useState({
    title: tour.title, kind: tour.kind, externalUrl: tour.externalUrl || "", published: tour.published, autoRotate: tour.autoRotate,
    startSceneId: tour.startSceneId, floorPlanUrl: tour.floorPlanUrl || "", planWidth: tour.plan?.width || 800, planHeight: tour.plan?.height || 520, planLabel: tour.plan?.label || "Floor plan",
  });
  const [status, setStatus] = useState("saved");
  const [tool, setTool] = useState(null);
  const [hotspotDraft, setHotspotDraft] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [deleting, startDelete] = useTransition();

  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const panos = useUploader("panorama");
  const plans = useUploader("plan");

  const scene = scenes.find((s) => s.id === selectedId) || null;
  const byId = useMemo(() => Object.fromEntries(scenes.map((s) => [s.id, s])), [scenes]);
  const toolRef = useRef(tool);
  toolRef.current = tool;

  // ---- autosave -------------------------------------------------------------
  const pendingScene = useRef({});
  const timers = useRef({});
  const settingsTimer = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const markSaving = () => setStatus("saving");
  const finish = (res) => {
    if (!res.ok) {
      setStatus("error");
      toast.error(res.error);
    } else setStatus((s) => (Object.keys(pendingScene.current).length || settingsTimer.current ? "saving" : "saved"));
  };

  const flushScene = useCallback(async (id) => {
    const patch = pendingScene.current[id];
    if (!patch) return;
    delete pendingScene.current[id];
    finish(await updateScene(id, patch));
  }, []);

  const patchScene = useCallback(
    (id, patch, { silent = false } = {}) => {
      setScenes((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      if (silent) return;
      pendingScene.current[id] = { ...pendingScene.current[id], ...patch };
      clearTimeout(timers.current[id]);
      markSaving();
      timers.current[id] = setTimeout(() => flushScene(id), 700);
    },
    [flushScene],
  );

  const pushSettings = useCallback(async (immediate = false, override) => {
    clearTimeout(settingsTimer.current);
    const run = async () => {
      settingsTimer.current = null;
      const res = await saveTourSettings(tour.id, override || settingsRef.current);
      finish(res);
      return res;
    };
    markSaving();
    if (immediate) return run();
    settingsTimer.current = setTimeout(run, 800);
  }, [tour.id]);

  const patchSettings = (patch, immediate = false) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    return pushSettings(immediate, next);
  };

  useEffect(() => {
    const warn = (e) => {
      if (Object.keys(pendingScene.current).length || settingsTimer.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ---- panorama viewer ------------------------------------------------------
  const container = useRef(null);
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);
  const loadedRef = useRef(null);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  const renderMarkers = useCallback((s) => {
    const plugin = pluginRef.current;
    if (!plugin || !s) return;
    plugin.clearMarkers();
    plugin.setMarkers(s.hotspots.map((h) => markerFor(h, byIdRef.current[h.targetSceneId]?.name)));
  }, []);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  useEffect(() => {
    if (settings.kind !== "PANORAMA" || !scenes.length || viewerRef.current || !container.current) return;
    let disposed = false;
    (async () => {
      const [{ Viewer }, { MarkersPlugin }] = await Promise.all([import("@photo-sphere-viewer/core"), import("@photo-sphere-viewer/markers-plugin")]);
      if (disposed || !container.current) return;
      const first = scenesRef.current.find((s) => s.id === selectedIdRef.current) || scenesRef.current[0];
      const v = new Viewer({
        container: container.current,
        panorama: first.panoramaUrl,
        navbar: ["zoom", "fullscreen"],
        defaultYaw: `${first.initialYaw || 0}deg`,
        minFov: 35,
        maxFov: 100,
        defaultZoomLvl: 38,
        mousewheelCtrlKey: true,
        loadingTxt: "Loading panorama…",
        plugins: [[MarkersPlugin, {}]],
      });
      viewerRef.current = v;
      const plugin = v.getPlugin(MarkersPlugin);
      pluginRef.current = plugin;
      loadedRef.current = first.id;
      v.addEventListener("ready", () => {
        if (disposed) return;
        setViewerReady(true);
        renderMarkers(first);
      }, { once: true });
      v.addEventListener("click", ({ data }) => {
        const t = toolRef.current;
        if (!t || data.rightclick) return;
        setHotspotDraft({ id: null, type: t, yaw: round1(normDeg(data.yaw * RAD)), pitch: round1(data.pitch * RAD), label: "", content: "", targetSceneId: "" });
        setTool(null);
      });
      plugin.addEventListener("select-marker", ({ marker }) => {
        if (marker.data) setHotspotDraft({ ...marker.data, label: marker.data.label || "", content: marker.data.content || "", targetSceneId: marker.data.targetSceneId || "" });
      });
    })();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.kind, scenes.length > 0]);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(
    () => () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      pluginRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !scene || !viewerReady || loadedRef.current === scene.id) return;
    let cancelled = false;
    pluginRef.current?.clearMarkers();
    v.setPanorama(scene.panoramaUrl, { transition: 500, showLoader: true, position: { yaw: `${scene.initialYaw || 0}deg`, pitch: 0 } })
      .then((done) => {
        if (cancelled || done === false) return;
        loadedRef.current = scene.id;
        renderMarkers(scenesRef.current.find((s) => s.id === scene.id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scene?.id, viewerReady, renderMarkers]);

  useEffect(() => {
    if (viewerReady && scene && loadedRef.current === scene.id) renderMarkers(scene);
  }, [scene?.hotspots, byId, viewerReady, renderMarkers, scene]);

  useEffect(() => {
    const el = container.current;
    if (el) el.style.cursor = tool ? "crosshair" : "";
  }, [tool]);

  useEffect(() => {
    if (!tool) return;
    const esc = (e) => e.key === "Escape" && setTool(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [tool]);

  const currentYaw = () => normDeg(viewerRef.current.getPosition().yaw * RAD);

  // ---- scene ops ------------------------------------------------------------
  const onPanos = async (files) => {
    const up = await panos.upload(files);
    if (!up.length) return;
    up.forEach((f) => {
      const r = f.width / f.height;
      if (r < 1.9 || r > 2.1) toast.warning(`${f.name} is not 2:1. Panoramas should be equirectangular (e.g. 6000×3000) or they will look stretched.`);
    });
    const res = await addScenes(tour.id, up.map((f) => ({ panoramaUrl: f.url, thumbUrl: f.thumbUrl, name: titleFromFile(f.name) })));
    if (!res.ok) return toast.error(res.error);
    setScenes((ss) => [...ss, ...res.scenes.map((s) => ({ ...s, hotspots: [] }))]);
    setSelectedId((cur) => cur || res.scenes[0]?.id);
    if (!settingsRef.current.startSceneId) setSettings((st) => ({ ...st, startSceneId: res.scenes[0]?.id || null }));
    toast.success(`${res.scenes.length} scene${res.scenes.length === 1 ? "" : "s"} added`);
    router.refresh();
  };

  const onReorder = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(scenes, scenes.findIndex((s) => s.id === active.id), scenes.findIndex((s) => s.id === over.id));
    setScenes(next);
    markSaving();
    finish(await reorderScenes(tour.id, next.map((s) => s.id)));
  };

  const removeScene = (id) =>
    startDelete(async () => {
      const res = await deleteScene(id);
      if (!res.ok) return toast.error(res.error);
      const rest = scenes.filter((s) => s.id !== id).map((s) => ({ ...s, hotspots: s.hotspots.filter((h) => h.targetSceneId !== id) }));
      setScenes(rest);
      if (selectedId === id) {
        loadedRef.current = null;
        setSelectedId(rest[0]?.id || null);
      }
      setSettings((st) => ({ ...st, startSceneId: res.startSceneId, published: res.published }));
      setConfirm(null);
      toast.success("Scene removed");
    });

  const submitHotspot = async () => {
    const d = hotspotDraft;
    const res = await saveHotspot(scene.id, d.id, { type: d.type, yaw: d.yaw, pitch: d.pitch, label: d.label, content: d.content, targetSceneId: d.targetSceneId });
    if (!res.ok) return toast.error(res.error);
    setScenes((ss) => ss.map((s) => (s.id === scene.id ? { ...s, hotspots: d.id ? s.hotspots.map((h) => (h.id === d.id ? res.hotspot : h)) : [...s.hotspots, res.hotspot] } : s)));
    setHotspotDraft(null);
    toast.success("Hotspot saved");
  };

  const removeHotspot = async () => {
    const id = hotspotDraft.id;
    const res = await deleteHotspot(id);
    if (!res.ok) return toast.error(res.error);
    setScenes((ss) => ss.map((s) => (s.id === scene.id ? { ...s, hotspots: s.hotspots.filter((h) => h.id !== id) } : s)));
    setHotspotDraft(null);
  };

  const onPlan = async (files) => {
    const [f] = await plans.upload(files.slice(0, 1));
    if (f) patchSettings({ floorPlanUrl: f.url, planWidth: f.width, planHeight: f.height }, true);
  };

  const planInfo = settings.floorPlanUrl ? { width: settings.planWidth, height: settings.planHeight } : null;
  const placeOnPlan = (id, x, y, opts) => patchScene(id, { planX: Math.round(x * 1000) / 1000, planY: Math.round(y * 1000) / 1000 }, opts);

  // ---- publish --------------------------------------------------------------
  const togglePublish = async (published) => {
    const prev = settingsRef.current.published;
    const res = await patchSettings({ published }, true);
    if (res && !res.ok) setSettings((st) => ({ ...st, published: prev }));
    else {
      toast.success(published ? "Tour published. It now appears on the property page." : "Tour unpublished");
      router.refresh();
    }
  };

  const external = settings.kind === "EXTERNAL";

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[14rem] flex-1">
          <input
            value={settings.title}
            onChange={(e) => patchSettings({ title: e.target.value })}
            aria-label="Tour title"
            className="w-full rounded-lg bg-transparent px-2 py-1 font-heading text-2xl font-semibold outline-none ring-primary/30 focus:ring-4"
          />
          <p className="px-2 text-sm text-muted-foreground">
            <Link href={`/admin/properties/${property.id}`} className="hover:text-primary">{property.title}</Link>
          </p>
        </div>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", status === "error" ? "text-danger" : "text-muted-foreground")} aria-live="polite">
          {status === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : status === "saved" ? <Check className="size-3.5 text-success" /> : null}
          {status === "saving" ? "Saving…" : status === "saved" ? "All changes saved" : "Not saved"}
        </span>
        <Switch id="publish" checked={settings.published} onCheckedChange={togglePublish} label={settings.published ? "Published" : "Draft"} />
        <Link href={`/tour/${tour.id}?preview=1`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
          <ExternalLink className="size-4" /> Preview
        </Link>
        <button type="button" onClick={() => setConfirm({ type: "tour" })} aria-label="Delete tour" className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground hover:border-danger hover:text-danger">
          <Trash2 className="size-4" />
        </button>
      </Card>

      <Card className="p-4">
        <Field label="Tour type">
          <SegmentedControl value={settings.kind} onChange={(kind) => patchSettings({ kind }, kind === "PANORAMA")} options={[{ value: "PANORAMA", label: "360° photos" }, { value: "EXTERNAL", label: "External link" }]} />
        </Field>
      </Card>

      {external ? (
        <Card className="space-y-4 p-5">
          <Field label="External tour link" hint="Matterport, Kuula, 3DVista, YouTube 360… Must be an https:// link that allows embedding.">
            <Input type="url" value={settings.externalUrl} onChange={(e) => patchSettings({ externalUrl: e.target.value })} placeholder="https://my.matterport.com/show/?m=…" />
          </Field>
          {/^https:\/\//.test(settings.externalUrl) && (
            <div className="aspect-video overflow-hidden rounded-2xl border border-border">
              <iframe src={settings.externalUrl} title="External tour preview" className="size-full" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
          <div className="space-y-3">
            <DropZone compact uploading={panos.uploading} progress={panos.progress} label="Add 360° photos" hint="Equirectangular 2:1 JPGs" onFiles={onPanos} />
            <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorder}>
              <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {scenes.map((s) => (
                    <SceneRow key={s.id} scene={s} active={s.id === selectedId} isStart={s.id === settings.startSceneId} onSelect={() => setSelectedId(s.id)} onDelete={() => setConfirm({ type: "scene", id: s.id, name: s.name })} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {scenes.length === 0 && <p className="text-center text-xs text-muted-foreground">Upload one photo per room, then link rooms with arrows.</p>}
          </div>

          <div className="min-w-0 space-y-4">
            {scene ? (
              <>
                <div className="relative overflow-hidden rounded-2xl border border-border bg-black shadow-soft">
                  <div ref={container} className="aspect-[16/10] min-h-[22rem] w-full" />
                  <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setTool(tool === "LINK" ? null : "LINK")} className={cn("pointer-events-auto flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium shadow-lg transition", tool === "LINK" ? "bg-accent text-accent-foreground" : "bg-black/70 text-white backdrop-blur hover:bg-black/85")}>
                      <ArrowUpRight className="size-4" /> {tool === "LINK" ? "Click the photo…" : "Add arrow"}
                    </button>
                    <button type="button" onClick={() => setTool(tool === "INFO" ? null : "INFO")} className={cn("pointer-events-auto flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium shadow-lg transition", tool === "INFO" ? "bg-accent text-accent-foreground" : "bg-black/70 text-white backdrop-blur hover:bg-black/85")}>
                      <Info className="size-4" /> {tool === "INFO" ? "Click the photo…" : "Add info point"}
                    </button>
                  </div>
                  {tool && <p className="pointer-events-none absolute inset-x-0 bottom-3 z-20 mx-auto w-fit rounded-full bg-black/75 px-4 py-1.5 text-xs text-white">Click where the {tool === "LINK" ? "arrow" : "info point"} should appear. Press Esc to cancel.</p>}
                </div>

                <Card className="space-y-4 p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Scene name"><Input value={scene.name} onChange={(e) => patchScene(scene.id, { name: e.target.value })} /></Field>
                    <Field label="Room label" hint="Shown on the plan"><Input value={scene.roomLabel || ""} onChange={(e) => patchScene(scene.id, { roomLabel: e.target.value })} /></Field>
                    <Field label="Floor"><Input type="number" value={scene.floor} onChange={(e) => patchScene(scene.id, { floor: Number(e.target.value) || 0 })} /></Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={!viewerReady} onClick={() => { patchScene(scene.id, { initialYaw: round1(currentYaw()) }); toast.success("Opening view saved for this room"); }}>
                      <MousePointerClick className="size-4" /> Use current view as opening angle
                    </Button>
                    <Button size="sm" variant="outline" disabled={!viewerReady} onClick={() => { patchScene(scene.id, { northYaw: round1(currentYaw()) }); toast.success("North calibrated. The map cone will now point correctly."); }}>
                      <Compass className="size-4" /> Set current direction as North
                    </Button>
                    <Button size="sm" variant={settings.startSceneId === scene.id ? "secondary" : "outline"} disabled={settings.startSceneId === scene.id} onClick={() => patchSettings({ startSceneId: scene.id }, true)}>
                      <Navigation className="size-4" /> {settings.startSceneId === scene.id ? "This is the first scene" : "Make first scene"}
                    </Button>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Hotspots in this room ({scene.hotspots.length})</p>
                    {scene.hotspots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None yet. Use “Add arrow” to connect to another room.</p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {scene.hotspots.map((h) => (
                          <li key={h.id}>
                            <button type="button" onClick={() => setHotspotDraft({ ...h, label: h.label || "", content: h.content || "", targetSceneId: h.targetSceneId || "" })} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary">
                              {h.type === "LINK" ? <ArrowUpRight className="size-3.5" /> : <Info className="size-3.5" />}
                              {h.type === "LINK" ? `To ${byId[h.targetSceneId]?.name || "…"}` : h.label || "Info"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              </>
            ) : (
              <div className="grid min-h-[22rem] place-items-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center">
                <div>
                  <View className="mx-auto size-10 text-primary" />
                  <p className="mt-3 font-heading text-xl font-semibold">Upload your first 360° photo</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Use equirectangular panoramas from a 360° camera or your phone’s panorama mode. Aim for 6000×3000 pixels.</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="mb-3 font-heading text-lg font-semibold">Placement</h3>
              {scene ? (
                <Tabs defaultValue={planInfo ? "plan" : "map"}>
                  <TabsList className="mb-3">
                    <TabsTrigger value="plan">Floor plan</TabsTrigger>
                    <TabsTrigger value="map"><MapPin className="mr-1 inline size-3.5" /> Map</TabsTrigger>
                  </TabsList>
                  <TabsContent value="plan">
                    {planInfo ? (
                      <>
                        <PlanPlacer plan={planInfo} url={settings.floorPlanUrl} scenes={scenes} selectedId={selectedId} onSelect={setSelectedId} onPlace={placeOnPlan} />
                        <button type="button" onClick={() => patchSettings({ floorPlanUrl: "" }, true)} className="mt-2 text-xs text-muted-foreground hover:text-danger">Remove floor plan</button>
                      </>
                    ) : (
                      <DropZone compact multiple={false} uploading={plans.uploading} progress={plans.progress} label="Upload floor plan image" hint="PNG or JPG. Clean top-down plans work best." onFiles={onPlan} />
                    )}
                  </TabsContent>
                  <TabsContent value="map">
                    <LocationPicker key={scene.id} lat={scene.lat ?? property.lat} lng={scene.lng ?? property.lng} zoom={18} className="h-60" onChange={({ lat, lng }) => patchScene(scene.id, { lat, lng })} />
                    <p className="mt-2 text-xs text-muted-foreground">Powers the live mini-map and direction cone in the viewer.</p>
                  </TabsContent>
                </Tabs>
              ) : (
                <p className="text-sm text-muted-foreground">Add a scene to place it on a plan or map.</p>
              )}
            </Card>
            <Card className="space-y-3 p-4">
              <h3 className="font-heading text-lg font-semibold">Viewer options</h3>
              <Switch id="rotate" checked={settings.autoRotate} onCheckedChange={(autoRotate) => patchSettings({ autoRotate })} label="Gentle auto-rotate when idle" />
            </Card>
          </div>
        </div>
      )}

      <Dialog open={Boolean(hotspotDraft)} onOpenChange={(o) => !o && setHotspotDraft(null)}>
        <DialogContent title={hotspotDraft?.id ? "Edit hotspot" : hotspotDraft?.type === "INFO" ? "New info point" : "New arrow"} description={hotspotDraft?.type === "INFO" ? "A tappable ‘i’ that reveals a note." : "A tappable arrow that moves visitors to another room."}>
          {hotspotDraft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitHotspot();
              }}
            >
              {hotspotDraft.type === "LINK" ? (
                <Field label="Leads to">
                  <Select value={hotspotDraft.targetSceneId} onChange={(e) => setHotspotDraft({ ...hotspotDraft, targetSceneId: e.target.value })} required>
                    <option value="">Choose a room…</option>
                    {scenes.filter((s) => s.id !== scene?.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              ) : null}
              <Field label={hotspotDraft.type === "LINK" ? "Label (optional)" : "Title"}>
                <Input value={hotspotDraft.label} onChange={(e) => setHotspotDraft({ ...hotspotDraft, label: e.target.value })} maxLength={60} placeholder={hotspotDraft.type === "LINK" ? "Defaults to the room name" : "Italian marble flooring"} />
              </Field>
              {hotspotDraft.type === "INFO" && (
                <Field label="Details">
                  <Textarea rows={3} value={hotspotDraft.content} onChange={(e) => setHotspotDraft({ ...hotspotDraft, content: e.target.value })} maxLength={500} />
                </Field>
              )}
              <div className="flex items-center justify-between pt-1">
                {hotspotDraft.id ? <Button type="button" variant="ghost" className="text-danger" onClick={removeHotspot}><Trash2 className="size-4" /> Delete</Button> : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setHotspotDraft(null)}>Cancel</Button>
                  <Button type="submit">Save hotspot</Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title={confirm?.type === "tour" ? "Delete this tour?" : `Delete “${confirm?.name}”?`} description={confirm?.type === "tour" ? "All scenes and hotspots will be removed. This cannot be undone." : "Arrows pointing to this room will be removed too."}>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() =>
                confirm.type === "tour"
                  ? startDelete(async () => {
                      const res = await deleteTour(tour.id);
                      if (res.ok) router.replace("/admin/tours");
                      else toast.error(res.error);
                    })
                  : removeScene(confirm.id)
              }
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
