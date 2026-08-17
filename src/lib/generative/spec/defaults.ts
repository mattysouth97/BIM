// src/lib/generative/spec/defaults.ts
//
// Architectural standards library. Two jobs:
//
//   1. Ground the reasoning layer. These numbers go into Claude's system prompt
//      as a reference table, so "a 5-storey office" lands on 3900mm floor-to-
//      floor and an 8400mm bay rather than something arbitrary.
//   2. Back the deterministic heuristic provider, which must produce a complete,
//      coherent BuildingSpec with no network call at all (CI, offline, and the
//      fallback when the API errors).
//
// All linear dimensions are millimetres. Areas are m².
//
// These are ordinary professional defaults, not code compliance. Nothing here
// entitles the app to claim a building is PERMIT COMPLIANT or CODE COMPLIANT
// (brief §10) — see `src/lib/generative/spec/status.ts`.

import type { BuildingUse, SpaceType } from "./building-spec";

export interface UseProfile {
  /** Typical floor-to-floor for a normal occupied storey. */
  floorToFloorMm: number;
  /** Ground/lobby storeys are taller. */
  groundFloorToFloorMm: number;
  /** Mechanical storeys are taller still. */
  mechanicalFloorToFloorMm: number;
  /** Square-ish structural bay. */
  gridMm: number;
  /** Net-to-gross efficiency used to size the footprint from a target area. */
  efficiency: number;
  /** Fraction of the floor plate the core consumes. */
  coreRatio: number;
  /** Target circulation as a fraction of net area. */
  circulationRatio: number;
  /** Default plan aspect ratio (width ÷ depth). */
  plateAspect: number;
  /** Maximum sensible distance from core to facade (drives plate depth). */
  maxLeaseDepthMm: number;
  structuralSystem: "rc-frame" | "steel-frame" | "bearing-wall" | "hybrid";
  defaultGlazingRatio: number;
}

/**
 * Per-use profiles. Sources are ordinary practice ranges: office 3.9m f2f and
 * 8.4m bays, residential 2.9m f2f on a shorter 6m bay with bearing walls,
 * industrial tall and long-span, labs deep-plan with heavy services.
 */
export const USE_PROFILES: Record<BuildingUse, UseProfile> = {
  office: {
    floorToFloorMm: 3_900,
    groundFloorToFloorMm: 4_800,
    mechanicalFloorToFloorMm: 4_500,
    gridMm: 8_400,
    efficiency: 0.82,
    coreRatio: 0.14,
    circulationRatio: 0.16,
    plateAspect: 1.5,
    maxLeaseDepthMm: 18_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.45,
  },
  residential: {
    floorToFloorMm: 2_900,
    groundFloorToFloorMm: 3_600,
    mechanicalFloorToFloorMm: 3_200,
    gridMm: 6_000,
    efficiency: 0.78,
    coreRatio: 0.12,
    circulationRatio: 0.14,
    plateAspect: 1.8,
    maxLeaseDepthMm: 14_000,
    structuralSystem: "bearing-wall",
    defaultGlazingRatio: 0.3,
  },
  retail: {
    floorToFloorMm: 4_500,
    groundFloorToFloorMm: 5_400,
    mechanicalFloorToFloorMm: 4_500,
    gridMm: 9_000,
    efficiency: 0.85,
    coreRatio: 0.1,
    circulationRatio: 0.2,
    plateAspect: 1.4,
    maxLeaseDepthMm: 24_000,
    structuralSystem: "steel-frame",
    defaultGlazingRatio: 0.55,
  },
  research: {
    floorToFloorMm: 4_500,
    groundFloorToFloorMm: 5_000,
    mechanicalFloorToFloorMm: 5_000,
    gridMm: 9_600,
    efficiency: 0.72,
    coreRatio: 0.18,
    circulationRatio: 0.2,
    plateAspect: 1.6,
    maxLeaseDepthMm: 20_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.35,
  },
  education: {
    floorToFloorMm: 4_000,
    groundFloorToFloorMm: 4_500,
    mechanicalFloorToFloorMm: 4_200,
    gridMm: 8_100,
    efficiency: 0.75,
    coreRatio: 0.12,
    circulationRatio: 0.22,
    plateAspect: 1.9,
    maxLeaseDepthMm: 18_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.4,
  },
  industrial: {
    floorToFloorMm: 7_000,
    groundFloorToFloorMm: 7_000,
    mechanicalFloorToFloorMm: 5_000,
    gridMm: 12_000,
    efficiency: 0.9,
    coreRatio: 0.06,
    circulationRatio: 0.1,
    plateAspect: 1.6,
    maxLeaseDepthMm: 40_000,
    structuralSystem: "steel-frame",
    defaultGlazingRatio: 0.15,
  },
  healthcare: {
    floorToFloorMm: 4_200,
    groundFloorToFloorMm: 4_800,
    mechanicalFloorToFloorMm: 4_800,
    gridMm: 7_800,
    efficiency: 0.7,
    coreRatio: 0.16,
    circulationRatio: 0.26,
    plateAspect: 1.5,
    maxLeaseDepthMm: 18_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.35,
  },
  hospitality: {
    floorToFloorMm: 3_200,
    groundFloorToFloorMm: 4_800,
    mechanicalFloorToFloorMm: 3_600,
    gridMm: 7_200,
    efficiency: 0.74,
    coreRatio: 0.13,
    circulationRatio: 0.18,
    plateAspect: 2.0,
    maxLeaseDepthMm: 15_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.35,
  },
  civic: {
    floorToFloorMm: 4_200,
    groundFloorToFloorMm: 5_400,
    mechanicalFloorToFloorMm: 4_500,
    gridMm: 8_400,
    efficiency: 0.76,
    coreRatio: 0.14,
    circulationRatio: 0.22,
    plateAspect: 1.4,
    maxLeaseDepthMm: 18_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.4,
  },
  "mixed-use": {
    floorToFloorMm: 3_900,
    groundFloorToFloorMm: 5_100,
    mechanicalFloorToFloorMm: 4_500,
    gridMm: 8_400,
    efficiency: 0.78,
    coreRatio: 0.15,
    circulationRatio: 0.18,
    plateAspect: 1.5,
    maxLeaseDepthMm: 18_000,
    structuralSystem: "rc-frame",
    defaultGlazingRatio: 0.45,
  },
};

