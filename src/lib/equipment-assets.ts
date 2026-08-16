// src/lib/equipment-assets.ts
// Preload cache for Blender-authored GLB equipment/structural assets.
//
// Layer generators run synchronously (LayerGenerator.generate), so assets are
// preloaded once via preloadEquipmentAssets() and then served synchronously.
// Consumers that miss the cache (SSR, tests, load failure) fall back to their
// original coarse procedural geometry.
//
// IMPORTANT: building-layers.tsx and ProceduralBuilding dispose geometry AND
// materials on every regeneration. The cache therefore hands out deep clones
// (geometry + materials) — never shared references to the cached template.
// Pure Three.js, no React.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** All Blender-authored assets shipped in public/models/equipment/. */
export type EquipmentAssetId =
  // MEP equipment (HAND OFF.MD "more realistic equipment forms")
  | "chiller"
  | "cooling-tower"
  | "boiler"
  | "vrf-outdoor"
  | "fan-coil"
  | "dhw-tank"
  | "dhw-pump"
  // HVAC / electrical (instanced swaps)
  | "ahu"
  | "light-fixture"
  | "electrical-panel"
  // Renewables / microgrid
  | "solar-panel"
  | "solar-rack"
  | "battery-rack"
  | "inverter"
  | "gshp"
  | "heat-pump"
  // Retrofit-scenario variants (green remodeling swaps)
  | "boiler-condensing"
  | "light-fixture-led"
  // Envelope retrofit variants (windowUpgrade / wallInsulation scenarios)
  | "mullion-he"
  | "facade-panel-insulated"
  // BAS / controls
  | "bas-sensor"
  | "ddc-panel"
  | "bas-headend"
  // Structural kit
  | "column"
  | "beam"
  | "mullion"
  | "facade-panel"
  | "cable-tray"
  | "roof-furniture"
  // Safety / fire-protection kit
  | "sprinkler-head"
  | "smoke-detector"
  | "exit-sign"
  | "fire-extinguisher"
  | "hydrant-cabinet"
  // Transport / elevator kit
  | "elevator-cab"
  | "elevator-counterweight"
  | "hoist-machine"
  | "landing-door"
  // Telecom / media kit
  | "comm-rack"
  | "wifi-ap"
  | "cctv-camera"
  | "antenna-mast"
  | "gas-valve-station"
  // Waste & recovery kit
  | "wheelie-bin"
  | "waste-chute-module"
  // Gas + water + bathroom kit
  | "gas-meter"
  | "lpg-tank"
  | "water-meter"
  | "bathroom-fixture"
  // New site kit (2026-08-14) — not remakes of existing ids
  | "junction-box"
  | "ev-charger"
  | "exhaust-fan"
  | "fire-pump"
  | "emergency-generator"
  // Architectural envelope kit (Blender MCP, 2026-08-17)
  | "facade-cladding"
  | "parapet-cap"
  | "balcony-module"
  | "roof-pergola";

export const EQUIPMENT_ASSET_IDS: EquipmentAssetId[] = [
  "chiller",
  "cooling-tower",
  "boiler",
  "vrf-outdoor",
  "fan-coil",
  "dhw-tank",
  "dhw-pump",
  "ahu",
  "light-fixture",
  "electrical-panel",
  "solar-panel",
  "solar-rack",
  "battery-rack",
  "inverter",
  "gshp",
  "heat-pump",
  "boiler-condensing",
  "light-fixture-led",
  "mullion-he",
  "facade-panel-insulated",
  "bas-sensor",
  "ddc-panel",
  "bas-headend",
  "column",
  "beam",
  "mullion",
  "facade-panel",
  "cable-tray",
  "roof-furniture",
  "sprinkler-head",
  "smoke-detector",
  "exit-sign",
  "fire-extinguisher",
  "hydrant-cabinet",
  "elevator-cab",
  "elevator-counterweight",
  "hoist-machine",
  "landing-door",
  "comm-rack",
  "wifi-ap",
  "cctv-camera",
  "antenna-mast",
  "gas-valve-station",
  "wheelie-bin",
  "waste-chute-module",
  "gas-meter",
  "lpg-tank",
  "water-meter",
  "bathroom-fixture",
  "junction-box",
  "ev-charger",
  "exhaust-fan",
  "fire-pump",
  "emergency-generator",
  "facade-cladding",
  "parapet-cap",
  "balcony-module",
  "roof-pergola",
];

