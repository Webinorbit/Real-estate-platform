"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Box, ExternalLink, Plus, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { ROOM_TYPES, buildLayout, generateLayout, planWarnings, toStoredRooms } from "@/lib/layout3d";
import { cn } from "@/lib/utils";

// Fill colours of the 2D preview, by room type.
const TINT = {
  bedroom: "#e7d9c4", bath: "#cfe3ea", kitchen: "#f0dcc8", dining: "#efe6d2", stairs: "#d8d2c8", terrace: "#d5e6c9",
  utility: "#dcdcdc", pantry: "#f0dcc8", cabin: "#e7d9c4", meeting: "#dfe2ef", hall: "#ece9e3",
};
const NUM = [["x", "Left"], ["z", "Front"], ["w", "Width"], ["d", "Depth"]];
const small = "h-9 rounded-lg px-2.5";

const usable = (rm) => Number(rm.w) > 0 && Number(rm.d) > 0 && Number.isFinite(Number(rm.x)) && Number.isFinite(Number(rm.z));

/** Top-down drawing of one floor: rooms, walls with their door gaps, front (street side) at the top. */
function PlanPreview({ layout, floor, selected, onSelect }) {
  const pad = 3;
  const W = layout.width;
  const D = layout.depth;
  const font = Math.max(1.1, Math.min(W, D) / 28);
  return (
    <svg viewBox={`${-pad} ${-pad - 2} ${W + pad * 2} ${D + pad * 2 + 2}`} className="h-auto max-h-[420px] w-full rounded-xl border border-border bg-muted/40" role="img" aria-label="Floor plan preview">
      <text x={W / 2} y={-pad + 0.4} textAnchor="middle" fontSize={font * 0.8} className="fill-muted-foreground">Street side</text>
      {layout.rooms.filter((rm) => rm.floor === floor).map((rm) => (
        <g key={rm.id} onClick={() => onSelect(rm.id)} className="cursor-pointer">
          <rect x={rm.x} y={rm.z} width={rm.w} height={rm.d} fill={TINT[rm.type] || "#f4efe6"} className={selected === rm.id ? "stroke-primary" : undefined} strokeWidth={selected === rm.id ? 0.8 : 0} />
          <text x={rm.x + rm.w / 2} y={rm.z + rm.d / 2} textAnchor="middle" fontSize={font} fill="#2b2622" fontWeight={500}>{rm.name}</text>
          <text x={rm.x + rm.w / 2} y={rm.z + rm.d / 2 + font * 1.2} textAnchor="middle" fontSize={font * 0.8} fill="#6b635a">{`${+rm.w.toFixed(1)}' × ${+rm.d.toFixed(1)}'`}</text>
        </g>
      ))}
      {layout.walls.filter((w) => w.floor === floor).map((w, i) => (
        <line key={i} x1={w.x1} y1={w.z1} x2={w.x2} y2={w.z2} stroke="#3b3631" strokeWidth={w.exterior ? 0.6 : 0.35} strokeLinecap="square" />
      ))}
    </svg>
  );
}

/**
 * Editor of a listing's real floor plan (Property.roomLayout). `value` is null (the 3D page generates an indicative
 * layout from `specs`) or { rooms: [...] } in feet, see backend/app/room_layout.py.
 */
