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
  // Structural kit
  | "column"
  | "beam"
  | "mullion"
  | "facade-panel"
  | "cable-tray"
  | "roof-furniture";

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
  "column",
  "beam",
  "mullion",
  "facade-panel",
  "cable-tray",
  "roof-furniture",
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
  column: { w: 1, h: 1, d: 1 }, // unit-normalized (BoxGeometry(1,1,1) drop-in)
  beam: { w: 1, h: 1, d: 1 }, // unit-normalized, length along X
  mullion: { w: 1, h: 1, d: 1 }, // unit-normalized, length along Y
  "facade-panel": { w: 1, h: 1, d: 1 }, // unit-normalized
  "cable-tray": { w: 0.45, h: 1.0, d: 0.17 }, // fixed 1 m module, length along Y
  "roof-furniture": { w: 4.9, h: 2.4, d: 3.4 },
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
