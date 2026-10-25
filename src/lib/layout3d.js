// Indicative floor plans generated from a listing's details (type, bedrooms, bathrooms, area), or built from the
// agency's real plan (buildLayout). Generated ones are not architectural drawings: the 3D page says so.
// Same listing in -> same layout out, so saved designs keep fitting.
// Units are feet. x runs across the width, z from the front (street side, z = 0) to the back, y is up.

export const FLOOR_HEIGHT = 10;
export const WALL_HEIGHT = 9;
const DOOR = 3;
const MIN_W = 5.5;

const r = (n, step = 0.5) => Math.round(n / step) * step;

/** Rooms for one band: [{ type, name, w (relative weight) }]. */
function homeRooms({ beds, baths, area, penthouse, study }) {
  const pub = [{ type: "living", name: "Living room", w: 3 }];
  if (beds >= 2) pub.push({ type: "dining", name: "Dining", w: 1.3 });
  pub.push({ type: "kitchen", name: "Kitchen", w: 1.2 });
  const priv = [];
  const attached = Math.min(baths, beds);
  for (let i = 0; i < beds; i++) {
    const bath = i < attached ? { type: "bath", name: i === 0 ? "Master bath" : `Bath ${i + 1}` } : null;
    priv.push({ type: "bedroom", name: i === 0 ? "Master bedroom" : `Bedroom ${i + 1}`, w: i === 0 ? 1.7 : 1.3, attach: bath });
  }
  if (study) priv.push({ type: "study", name: "Study", w: 0.9 });
  for (let i = attached; i < baths; i++) pub.push({ type: "bath", name: "Common bath", w: 0.5 });
  if (penthouse) pub.push({ type: "terrace", name: "Terrace", w: 1.6 });
  return { pub, priv, balcony: !penthouse && area > 700 };
}

function officeRooms(area) {
  const cabins = Math.max(1, Math.min(4, Math.round(area / 1500)));
  return {
    pub: [
      { type: "reception", name: "Reception", w: 1 },
      { type: "workspace", name: "Open workspace", w: 4 },
      { type: "pantry", name: "Pantry", w: 0.7 },
    ],
    priv: [
      ...Array.from({ length: cabins }, (_, i) => ({ type: "cabin", name: `Cabin ${i + 1}`, w: 0.9 })),
      { type: "meeting", name: "Meeting room", w: 1.4, attach: { type: "bath", name: "Washroom" } },
    ],
    balcony: false,
  };
}

/** Lays out a front (public) and back (private) band inside a W x D footprint. */
function pack(W, D, { pub, priv }, floor) {
  const sum = (list) => list.reduce((a, b) => a + b.w, 0);
  const FRONT_MIN = 11;
  const ROOM_MIN_D = 10.5;
  const BATH_MIN_D = 6;
  let backMin = ROOM_MIN_D + BATH_MIN_D;
  if (!priv.some((x) => x.attach) || D - FRONT_MIN < backMin) {
    // No room to put baths behind bedrooms: place them beside their room instead.
    priv = priv.flatMap((x) => (x.attach ? [{ ...x, attach: null }, { type: x.attach.type, name: x.attach.name, w: 0.6 }] : [x]));
    backMin = ROOM_MIN_D;
  }
  const share = priv.length ? sum(pub) / (sum(pub) + sum(priv)) : 1;
  const frontD = !priv.length ? D : D - FRONT_MIN < backMin ? r(D / 2) : r(Math.min(Math.max(D * share, FRONT_MIN), D - backMin));
  const rooms = [];
  const row = (list, z, d, band) => {
    const total = sum(list);
    // Proportional widths, but never narrower than MIN_W: take the difference from the widest room.
    const widths = list.map((room) => r((W * room.w) / total));
    for (let guard = 0; guard < 20; guard++) {
      const i = widths.findIndex((w) => w < MIN_W);
      if (i < 0) break;
      const widest = widths.indexOf(Math.max(...widths));
      const need = MIN_W - widths[i];
      widths[i] += need;
      widths[widest] -= need;
    }
    let x = 0;
    list.forEach((room, i) => {
      const w = i === list.length - 1 ? W - x : widths[i];
      if (room.attach) {
        // An attached room (bath behind a bedroom) shares the column and is entered from the room in front.
        const backD = r(Math.min(Math.max(6, d * 0.35), d - 10.5));
        rooms.push({ id: `f${floor}-${band}${i}`, type: room.type, name: room.name, floor, band, x, z, w, d: d - backD, head: true });
        rooms.push({ id: `f${floor}-${band}${i}b`, type: room.attach.type, name: room.attach.name, floor, band, x, z: z + d - backD, w, d: backD, attached: true });
      } else {
        rooms.push({ id: `f${floor}-${band}${i}`, type: room.type, name: room.name, floor, band, x, z, w, d, head: true });
      }
      x += w;
    });
  };
  row(pub, 0, frontD, "p");
  if (priv.length) row(priv, frontD, D - frontD, "q");
  return { rooms, frontD };
}

