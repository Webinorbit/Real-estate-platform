#!/usr/bin/env node
// Downloads demo photos (Unsplash licence) and 360 panoramas (Poly Haven, CC0) into public/demo
// so the seeded demo works offline and loads fast. Replace these with real client media in production.
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const photoDir = path.join(root, "public/demo/photos");
const panoDir = path.join(root, "public/demo/panos");
const mapPath = path.join(root, "public/demo/assets.json");

export const PHOTOS = {
  "ext-01": "photo-1600596542815-ffad4c1539a9",
  "ext-02": "photo-1600585154340-be6161a56a0c",
  "ext-03": "photo-1600607687939-ce8a6c25118c",
  "ext-04": "photo-1600566753190-17f0baa2a6c3",
  "ext-05": "photo-1512917774080-9991f1c4c750",
  "ext-06": "photo-1613490493576-7fde63acd811",
  "ext-07": "photo-1613977257363-707ba9348227",
  "ext-08": "photo-1600047509807-ba8f99d2cdde",
  "ext-09": "photo-1564013799919-ab600027ffc6",
  "ext-10": "photo-1545324418-cc1a3fa10c00",
  "ext-11": "photo-1570129477492-45c003edd2be",
  "ext-12": "photo-1568605114967-8130f3a36994",
  "ext-13": "photo-1580587771525-78b9dba3b914",
  "ext-15": "photo-1522771739844-6a9f6d5f14af",
  "ext-17": "photo-1574362848149-11496d93a7c7",
  "ext-18": "photo-1512918728675-ed5a9ecdebfd",
  "int-01": "photo-1502672260266-1c1ef2d93688",
  "int-02": "photo-1560448204-e02f11c3d0e2",
  "int-03": "photo-1493809842364-78817add7ffb",
  "int-04": "photo-1522708323590-d24dbb6b0267",
  "int-05": "photo-1484154218962-a197022b5858",
  "int-06": "photo-1560185007-cde436f6a4d0",
  "int-07": "photo-1556909114-f6e7ad7d3136",
  "int-08": "photo-1618221195710-dd6b41faaea6",
  "int-09": "photo-1600210492486-724fe5c67fb0",
  "int-10": "photo-1600573472550-8090b5e0745e",
  "int-11": "photo-1616594039964-ae9021a400a0",
  "int-12": "photo-1560185893-a55cbc8c57e8",
  "int-13": "photo-1554995207-c18c203602cb",
  "int-14": "photo-1586023492125-27b2c045efd7",
  "int-15": "photo-1540518614846-7eded433c457",
  "int-16": "photo-1515263487990-61b07816b324",
  "com-01": "photo-1486406146926-c627a92ad1ab",
  "com-02": "photo-1497366216548-37526070297c",
};

export const HEROES = {
  "hero-01": "photo-1512453979798-5ea266f8880c",
  "hero-02": "photo-1449844908441-8829872d2607",
  "hero-03": "photo-1518780664697-55e3ad937233",
  "hero-04": "photo-1477959858617-67f85cf4f1df",
};

export const AVATARS = {
  "broker-01": "photo-1494790108377-be9c29b29330",
  "broker-02": "photo-1507003211169-0a1dd7228f2d",
  "broker-03": "photo-1438761681033-6461ffad8d80",
  "broker-04": "photo-1472099645785-5658abf4ff4e",
  "broker-05": "photo-1500648767791-00dcc994a43e",
  "broker-06": "photo-1573496359142-b8d87734a5a2",
  "broker-07": "photo-1580489944761-15a19d654956",
  "broker-08": "photo-1519085360753-af0119f7cbe7",
};

// Poly Haven CC0 HDRIs, tone-mapped JPG previews. Used as equirectangular 360 scenes.
export const PANOS = {
  "pano-living": "lebombo",
  "pano-lounge": "brown_photostudio_02",
  "pano-hall": "empty_play_room",
  "pano-studio": "photo_studio_loft_hall",
  "pano-room": "small_empty_room_3",
  "pano-lobby": "cinema_lobby",
  "pano-garden": "kloofendal_43d_clear_puresky",
  "pano-terrace": "rooftop_night",
};

const exists = (p) => access(p).then(() => true, () => false);

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "webinorbit-realestate-demo/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(photoDir, { recursive: true });
  await mkdir(panoDir, { recursive: true });
  const result = { photos: {}, panos: {} };

  for (const [key, id] of Object.entries(PHOTOS)) {
    const file = path.join(photoDir, `${key}.jpg`);
    try {
      if (!(await exists(file))) {
        const buf = await download(`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1800&q=80`);
        await sharp(buf).resize({ width: 1800, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(file);
      }
      result.photos[key] = `/demo/photos/${key}.jpg`;
      console.log("photo ok ", key);
    } catch (e) {
      console.warn("photo FAIL", key, e.message);
    }
  }

  for (const [key, id] of Object.entries(HEROES)) {
    const file = path.join(photoDir, `${key}.jpg`);
    try {
      if (!(await exists(file))) {
        const buf = await download(`https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80`);
        await sharp(buf).resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(file);
      }
      result.photos[key] = `/demo/photos/${key}.jpg`;
      console.log("hero ok  ", key);
    } catch (e) {
      console.warn("hero FAIL ", key, e.message);
    }
  }

  for (const [key, id] of Object.entries(AVATARS)) {
    const file = path.join(photoDir, `${key}.jpg`);
    try {
      if (!(await exists(file))) {
        const buf = await download(`https://images.unsplash.com/${id}?auto=format&fit=crop&crop=faces&w=480&h=480&q=80`);
        await sharp(buf).resize(480, 480, { fit: "cover" }).jpeg({ quality: 82 }).toFile(file);
      }
      result.photos[key] = `/demo/photos/${key}.jpg`;
      console.log("avatar ok", key);
    } catch (e) {
      console.warn("avatar FAIL", key, e.message);
    }
  }

  const planDir = path.join(root, "public/demo/floorplans");
  await mkdir(planDir, { recursive: true });
  const py = path.join(root, "backend/.venv/bin/python");
  const gen = spawnSync(
    py,
    ["-c", "import sys; from app.cli.demo_floorplans import FLOORPLANS, floorplan_svg\nfor k in FLOORPLANS: open(f'{sys.argv[1]}/{k}.svg','w').write(floorplan_svg(k)); print('plan ok  ', k)", planDir],
    { cwd: path.join(root, "backend"), stdio: "inherit" },
  );
  if (gen.status !== 0) console.warn("plan FAIL: run `npm run api:setup` first");

  for (const [key, name] of Object.entries(PANOS)) {
    const file = path.join(panoDir, `${key}.jpg`);
    try {
      if (!(await exists(file))) {
        const buf = await download(`https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/${name}.jpg`);
        await sharp(buf).resize({ width: 4096, height: 2048, fit: "fill" }).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
      }
      result.panos[key] = `/demo/panos/${key}.jpg`;
      console.log("pano ok  ", key);
    } catch (e) {
      console.warn("pano FAIL ", key, e.message);
    }
  }

  await writeFile(mapPath, JSON.stringify(result, null, 2));
  console.log(`\nDone: ${Object.keys(result.photos).length} photos, ${Object.keys(result.panos).length} panoramas -> public/demo`);
}

main();