const ASSET_BASE_PATH = "/models/equipment";

/**
 * Native authored dimensions (metres, three.js axes: x=width, y=height, z=depth).
 * Consumers scale clones by (param / native) so MepEquipmentParams overrides
 * keep working exactly like they did with the coarse primitives.
 */
export const ASSET_NATIVE_DIMS: Record<
  EquipmentAssetId,
  { w: number; h: number; d: number }
> = {
  chiller: { w: 2.4, h: 1.5, d: 1.8 },
  "cooling-tower": { w: 1.5, h: 1.66, d: 1.5 },
  boiler: { w: 1.0, h: 1.8, d: 1.0 }, // body only; flue extends above h
  "vrf-outdoor": { w: 0.8, h: 0.6, d: 0.35 },
  "fan-coil": { w: 0.9, h: 0.1, d: 0.5 },
  "dhw-tank": { w: 1.2, h: 1.8, d: 1.2 },
  "dhw-pump": { w: 0.78, h: 0.56, d: 0.32 },
  ahu: { w: 1.2, h: 0.8, d: 0.8 },
  "light-fixture": { w: 0.6, h: 0.1, d: 0.3 },
  "electrical-panel": { w: 0.5, h: 0.8, d: 0.18 },
  "solar-panel": { w: 1.6, h: 0.05, d: 1.0 },
  "solar-rack": { w: 1.64, h: 0.16, d: 1.04 },
  "battery-rack": { w: 0.9, h: 0.7, d: 0.6 },
  inverter: { w: 0.8, h: 1.7, d: 0.5 },
  gshp: { w: 2.0, h: 1.15, d: 1.2 },
  "heat-pump": { w: 1.1, h: 1.35, d: 0.45 },
  "boiler-condensing": { w: 2.0, h: 2.0, d: 0.6 },
  "light-fixture-led": { w: 0.6, h: 0.06, d: 0.3 },
  // Envelope retrofit variants — authored as drop-in replacements for their
  // baseline counterparts (same unit envelope, same axis conventions).
  "mullion-he": { w: 1, h: 1, d: 1 }, // unit-normalized, length along Y (mullion drop-in)
  "facade-panel-insulated": { w: 1, h: 1, d: 1 }, // unit-normalized (facade-panel drop-in)
  "bas-sensor": { w: 0.2, h: 0.09, d: 0.2 },
  "ddc-panel": { w: 0.6, h: 0.8, d: 0.2 },
  "bas-headend": { w: 0.66, h: 2.0, d: 0.84 },
  column: { w: 1, h: 1, d: 1 }, // unit-normalized (BoxGeometry(1,1,1) drop-in)
  beam: { w: 1, h: 1, d: 1 }, // unit-normalized, length along X
  mullion: { w: 1, h: 1, d: 1 }, // unit-normalized, length along Y
  "facade-panel": { w: 1, h: 1, d: 1 }, // unit-normalized
  "cable-tray": { w: 0.45, h: 1.0, d: 0.17 }, // fixed 1 m module, length along Y
  "roof-furniture": { w: 4.9, h: 2.4, d: 3.4 },
  // Safety / fire-protection kit — authored Blender Z-up; native dims below
  // are the three.js axes (w=X, h=Y-up, d=Z) after the Blender→three.js swap.
  "sprinkler-head": { w: 0.06, h: 0.10, d: 0.06 },
  "smoke-detector": { w: 0.13, h: 0.045, d: 0.13 },
  "exit-sign": { w: 0.36, h: 0.20, d: 0.06 },
  "fire-extinguisher": { w: 0.22, h: 0.60, d: 0.18 },
  "hydrant-cabinet": { w: 0.70, h: 1.30, d: 0.22 },
  // Transport / elevator kit — native dims from verified glTF bounds
  // (three.js axes: w=X, h=Y-up, d=Z).
  "elevator-cab": { w: 1.4, h: 2.2, d: 1.5 },
  "elevator-counterweight": { w: 0.3, h: 1.3, d: 0.45 },
  "hoist-machine": { w: 1.2, h: 1.0, d: 0.8 },
  "landing-door": { w: 1.1, h: 2.1, d: 0.12 },
  // Telecom / media kit — native dims from verified glTF bounds
  // (three.js axes: w=X, h=Y-up, d=Z).
  "comm-rack": { w: 0.6, h: 2.0, d: 0.8 },
  "wifi-ap": { w: 0.18, h: 0.045, d: 0.18 },
  "cctv-camera": { w: 0.14, h: 0.16, d: 0.14 },
  "antenna-mast": { w: 1.0, h: 2.6, d: 1.0 },
  "gas-valve-station": { w: 0.2, h: 0.15, d: 0.12 },
  // Waste & recovery kit (three.js axes: w=X, h=Y-up, d=Z).
  // wheelie-bin uses a BASE origin (y ∈ [0, h]) — consumers replacing a
  // centre-origin primitive must translate the clone down by half its height.
  "wheelie-bin": { w: 0.58, h: 1.07, d: 0.74 }, // nominal body; measured bounds 0.61 × 1.05 × 0.80 are wider/deeper from the lid lip + wheels, and slightly shorter than nominal height
  "waste-chute-module": { w: 1, h: 1, d: 1 }, // unit-normalized shell, axis along Y; flange collars reach ±0.54
  // Gas + water + bathroom kit (authored 2026-07-27 via scripts/blender/
  // gas_water_assets.py — measured export bounds, BASE origin y ∈ [0, h]).
  "gas-meter": { w: 0.24, h: 0.49, d: 0.17 },
  "lpg-tank": { w: 1.05, h: 1.48, d: 0.55 },
  "water-meter": { w: 0.33, h: 0.15, d: 0.11 },
  "bathroom-fixture": { w: 1.4, h: 0.92, d: 0.9 },
  // New site kit — three.js axes after glTF Y-up (w=X, h=Y, d=Z).
  "junction-box": { w: 0.2, h: 0.14, d: 0.14 }, // centre origin, drop-in for BoxGeometry
  "ev-charger": { w: 0.36, h: 1.44, d: 0.28 }, // base origin
  "exhaust-fan": { w: 0.84, h: 0.6, d: 0.84 }, // base origin
  "fire-pump": { w: 1.55, h: 0.78, d: 0.62 }, // base origin
  "emergency-generator": { w: 2.15, h: 1.14, d: 0.95 }, // base origin
  // Envelope kit — three.js axes after glTF Y-up (w=X, h=Y, d=Z).
  "facade-cladding": { w: 1, h: 1, d: 1 }, // unit-normalized, raised face +Z
  "parapet-cap": { w: 1.0, h: 0.07, d: 0.38 }, // base origin, 1 m module
  "balcony-module": { w: 2.4, h: 1.2, d: 1.4 }, // wall-face origin, slab top
  "roof-pergola": { w: 5.4, h: 2.4, d: 3.2 }, // base origin
};

