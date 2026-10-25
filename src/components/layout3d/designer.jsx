"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { toast } from "sonner";
import {
  ArrowLeft, Box, Camera, Copy, Eye, EyeOff, Info, Layers, Link2, Paintbrush, RotateCw, Sofa, Sparkles, SquareDashed, Trash2, X,
} from "lucide-react";
import { CATALOG, FLOOR_FINISHES, WALL_COLORS, autoFurnish, defaultFinish, footprint } from "@/lib/furniture3d";
import { FLOOR_HEIGHT, WALL_HEIGHT, roomSize } from "@/lib/layout3d";
import { cn } from "@/lib/utils";

const SNAP = 0.25;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const GROUPS = ["Living", "Dining", "Bedroom", "Kitchen", "Bath", "Work", "Office", "Decor", "Outdoor"];

/* ---------- design state: save, share, restore ---------- */

// Designs are kept per floor plan: a plan the agency edits later starts a fresh design.
const storageKey = (slug, layout) => (layout.key ? `design:${slug}:${layout.key}` : `design:${slug}`);

function encodeDesign(d) {
  const compact = { v: 1, w: d.wallColor, f: d.floors, i: d.items.map((it) => [it.kind, +it.x.toFixed(2), +it.z.toFixed(2), it.rot, it.floor]) };
  const json = JSON.stringify(compact);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeDesign(s) {
  try {
    const json = decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
    const c = JSON.parse(json);
    if (c?.v !== 1 || !Array.isArray(c.i)) return null;
    return {
      wallColor: typeof c.w === "string" ? c.w : WALL_COLORS[0].hex,
      floors: c.f && typeof c.f === "object" ? c.f : {},
      items: c.i.filter((x) => Array.isArray(x) && CATALOG[x[0]]).map(([kind, x, z, rot, floor], n) => ({ id: `s${n}`, kind, x: +x, z: +z, rot: +rot % 4, floor: +floor || 0 })),
    };
  } catch {
    return null;
  }
}

function initialDesign(slug, layout) {
  if (typeof window !== "undefined") {
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("d");
    const shared = fromLink && decodeDesign(fromLink);
    if (shared) return { ...shared, source: "link" };
    try {
      const saved = decodeDesign(localStorage.getItem(storageKey(slug, layout)) || "");
      if (saved) return { ...saved, source: "saved" };
    } catch {}
  }
  return { wallColor: WALL_COLORS[0].hex, floors: {}, items: autoFurnish(layout), source: "auto" };
}

/* ---------- textures and materials ---------- */

function finishTexture(key) {
  const f = FLOOR_FINISHES.find((x) => x.key === key) || FLOOR_FINISHES[0];
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = f.color;
  g.fillRect(0, 0, 256, 256);
  let seed = key.length * 97;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  if (f.stripes) {
    g.strokeStyle = f.stripes;
    g.lineWidth = 2;
    for (let y = 0; y <= 256; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
      const off = rnd() * 256;
      g.beginPath(); g.moveTo(off, y); g.lineTo(off, y + 32); g.stroke();
    }
  } else if (f.grid) {
    g.strokeStyle = f.grid;
    g.lineWidth = 3;
    for (let p = 0; p <= 256; p += 64) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
    }
  } else if (f.veins) {
    g.strokeStyle = f.veins;
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      let x = rnd() * 256;
      let y = 0;
      g.moveTo(x, y);
      while (y < 256) { x += (rnd() - 0.5) * 40; y += 20 + rnd() * 20; g.lineTo(x, y); }
      g.stroke();
    }
  } else {
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- the component ---------- */

export default function Designer({ property, layout, backHref }) {
  const mountRef = useRef(null);
  const three = useRef({});
  const [design, setDesign] = useState(() => initialDesign(property.slug, layout));
  const [selected, setSelected] = useState(null); // { type: "item"|"room", id }
  const [view, setView] = useState("3d");
  const [walls, setWalls] = useState("cut");
  const [labels, setLabels] = useState(true);
  const [floor, setFloor] = useState(0);
  const [tab, setTab] = useState("furniture");
  const [panelOpen, setPanelOpen] = useState(false);
  const designRef = useRef(design);
  designRef.current = design;

  const roomsById = useMemo(() => Object.fromEntries(layout.rooms.map((rm) => [rm.id, rm])), [layout]);
  const finishOf = useCallback((rm) => design.floors[rm.id] || defaultFinish(rm.type), [design.floors]);
  const offset = useMemo(() => ({ x: -layout.width / 2, z: -layout.depth / 2 }), [layout]);
  const floorY = (f) => f * FLOOR_HEIGHT;

  // Remember the design in this browser.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(property.slug, layout), encodeDesign(design));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [design, property.slug, layout]);

  useEffect(() => {
    if (design.source === "link") toast.success("Opened a shared design", { description: "Changes you make are saved on this device." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- scene setup (once) --- */
  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = "pointer-events-none absolute inset-0";
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 8;
    controls.maxDistance = 400;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(60, 120, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const ext = Math.max(layout.width, layout.depth) * 0.9 + 20;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, far: 400 });
    scene.add(sun);

    const root = new THREE.Group();
    root.position.set(offset.x, 0, offset.z);
    scene.add(root);
    const structure = new THREE.Group();
    const furniture = new THREE.Group();
    const labelsGroup = new THREE.Group();
    root.add(structure, furniture, labelsGroup);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let frame;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();

    three.current = { renderer, labelRenderer, scene, camera, controls, root, structure, furniture, labelsGroup, textures: {}, materials: {} };
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [layout, offset]);

  /* --- camera for 3D / top view --- */
  useEffect(() => {
    const { camera, controls } = three.current;
    if (!camera) return;
    // Portrait screens (phones) need the camera further back to fit the whole home.
    const mount = mountRef.current;
    const aspect = mount ? mount.clientWidth / Math.max(mount.clientHeight, 1) : 1.6;
    const size = Math.max(layout.width, layout.depth) * (aspect < 1 ? Math.min(2.2, 1.15 / aspect) : 1);
    const y = floorY(floor);
    controls.target.set(0, y, 0);
    if (view === "top") {
      camera.position.set(0, y + size * 1.45, 0.01);
      controls.enableRotate = false;
    } else {
      camera.position.set(size * 0.55, y + size * 0.85, size * 0.95);
      controls.enableRotate = true;
    }
    controls.update();
  }, [view, floor, layout]);

  /* --- walls, floors, labels --- */
  useEffect(() => {
    const t = three.current;
    if (!t.structure) return;
    const { structure, labelsGroup, textures, materials } = t;
    structure.clear();
    labelsGroup.clear();
    const mat = (key, make) => (materials[key] ||= make());

    const W = layout.width;
    const D = layout.depth;
    // Ground: garden for villas and houses, paving otherwise.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 40, D + 40),
      mat(layout.garden || layout.kind === "plot" ? "grass" : "paving", () => new THREE.MeshStandardMaterial({ color: layout.garden || layout.kind === "plot" ? 0x8fb874 : 0xd6d3cd, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, -0.32, D / 2);
    ground.receiveShadow = true;
    structure.add(ground);

    if (layout.kind === "plot") {
      const plot = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), mat("plotSoil", () => new THREE.MeshStandardMaterial({ color: 0xb59b74, roughness: 1 })));
      plot.position.set(W / 2, -0.2, D / 2);
      plot.receiveShadow = true;
      structure.add(plot);
      [[0, 0, W, 0], [0, D, W, D], [0, 0, 0, D], [W, 0, W, D]].forEach(([x1, z1, x2, z2]) => {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 0.5), mat("boundary", () => new THREE.MeshStandardMaterial({ color: 0xc9c2b6 })));
        m.position.set((x1 + x2) / 2, 1.25, (z1 + z2) / 2);
        m.rotation.y = x1 === x2 ? Math.PI / 2 : 0;
        m.castShadow = true;
        structure.add(m);
      });
      const el = document.createElement("div");
      el.className = "rounded-lg bg-black/70 px-2.5 py-1 text-center text-xs font-semibold text-white";
      el.innerHTML = `Plot · ${Math.round(W)}' × ${Math.round(D)}'<br/><span class="font-normal opacity-80">${Math.round(layout.area).toLocaleString("en-IN")} sq ft</span>`;
      const lbl = new CSS2DObject(el);
      lbl.position.set(W / 2, 1, D / 2);
      labelsGroup.add(lbl);
      return;
    }

    const wallMat = mat(`wall-${design.wallColor}`, () => new THREE.MeshStandardMaterial({ color: design.wallColor, roughness: 0.9 }));
    const showFloor = (f) => layout.floors === 1 || f === floor || (f < floor && view === "3d");

    layout.rooms.forEach((rm) => {
      if (!showFloor(rm.floor)) return;
      const key = finishOf(rm);
      const tex = (textures[`${key}-${rm.id}`] ||= (() => {
        const base = (textures[key] ||= finishTexture(key));
        const c = base.clone();
        c.repeat.set(rm.w / 6, rm.d / 6);
        c.needsUpdate = true;
        return c;
      })());
      const slab = new THREE.Mesh(new THREE.BoxGeometry(rm.w, 0.3, rm.d), new THREE.MeshStandardMaterial({ map: tex, roughness: key === "marble" ? 0.35 : 0.85 }));
      slab.position.set(rm.x + rm.w / 2, floorY(rm.floor) - 0.15, rm.z + rm.d / 2);
      slab.receiveShadow = true;
      slab.userData.roomId = rm.id;
      if (selected?.type === "room" && selected.id === rm.id) slab.material.emissive = new THREE.Color(0x2a6f6f), (slab.material.emissiveIntensity = 0.35);
      structure.add(slab);

      if (rm.type === "stairs" && rm.floor === 0) {
        const steps = 12;
        const sw = Math.min(rm.w - 1, 4);
        for (let i = 0; i < steps; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(sw, (FLOOR_HEIGHT / steps) * (i + 1), (rm.d - 1) / steps), mat("stairs", () => new THREE.MeshStandardMaterial({ color: 0xbfb3a1 })));
          s.position.set(rm.x + 0.5 + sw / 2, ((FLOOR_HEIGHT / steps) * (i + 1)) / 2, rm.z + 0.5 + ((rm.d - 1) / steps) * (i + 0.5));
          s.castShadow = s.receiveShadow = true;
          structure.add(s);
        }
      }

      if (labels && rm.floor === floor) {
        const el = document.createElement("div");
        el.className = "rounded-lg bg-black/65 px-2 py-0.5 text-center text-[11px] font-semibold leading-tight text-white shadow";
        el.innerHTML = `${rm.name}<br/><span class="font-normal opacity-80">${roomSize(rm)}</span>`;
        const lbl = new CSS2DObject(el);
        lbl.position.set(rm.x + rm.w / 2, floorY(rm.floor) + 0.6, rm.z + rm.d / 2);
        labelsGroup.add(lbl);
      }
    });

    if (layout.balcony && showFloor(0)) {
      const b = layout.balcony;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.3, b.d), mat("balcony", () => new THREE.MeshStandardMaterial({ color: 0xcfc8bd })));
      slab.position.set(b.x + b.w / 2, -0.15, b.z + b.d / 2);
      slab.receiveShadow = true;
      structure.add(slab);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(b.w, 3.2, 0.15), mat("glass", () => new THREE.MeshStandardMaterial({ color: 0xa7d3e8, transparent: true, opacity: 0.35 })));
      rail.position.set(b.x + b.w / 2, 1.6, b.z);
      structure.add(rail);
    }

    const height = walls === "cut" && view === "3d" ? 3.2 : WALL_HEIGHT;
    layout.walls.forEach((w) => {
      if (!showFloor(w.floor)) return;
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const thick = w.exterior ? 0.6 : 0.35;
      const h = w.floor < floor ? WALL_HEIGHT : height;
      const m = new THREE.Mesh(new THREE.BoxGeometry(len + (w.exterior ? thick : 0), h, thick), wallMat);
      m.position.set((w.x1 + w.x2) / 2, floorY(w.floor) + h / 2, (w.z1 + w.z2) / 2);
      m.rotation.y = w.x1 === w.x2 ? Math.PI / 2 : 0;
      m.castShadow = m.receiveShadow = true;
      structure.add(m);
    });
    // Ceiling slab of a lower floor, so the upper floor has something to stand on.
    if (layout.floors > 1 && floor > 0 && view === "3d") {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, D), mat("slab", () => new THREE.MeshStandardMaterial({ color: 0xd9d4cb })));
      slab.position.set(W / 2, floorY(floor) - 0.5, D / 2);
      structure.add(slab);
    }
  }, [layout, design.wallColor, design.floors, finishOf, walls, view, labels, floor, selected]);

  /* --- furniture --- */
  useEffect(() => {
    const t = three.current;
    if (!t.furniture) return;
    const { furniture, materials } = t;
    furniture.clear();
    const mat = (color, opacity) =>
      (materials[`f-${color}-${opacity ?? 1}`] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.75, transparent: opacity != null, opacity: opacity ?? 1 }));
    design.items.forEach((it) => {
      if (layout.floors > 1 && it.floor !== floor && !(it.floor < floor && view === "3d")) return;
      const def = CATALOG[it.kind];
      const g = new THREE.Group();
      def.parts.forEach((p) => {
        const geo = p.shape === "cyl" ? new THREE.CylinderGeometry(p.r, p.r * 0.85, p.h, 20) : p.shape === "sphere" ? new THREE.SphereGeometry(p.r, 20, 14) : new THREE.BoxGeometry(p.w, p.h, p.d);
        const m = new THREE.Mesh(geo, mat(p.color, p.opacity));
        m.position.set(p.x, p.y, p.z);
        m.castShadow = !def.flat && (p.opacity ?? 1) > 0.5;
        m.receiveShadow = true;
        m.userData.itemId = it.id;
        g.add(m);
      });
      g.position.set(it.x, floorY(it.floor), it.z);
      g.rotation.y = (-it.rot * Math.PI) / 2;
      g.userData.itemId = it.id;
      if (selected?.type === "item" && selected.id === it.id) {
        const f = footprint(it.kind, 0);
        const ring = new THREE.Mesh(new THREE.BoxGeometry(f.w + 0.6, 0.08, f.d + 0.6), new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.55 }));
        ring.position.y = 0.05;
        g.add(ring);
      }
      furniture.add(g);
    });
  }, [design.items, selected, floor, view, layout.floors]);

  /* --- picking and dragging --- */
  useEffect(() => {
    const t = three.current;
    const el = t.renderer?.domElement;
    if (!el) return;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null;
    let down = null;

    const pointer = (e) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, t.camera);
    };
    const planeHit = (y) => {
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null;
    };

    const onDown = (e) => {
      down = { x: e.clientX, y: e.clientY };
      pointer(e);
      const hit = ray.intersectObjects(t.furniture.children, true).find((h) => h.object.userData.itemId);
      if (!hit) return;
      const id = hit.object.userData.itemId;
      const item = designRef.current.items.find((x) => x.id === id);
      if (!item) return;
      setSelected({ type: "item", id });
      const p = planeHit(floorY(item.floor));
      if (!p) return;
      drag = { id, dx: item.x - (p.x - offset.x), dz: item.z - (p.z - offset.z), floor: item.floor };
      t.controls.enabled = false;
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!drag) return;
      pointer(e);
      const p = planeHit(floorY(drag.floor));
      if (!p) return;
      const x = Math.min(Math.max(snap(p.x - offset.x + drag.dx), -6), layout.width + 6);
      const z = Math.min(Math.max(snap(p.z - offset.z + drag.dz), -6), layout.depth + 6);
      setDesign((d) => ({ ...d, items: d.items.map((it) => (it.id === drag.id ? { ...it, x, z } : it)) }));
    };
    const onUp = (e) => {
      if (drag) {
        drag = null;
        t.controls.enabled = true;
        return;
      }
      // A click (not an orbit drag) on a floor selects the room; on nothing clears the selection.
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        pointer(e);
        const hit = ray.intersectObjects(t.structure.children, false).find((h) => h.object.userData.roomId);
        setSelected(hit ? { type: "room", id: hit.object.userData.roomId } : null);
      }
      down = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [layout, offset]);

  /* --- actions --- */
  const selItem = selected?.type === "item" ? design.items.find((x) => x.id === selected.id) : null;
  const selRoom = selected?.type === "room" ? roomsById[selected.id] : null;

  const updateItems = (fn) => setDesign((d) => ({ ...d, items: fn(d.items) }));
  const rotate = () => selItem && updateItems((list) => list.map((x) => (x.id === selItem.id ? { ...x, rot: (x.rot + 1) % 4 } : x)));
  const remove = () => {
    if (!selItem) return;
    updateItems((list) => list.filter((x) => x.id !== selItem.id));
    setSelected(null);
  };
  const duplicate = () => {
    if (!selItem) return;
    const copy = { ...selItem, id: `c${Date.now().toString(36)}`, x: selItem.x + 1.5, z: selItem.z + 1.5 };
    updateItems((list) => [...list, copy]);
    setSelected({ type: "item", id: copy.id });
  };
  const addItem = (kind) => {
    const target = selRoom || layout.rooms.filter((rm) => rm.floor === floor).sort((a, b) => b.w * b.d - a.w * a.d)[0];
    const item = { id: `n${Date.now().toString(36)}`, kind, x: target ? target.x + target.w / 2 : layout.width / 2, z: target ? target.z + target.d / 2 : layout.depth / 2, rot: 0, floor: target?.floor ?? floor };
    updateItems((list) => [...list, item]);
    setSelected({ type: "item", id: item.id });
    setPanelOpen(false);
  };
  const setFinish = (key, all) =>
    setDesign((d) => ({ ...d, floors: all ? Object.fromEntries(layout.rooms.map((rm) => [rm.id, key])) : { ...d.floors, [selRoom.id]: key } }));

  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "r" || e.key === "R") rotate();
      if (e.key === "Delete" || e.key === "Backspace") remove();
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#d=${encodeDesign(design)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Anyone with the link sees this design." });
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  const snapshot = () => {
    const t = three.current;
    t.renderer.render(t.scene, t.camera);
    const a = document.createElement("a");
    a.href = t.renderer.domElement.toDataURL("image/png");
    a.download = `${property.slug}-design.png`;
    a.click();
  };
  const furnish = () => {
    setDesign((d) => ({ ...d, items: autoFurnish(layout) }));
    setSelected(null);
    toast.success("Furnished every room");
  };
  const clearAll = () => {
    setDesign((d) => ({ ...d, items: [] }));
    setSelected(null);
  };

  const plot = layout.kind === "plot";
  const toggle = "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition";

  const panel = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 border-b border-border p-2">
        {[["furniture", "Furniture", Sofa], ["finishes", "Finishes", Paintbrush], ["rooms", "Rooms", Layers]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "furniture" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{selRoom ? `Adds to ${selRoom.name}.` : "Click a room first to add there, or it goes into the largest room."} Drag pieces to move them.</p>
            {GROUPS.map((g) => {
              const kinds = Object.entries(CATALOG).filter(([, c]) => c.group === g);
              return kinds.length ? (
                <div key={g}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {kinds.map(([k, c]) => (
                      <button key={k} onClick={() => addItem(k)} className="rounded-lg border border-border px-2.5 py-2 text-left text-xs font-medium transition hover:border-primary hover:bg-primary/5">
                        {c.name}
                        <span className="block text-[10px] text-muted-foreground">{c.w}′ × {c.d}′</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
          </div>
        )}
        {tab === "finishes" && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Wall colour</p>
              <div className="grid grid-cols-3 gap-2">
                {WALL_COLORS.map((c) => (
                  <button key={c.hex} onClick={() => setDesign((d) => ({ ...d, wallColor: c.hex }))} className={cn("rounded-lg border p-1.5 text-[11px]", design.wallColor === c.hex ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                    <span className="mb-1 block h-7 rounded-md" style={{ background: c.hex }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Flooring {selRoom ? `· ${selRoom.name}` : "· whole home"}</p>
              <div className="grid grid-cols-3 gap-2">
                {FLOOR_FINISHES.map((f) => (
                  <button key={f.key} onClick={() => setFinish(f.key, !selRoom)} className={cn("rounded-lg border p-1.5 text-[11px]", selRoom && finishOf(selRoom) === f.key ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                    <span className="mb-1 block h-7 rounded-md" style={{ background: f.color }} />
                    {f.name}
                  </button>
                ))}
              </div>
              {selRoom && <button onClick={() => setFinish(finishOf(selRoom), true)} className="mt-2 text-xs font-semibold text-primary hover:underline">Use this flooring in every room</button>}
              {!selRoom && <p className="mt-2 text-xs text-muted-foreground">Tip: click a room in the 3D view to change only its floor.</p>}
            </div>
          </div>
        )}
        {tab === "rooms" && (
          <ul className="space-y-1">
            {layout.rooms.map((rm) => (
              <li key={rm.id}>
                <button
                  onClick={() => {
                    setFloor(rm.floor);
                    setSelected({ type: "room", id: rm.id });
                  }}
                  className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted", selRoom?.id === rm.id && "bg-primary/10")}
                >
                  <span className="font-medium">{rm.name}{layout.floors > 1 && <span className="ml-1 text-xs text-muted-foreground">({rm.floor ? "1st" : "Ground"})</span>}</span>
                  <span className="text-xs text-muted-foreground">{roomSize(rm)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <Link href={backHref} className="grid size-9 place-items-center rounded-full hover:bg-muted" aria-label="Back to listing">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-semibold sm:text-lg">{property.title}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info className="size-3" />{" "}
            {layout.provided ? "Floor plan provided by the agency" : "Indicative 3D layout from the listing details · not an architectural plan"}
          </p>
        </div>
        {!plot && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex rounded-full bg-muted p-0.5">
              <button onClick={() => setView("3d")} className={cn(toggle, view === "3d" ? "bg-card shadow-soft" : "text-muted-foreground")}><Box className="size-3.5" /> 3D</button>
              <button onClick={() => setView("top")} className={cn(toggle, view === "top" ? "bg-card shadow-soft" : "text-muted-foreground")}><SquareDashed className="size-3.5" /> Top</button>
            </div>
            {layout.floors > 1 && (
              <div className="flex rounded-full bg-muted p-0.5">
                {Array.from({ length: layout.floors }, (_, f) => (
                  <button key={f} onClick={() => setFloor(f)} className={cn(toggle, floor === f ? "bg-card shadow-soft" : "text-muted-foreground")}>{f ? "1st floor" : "Ground"}</button>
                ))}
              </div>
            )}
            <button onClick={() => setWalls((w) => (w === "cut" ? "full" : "cut"))} className={cn(toggle, "bg-muted")} title="Wall height">{walls === "cut" ? "Full walls" : "Cutaway"}</button>
            <button onClick={() => setLabels((v) => !v)} className={cn(toggle, "bg-muted")} aria-label="Room labels">{labels ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} Labels</button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {!plot && <button onClick={furnish} className={cn(toggle, "bg-muted")}><Sparkles className="size-3.5" /> Auto-furnish</button>}
          {!plot && <button onClick={clearAll} className={cn(toggle, "bg-muted")}>Clear</button>}
          <button onClick={share} className={cn(toggle, "bg-muted")}><Link2 className="size-3.5" /> Share</button>
          <button onClick={snapshot} className={cn(toggle, "bg-primary text-primary-foreground")}><Camera className="size-3.5" /> Snapshot</button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={mountRef} className="relative min-w-0 flex-1 bg-gradient-to-b from-muted to-background" />

        {/* selected item toolbar */}
        {selItem && (
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-lift lg:left-[calc(50%-10rem)]">
            <span className="px-3 text-sm font-semibold">{CATALOG[selItem.kind].name}</span>
            <button onClick={rotate} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-muted" title="Rotate (R)"><RotateCw className="size-3.5" /> Rotate</button>
            <button onClick={duplicate} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Copy className="size-3.5" /> Copy</button>
            <button onClick={remove} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10" title="Delete"><Trash2 className="size-3.5" /> Delete</button>
            <button onClick={() => setSelected(null)} className="grid size-8 place-items-center rounded-full hover:bg-muted" aria-label="Deselect"><X className="size-4" /></button>
          </div>
        )}
        {selRoom && !selItem && (
          <div className="absolute left-3 top-3 z-10 rounded-xl border border-border bg-card/95 px-3 py-2 text-sm shadow-soft">
            <p className="font-semibold">{selRoom.name}</p>
            <p className="text-xs text-muted-foreground">{roomSize(selRoom)} · {Math.round(selRoom.w * selRoom.d)} sq ft</p>
          </div>
        )}

        {!plot && (
          <>
            {/* desktop side panel */}
            <aside className="hidden w-80 shrink-0 border-l border-border bg-card lg:block">{panel}</aside>
            {/* mobile bottom sheet */}
            <button onClick={() => setPanelOpen(true)} className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lift lg:hidden">
              <Paintbrush className="size-4" /> Design
            </button>
            {panelOpen && (
              <div className="absolute inset-x-0 bottom-0 z-20 h-[60%] rounded-t-3xl border-t border-border bg-card shadow-lift lg:hidden">
                <button onClick={() => setPanelOpen(false)} className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-muted" aria-label="Close design tools"><X className="size-4" /></button>
                <div className="h-full pt-10">{panel}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
