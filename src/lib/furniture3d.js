// Furniture catalogue (sizes in feet) and the auto-furnish rules for the 3D designer.
// Each item is a set of simple parts (boxes, cylinders, spheres) in its own space: x across, z depth (front faces +z), y up.

const WOOD = "#9b6b43";
const DARK_WOOD = "#5b3d27";
const FABRIC = "#8a9aa9";
const WHITE = "#f4f1ea";
const STEEL = "#b9bec4";
const BLACK = "#22252b";
const GREEN = "#4f7d43";

const box = (w, h, d, x, y, z, color, extra = {}) => ({ shape: "box", w, h, d, x, y, z, color, ...extra });

export const CATALOG = {
  sofa: { name: "Sofa", group: "Living", w: 7, d: 3, parts: [box(7, 1.4, 2.6, 0, 0.7, 0.2, FABRIC), box(7, 1.6, 0.6, 0, 1.9, -1.2, FABRIC), box(0.6, 2, 3, -3.2, 1, 0, FABRIC), box(0.6, 2, 3, 3.2, 1, 0, FABRIC)] },
  armchair: { name: "Armchair", group: "Living", w: 3, d: 3, parts: [box(3, 1.4, 2.6, 0, 0.7, 0.2, "#c08a5b"), box(3, 1.6, 0.5, 0, 1.9, -1.25, "#c08a5b"), box(0.4, 2, 3, -1.3, 1, 0, "#c08a5b"), box(0.4, 2, 3, 1.3, 1, 0, "#c08a5b")] },
  coffeeTable: { name: "Coffee table", group: "Living", w: 4, d: 2, parts: [box(4, 0.15, 2, 0, 1.4, 0, WOOD), box(3.6, 1.3, 1.6, 0, 0.65, 0, DARK_WOOD)] },
  tvUnit: { name: "TV unit", group: "Living", w: 6, d: 1.5, parts: [box(6, 1.6, 1.5, 0, 0.8, 0, DARK_WOOD), box(4.5, 2.6, 0.2, 0, 3.4, -0.4, BLACK)] },
  rug: { name: "Rug", group: "Living", w: 7, d: 5, parts: [box(7, 0.04, 5, 0, 0.02, 0, "#d8c3a5")], flat: true },
  diningSet: {
    name: "Dining set", group: "Dining", w: 6, d: 6,
    parts: [box(6, 0.15, 3.2, 0, 2.5, 0, WOOD), box(5.4, 2.4, 2.6, 0, 1.2, 0, DARK_WOOD, { opacity: 0.0001 }),
      ...[-1.8, 0, 1.8].flatMap((x) => [box(1.4, 3, 1.4, x, 1.5, -2.3, "#7c8a6e"), box(1.4, 3, 1.4, x, 1.5, 2.3, "#7c8a6e")])],
  },
  bed: { name: "Double bed", group: "Bedroom", w: 6, d: 7, parts: [box(6, 1.2, 7, 0, 0.6, 0, WOOD), box(5.8, 0.7, 6.6, 0, 1.55, 0.1, WHITE), box(6, 3.6, 0.4, 0, 1.8, -3.3, DARK_WOOD), box(2.2, 0.4, 1.2, -1.4, 2.1, -2.4, "#dfe7ef"), box(2.2, 0.4, 1.2, 1.4, 2.1, -2.4, "#dfe7ef")] },
  singleBed: { name: "Single bed", group: "Bedroom", w: 3.5, d: 6.5, parts: [box(3.5, 1.2, 6.5, 0, 0.6, 0, WOOD), box(3.3, 0.7, 6.1, 0, 1.55, 0.1, WHITE), box(3.5, 3, 0.4, 0, 1.5, -3.05, DARK_WOOD)] },
  wardrobe: { name: "Wardrobe", group: "Bedroom", w: 6, d: 2, parts: [box(6, 7, 2, 0, 3.5, 0, "#c9b79c"), box(0.08, 6.6, 0.05, 0, 3.5, 1.01, DARK_WOOD)] },
  desk: { name: "Desk & chair", group: "Work", w: 4, d: 3.5, parts: [box(4, 0.15, 2, 0, 2.5, -0.7, WOOD), box(3.8, 2.4, 1.8, 0, 1.2, -0.7, DARK_WOOD, { opacity: 0.0001 }), box(1.6, 0.3, 1.6, 0, 1.5, 0.9, BLACK), box(1.6, 1.6, 0.25, 0, 2.4, 1.6, BLACK)] },
  bookshelf: { name: "Bookshelf", group: "Work", w: 3, d: 1.2, parts: [box(3, 6, 1.2, 0, 3, 0, WOOD), ...[1.2, 2.4, 3.6, 4.8].map((y) => box(2.8, 0.1, 1.1, 0, y, 0.05, DARK_WOOD))] },
  kitchenCounter: { name: "Kitchen counter", group: "Kitchen", w: 8, d: 2, parts: [box(8, 2.9, 2, 0, 1.45, 0, "#e6e1d8"), box(8.1, 0.15, 2.1, 0, 2.95, 0, "#3d3f44"), box(8, 2.4, 1.2, 0, 5.6, -0.4, "#e6e1d8")] },
  fridge: { name: "Fridge", group: "Kitchen", w: 2.5, d: 2.5, parts: [box(2.5, 6, 2.5, 0, 3, 0, STEEL)] },
  toilet: { name: "Toilet", group: "Bath", w: 1.6, d: 2.4, parts: [box(1.3, 1.3, 1.6, 0, 0.65, 0.3, WHITE), box(1.6, 1.4, 0.6, 0, 1.7, -0.85, WHITE)] },
  basin: { name: "Washbasin", group: "Bath", w: 2, d: 1.5, parts: [box(2, 2.6, 1.5, 0, 1.3, 0, "#d9d4ca"), box(1.4, 0.3, 1, 0, 2.75, 0, WHITE)] },
  shower: { name: "Shower", group: "Bath", w: 3, d: 3, parts: [box(3, 0.2, 3, 0, 0.1, 0, "#cfd8dc"), box(3, 6.5, 0.08, 0, 3.4, 1.5, "#a7d3e8", { opacity: 0.35 })] },
  plant: { name: "Plant", group: "Decor", w: 1.6, d: 1.6, parts: [{ shape: "cyl", r: 0.6, h: 1.2, x: 0, y: 0.6, z: 0, color: "#b5653d" }, { shape: "sphere", r: 1.1, x: 0, y: 2.3, z: 0, color: GREEN }] },
  lounger: { name: "Lounger", group: "Outdoor", w: 2.2, d: 6, parts: [box(2.2, 1, 6, 0, 0.5, 0, "#e8e2d4"), box(2.2, 1.6, 0.4, 0, 1.6, -2.6, "#e8e2d4")] },
  workstation: { name: "Workstation", group: "Office", w: 5, d: 4, parts: [box(5, 0.15, 2.5, 0, 2.5, -0.7, WHITE), box(4.8, 2.4, 2.3, 0, 1.2, -0.7, STEEL, { opacity: 0.0001 }), box(1.8, 1.2, 0.15, 0, 3.2, -1.7, BLACK), box(1.6, 0.3, 1.6, 0, 1.5, 1.1, BLACK), box(1.6, 1.6, 0.25, 0, 2.4, 1.8, BLACK)] },
  meetingTable: {
    name: "Meeting table", group: "Office", w: 9, d: 7,
    parts: [box(9, 0.15, 3.5, 0, 2.5, 0, DARK_WOOD), box(8.4, 2.4, 3, 0, 1.2, 0, DARK_WOOD, { opacity: 0.0001 }),
      ...[-3, -1, 1, 3].flatMap((x) => [box(1.4, 3, 1.4, x, 1.5, -2.6, BLACK), box(1.4, 3, 1.4, x, 1.5, 2.6, BLACK)])],
  },
  receptionDesk: { name: "Reception desk", group: "Office", w: 7, d: 2.5, parts: [box(7, 3.6, 2.5, 0, 1.8, 0, WHITE), box(7.1, 0.15, 2.6, 0, 3.7, 0, DARK_WOOD)] },
};

