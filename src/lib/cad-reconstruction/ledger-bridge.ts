// src/lib/cad-reconstruction/ledger-bridge.ts
//
// P2-29 — the bridge between the app's 건축물대장 data and the reconstruction,
// in both directions.
//
//   register + VWorld  →  evidenceFromLedger  →  reconstructModel
//                                                      │
//                          twinGeometryFromModel  ◄────┴────►  ledgerRingFromModel
//                          (3D twin recipe)                    (traceable engine)
//
// Before this module the app derived a building shape three separate times —
// the twin from a GIS bbox or a 1.5:1 rectangle, the traceable engine from its
// own 1.5:1 rectangle, and the reconstruction from the register's per-floor
// areas — and only the third read 층별개요. This makes the reconstruction the
// one producer and the other two its consumers.
//
// Grades are carried, never improved. A ring solved from 건축면적 stays an
// inference here exactly as it is inside the model; `observed` is the flag the
// callers must branch on, and it is read off the model's own grade rather than
// off the fact that a ring exists.
//
// Units: the model is millimetres in a site-centred frame with X = east and
// Y = north. Everything this module returns is metres in the twin's local
// [x, z] frame — the same axes `createSceneProjection` produces — re-centred on
// the footprint's bounding box so the stack shares one origin with the viewer's
// roof box and column grid.

import { createSceneProjection } from "@/lib/gis/gis-transform";
import type {
  BrAreaInfo,
  BrFloorInfo,
  BrRecapTitleInfo,
  BrTitleInfo,
} from "@/lib/types";

import { areaSqm, bbox } from "./geometry";
import { reconstruct } from "./reconstruct";
import type {
  EvidenceGrade,
  EvidenceInput,
  GisFootprintInput,
  ReconstructionModel,
  RingMm,
} from "./types";

/* ------------------------------------------------------------------ */
/* Register → evidence                                                 */
/* ------------------------------------------------------------------ */

export interface LedgerEvidenceInput {
  buildingPk: string;
  title: BrTitleInfo | null;
  recap?: BrRecapTitleInfo | null;
  floors?: readonly BrFloorInfo[];
  areas?: readonly BrAreaInfo[];
  gis?: GisFootprintInput | null;
  address?: string | null;
  /** Injected so a reconstruction is reproducible in tests and reports. */
  now?: string;
}

/**
 * Build the reconstruction's evidence input from what the app already fetched.
 *
 * `claims` is always empty: this is the automatic path, and a claim is
 * something a user said. The prompt module keeps its own entry point, and a
 * building that has one simply reconstructs again with those claims attached.
 */
export function evidenceFromLedger(input: LedgerEvidenceInput): EvidenceInput {
  return {
    buildingPk: input.buildingPk,
    title: input.title,
    recap: input.recap ?? null,
    floors: [...(input.floors ?? [])],
    areas: [...(input.areas ?? [])],
    gis: input.gis ?? null,
    address: input.address ?? null,
    claims: [],
    ...(input.now ? { now: input.now } : {}),
  };
}

/**
 * Run the reconstruction and return only the model.
 *
 * `runReconstruction` in `index.ts` additionally writes a DXF, runs QA and
 * renders eight documents. The twin and the energy engine need none of that,
 * and doing it on every building selection would be pure waste.
 */