/** Wall segments [{x1,z1,x2,z2,floor,exterior}] with door gaps cut where rooms connect. */
function walls(W, D, rooms, frontD, floor, { entrance = true } = {}) {
  const out = [];
  const seg = (x1, z1, x2, z2, exterior, gaps = []) => {
    // gaps: positions (along the segment) of door centres
    const horizontal = z1 === z2;
    const a = horizontal ? Math.min(x1, x2) : Math.min(z1, z2);
    const b = horizontal ? Math.max(x1, x2) : Math.max(z1, z2);
    let cur = a;
    [...gaps].sort((p, q) => p - q).forEach((g) => {
      const s = Math.max(a, g - DOOR / 2);
      const e = Math.min(b, g + DOOR / 2);
      if (s - cur > 0.2) out.push(horizontal ? { x1: cur, z1, x2: s, z2: z1, exterior } : { x1, z1: cur, x2: x1, z2: s, exterior });
      cur = e;
    });
    if (b - cur > 0.2) out.push(horizontal ? { x1: cur, z1, x2: b, z2: z1, exterior } : { x1, z1: cur, x2: x1, z2: b, exterior });
  };
  const front = rooms.filter((rm) => rm.band === "p");
  const back = rooms.filter((rm) => rm.band === "q" && rm.head);
  const living = front.find((rm) => rm.type === "living" || rm.type === "reception" || rm.type === "studio") || front[0];

  // Exterior: entrance on the front wall of the living room / reception (ground floor only).
  seg(0, 0, W, 0, true, entrance && living ? [living.x + Math.min(living.w / 2, living.w - 2)] : []);
  seg(0, D, W, D, true);
  seg(0, 0, 0, D, true);
  seg(W, 0, W, D, true);

  // The line between the two bands: one door into every back room.
  if (back.length) seg(0, frontD, W, frontD, false, back.map((rm) => rm.x + rm.w / 2));

  // Partitions inside each band. Living and dining stay open plan; everything else gets a wall with a door.
  const partition = (list, z, d, withDoor) => {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      const open = [a.type, b.type].every((t) => ["living", "dining", "workspace", "reception", "studio", "lounge"].includes(t));
      if (open) continue;
      seg(b.x, z, b.x, z + d, false, withDoor ? [z + d / 2] : []);
    }
  };
  partition(front, 0, frontD, true);
  if (back.length) partition(back, frontD, D - frontD, false);
  // Attached rooms: a wall across the column with a door from the room in front.
  rooms.filter((rm) => rm.attached).forEach((rm) => seg(rm.x, rm.z, rm.x + rm.w, rm.z, false, [rm.x + rm.w / 2]));
  return out.map((s) => ({ ...s, floor, exterior: !!s.exterior }));
}

/**
 * Builds the indicative layout for a listing.
 * Returns { kind: "home"|"office"|"plot", width, depth, floors: n, rooms, walls, balcony, plot, area, note }.
 */
