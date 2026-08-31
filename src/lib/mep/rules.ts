// src/lib/mep/rules.ts
//
// Engineering rules and catalogs for MEP generation. Every constant cites a
// rule id from docs/05_Research/MEP Design Practice Research.md, where each
// rule is classified universal (U) / heuristic (H) / code-indicative (C) /
// manufacturer (M). Values here are engineering-practice bands, not certified
// code calculations — the model labels its outputs accordingly.

import type { HvacArchetype, MepBasis } from "./types";

// ---------------------------------------------------------------------------
// Size catalogs (rule A2, W1, E2). Metres. Snapping to a catalog is what
// keeps geometry instanceable: a building yields a handful of distinct sizes.

/** Round duct preferred series (ISO/EN, common KR) — rule A2. */
export const ROUND_DUCT_DIAMETERS_M = [0.1, 0.125, 0.16, 0.2, 0.25, 0.315, 0.4, 0.5, 0.63, 0.8, 1.0];

/** Rectangular duct sides step in 50 mm, aspect ≤ 4:1 — rule A2 (SMACNA practice). */
export const RECT_DUCT_STEP_M = 0.05;
export const RECT_DUCT_MAX_ASPECT = 4;

/** Nominal pipe diameters (DN, metres) — rule W1. */
export const PIPE_DN_M = [0.015, 0.02, 0.025, 0.032, 0.04, 0.05, 0.065, 0.08, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3];

/** Cable tray widths — rule E2. */
export const TRAY_WIDTHS_M = [0.15, 0.3, 0.45, 0.6];
export const TRAY_HEIGHT_M = 0.1;

/** Design air velocities m/s by role — rule A1 (ASHRAE Fundamentals band). */
export const AIR_VELOCITY = { main: 6.5, branch: 4.5, runout: 2.5 } as const;

/** Design water velocities m/s by role — rule W1. */
export const WATER_VELOCITY = { main: 1.8, branch: 1.0, runout: 0.8 } as const;

/** Sprinkler pipe schedule, heads-served → DN (m) — rule F3 (NFPA 13 light hazard, indicative). */
export const SPRINKLER_SCHEDULE: { maxHeads: number; dn: number }[] = [
  { maxHeads: 2, dn: 0.025 },
  { maxHeads: 3, dn: 0.032 },
  { maxHeads: 5, dn: 0.04 },
  { maxHeads: 10, dn: 0.05 },
  { maxHeads: 30, dn: 0.065 },
  { maxHeads: 60, dn: 0.08 },
  { maxHeads: Infinity, dn: 0.1 },
];

/** Sanitary drainage sizing by fixture units — rule P4 (Hunter, simplified). */
export const DRAIN_SCHEDULE: { maxFu: number; dn: number }[] = [
  { maxFu: 6, dn: 0.05 },
  { maxFu: 20, dn: 0.08 },
  { maxFu: 160, dn: 0.1 },
  { maxFu: Infinity, dn: 0.15 },
];

/** Gravity drainage slope by DN — rule P1 (1–2 % band). */
export function drainSlope(dn: number): number {
  return dn <= 0.08 ? 0.02 : 0.01;
}

// ---------------------------------------------------------------------------
// Demand heuristics. All ESTIMATED unless real inputs exist.

/** Supply air per conditioned m² — rule A3 (≈1.5 L/s·m² ⇒ 5.4 m³/h·m²). */
export const SUPPLY_AIR_M3H_PER_SQM = 5.4;

/** Sensible cooling / heating design loads W/m² by use family — rules A3/W3 (H). */
export const DESIGN_LOADS_W_PER_SQM = {
  office: { cooling: 95, heating: 70 },
  residential: { cooling: 60, heating: 55 },
  retail: { cooling: 120, heating: 65 },
  default: { cooling: 90, heating: 65 },
} as const;

/** Electrical demand VA/m² — rule E3 (H). */
export const ELECTRICAL_VA_PER_SQM = { lighting: 12, power: 25 } as const;

/** Chilled/heating water flow per kW — rule W3: Q = P/(ρ·cp·ΔT). */
export const CHW_LPS_PER_KW = 0.048; // ΔT ≈ 5 K
export const HW_LPS_PER_KW = 0.024; // ΔT ≈ 10 K

/** Terminal zone target area (one diffuser per zone) — rule A5. */
export const ZONE_TARGET_AREA_SQM = 42;

/** Sprinkler head coverage/spacing — rule F1 (C, indicative). */
export const SPRINKLER_SPACING_M = 3.6;
export const SPRINKLER_WALL_MIN_M = 1.2;