/** Footprint of an item after `rot` quarter turns. */
export function footprint(kind, rot = 0) {
  const c = CATALOG[kind];
  return rot % 2 ? { w: c.d, d: c.w } : { w: c.w, d: c.d };
}

let seq = 0;
const nextId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Places a sensible starting set of furniture in every room. Returns [{ id, kind, x, z, rot, floor }]. */
export function autoFurnish(layout) {
  const items = [];
  for (const room of layout.rooms) {
    const front = room.band === "p";
    const wallZ = front ? room.z : room.z + room.d; // the room's exterior wall: furniture backs onto it
    const inward = front ? 1 : -1;
    const facing = front ? 0 : 2;
    const cx = room.x + room.w / 2;
    const cz = room.z + room.d / 2;
    const fits = (kind, rot = 0) => {
      const f = footprint(kind, rot);
      return f.w <= room.w - 1 && f.d <= room.d - 1;
    };
    const add = (kind, x, z, rot) => fits(kind, rot) && items.push({ id: nextId(), kind, x, z, rot: ((rot % 4) + 4) % 4, floor: room.floor });
    const atWall = (kind, dx = 0) => add(kind, cx + dx, wallZ + inward * (CATALOG[kind].d / 2 + 0.3), facing);
    const opposite = (kind, dx = 0) => add(kind, cx + dx, (front ? room.z + room.d : room.z) - inward * (CATALOG[kind].d / 2 + 0.3), facing + 2);
    const side = (kind, left = true) => add(kind, left ? room.x + CATALOG[kind].d / 2 + 0.3 : room.x + room.w - CATALOG[kind].d / 2 - 0.3, cz, left ? 1 : 3);
    const corner = (kind, rightSide = true, far = false) => {
      const hw = CATALOG[kind].w / 2 + 0.3;
      const hd = CATALOG[kind].d / 2 + 0.3;
      add(kind, rightSide ? room.x + room.w - hw : room.x + hw, (far ? !front : front) ? room.z + hd : room.z + room.d - hd, 0);
    };
    const center = (kind, rot) => add(kind, cx, cz, rot ?? (room.d > room.w ? 1 : 0));

    switch (room.type) {
      case "living":
      case "lounge":
        add("rug", cx, cz, 0);
        atWall("sofa");
        add("coffeeTable", cx, wallZ + inward * (CATALOG.sofa.d + 2.3), 0);
        opposite("tvUnit");
        if (room.w > 16) side("armchair", false);
        corner("plant", false);
        break;
      case "studio":
        atWall("bed", -room.w / 4);
        opposite("sofa", room.w / 5);
        corner("plant", true);
        break;
      case "dining":
        center("diningSet", 0);
        corner("plant", true, true);
        break;
      case "kitchen":
        // Narrow kitchens get the counter along a side wall instead.
        if (!atWall("kitchenCounter")) side("kitchenCounter", true);
        corner("fridge", true, true);
        break;
      case "bedroom":
        atWall("bed");
        side("wardrobe", true);
        if (room.w > 13) side("armchair", false);
        else corner("plant", false, true);
        break;
      case "bath":
        atWall("toilet", -room.w / 4);
        atWall("basin", room.w / 4);
        if (room.w > 8 && room.d > 7) corner("shower", true, true);
        break;
      case "study":
        atWall("desk");
        side("bookshelf", false);
        break;
      case "utility":
        atWall("bookshelf");
        break;
      case "terrace":
        atWall("lounger", -2.5);
        atWall("lounger", 2.5);
        corner("plant", true, true);
        corner("plant", false, true);
        break;
      case "reception":
        atWall("receptionDesk");
        opposite("sofa");
        corner("plant", true);
        break;
      case "workspace": {
        const cols = Math.max(1, Math.floor((room.w - 2) / 6));
        const rows = Math.max(1, Math.floor((room.d - 2) / 6));
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) add("workstation", room.x + 1 + 3 + i * 6, room.z + 1 + 2.5 + j * 6, 0);
        break;
      }
      case "cabin":
        atWall("desk");
        side("bookshelf", true);
        break;
      case "meeting":
        center("meetingTable", room.d > room.w ? 1 : 0);
        break;
      case "pantry":
        if (!atWall("kitchenCounter")) side("kitchenCounter", true);
        corner("fridge", true, true);
        break;
      default:
        break;
    }
  }
  if (layout.balcony) {
    const b = layout.balcony;
    items.push({ id: nextId(), kind: "plant", x: b.x + 1.2, z: b.z + 2.5, rot: 0, floor: 0 }, { id: nextId(), kind: "armchair", x: b.x + b.w - 2.2, z: b.z + 2.4, rot: 0, floor: 0 });
  }
  return items;
}