export function generateLayout(p) {
  const type = String(p.type || "APARTMENT").toUpperCase();
  const beds = Math.max(0, Math.min(8, Number(p.beds) || 0));
  const baths = Math.max(1, Math.min(8, Number(p.baths) || 1));
  const area = Math.max(Number(p.areaSqft) || 0, type === "STUDIO" ? 350 : type === "COMMERCIAL" ? 600 : 300 + beds * 250);

  if (type === "PLOT") {
    const w = r(Math.sqrt(area * 1.3));
    return { kind: "plot", width: w, depth: r(area / w), floors: 1, rooms: [], walls: [], balcony: null, plot: true, area };
  }

  const twoFloors = (type === "VILLA" || type === "HOUSE") && beds >= 4;
  const usable = area * 0.88;
  const perFloor = twoFloors ? usable / 2 : usable;
  const W = r(Math.sqrt(perFloor * (type === "COMMERCIAL" ? 1.45 : 1.2)));
  const D = r(perFloor / W);

  const rooms = [];
  const wallList = [];
  let balcony = null;

  if (type === "COMMERCIAL") {
    const plan = officeRooms(area);
    const { rooms: rs, frontD } = pack(W, D, plan, 0);
    rooms.push(...rs);
    wallList.push(...walls(W, D, rs, frontD, 0));
  } else if (type === "STUDIO" || beds === 0) {
    const plan = { pub: [{ type: "studio", name: "Studio room", w: 3 }], priv: [{ type: "kitchen", name: "Kitchenette", w: 1.2 }, { type: "bath", name: "Bath", w: 1 }], balcony: false };
    const { rooms: rs, frontD } = pack(W, D, plan, 0);
    rooms.push(...rs);
    wallList.push(...walls(W, D, rs, frontD, 0));
  } else if (twoFloors) {
    const ground = {
      pub: [{ type: "living", name: "Living room", w: 3 }, { type: "dining", name: "Dining", w: 1.4 }, { type: "kitchen", name: "Kitchen", w: 1.2 }],
      priv: [{ type: "bedroom", name: "Guest bedroom", w: 1.4, attach: { type: "bath", name: "Guest bath" } }, { type: "utility", name: "Utility", w: 0.8 }, { type: "stairs", name: "Stairs", w: 0.7 }],
    };
    const upperBeds = beds - 1;
    const upper = homeRooms({ beds: upperBeds, baths: Math.max(1, baths - 1), area: perFloor, study: false });
    // Stairs close both back bands, so they sit in the same corner on both floors.
    upper.pub = [{ type: "lounge", name: "Family lounge", w: 2 }, ...upper.pub.filter((x) => x.type === "bath")];
    upper.priv.push({ type: "stairs", name: "Stairs", w: 0.7 });
    const g = pack(W, D, ground, 0);
    const u = pack(W, D, upper, 1);
    rooms.push(...g.rooms, ...u.rooms);
    wallList.push(...walls(W, D, g.rooms, g.frontD, 0), ...walls(W, D, u.rooms, u.frontD, 1, { entrance: false }));
  } else {
    const plan = homeRooms({ beds, baths, area, penthouse: type === "PENTHOUSE", study: area > 1800 && beds >= 3 });
    const { rooms: rs, frontD } = pack(W, D, plan, 0);
    rooms.push(...rs);
    wallList.push(...walls(W, D, rs, frontD, 0));
    if (plan.balcony) {
      const living = rs.find((x) => x.type === "living");
      balcony = { x: living.x + 1, z: -5, w: Math.max(6, living.w - 2), d: 5, floor: 0 };
    }
  }

  return {
    kind: type === "COMMERCIAL" ? "office" : "home",
    width: W,
    depth: D,
    floors: twoFloors ? 2 : 1,
    rooms,
    walls: wallList,
    balcony,
    garden: type === "VILLA" || type === "HOUSE",
    area,
  };
}

/* ---------- agency floor plans (Property.roomLayout) ---------- */

/** Room types a stored plan may use (mirrors backend/app/room_layout.py). */
export const ROOM_TYPES = [
  ["living", "Living room"], ["dining", "Dining"], ["kitchen", "Kitchen"], ["bedroom", "Bedroom"], ["bath", "Bathroom"],
  ["study", "Study"], ["utility", "Utility"], ["stairs", "Stairs"], ["lounge", "Lounge"], ["terrace", "Terrace / balcony"],
  ["hall", "Hall / passage"], ["studio", "Studio room"], ["reception", "Reception"], ["workspace", "Workspace"],
  ["cabin", "Cabin"], ["meeting", "Meeting room"], ["pantry", "Pantry"], ["other", "Other"],
];
const OPEN = ["living", "dining", "workspace", "reception", "studio", "lounge", "hall"];
const CIRCULATION = ["hall", "living", "lounge", "reception", "workspace", "dining", "studio", "stairs"];
const k = (n) => Math.round(n * 100);