/** Fixture units per wet zone (restroom group ≈ WC+lav+drain) — rule P4. */
export const WET_ZONE_FIXTURE_UNITS = { restroom: 8, kitchen: 4 } as const;

// ---------------------------------------------------------------------------
// Ceiling service bands — rule Z1. Offsets are fractions of the available
// service depth below the slab soffit, so the stack compresses on low floors
// instead of punching through the ceiling.

export interface ServiceBands {
  /** Depth of the ceiling service void, metres. */
  depth: number;
  /** Y offsets below the soffit (positive numbers, subtract from soffit). */
  drain: number;
  ductSupply: number;
  ductReturn: number;
  tray: number;
  conduit: number;
  sprinkler: number;
  water: number;
  /** Ceiling plane offset below soffit (terminals mount here). */
  ceiling: number;
}

/**
 * Rule Z1: the coordinated vertical stack under the slab. Drainage highest
 * (slope-locked), supply ducts tight to the slab, return/OA ducts below,
 * then tray, conduit, sprinkler branches, water piping just above the
 * ceiling. Fractions are of the available service depth so the whole stack
 * compresses on low floors instead of punching through the ceiling. The
 * spans were coordinated against the element half-sizes the catalogs can
 * emit (duct height ≤ 0.25, ceiling water mains ≤ DN50, tray 0.1 high).
 */
export function serviceBands(floorHeightM: number): ServiceBands {
  const depth = Math.min(1.0, Math.max(0.55, floorHeightM - 2.45));
  return {
    depth,
    drain: 0.1 * depth,
    ductSupply: 0.33 * depth,
    ductReturn: 0.59 * depth,
    tray: 0.77 * depth,
    conduit: 0.845 * depth,
    sprinkler: 0.895 * depth,
    water: 0.955 * depth,
    ceiling: depth,
  };
}

/**
 * Plan channel offsets (metres, perpendicular to the corridor spine) so
 * systems sharing the corridor never overlap in plan — rule Z4/Z5.
 * Signed: negative = core side of the spine. Systems that share an
 * elevation band always get distinct channels AND distinct branch-line
 * offsets, and their branch runs dip up at the other systems' main lines
 * (deterministic crossing coordination, §15/§28).
 */
export const SPINE_CHANNELS = {
  supplyDuct: 0,
  returnDuct: 0.95,
  outdoorAirDuct: -0.85,
  tray: 1.6,
  conduitLighting: 1.72,
  conduitPower: 1.88,
  chwSupply: -1.5,
  chwReturn: -1.32,
  hwSupply: -2.0,
  hwReturn: -1.82,
  refrigerant: -2.0,
  sprinklerMain: -2.5,
} as const;

/**
 * Water-band main lines (relative z channels) that other water-band branch
 * runs must dip at when crossing. Archetype-dependent subsets are selected
 * by the planners.
 */
export const WATER_BAND_CHANNELS: Record<string, number> = {
  chws: SPINE_CHANNELS.chwSupply,
  chwr: SPINE_CHANNELS.chwReturn,
  hws: SPINE_CHANNELS.hwSupply,
  hwr: SPINE_CHANNELS.hwReturn,
  ref: SPINE_CHANNELS.refrigerant,
};

// ---------------------------------------------------------------------------
// Archetype selection — rule KR-10 table (use × era).

export interface ArchetypeChoice {
  archetype: HvacArchetype;
  ruleId: string;
  basis: MepBasis;
  reason: string;
}

/** Use-code families (건축물대장 주용도코드 prefixes, korean-building-codes.ts). */
export function buildingUseFamily(mainPurpsCd: string): "office" | "residential" | "retail" | "default" {
  // 02xxx 공동주택 / 01xxx 단독주택 → residential; 14xxx 업무시설 → office;
  // 03/04xxx 근린생활, 07xxx 판매 → retail.
  const p2 = mainPurpsCd.slice(0, 2);
  if (p2 === "01" || p2 === "02") return "residential";
  if (p2 === "14") return "office";
  if (p2 === "03" || p2 === "04" || p2 === "07") return "retail";
  return "default";
}

