// src/lib/generative/generate/massing.ts
//
// Parametric massing → footprint polygons.
//
// Output is in METRES and in the existing engine's local XZ convention:
// `[outer, ...holes]`, each ring a closed-by-convention list of `[x, z]` pairs
// centred on the origin, wound counter-clockwise for the outer ring and
// clockwise for holes (earcut's expectation, matching `footprintPolygon` in
// `BuildingRecipe`).
//
// The mm→m conversion happens here and in spec-to-recipe.ts only.

import type { BuildingSpec, MassingStrategy } from "../spec/building-spec";

export type Ring = [number, number][];
/** `[outerRing, ...holeRings]` — the shape of `BuildingRecipe.footprintPolygon`. */
export type Polygon = Ring[];

export interface LevelPlate {
  floorNo: number;
  polygon: Polygon;
  /** Plan area of this plate in m², holes subtracted. */
  areaSqm: number;
}

export interface MassingResult {
  /** The footprint the shared geometry engine renders (the largest plate). */
  primary: Polygon;
  /** Bounding box of `primary`, metres — feeds footprintWidth/Depth. */
  widthM: number;
  depthM: number;
  /** Per-level plates. Differs from `primary` for podium-tower and stepped. */
  plates: LevelPlate[];
  /** True when plates vary by level, so the single-footprint shell is approximate. */
  variesByLevel: boolean;
}

const mmToM = (mm: number) => mm / 1000;

/* ------------------------------------------------------------------ */
/* Ring builders                                                       */
/* ------------------------------------------------------------------ */

/** Axis-aligned rectangle centred on the origin, counter-clockwise. */
export function rectRing(widthM: number, depthM: number): Ring {
  const x = widthM / 2;
  const z = depthM / 2;
  return [
    [-x, -z],
    [x, -z],
    [x, z],
    [-x, z],
  ];
}

/** Rectangular hole — wound clockwise so earcut treats it as a hole. */
function holeRing(widthM: number, depthM: number): Ring {
  return rectRing(widthM, depthM).slice().reverse();
}

/**
 * L-shape: full rectangle with the north-east quadrant removed.
 * `wingDepthM` is the thickness of each arm.
 */
function lShapeRing(widthM: number, depthM: number, wingDepthM: number): Ring {
  const x = widthM / 2;
  const z = depthM / 2;
  const w = clamp(wingDepthM, 3, Math.min(widthM, depthM) - 3);
  return [
    [-x, -z],
    [x, -z],
    [x, -z + w],
    [-x + w, -z + w],
    [-x + w, z],
    [-x, z],
  ];
}

/** U-shape: rectangle with a notch cut from the north edge. */
function uShapeRing(widthM: number, depthM: number, wingDepthM: number): Ring {
  const x = widthM / 2;
  const z = depthM / 2;
  const w = clamp(wingDepthM, 3, Math.min(widthM / 2 - 2, depthM - 3));
  return [
    [-x, -z],
    [x, -z],
    [x, z],
    [x - w, z],
    [x - w, -z + w],
    [-x + w, -z + w],
    [-x + w, z],
    [-x, z],
  ];
}

/** Cross / plus shape with arms of `wingDepthM` thickness. */
function crossRing(widthM: number, depthM: number, wingDepthM: number): Ring {
  const x = widthM / 2;
  const z = depthM / 2;
  const aw = clamp(wingDepthM, 3, widthM - 4) / 2;
  const az = clamp(wingDepthM, 3, depthM - 4) / 2;
  return [
    [-aw, -z],
    [aw, -z],
    [aw, -az],
    [x, -az],
    [x, az],
    [aw, az],
    [aw, z],
    [-aw, z],
    [-aw, az],
    [-x, az],
    [-x, -az],
    [-aw, -az],
  ];
}

/**
 * Twin bar, expressed as a single H-shaped ring joined by a central link.
 * Two genuinely disjoint bars cannot be one outer ring, and the engine's
 * `footprintPolygon` contract is one outer ring plus holes — so the link is
 * structural honesty, not a fudge: the bars are connected at the core.
 */
function twinBarRing(widthM: number, depthM: number, barDepthM: number, gapM: number): Ring {
  const x = widthM / 2;
  const z = depthM / 2;
  const bar = clamp(barDepthM, 3, (depthM - 2) / 2);
  const gap = clamp(gapM, 2, depthM - 2 * bar);
  const linkHalf = Math.max(2, widthM * 0.1);
  const innerZ = gap / 2;

  return [
    [-x, -z],
    [x, -z],
    [x, -z + bar],
    [linkHalf, -z + bar],
    [linkHalf, -innerZ],
    [linkHalf, innerZ],
    [x, innerZ],
    [x, z],
    [-x, z],
    [-x, innerZ],
    [-linkHalf, innerZ],
    [-linkHalf, -innerZ],
    [-linkHalf, -z + bar],
    [-x, -z + bar],
  ];
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/* ------------------------------------------------------------------ */
/* Area                                                                */
/* ------------------------------------------------------------------ */

/** Shoelace area of a ring, absolute value. */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
}

/** Net plan area of a polygon: outer ring minus every hole. */
export function polygonArea(polygon: Polygon): number {
  if (polygon.length === 0) return 0;
  const [outer, ...holes] = polygon;
  return holes.reduce((area, hole) => area - ringArea(hole), ringArea(outer));
}