/** Turns a generated layout into stored rooms, as a starting point for the agency's real plan. */
export function toStoredRooms(layout) {
  const living = layout.rooms.find((rm) => rm.floor === 0 && ["living", "reception", "studio"].includes(rm.type));
  return layout.rooms.map((rm, i) => {
    // An attached bath opens into the room in front of it, like in the generated plan.
    const front = rm.attached ? layout.rooms[i - 1] : null;
    return {
      id: rm.id, name: rm.name, type: rm.type, x: rm.x, z: rm.z, w: rm.w, d: rm.d, floor: rm.floor,
      ...(front ? { doorTo: front.id } : {}),
      ...(rm === living ? { entrance: true } : {}),
    };
  });
}

/** Which rooms of one floor touch, and over which stretch of wall: [{a, b, line: "h"|"v", at, from, to}]. */
function contacts(rooms) {
  const out = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const ox = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)];
      const oz = [Math.max(a.z, b.z), Math.min(a.z + a.d, b.z + b.d)];
      if (ox[1] - ox[0] > 0.2 && (k(a.z + a.d) === k(b.z) || k(b.z + b.d) === k(a.z))) {
        out.push({ a, b, line: "h", at: k(a.z + a.d) === k(b.z) ? b.z : a.z, from: ox[0], to: ox[1] });
      } else if (oz[1] - oz[0] > 0.2 && (k(a.x + a.w) === k(b.x) || k(b.x + b.w) === k(a.x))) {
        out.push({ a, b, line: "v", at: k(a.x + a.w) === k(b.x) ? b.x : a.x, from: oz[0], to: oz[1] });
      }
    }
  }
  return out;
}

/**
 * Doors of one floor: every room is reached from the hub (entrance / stairs) through a tree of doors that prefers
 * halls and living areas, keeps bedrooms off each other and baths off everything but their bedroom.
 * A room's `doorTo` adds a door to that neighbour first. Open-plan neighbours (living + dining…) need no door at all.
 */
function planDoors(rooms, links) {
  const parent = new Map(rooms.map((rm) => [rm.id, rm.id]));
  const find = (id) => (parent.get(id) === id ? id : find(parent.get(id)));
  const join = (a, b) => (find(a) === find(b) ? false : (parent.set(find(a), find(b)), true));
  const cost = ({ a, b, to, from }) => {
    if (OPEN.includes(a.type) && OPEN.includes(b.type)) return -2;
    if (a.doorTo === b.id || b.doorTo === a.id) return -1;
    if (to - from < DOOR + 0.5) return Infinity; // too short for a door
    const t = [a.type, b.type];
    if (t.includes("bath")) return t.includes("bedroom") ? 1.5 : t.some((x) => CIRCULATION.includes(x)) ? 2 : 6;
    if (t.some((x) => CIRCULATION.includes(x))) return 1;
    if (t[0] === "bedroom" && t[1] === "bedroom") return 5;
    return 3;
  };
  const doors = [];
  [...links]
    .map((l) => ({ ...l, cost: cost(l) }))
    .filter((l) => l.cost < Infinity)
    .sort((p, q) => p.cost - q.cost || q.to - q.from - (p.to - p.from))
    .forEach((l) => {
      if (join(l.a.id, l.b.id) && l.cost > -2) doors.push({ line: l.line, at: l.at, pos: (l.from + l.to) / 2 });
    });
  return doors;
}