export function chooseArchetype(mainPurpsCd: string, eraStartYear: number): ArchetypeChoice {
  const family = buildingUseFamily(mainPurpsCd);
  if (family === "residential") {
    return {
      archetype: "residential-hydronic",
      ruleId: "KR-10",
      basis: "estimated",
      reason: "공동주택/단독주택: 바닥난방 + 개별 환기 관행",
    };
  }
  if (family === "retail") {
    return {
      archetype: "packaged",
      ruleId: "KR-10",
      basis: "estimated",
      reason: "근린생활/판매시설: 패키지 공조 관행",
    };
  }
  if (eraStartYear >= 2000) {
    return {
      archetype: "vrf",
      ruleId: "KR-10",
      basis: "estimated",
      reason: "2000년 이후 업무시설: 시스템에어컨(VRF) + 환기유닛 관행",
    };
  }
  return {
    archetype: "central-ahu",
    ruleId: "KR-10",
    basis: "estimated",
    reason: "2000년 이전 업무시설: 중앙 AHU + 보일러/냉동기 관행",
  };
}

// ---------------------------------------------------------------------------
// Sizing helpers (pure).

function snapUp(value: number, catalog: readonly number[]): number {
  for (const c of catalog) if (c >= value - 1e-9) return c;
  return catalog[catalog.length - 1];
}

/**
 * Rule A1: rect duct from airflow (m³/h) at role velocity. Returns metres.
 * Horizontal ceiling ducts cap at 0.25 m height so the coordinated band
 * stack in serviceBands() holds; vertical shaft risers may go square.
 */
export function sizeRectDuct(
  flowM3h: number,
  role: "main" | "branch" | "runout",
  orientation: "horizontal" | "riser" = "horizontal",
): { widthM: number; heightM: number } {
  const v = AIR_VELOCITY[role];
  const areaM2 = Math.max(flowM3h, 60) / 3600 / v;
  if (orientation === "riser") {
    const side = Math.max(0.2, Math.ceil(Math.sqrt(areaM2) / RECT_DUCT_STEP_M) * RECT_DUCT_STEP_M);
    return { widthM: side, heightM: side };
  }
  const maxH = 0.25;
  let heightM = Math.min(maxH, Math.max(0.15, Math.sqrt(areaM2 / 2)));
  heightM = Math.max(0.15, Math.round(heightM / RECT_DUCT_STEP_M) * RECT_DUCT_STEP_M);
  let widthM = areaM2 / heightM;
  widthM = Math.max(heightM, Math.ceil(widthM / RECT_DUCT_STEP_M) * RECT_DUCT_STEP_M);
  if (widthM / heightM > RECT_DUCT_MAX_ASPECT) {
    heightM = Math.min(maxH, Math.ceil(widthM / RECT_DUCT_MAX_ASPECT / RECT_DUCT_STEP_M) * RECT_DUCT_STEP_M);
    widthM = Math.min(widthM, heightM * RECT_DUCT_MAX_ASPECT);
  }
  return { widthM, heightM };
}

/** Rule A1: round duct (runouts) from airflow. */
export function sizeRoundDuct(flowM3h: number, role: "branch" | "runout"): number {
  const v = AIR_VELOCITY[role];
  const areaM2 = Math.max(flowM3h, 40) / 3600 / v;
  const d = 2 * Math.sqrt(areaM2 / Math.PI);
  return snapUp(d, ROUND_DUCT_DIAMETERS_M);
}

/** Rule W1: pipe DN from flow (L/s) at role velocity. */
export function sizePipe(flowLps: number, role: "main" | "branch" | "runout"): number {
  const v = WATER_VELOCITY[role];
  const areaM2 = Math.max(flowLps, 0.05) / 1000 / v;
  const d = 2 * Math.sqrt(areaM2 / Math.PI);
  return snapUp(d, PIPE_DN_M);
}

/** Rule F3: sprinkler branch DN from heads served downstream. */
export function sizeSprinklerPipe(headsServed: number): number {
  for (const row of SPRINKLER_SCHEDULE) if (headsServed <= row.maxHeads) return row.dn;
  return 0.1;
}

/** Rule P4: drainage DN from fixture units. */
export function sizeDrainPipe(fixtureUnits: number): number {
  for (const row of DRAIN_SCHEDULE) if (fixtureUnits <= row.maxFu) return row.dn;
  return 0.15;
}

/** Rule E2: tray width from downstream circuit VA (coarse demand proxy). */
export function sizeTray(loadVa: number): number {
  if (loadVa < 40_000) return TRAY_WIDTHS_M[0];
  if (loadVa < 120_000) return TRAY_WIDTHS_M[1];
  if (loadVa < 300_000) return TRAY_WIDTHS_M[2];
  return TRAY_WIDTHS_M[3];
}