export function reconstructModel(input: EvidenceInput): ReconstructionModel {
  return reconstruct(input, {
    project: (originLng, originLat) => {
      const projection = createSceneProjection(originLng, originLat);
      return (lng: number, lat: number) => projection.project(lng, lat);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Model → twin                                                        */
/* ------------------------------------------------------------------ */

/** Local metres in the twin frame: x = east, z = north. */
export type PointM = [number, number];
export type RingM = PointM[];

export interface TwinLevel {
  id: string;
  label: string;
  floorNo: number;
  below: boolean;
  /** `[outer, ...holes]` in local metres. The reconstruction models no holes. */
  plate: RingM[];
  planAreaSqm: number;
  /** Height of this level's floor above ±0.000, metres (negative below grade). */
  elevationM: number;
  heightM: number;
  registeredAreaSqm: number | null;
  registeredUse: string | null;
  grade: EvidenceGrade;
}

export interface TwinGeometry {
  /** `[outer, ...holes]` in local metres, centred on the outer ring's bbox. */
  footprintPolygon: RingM[];
  footprintAreaSqm: number;
  footprintWidthM: number;
  footprintDepthM: number;
  levels: readonly TwinLevel[];
  /** Top of the highest above-grade level, metres above ±0.000. */
  totalHeightM: number;
  grade: EvidenceGrade;
  /**
   * True only when the outline was traced or measured. A ring solved from
   * 건축면적 is a shape the pipeline invented to satisfy a stated area, and
   * must not raise the twin's stated precision (ADR-003).
   */
  observed: boolean;
}

function isObserved(grade: EvidenceGrade): boolean {
  return grade === "A-VERIFIED" || grade === "B-OBSERVED";
}

function ringToMetres(ring: RingMm, dxMm: number, dyMm: number): RingM {
  return ring.map(([x, y]) => [
    Math.round(x - dxMm) / 1000,
    Math.round(y - dyMm) / 1000,
  ]);
}

/**
 * The twin's geometry, or `null` when the model could not resolve a footprint.
 *
 * Returning `null` is the point: a blocked model carries a placeholder square
 * so the pipeline stays total, and offering that square as a building would be
 * exactly the fabrication the grading system exists to prevent. The caller
 * falls back to its own path and says so.
 */
export function twinGeometryFromModel(
  model: ReconstructionModel,
): TwinGeometry | null {
  if (model.blockers.length > 0) return null;
  const outerMm = model.footprint.ring;
  if (!Array.isArray(outerMm) || outerMm.length < 3) return null;

  // Centre on the bounding box, not the vertex average: a vertex mean is
  // biased by dense edges, which would shift the shell off the origin the
  // viewer's roof box and column grid build around.
  const box = bbox(outerMm);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;

  const footprintPolygon: RingM[] = [ringToMetres(outerMm, cx, cy)];

  const levels: TwinLevel[] = model.levels.map((level) => ({
    id: level.id,
    label: level.name,
    floorNo: level.floorNo,
    below: level.below,
    plate: [ringToMetres(level.plate, cx, cy)],
    planAreaSqm: level.modelAreaSqm,
    elevationM: level.elevationMm / 1000,
    heightM: level.floorToFloorMm / 1000,
    registeredAreaSqm: level.registeredAreaSqm,
    registeredUse: level.registeredUse,
    grade: level.plateGrade,
  }));

  const aboveTops = levels
    .filter((l) => !l.below)
    .map((l) => l.elevationM + l.heightM);

  return {
    footprintPolygon,
    footprintAreaSqm: areaSqm(outerMm),
    footprintWidthM: (box.maxX - box.minX) / 1000,
    footprintDepthM: (box.maxY - box.minY) / 1000,
    levels,
    totalHeightM: aboveTops.length > 0 ? Math.max(...aboveTops) : 0,
    grade: model.footprint.grade,
    observed: isObserved(model.footprint.grade),
  };
}

/* ------------------------------------------------------------------ */
/* Model → traceable engine                                            */
/* ------------------------------------------------------------------ */

export interface LedgerRing {
  /** The outer ring in local metres — the same ring the twin renders. */
  ringM: RingM;
  /** See `TwinGeometry.observed`. The engine's authority tier follows this. */
  observed: boolean;
  grade: EvidenceGrade;
}

/**
 * The outline the traceable engine should treat as its extracted boundary.
 *
 * Deliberately the same ring `twinGeometryFromModel` returns, so the twin and
 * the diagnosis can no longer describe different buildings — which they did
 * whenever VWorld answered, because the twin used the GIS outline and the
 * engine used a 1.5:1 rectangle solved from 건축면적.
 */
export function ledgerRingFromModel(
  model: ReconstructionModel,
): LedgerRing | null {
  const twin = twinGeometryFromModel(model);
  if (!twin) return null;
  return {
    ringM: twin.footprintPolygon[0],
    observed: twin.observed,
    grade: twin.grade,
  };
}

/* ------------------------------------------------------------------ */
/* Model → provenance                                                  */
/* ------------------------------------------------------------------ */

/**
 * What the twin's provenance should record for a building rendering from this
 * model, or `null` when it should record nothing.
 *
 * Two rules, both about not laundering an inference:
 *
 * - `hasCadFootprint` is never returned. An automatic reconstruction is not a
 *   drawing anyone made of this building (ADR-003), and the whole reason this
 *   pipeline can run on every building is that it cannot raise the twin's
 *   stated precision by doing so.
 * - An uploaded CAD outline outranks everything here, so when one is already
 *   recorded this returns `null` rather than overwriting it. The automatic
 *   path runs on every render; the upload happens once.
 *
 * A GIS trace is *not* a reconstruction — it is the same observed outline the
 * twin used before this pipeline existed, and flagging it would be a false
 * downgrade. Only a ring solved to satisfy a stated area is one.
 */
export function provenancePatchForModel(
  twin: TwinGeometry | null,
  current: Readonly<{ hasCadFootprint?: boolean }>,
): Readonly<{ reconstructedFootprint: boolean }> | null {
  if (current.hasCadFootprint) return null;
  // A blocked model gives the twin nothing, so it falls back to its own
  // rectangle — invented, but not by this pipeline, and not this flag's claim.
  return { reconstructedFootprint: twin !== null && !twin.observed };
}

/* ------------------------------------------------------------------ */
/* Model → per-storey twin geometry                                    */
/* ------------------------------------------------------------------ */

/** Minimal shape of the twin geometry this module patches. */
interface PlatedFloor {
  floorNo: number;
  type: "above" | "below";
  plate?: [number, number][][];
}
interface PlatedGeometry {
  floors: PlatedFloor[];
}

export interface AppliedLevelPlates<G extends PlatedGeometry> {
  geometry: G;
  /**
   * Floor numbers the model carried a level for but could not resolve a plate
   * on — an `X-UNRESOLVED` level, where the registered area contradicts the
   * observed outline. They keep the building footprint, and the caller is
   * expected to say so rather than present the substitution as the storey.
   */
  substituted: number[];
}

/**
 * Attach each resolved level's plate to the matching floor (P2-30).
 *
 * Mutates and returns the geometry it is given — the callers all build it
 * fresh from `generateBuildingGeometry` immediately before calling this.
 *
 * A level whose plate the reconstruction graded `X-UNRESOLVED` gets no plate
 * at all. Falling back to the footprint is the honest outcome: the register
 * and the outline disagree about that storey, and quietly scaling a ring to
 * paper over the contradiction is exactly what the grading system exists to
 * prevent.
 */
export function applyLevelPlates<G extends PlatedGeometry>(
  geometry: G,
  levels: readonly TwinLevel[],
): AppliedLevelPlates<G> {
  const substituted: number[] = [];
  const byKey = new Map<string, TwinLevel>();
  for (const level of levels) {
    byKey.set(`${level.below ? "b" : "a"}${Math.abs(level.floorNo)}`, level);
  }

  for (const floor of geometry.floors) {
    const level = byKey.get(
      `${floor.type === "below" ? "b" : "a"}${Math.abs(floor.floorNo)}`,
    );
    if (!level) continue;
    if (level.grade === "X-UNRESOLVED") {
      substituted.push(floor.floorNo);
      continue;
    }
    if (level.plate.length >= 1 && level.plate[0].length >= 3) {
      floor.plate = level.plate;
    }
  }

  return { geometry, substituted };
}