interface CachedAsset {
  /** Template scene — cloned per request, never handed out directly. */
  object: THREE.Group;
  /** All primitives merged into one geometry (world transforms baked). */
  geometry: THREE.BufferGeometry;
  /** First material found in the asset (template). */
  material: THREE.Material | null;
}

const cache = new Map<EquipmentAssetId, CachedAsset>();
let preloadPromise: Promise<boolean> | null = null;
// True only once the AGGREGATE preload has settled with ≥1 asset. The cache
// fills incrementally during preload, so readiness must NOT be derived from
// cache.size alone — a component mounting mid-preload would see a partial
// cache, report ready, and never regenerate when the remaining GLBs land.
let preloadSettled = false;

/** Strip non-shared attributes so mergeGeometries never rejects a mix. */
function normalizeForMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  if (geos.length === 0) return geos;
  let shared = new Set(Object.keys(geos[0].attributes));
  for (const g of geos) {
    shared = new Set(Object.keys(g.attributes).filter((k) => shared.has(k)));
  }
  const anyNonIndexed = geos.some((g) => g.index === null);
  return geos.map((g) => {
    let out = g;
    for (const key of Object.keys(out.attributes)) {
      if (!shared.has(key)) out.deleteAttribute(key);
    }
    out.morphAttributes = {};
    if (anyNonIndexed && out.index !== null) out = out.toNonIndexed();
    return out;
  });
}

/** Merge every mesh in an object into a single world-baked BufferGeometry. */
function mergeObjectGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateWorldMatrix(true, true);
  const geos: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      geos.push(g);
    }
  });
  if (geos.length === 0) return null;
  const merged = mergeGeometries(normalizeForMerge(geos), false);
  geos.forEach((g) => g.dispose());
  return merged;
}

function firstMaterial(root: THREE.Object3D): THREE.Material | null {
  let found: THREE.Material | null = null;
  root.traverse((obj) => {
    if (found) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      found = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    }
  });
  return found;
}