/** Dimensional standards shared by every use. */
export const DIMENSION_DEFAULTS = {
  exteriorWallMm: 250,
  interiorWallMm: 125,
  doorWidthMm: 900,
  doorHeightMm: 2_100,
  corridorWidthMm: 1_800,
  slabThicknessMm: 200,
  parapetMm: 1_100,
  spandrelMm: 900,
  sillHeightMm: 900,
  headHeightMm: 2_400,
  facadeModuleMm: 1_500,
  ceilingPlenumMm: 750,
} as const;

/** Minimum sensible areas per space type, m². Used by the solver and validator. */
export const MIN_AREA_SQM: Record<SpaceType, number> = {
  "office-open": 20,
  "office-cellular": 9,
  meeting: 12,
  lobby: 20,
  reception: 8,
  corridor: 6,
  restroom: 6,
  pantry: 6,
  storage: 3,
  mechanical: 10,
  electrical: 6,
  laboratory: 20,
  classroom: 30,
  retail: 20,
  "residential-unit": 25,
  atrium: 30,
  circulation: 6,
  service: 4,
};

/** Preferred plan proportion per space type (long ÷ short). */
export const PREFERRED_ASPECT: Record<SpaceType, number> = {
  "office-open": 1.5,
  "office-cellular": 1.3,
  meeting: 1.4,
  lobby: 1.6,
  reception: 1.4,
  corridor: 5.0,
  restroom: 1.6,
  pantry: 1.3,
  storage: 1.5,
  mechanical: 1.5,
  electrical: 1.4,
  laboratory: 1.6,
  classroom: 1.4,
  retail: 1.5,
  "residential-unit": 1.7,
  atrium: 1.2,
  circulation: 3.0,
  service: 1.4,
};

/**
 * Elevator count. One car per ~5,000 m² of served area is a common early rule
 * of thumb; low-rise buildings still get one.
 */
export function recommendElevators(grossAreaSqm: number, floors: number): number {
  if (floors <= 1) return 0;
  if (floors <= 3 && grossAreaSqm < 2_000) return 1;
  return Math.max(1, Math.min(12, Math.ceil(grossAreaSqm / 5_000)));
}

/** Two egress stairs once a building is multi-storey or large-plate. */
export function recommendStairs(grossAreaSqm: number, floors: number): number {
  if (floors <= 1 && grossAreaSqm < 500) return 1;
  if (grossAreaSqm > 20_000) return 3;
  return 2;
}