/** Wall segments of one floor of a stored plan: room edges, merged; exterior where only one room is behind them. */
function planWalls(rooms, floor, entrance) {
  const lines = new Map(); // "h:z" | "v:x" -> [{from, to, room, side}]
  const add = (line, at, from, to, room, side) => {
    const key = `${line}:${k(at)}`;
    if (!lines.has(key)) lines.set(key, { line, at, edges: [] });
    lines.get(key).edges.push({ from, to, room, side });
  };
  rooms.forEach((rm) => {
    add("h", rm.z, rm.x, rm.x + rm.w, rm, 1);
    add("h", rm.z + rm.d, rm.x, rm.x + rm.w, rm, -1);
    add("v", rm.x, rm.z, rm.z + rm.d, rm, 1);
    add("v", rm.x + rm.w, rm.z, rm.z + rm.d, rm, -1);
  });
  const links = contacts(rooms);
  const doors = planDoors(rooms, links);
  if (entrance) {
    // Front door on the entrance room's longest outside wall, preferring the street side (its front edge).
    const runs = [];
    for (const { line, at, edges } of lines.values()) {
      edges.filter((e) => e.room === entrance).forEach((e) => {
        const covered = links.filter((l) => l.line === line && k(l.at) === k(at) && (l.a === entrance || l.b === entrance));
        let cur = e.from;
        [...covered].sort((p, q) => p.from - q.from).forEach((c) => {
          if (c.from > cur) runs.push({ line, at, from: cur, to: c.from, front: line === "h" && e.side === 1 });
          cur = Math.max(cur, c.to);
        });
        if (e.to > cur) runs.push({ line, at, from: cur, to: e.to, front: line === "h" && e.side === 1 });
      });
    }
    const best = runs.filter((x) => x.to - x.from >= DOOR + 0.5).sort((p, q) => q.front - p.front || q.to - q.from - (p.to - p.from))[0];
    if (best) doors.push({ line: best.line, at: best.at, pos: (best.from + best.to) / 2 });
  }

  const out = [];
  for (const { line, at, edges } of lines.values()) {
    const cuts = [...new Set(edges.flatMap((e) => [k(e.from), k(e.to)]))].sort((p, q) => p - q).map((n) => n / 100);
    // Elementary pieces of this line: wall kind is "ext", "int" or none (open plan).
    const pieces = [];
    for (let i = 1; i < cuts.length; i++) {
      const mid = (cuts[i - 1] + cuts[i]) / 2;
      const over = edges.filter((e) => e.from <= mid && e.to >= mid);
      if (!over.length) continue;
      const kind = over.length === 1 ? "ext" : over.every((e) => OPEN.includes(e.room.type)) ? null : "int";
      if (kind) pieces.push({ from: cuts[i - 1], to: cuts[i], kind });
    }
    const gaps = doors.filter((d) => d.line === line && k(d.at) === k(at)).map((d) => d.pos).sort((p, q) => p - q);
    const runs = [];
    pieces.forEach((p) => {
      const last = runs[runs.length - 1];
      if (last && last.kind === p.kind && k(last.to) === k(p.from)) last.to = p.to;
      else runs.push({ ...p });
    });
    runs.forEach(({ from, to, kind }) => {
      const exterior = kind === "ext";
      const push = (a, b) => {
        if (b - a <= 0.2) return;
        out.push(line === "h" ? { x1: a, z1: at, x2: b, z2: at, floor, exterior } : { x1: at, z1: a, x2: at, z2: b, floor, exterior });
      };
      let cur = from;
      gaps.filter((g) => g > from && g < to).forEach((g) => {
        push(cur, Math.max(from, g - DOOR / 2));
        cur = Math.min(to, g + DOOR / 2);
      });
      push(cur, to);
    });
  }
  return out;
}

/**
 * The 3D layout of an agency-provided plan ({ rooms }), same shape as generateLayout's plus `provided: true`
 * and a `key` that changes whenever the rooms do (saved designs are kept per plan).
 */