function buildCacheEntry(scene: THREE.Group): CachedAsset | null {
  const geometry = mergeObjectGeometry(scene);
  if (!geometry) return null;
  return { object: scene, geometry, material: firstMaterial(scene) };
}

/**
 * Preload all GLB assets. Safe to call multiple times (single in-flight
 * promise). Resolves true when at least one asset loaded. Always resolves —
 * individual failures are logged and that asset simply falls back to the
 * coarse procedural geometry.
 */
export function preloadEquipmentAssets(): Promise<boolean> {
  if (preloadPromise) return preloadPromise;
  if (typeof window === "undefined") {
    // SSR / node test environment — synchronous fallback path stays active.
    return Promise.resolve(false);
  }
  const loader = new GLTFLoader();
  preloadPromise = Promise.all(
    EQUIPMENT_ASSET_IDS.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${ASSET_BASE_PATH}/${id}.glb`);
        const entry = buildCacheEntry(gltf.scene);
        if (entry) cache.set(id, entry);
        return entry !== null;
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[equipment-assets] failed to load ${id}.glb`, err);
        }
        return false;
      }
    })
  ).then((flags) => {
    const ok = flags.some(Boolean);
    preloadSettled = ok;
    if (!ok) {
      // Total failure (e.g. transient network outage): clear the in-flight
      // promise so a later mount retries instead of negatively caching the
      // failure for the whole session.
      preloadPromise = null;
    }
    return ok;
  });
  return preloadPromise;
}

/** True when the given asset is available for synchronous consumption. */
export function isEquipmentAssetReady(id: EquipmentAssetId): boolean {
  return cache.has(id);
}

/** True once the preload has SETTLED with at least one asset loaded. */
export function areEquipmentAssetsReady(): boolean {
  return preloadSettled && cache.size > 0;
}

/**
 * Deep clone of the asset scene: geometry and materials are cloned so callers
 * may dispose them freely on regeneration without corrupting the template.
 */
export function getEquipmentObjectClone(id: EquipmentAssetId): THREE.Group | null {
  const entry = cache.get(id);
  if (!entry) return null;
  const clone = entry.object.clone(true);
  const materialClones = new Map<THREE.Material, THREE.Material>();
  clone.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => {
        if (!materialClones.has(m)) materialClones.set(m, m.clone());
        return materialClones.get(m)!;
      });
    } else if (mesh.material) {
      const m = mesh.material;
      if (!materialClones.has(m)) materialClones.set(m, m.clone());
      mesh.material = materialClones.get(m)!;
    }
  });
  return clone;
}

/** Clone of the merged single geometry (for InstancedMesh / geometry swaps). */
export function getEquipmentGeometryClone(
  id: EquipmentAssetId
): THREE.BufferGeometry | null {
  const entry = cache.get(id);
  return entry ? entry.geometry.clone() : null;
}

/** Clone of the asset's own material (single-material instanced assets). */
export function getEquipmentMaterialClone(id: EquipmentAssetId): THREE.Material | null {
  const entry = cache.get(id);
  return entry?.material ? entry.material.clone() : null;
}

/**
 * Tag the root and every descendant mesh with the given userData.
 * EquipmentClickHandler reads userData from the raycast-hit mesh directly,
 * so multi-part assets must carry the tag on every child mesh.
 */
export function tagEquipmentObject(
  root: THREE.Object3D,
  userData: Record<string, unknown>,
  options?: { castShadow?: boolean; receiveShadow?: boolean }
): void {
  root.userData = { ...root.userData, ...userData };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.userData = { ...mesh.userData, ...userData };
      if (options?.castShadow !== undefined) mesh.castShadow = options.castShadow;
      if (options?.receiveShadow !== undefined) mesh.receiveShadow = options.receiveShadow;
    }
  });
}

// ---------------------------------------------------------------------------
// Test hooks — vitest runs in node where GLB fetch is unavailable.
// ---------------------------------------------------------------------------

/** Inject a fake asset (tests only). */
export function __injectEquipmentAssetForTest(
  id: EquipmentAssetId,
  object: THREE.Group
): void {
  const entry = buildCacheEntry(object);
  if (entry) {
    cache.set(id, entry);
    preloadSettled = true;
  }
}

/** Clear the cache and preload state (tests only). */
export function __resetEquipmentAssetsForTest(): void {
  cache.clear();
  preloadPromise = null;
  preloadSettled = false;
}
