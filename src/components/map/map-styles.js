// Map styles are raster styles over OpenStreetMap-based tiles, rendered by MapLibre GL (no vendor SDK or API key).
// For production traffic point NEXT_PUBLIC_TILE_URL at your own / a paid tile provider (MapTiler, Stadia, self-hosted).
// Check each provider's usage policy: the public OSM tile servers are for light use only.

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const custom = process.env.NEXT_PUBLIC_TILE_URL;

export const MAP_STYLES = {
  streets: {
    label: "Streets",
    tiles: custom ? [custom] : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: OSM_ATTR,
    tileSize: 256,
    maxzoom: 19,
    darkInvert: true,
  },
  clean: {
    label: "Clean",
    tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`),
    attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`,
    tileSize: 256,
    maxzoom: 19,
    darkInvert: true,
  },
  satellite: {
    label: "Satellite",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    tileSize: 256,
    maxzoom: 19,
    darkInvert: false,
  },
};

export function buildStyle(key) {
  const s = MAP_STYLES[key] || MAP_STYLES.streets;
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: s.tiles, tileSize: s.tileSize, maxzoom: s.maxzoom, attribution: s.attribution },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}
