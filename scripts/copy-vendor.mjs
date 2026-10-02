import { cpSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "node_modules/maplibre-gl/dist");
const dest = path.join(root, "public/vendor/maplibre");

if (!existsSync(src)) {
  console.log("[vendor] maplibre-gl not installed yet, skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(path.join(src, f), path.join(dest, f));
}
console.log("[vendor] copied maplibre worker files");