export const WALL_COLORS = [
  { name: "Warm white", hex: "#f2ede4" },
  { name: "Sand", hex: "#e3d3b8" },
  { name: "Sage", hex: "#c9d5c0" },
  { name: "Sky", hex: "#cfdbe6" },
  { name: "Blush", hex: "#ecd4cf" },
  { name: "Charcoal", hex: "#5d6268" },
];

export const FLOOR_FINISHES = [
  { key: "oak", name: "Oak wood", color: "#c79b6d", stripes: "#b48558" },
  { key: "walnut", name: "Walnut", color: "#7a5236", stripes: "#6a4630" },
  { key: "marble", name: "White marble", color: "#ece9e4", veins: "#c9c4bc" },
  { key: "tiles", name: "Grey tiles", color: "#b9bcc0", grid: "#9ea2a7" },
  { key: "terracotta", name: "Terracotta", color: "#c8724b", grid: "#a95c3b" },
  { key: "carpet", name: "Carpet", color: "#8d8fa3" },
];

/** Starting finish per room type. */
export function defaultFinish(type) {
  if (["bath", "kitchen", "pantry", "utility"].includes(type)) return "tiles";
  if (["terrace"].includes(type)) return "terracotta";
  if (["bedroom", "study", "cabin", "lounge"].includes(type)) return "oak";
  if (["meeting", "workspace", "reception"].includes(type)) return "carpet";
  return "marble";
}