/**
 * Size a rectangular plate from a target gross area, snapped to the structural
 * grid so bays land whole. Depth is capped by `maxLeaseDepthMm` so the plan
 * stays daylight-reasonable rather than a deep blind box.
 */
export function plateFromArea(input: {
  grossAreaSqm: number;
  floors: number;
  profile: UseProfile;
}): { widthMm: number; depthMm: number } {
  const { grossAreaSqm, floors, profile } = input;
  const perFloorSqm = Math.max(60, grossAreaSqm / Math.max(1, floors));

  // area = w × d, w = aspect × d  ⇒  d = sqrt(area / aspect)
  let depthM = Math.sqrt(perFloorSqm / profile.plateAspect);
  let widthM = perFloorSqm / depthM;

  const maxDepthM = profile.maxLeaseDepthMm / 1000;
  if (depthM > maxDepthM) {
    depthM = maxDepthM;
    widthM = perFloorSqm / depthM;
  }

  const gridM = profile.gridMm / 1000;
  const snap = (m: number) => Math.max(gridM, Math.round(m / gridM) * gridM);

  return {
    widthMm: Math.round(snap(widthM) * 1000),
    depthMm: Math.round(snap(depthM) * 1000),
  };
}

/** Core footprint sized off the plate, snapped to grid, with sane bounds. */
export function coreFromPlate(input: {
  plateWidthMm: number;
  plateDepthMm: number;
  profile: UseProfile;
}): { widthMm: number; depthMm: number } {
  const plateAreaSqm = (input.plateWidthMm / 1000) * (input.plateDepthMm / 1000);
  const targetSqm = plateAreaSqm * input.profile.coreRatio;
  const sideM = Math.sqrt(Math.max(9, targetSqm));

  // Keep the core inside the plate with a usable ring around it.
  const maxWidthM = (input.plateWidthMm / 1000) * 0.5;
  const maxDepthM = (input.plateDepthMm / 1000) * 0.5;

  return {
    widthMm: Math.round(Math.min(sideM, maxWidthM) * 1000),
    depthMm: Math.round(Math.min(sideM * 0.8, maxDepthM) * 1000),
  };
}

/** Column section grows with span and the load above it. */
export function columnSizeMm(gridMm: number, floorsAbove: number): number {
  const spanM = gridMm / 1000;
  const base = 300 + (spanM - 6) * 30;
  const load = floorsAbove * 12;
  return Math.round(Math.max(300, Math.min(1_200, base + load)) / 50) * 50;
}

/** Common early-stage beam-depth rule: roughly span/12 for RC. */
export function beamDepthMm(gridMm: number): number {
  return Math.round(Math.max(300, Math.min(1_200, gridMm / 12)) / 50) * 50;
}

/** Slab thickness from the governing span. */
export function slabThicknessMm(gridMm: number): number {
  return Math.round(Math.max(150, Math.min(450, gridMm / 30)) / 10) * 10;
}

/**
 * Reference table injected into the reasoning system prompt. Compact on
 * purpose — it grounds the model without spending the context budget.
 */
export function defaultsReferenceTable(): string {
  const rows = (Object.keys(USE_PROFILES) as BuildingUse[]).map((use) => {
    const p = USE_PROFILES[use];
    return `${use.padEnd(16)} f2f=${p.floorToFloorMm} ground=${p.groundFloorToFloorMm} grid=${p.gridMm} eff=${p.efficiency} core=${p.coreRatio} circ=${p.circulationRatio} maxDepth=${p.maxLeaseDepthMm} sys=${p.structuralSystem} glaz=${p.defaultGlazingRatio}`;
  });
  return [
    "TYPICAL VALUES BY USE (millimetres unless noted):",
    ...rows,
    "",
    "SHARED DIMENSIONAL STANDARDS:",
    `exteriorWall=${DIMENSION_DEFAULTS.exteriorWallMm} interiorWall=${DIMENSION_DEFAULTS.interiorWallMm} door=${DIMENSION_DEFAULTS.doorWidthMm}x${DIMENSION_DEFAULTS.doorHeightMm} corridor=${DIMENSION_DEFAULTS.corridorWidthMm} slab=${DIMENSION_DEFAULTS.slabThicknessMm} parapet=${DIMENSION_DEFAULTS.parapetMm} sill=${DIMENSION_DEFAULTS.sillHeightMm} head=${DIMENSION_DEFAULTS.headHeightMm} module=${DIMENSION_DEFAULTS.facadeModuleMm}`,
  ].join("\n");
}