export function polygonBounds(polygon: Polygon): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const outer = polygon[0] ?? [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/* ------------------------------------------------------------------ */
/* Strategy dispatch                                                   */
/* ------------------------------------------------------------------ */

function ringForStrategy(
  strategy: MassingStrategy,
  widthM: number,
  depthM: number,
  params: BuildingSpec["massing"]["parameters"],
): Ring {
  // Fallbacks are expressed in METRES as a fraction of the plate, so they stay
  // sensible at any building size. `wingDepthMm` from the spec is converted;
  // the fallback is already metric.
  const wingM = params.wingDepthMm !== undefined ? mmToM(params.wingDepthMm) : null;

  switch (strategy) {
    case "l-shape":
      return lShapeRing(widthM, depthM, wingM ?? depthM * 0.4);
    case "u-shape":
      return uShapeRing(widthM, depthM, wingM ?? depthM * 0.35);
    case "cross":
      return crossRing(widthM, depthM, wingM ?? depthM * 0.4);
    case "twin-bar":
      return twinBarRing(
        widthM,
        depthM,
        wingM ?? depthM * 0.35,
        params.gapMm !== undefined ? mmToM(params.gapMm) : depthM * 0.2,
      );
    // rectangle, bar, courtyard, atrium, podium-tower and stepped are all
    // rectangular in outline; the first two differ only in proportion, the
    // rest add a hole or vary per level below.
    default:
      return rectRing(widthM, depthM);
  }
}

function holesForStrategy(
  strategy: MassingStrategy,
  widthM: number,
  depthM: number,
  params: BuildingSpec["massing"]["parameters"],
): Ring[] {
  if (strategy !== "courtyard" && strategy !== "atrium") return [];

  // Keep a habitable ring of floor around the void. Without this clamp a
  // generous void swallows the plate and every room fails to place.
  const maxVoidW = Math.max(2, widthM - 8);
  const maxVoidD = Math.max(2, depthM - 8);
  const voidW = clamp(
    params.voidWidthMm !== undefined ? mmToM(params.voidWidthMm) : widthM * 0.3,
    2,
    maxVoidW,
  );
  const voidD = clamp(
    params.voidDepthMm !== undefined ? mmToM(params.voidDepthMm) : depthM * 0.3,
    2,
    maxVoidD,
  );

  return [holeRing(voidW, voidD)];
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function generateMassing(spec: BuildingSpec): MassingResult {
  const strategy = spec.massing.strategy.value;
  const widthM = mmToM(spec.massing.widthMm.value);
  const depthM = mmToM(spec.massing.depthMm.value);
  const params = spec.massing.parameters;

  const base: Polygon = [
    ringForStrategy(strategy, widthM, depthM, params),
    ...holesForStrategy(strategy, widthM, depthM, params),
  ];

  const floorNos = spec.levels.map((l) => l.floorNo).sort((a, b) => a - b);
  let plates: LevelPlate[];
  let variesByLevel = false;

  if (strategy === "podium-tower") {
    const podiumLevels = params.podiumLevels ?? 2;
    const podiumW = mmToM(params.podiumWidthMm ?? spec.massing.widthMm.value);
    const podiumD = mmToM(params.podiumDepthMm ?? spec.massing.depthMm.value);
    // The tower sits inside the podium; never larger than it.
    const towerW = Math.min(widthM, podiumW * 0.62);
    const towerD = Math.min(depthM, podiumD * 0.62);

    variesByLevel = true;
    plates = floorNos.map((floorNo) => {
      const isPodium = floorNo <= podiumLevels;
      const polygon: Polygon = isPodium
        ? [rectRing(podiumW, podiumD)]
        : [rectRing(towerW, towerD)];
      return { floorNo, polygon, areaSqm: polygonArea(polygon) };
    });
  } else if (strategy === "stepped") {
    const setbackM = mmToM(params.setbackMm ?? 3_000);
    const every = params.setbackEveryLevels ?? 3;

    variesByLevel = true;
    plates = floorNos.map((floorNo) => {
      const steps = floorNo > 0 ? Math.floor((floorNo - 1) / every) : 0;
      // Never step past a usable plate.
      const w = Math.max(widthM * 0.4, widthM - steps * setbackM * 2);
      const d = Math.max(depthM * 0.4, depthM - steps * setbackM * 2);
      const polygon: Polygon = [rectRing(w, d)];
      return { floorNo, polygon, areaSqm: polygonArea(polygon) };
    });
  } else {
    plates = floorNos.map((floorNo) => ({
      floorNo,
      polygon: base,
      areaSqm: polygonArea(base),
    }));
  }

  // The shared geometry engine carries a single footprint, so the shell is
  // built from the LARGEST plate. Per-level plates stay authoritative for
  // slabs, rooms and areas; `variesByLevel` tells validation to flag the
  // difference rather than let it pass silently.
  const primaryPlate = plates.reduce(
    (largest, plate) => (plate.areaSqm > largest.areaSqm ? plate : largest),
    plates[0] ?? { floorNo: 1, polygon: base, areaSqm: polygonArea(base) },
  );
  const bounds = polygonBounds(primaryPlate.polygon);

  return {
    primary: primaryPlate.polygon,
    widthM: bounds.maxX - bounds.minX,
    depthM: bounds.maxZ - bounds.minZ,
    plates,
    variesByLevel,
  };
}