export function FloorPlanEditor({ value, onChange, specs, designHref }) {
  const rooms = value?.rooms || [];
  const [floor, setFloor] = useState(0);
  const [selected, setSelected] = useState(null);

  const ready = rooms.length > 0 && rooms.every(usable);
  const layout = useMemo(() => (ready ? buildLayout({ rooms }, { type: specs.type }) : null), [ready, rooms, specs.type]);
  const warnings = useMemo(() => (ready ? planWarnings({ rooms }) : []), [ready, rooms]);
  const floors = Math.max(1, ...rooms.map((rm) => (Number(rm.floor) || 0) + 1));
  const shown = Math.min(floor, floors - 1);

  const setRooms = (next) => onChange(next.length ? { rooms: next } : null);
  const patch = (id, change) => setRooms(rooms.map((rm) => (rm.id === id ? { ...rm, ...change } : rm)));
  const remove = (id) => setRooms(rooms.filter((rm) => rm.id !== id).map(({ doorTo, ...rm }) => (doorTo === id ? rm : { ...rm, ...(doorTo ? { doorTo } : {}) })));
  const setEntrance = (id) => setRooms(rooms.map(({ entrance, ...rm }) => (rm.id === id ? { ...rm, entrance: true } : rm)));
  const add = () => {
    const here = rooms.filter((rm) => (Number(rm.floor) || 0) === shown && usable(rm));
    const right = Math.max(0, ...here.map((rm) => Number(rm.x) + Number(rm.w)));
    const id = `r${Date.now().toString(36)}`;
    setRooms([...rooms, { id, name: `Room ${rooms.length + 1}`, type: "bedroom", x: right, z: 0, w: 10, d: 10, floor: shown }]);
    setSelected(id);
  };
  const fromGenerated = () => {
    const generated = generateLayout(specs);
    if (!generated.rooms.length) return setRooms([{ id: "r1", name: "Living room", type: "living", x: 0, z: 0, w: 16, d: 14, floor: 0, entrance: true }]);
    setRooms(toStoredRooms(generated));
  };

  if (!rooms.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-5 text-sm">
        <p className="text-muted-foreground">
          The 3D layout is generated from the bedrooms, bathrooms and area, and shown to buyers as <em>indicative</em>. Enter the real rooms to show the
          actual floor plan instead.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fromGenerated}><Wand2 className="size-4" /> Start from the generated layout</Button>
          <Button variant="ghost" size="sm" onClick={() => setRooms([{ id: "r1", name: "Living room", type: "living", x: 0, z: 0, w: 16, d: 14, floor: 0, entrance: true }])}>
            <Plus className="size-4" /> Start blank
          </Button>
          {designHref && (
            <a href={designHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-4" /> Open the 3D page
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {floors > 1 && (
          <div className="flex rounded-full bg-muted p-0.5">
            {Array.from({ length: floors }, (_, f) => (
              <button key={f} type="button" onClick={() => setFloor(f)} className={cn("rounded-full px-3 py-1 text-xs font-medium", shown === f ? "bg-card shadow-soft" : "text-muted-foreground")}>
                {f === 0 ? "Ground" : `Floor ${f}`}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs text-muted-foreground">Feet. Left / Front are the room's corner measured from the left and street side of the plan.</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {designHref && (
            <a href={designHref} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm text-muted-foreground hover:text-foreground">
              <Box className="size-4" /> 3D page (after saving)
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}><RotateCcw className="size-4" /> Use generated layout</Button>
        </div>
      </div>

      {layout ? (
        <PlanPreview layout={layout} floor={shown} selected={selected} onSelect={setSelected} />
      ) : (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">Fill in a size and position for every room to see the plan.</p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          {warnings.map((w) => (
            <li key={w} className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0 text-amber-600" /> {w}</li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        {rooms.map((rm) => {
          const f = Number(rm.floor) || 0;
          const neighbours = rooms.filter((o) => o.id !== rm.id && (Number(o.floor) || 0) === f);
          return (
            <div
              key={rm.id}
              onFocus={() => { setSelected(rm.id); if (f !== shown) setFloor(f); }}
              className={cn("space-y-2 rounded-xl border p-2.5", selected === rm.id ? "border-primary/60 bg-primary/5" : "border-border")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label="Room name" className={cn(small, "min-w-40 flex-1")} value={rm.name} maxLength={60} onChange={(e) => patch(rm.id, { name: e.target.value })} />
                <div className="w-40">
                  <Select aria-label="Room type" className={small} value={rm.type} onChange={(e) => patch(rm.id, { type: e.target.value })}>
                    {ROOM_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </div>
                <div className="w-28">
                  <Select aria-label="Floor" className={small} value={f} onChange={(e) => patch(rm.id, { floor: Number(e.target.value), doorTo: undefined, entrance: undefined })}>
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? "Ground" : `Floor ${n}`}</option>)}
                  </Select>
                </div>
                <button type="button" onClick={() => remove(rm.id)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger" aria-label={`Remove ${rm.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)_auto]">
                {NUM.map(([key, label]) => (
                  <label key={key} className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{label}</span>
                    <Input type="number" inputMode="decimal" step="0.5" min={key === "w" || key === "d" ? 2 : 0} aria-label={`${label} (ft)`} className={cn(small, "pl-14 text-right")} value={rm[key]} onChange={(e) => patch(rm.id, { [key]: e.target.value })} />
                  </label>
                ))}
                <div className="col-span-2 sm:col-span-3 xl:col-span-1">
                  <Select aria-label="Door" className={small} value={rm.doorTo || ""} onChange={(e) => patch(rm.id, { doorTo: e.target.value || undefined })}>
                    <option value="">Doors: automatic</option>
                    {neighbours.map((o) => <option key={o.id} value={o.id}>Door to {o.name || "room"}</option>)}
                  </Select>
                </div>
                {f === 0 ? (
                  <label className="flex items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted-foreground" title="The front door opens into this room">
                    <input type="radio" name="plan-entrance" checked={!!rm.entrance} onChange={() => setEntrance(rm.id)} /> Entrance
                  </label>
                ) : <span />}
              </div>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" onClick={add} disabled={rooms.length >= 60}><Plus className="size-4" /> Add room</Button>
    </div>
  );
}

/** The plan as sent to the API: numbers instead of input strings, no empty optional keys. */
export function serialiseFloorPlan(value) {
  if (!value?.rooms?.length) return null;
  return {
    rooms: value.rooms.map(({ doorTo, entrance, ...rm }) => ({
      ...rm, x: Number(rm.x), z: Number(rm.z), w: Number(rm.w), d: Number(rm.d), floor: Number(rm.floor) || 0,
      ...(doorTo ? { doorTo } : {}), ...(entrance ? { entrance: true } : {}),
    })),
  };
}