export function buildLayout(stored, { type } = {}) {
  const raw = (stored?.rooms || []).map((rm) => ({ ...rm, x: Number(rm.x) || 0, z: Number(rm.z) || 0, w: Number(rm.w) || 0, d: Number(rm.d) || 0, floor: Number(rm.floor) || 0 }));
  const minX = Math.min(...raw.map((rm) => rm.x));
  const minZ = Math.min(...raw.map((rm) => rm.z));
  const rooms = raw.filter((rm) => rm.w > 0 && rm.d > 0).map((rm) => ({ ...rm, x: rm.x - minX, z: rm.z - minZ, head: true }));
  const W = Math.max(...rooms.map((rm) => rm.x + rm.w));
  const D = Math.max(...rooms.map((rm) => rm.z + rm.d));
  rooms.forEach((rm) => (rm.band = rm.z + rm.d / 2 <= D / 2 ? "p" : "q"));
  const floors = Math.max(...rooms.map((rm) => rm.floor)) + 1;
  const wallList = [];
  for (let f = 0; f < floors; f++) {
    const here = rooms.filter((rm) => rm.floor === f);
    const entrance = f === 0 ? here.find((rm) => rm.entrance) || here.find((rm) => ["living", "reception", "studio", "hall"].includes(rm.type)) || here[0] : null;
    wallList.push(...planWalls(here, f, entrance));
  }
  const t = String(type || "").toUpperCase();
  const sig = JSON.stringify(rooms.map((rm) => [rm.id, rm.x, rm.z, rm.w, rm.d, rm.floor]));
  let hash = 0;
  for (let i = 0; i < sig.length; i++) hash = (hash * 31 + sig.charCodeAt(i)) | 0;
  return {
    kind: t === "COMMERCIAL" ? "office" : "home",
    width: W,
    depth: D,
    floors,
    rooms,
    walls: wallList,
    balcony: null,
    garden: t === "VILLA" || t === "HOUSE",
    area: rooms.reduce((a, rm) => a + rm.w * rm.d, 0),
    provided: true,
    key: (hash >>> 0).toString(36),
  };
}

/** Problems worth flagging while editing a plan: overlapping rooms and rooms no door leads to. */
export function planWarnings(stored) {
  const rooms = (stored?.rooms || []).map((rm) => ({ ...rm, x: Number(rm.x), z: Number(rm.z), w: Number(rm.w), d: Number(rm.d), floor: Number(rm.floor) || 0 }));
  if (!rooms.length || rooms.some((rm) => !(rm.w > 0 && rm.d > 0) || !Number.isFinite(rm.x) || !Number.isFinite(rm.z))) return [];
  const out = [];
  rooms.forEach((a, i) => rooms.slice(i + 1).forEach((b) => {
    if (a.floor === b.floor && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z) > 0.01) out.push(`${a.name || "A room"} overlaps ${b.name || "another room"}`);
  }));
  if (out.length) return out;
  const layout = buildLayout({ rooms });
  for (let f = 0; f < layout.floors; f++) {
    const here = layout.rooms.filter((rm) => rm.floor === f);
    // Reachability: flood from the hub through open sides and doors (a door = a gap on a shared edge).
    const links = contacts(here);
    const walls = layout.walls.filter((w) => w.floor === f);
    const blocked = (l) => {
      const len = l.to - l.from;
      const covered = walls
        .filter((w) => (l.line === "h" ? w.z1 === w.z2 && k(w.z1) === k(l.at) : w.x1 === w.x2 && k(w.x1) === k(l.at)))
        .reduce((a, w) => {
          const [p, q] = l.line === "h" ? [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)] : [Math.min(w.z1, w.z2), Math.max(w.z1, w.z2)];
          return a + Math.max(0, Math.min(q, l.to) - Math.max(p, l.from));
        }, 0);
      return len - covered < DOOR - 0.5;
    };
    const hub = (f === 0 && here.find((rm) => rm.entrance)) || here.find((rm) => rm.type === "stairs") || here.find((rm) => CIRCULATION.includes(rm.type)) || here[0];
    const seen = new Set([hub.id]);
    for (let grew = true; grew; ) {
      grew = false;
      links.forEach((l) => {
        if (seen.has(l.a.id) !== seen.has(l.b.id) && !blocked(l)) {
          seen.add(l.a.id);
          seen.add(l.b.id);
          grew = true;
        }
      });
    }
    here.filter((rm) => !seen.has(rm.id)).forEach((rm) => out.push(`No door leads to ${rm.name || "a room"}${layout.floors > 1 ? ` (floor ${f})` : ""}`));
  }
  return out;
}

/** Readable size like 12' × 14'. */
export const roomSize = (rm) => `${Math.round(rm.w)}' × ${Math.round(rm.d)}'`;
