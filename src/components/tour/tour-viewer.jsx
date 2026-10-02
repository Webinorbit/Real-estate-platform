"use client";

import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { ArrowLeft, CalendarCheck, Check, Code2, Compass, Copy, ExternalLink, Info, Maximize2, Minimize2, Pause, Play, Share2, Smartphone, X } from "lucide-react";
import { MiniMap } from "@/components/tour/mini-map";
import { LeadForm } from "@/components/site/lead-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const RAD = Math.PI / 180;
const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

function markerFor(h) {
  const label = h.label ? String(h.label).replace(/[<>&"]/g, "") : "";
  const position = { yaw: `${h.yaw}deg`, pitch: `${h.pitch || 0}deg` };
  if (h.type === "INFO") {
    return { id: h.id, position, html: '<div class="tour-info" role="button" aria-label="More information">i</div>', size: { width: 34, height: 34 }, anchor: "center center", data: h };
  }
  return {
    id: h.id,
    position,
    html: `<div class="tour-hotspot" role="button" aria-label="Go to ${label}">${ARROW}${label ? `<span class="tour-hotspot-label">${label}</span>` : ""}</div>`,
    size: { width: 54, height: 54 },
    anchor: "center center",
    data: h,
  };
}

function IconButton({ label, onClick, active, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn("grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70 active:scale-90", active && "bg-white text-black hover:bg-white", className)}
    >
      {children}
    </button>
  );
}

function ShareDialog({ open, onOpenChange, tourId, title }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/tour/${tourId}`;
  const embed = `<iframe src="${origin}/embed/tour/${tourId}" width="100%" height="520" style="border:0;border-radius:16px" allow="fullscreen; gyroscope; accelerometer" loading="lazy" title="${title.replace(/"/g, "'")}"></iframe>`;
  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(""), 1800);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Share this tour" description="Send the link, scan the QR code, or embed it on any website.">
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div className="mx-auto rounded-2xl border border-border bg-white p-3">
            <QRCodeSVG value={url || "https://"} size={140} marginSize={0} />
          </div>
          <div className="min-w-0 space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link</p>
              <div className="flex gap-2">
                <input readOnly value={url} className="min-w-0 flex-1 rounded-lg border border-input bg-muted px-3 py-2 text-sm" aria-label="Tour link" onFocus={(e) => e.target.select()} />
                <button onClick={() => copy(url, "link")} aria-label="Copy link" className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                  {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Code2 className="size-3.5" /> Embed code</p>
              <div className="flex gap-2">
                <textarea readOnly rows={3} value={embed} className="min-w-0 flex-1 resize-none rounded-lg border border-input bg-muted px-3 py-2 font-mono text-xs" aria-label="Embed code" onFocus={(e) => e.target.select()} />
                <button onClick={() => copy(embed, "embed")} aria-label="Copy embed code" className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                  {copied === "embed" ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TourViewer({ tour, embed = false, tenantName }) {
  const scenes = tour.scenes;
  const byId = useMemo(() => Object.fromEntries(scenes.map((s) => [s.id, s])), [scenes]);
  const container = useRef(null);
  const modRef = useRef(null);
  const markersRef = useRef(null);
  const loadedRef = useRef(null);
  const keepYawRef = useRef(false);
  const lastInteract = useRef(0);

  const [viewer, setViewer] = useState(null);
  const [sceneId, setSceneId] = useState(tour.startSceneId || scenes[0]?.id);
  const [loading, setLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(Boolean(tour.autoRotate));
  const [info, setInfo] = useState(null);
  const [fs, setFs] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [gyro, setGyro] = useState(false);
  const [gyroSupported, setGyroSupported] = useState(false);
  const [hint, setHint] = useState(true);
  const [showMap, setShowMap] = useState(true);

  const scene = byId[sceneId];
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);

  const go = useCallback((id, { keepYaw = false } = {}) => {
    keepYawRef.current = keepYaw;
    setInfo(null);
    setSceneId(id);
  }, []);

  const renderMarkers = useCallback(
    (s) => {
      const plugin = markersRef.current;
      if (!plugin || !s) return;
      plugin.clearMarkers();
      plugin.setMarkers(s.hotspots.filter((h) => h.type === "INFO" || byId[h.targetSceneId]).map(markerFor));
      s.hotspots.forEach((h) => {
        const t = byId[h.targetSceneId];
        if (t) {
          const img = new window.Image();
          img.src = t.panoramaUrl;
        }
      });
    },
    [byId],
  );

  useEffect(() => {
    if (tour.kind !== "PANORAMA" || !scenes.length) return;
    let disposed = false;
    let v;
    (async () => {
      const [{ Viewer }, { MarkersPlugin }] = await Promise.all([import("@photo-sphere-viewer/core"), import("@photo-sphere-viewer/markers-plugin")]);
      if (disposed || !container.current) return;
      modRef.current = { MarkersPlugin };
      const first = byId[sceneId] || scenes[0];
      v = new Viewer({
        container: container.current,
        panorama: first.panoramaUrl,
        navbar: false,
        defaultYaw: `${first.initialYaw || 0}deg`,
        defaultPitch: 0,
        minFov: 35,
        maxFov: 100,
        defaultZoomLvl: 38,
        mousewheelCtrlKey: false,
        touchmoveTwoFingers: false,
        moveInertia: true,
        loadingTxt: "Loading panorama…",
        plugins: [[MarkersPlugin, {}]],
      });
      const plugin = v.getPlugin(MarkersPlugin);
      markersRef.current = plugin;
      loadedRef.current = first.id;
      plugin.addEventListener("select-marker", ({ marker }) => {
        const h = marker.data;
        if (!h) return;
        if (h.type === "LINK" && h.targetSceneId) go(h.targetSceneId, { keepYaw: true });
        else setInfo({ label: h.label, content: h.content });
      });
      v.addEventListener("ready", () => {
        if (disposed) return;
        setLoading(false);
        renderMarkers(first);
      }, { once: true });
      const touch = () => {
        lastInteract.current = Date.now();
        setHint(false);
      };
      ["pointerdown", "wheel", "touchstart", "keydown"].forEach((ev) => v.container.addEventListener(ev, touch, { passive: true }));
      setViewer(v);
    })();
    return () => {
      disposed = true;
      markersRef.current = null;
      loadedRef.current = null;
      setViewer(null);
      v?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);

  useEffect(() => {
    if (!viewer || !scene || loadedRef.current === scene.id) return;
    let cancelled = false;
    setLoading(true);
    markersRef.current?.clearMarkers();
    const pos = keepYawRef.current ? { yaw: viewer.getPosition().yaw, pitch: 0 } : { yaw: `${scene.initialYaw || 0}deg`, pitch: 0 };
    viewer
      .setPanorama(scene.panoramaUrl, { transition: 900, showLoader: false, position: pos })
      .then((done) => {
        if (cancelled || done === false) return;
        loadedRef.current = scene.id;
        setLoading(false);
        renderMarkers(scene);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [viewer, scene, renderMarkers]);

  useEffect(() => {
    if (!viewer || !autoRotate || gyro) return;
    const t = setInterval(() => {
      if (Date.now() - lastInteract.current < 3500 || document.hidden) return;
      const p = viewer.getPosition();
      viewer.rotate({ yaw: p.yaw + 0.0035, pitch: p.pitch });
    }, 32);
    return () => clearInterval(t);
  }, [viewer, autoRotate, gyro]);

  useEffect(() => {
    const h = setTimeout(() => setHint(false), 7000);
    return () => clearTimeout(h);
  }, []);

  useEffect(() => {
    setGyroSupported(typeof window !== "undefined" && "DeviceOrientationEvent" in window && matchMedia("(pointer: coarse)").matches);
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!viewer || !gyro) return;
    let offset = null;
    const onOrient = (e) => {
      if (e.alpha == null) return;
      const cur = viewer.getPosition();
      if (offset == null) offset = cur.yaw + e.alpha * RAD;
      viewer.rotate({ yaw: offset - e.alpha * RAD, pitch: Math.max(-1.4, Math.min(1.4, (e.beta - 90) * RAD)) });
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [viewer, gyro]);

  const toggleGyro = async () => {
    if (gyro) return setGyro(false);
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return toast.error("Motion access was denied");
      }
      setGyro(true);
      toast.success("Move your phone to look around");
    } catch {
      toast.error("Motion sensors are not available");
    }
  };

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, [role=dialog]")) return;
      if (/^[1-9]$/.test(e.key) && scenes[Number(e.key) - 1]) go(scenes[Number(e.key) - 1].id);
      if (e.key === "m") setShowMap((s) => !s);
      if (e.key === "f") toggleFs();
      if (e.key === " ") {
        e.preventDefault();
        setAutoRotate((a) => !a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes, go]);

  const propertyHref = `/properties/${tour.property.slug}`;

  if (tour.kind !== "PANORAMA") {
    return (
      <div className="fixed inset-0 flex flex-col bg-neutral-950 text-white">
        <div className="flex items-center gap-3 p-3">
          {!embed && (
            <Link href={propertyHref} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20">
              <ArrowLeft className="size-4" /> {tour.property.title}
            </Link>
          )}
          <a href={tour.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20">
            <ExternalLink className="size-4" /> Open in new tab
          </a>
        </div>
        <iframe src={tour.externalUrl} title={tour.title} allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="min-h-0 w-full flex-1 border-0" />
      </div>
    );
  }

  if (!scenes.length) {
    return <div className="grid min-h-dvh place-items-center bg-neutral-950 p-6 text-center text-white">This tour has no scenes yet.</div>;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-950 text-white">
      <div ref={container} className="absolute inset-0" aria-label={`360° view of ${scene?.name}`} />

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden bg-white/10">
            <div className="h-full w-1/3 animate-[shimmer_1.2s_linear_infinite] bg-accent" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-3 sm:p-5">
        <div className="pointer-events-auto flex min-w-0 items-center gap-3">
          {!embed ? (
            <Link href={propertyHref} aria-label="Back to listing" className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-black/50 backdrop-blur-md transition hover:bg-black/70">
              <ArrowLeft className="size-5" />
            </Link>
          ) : (
            <a href={propertyHref} target="_blank" rel="noopener noreferrer" aria-label="View listing" className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-black/50 backdrop-blur-md hover:bg-black/70">
              <ExternalLink className="size-5" />
            </a>
          )}
          <div className="min-w-0 rounded-2xl border border-white/10 bg-black/45 px-4 py-2 backdrop-blur-md">
            <p className="truncate font-heading text-base font-semibold leading-tight sm:text-lg">{tour.property.title}</p>
            <p className="truncate text-xs text-white/75">
              {scene?.roomLabel || scene?.name} · {tour.property.priceLabel}
            </p>
          </div>
        </div>
        <div className="pointer-events-auto flex shrink-0 gap-2">
          <IconButton label={autoRotate ? "Pause auto-rotate" : "Auto-rotate"} active={autoRotate} onClick={() => setAutoRotate((a) => !a)}>
            {autoRotate ? <Pause className="size-5" /> : <Play className="size-5" />}
          </IconButton>
          {gyroSupported && (
            <IconButton label="Use phone motion" active={gyro} onClick={toggleGyro}>
              <Smartphone className="size-5" />
            </IconButton>
          )}
          {(tour.floorPlanUrl || scenes.some((s) => s.lat != null)) && (
            <IconButton label={showMap ? "Hide map" : "Show map"} active={showMap} onClick={() => setShowMap((s) => !s)} className="max-sm:hidden">
              <Compass className="size-5" />
            </IconButton>
          )}
          {!embed && (
            <IconButton label="Share or embed" onClick={() => setShareOpen(true)}>
              <Share2 className="size-5" />
            </IconButton>
          )}
          <IconButton label={fs ? "Exit full screen" : "Full screen"} onClick={toggleFs}>
            {fs ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
          </IconButton>
        </div>
      </div>

      <AnimatePresence>
        {hint && !loading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full bg-black/60 px-5 py-2.5 text-sm font-medium backdrop-blur-md">
            Drag to look around · tap the arrows to move
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {info && (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} className="absolute left-1/2 top-1/3 z-20 w-[min(90vw,24rem)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/75 p-5 shadow-lift backdrop-blur-xl" role="dialog" aria-label={info.label || "Details"}>
            <button onClick={() => setInfo(null)} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <X className="size-4" />
            </button>
            <p className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold"><Info className="size-4 text-accent" /> {info.label || "Highlight"}</p>
            <p className="text-sm leading-relaxed text-white/85">{info.content}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 pt-16 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="pointer-events-auto">
            <AnimatePresence initial={false}>
              {showMap && (
                <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }}>
                  <MiniMap tour={tour} current={scene} onSelect={go} viewer={viewer} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {!embed && (
            <button onClick={() => setBookOpen(true)} className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lift transition hover:brightness-110 active:scale-95">
              <CalendarCheck className="size-5" /> Book a visit
            </button>
          )}
        </div>

        {scenes.length > 1 && (
          <div className="pointer-events-auto scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Rooms">
            {scenes.map((s, i) => {
              const active = s.id === sceneId;
              return (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => go(s.id)}
                  className={cn("group relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border-2 transition-all sm:h-20 sm:w-36", active ? "border-white scale-105" : "border-transparent opacity-80 hover:opacity-100")}
                >
                  <Image src={s.thumbUrl} alt="" fill sizes="144px" className="object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 truncate px-2 pb-1 text-left text-[11px] font-semibold">
                    <kbd className="mr-1 rounded bg-white/25 px-1 text-[10px]">{i + 1}</kbd>
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {tenantName && embed && <p className="pointer-events-none absolute right-4 top-20 z-10 text-xs font-medium text-white/60">{tenantName}</p>}

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} tourId={tour.id} title={tour.title} />
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent title="Book a visit" description={`Tell us when you would like to see ${tour.property.title} in person.`}>
          <LeadForm propertyId={tour.property.id} propertyTitle={tour.property.title} defaultMode="TOUR_BOOKING" compact />
        </DialogContent>
      </Dialog>
    </div>
  );
}
