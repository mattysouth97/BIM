// src/lib/interior/types.ts
//
// The output vocabulary of the solved-interior layer.
//
// Everything here is METRES, Y-up, in the engine's world XZ frame — the same
// frame `BimElement.placement` and `BuildingRecipe.footprintPolygon` use. No
// millimetres survive past the readers in `snapshot-read.ts`.
//
// These are RENDER INSTRUCTIONS, not BIM objects. Every one of them carries the
// `elementId` it came from, so a click in the viewport resolves back to the real
// element in the BIM graph rather than to an anonymous mesh.

import type { BimKind } from "@/lib/bim/model/types";

/**
 * A 4×4 transform in three.js `Matrix4.elements` order (COLUMN-major, 16
 * numbers), ready to hand to `InstancedMesh.setMatrixAt(i, m)` via
 * `Matrix4.fromArray()`. Composed as T · Ry · S — see `transform.ts`.
 */
export type Matrix4Elements = readonly number[];

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

/**
 * Which part of a punched wall a box is.
 *
 *   full    — the whole wall, no openings on it
 *   pier    — a full-height stretch beside an opening
 *   sill    — the band UNDER an opening (floor → sill)
 *   header  — the band OVER an opening (head → wall top)
 */
export type WallSegmentRole = "full" | "pier" | "sill" | "header";

/**
 * One oriented box of wall. `position`/`rotationY`/`scale` describe a UNIT box
 * (three.js `BoxGeometry(1,1,1)`, centred on its own origin): scale it by
 * `scale`, yaw it by `rotationY` about world Y, translate to `position`.
 * `matrix` is the same transform pre-composed for InstancedMesh.
 *
 * `scale` is [length along the wall axis, height, thickness].
 */
export interface WallInstance {
  /** `${elementId}#s${index}` — stable across builds. */
  id: string;
  /** The `BimElement.id` of the wall this box is part of. */
  elementId: string;
  floorNo: number;
  role: WallSegmentRole;
  position: [number, number, number];
  /** three.js yaw: local +X runs start→end. NOT `placement.rotationY` — see walls.ts. */
  rotationY: number;
  /** [lengthM, heightM, thicknessM] */
  scale: [number, number, number];
  matrix: Matrix4Elements;
  isCore: boolean;
  isExterior: boolean;
  isCurtainWall: boolean;
}

/* ------------------------------------------------------------------ */
/* Family poses                                                        */
/* ------------------------------------------------------------------ */

/**
 * One authored GLB placed in the world. Field-for-field compatible with the
 * `FamilyInstance` props in `src/components/viewer/authoring-family-layer.tsx`
 * (`position`, `scale`, `rotation: [0, rotationY, 0]`, `url`), so the mounting
 * agent can reuse that component unchanged.
 */
export interface FamilyPose {
  /** `${elementId}#f` — stable across builds. */
  id: string;
  /** The `BimElement.id` this pose represents. */
  elementId: string;
  /** An `AUTHORING_FAMILIES` id, e.g. "door-single-flush-910". */
  familyId: string;
  /** `authoringFamilyUrl(familyId)`. */
  url: string;
  kind: BimKind;
  floorNo: number;
  position: [number, number, number];
  rotationY: number;
  /** Multiplier on the family's own `nativeDimsM` — 1 means "as authored". */
  scale: [number, number, number];
  /**
   * The element asks for a mirrored leaf (door `hand === "right"`). Left as a
   * flag rather than a negative X scale: a negative scale inverts the GLB's
   * normals, and that is the consumer's call to make, not this layer's.
   */
  mirrored: boolean;
}

/* ------------------------------------------------------------------ */
/* Railings                                                            */
/* ------------------------------------------------------------------ */

/**
 * A horizontal guard run, derived from the stairwell edge it protects. Carries
 * both the run (start/end in world XZ) and a ready-to-render pose, because the
 * guard family (`railing-guard-1m`) is a 1 m module stretched along its local
 * +X — `scale[0]` is the module count, not a distortion.
 */
export interface RailingRun {
  id: string;
  /** The core/stair element whose opening this guards. */
  elementId: string;
  familyId: string;
  url: string;
  floorNo: number;
  start: [number, number];
  end: [number, number];
  lengthM: number;
  heightM: number;
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

/**
 * Why an element this layer TRIED to draw could not be drawn. Every value is a
 * real failure, not a scoping decision — scoping lives in `outOfScope`.
 */
export type SkipReason =
  /** No authoring GLB exists for this kind (elevators, shafts). */
  | "no-family"
  /** Hosted element whose `hostId` is null or resolves to nothing. */
  | "missing-host"
  /** Host wall carries no startX/startZ/endX/endZ, so it has no axis. */
  | "host-has-no-axis"
  /** Wall with no start/end parameters. */
  | "no-axis"
  /** Zero (or sub-millimetre) length, width or height. */
  | "zero-geometry"
  /** `levelId` is null or names a level the snapshot does not contain. */
  | "no-level"
  /** The opening's own XZ is further off its host's centreline than the wall is thick. */
  | "opening-off-host";

export interface SkippedElement {
  elementId: string;
  kind: BimKind;
  category: string;
  reason: SkipReason;
  /** Human-readable specifics, e.g. "0.000 m". Never a stack trace. */
  detail: string;
}

export interface InteriorStats {
  wallCount: number;
  poseCount: number;
  railingCount: number;
  /** Elements this layer tried and failed to represent. Never silently empty. */
  skipped: SkippedElement[];
  /**
   * Elements deliberately not this layer's remit, counted by reason so nothing
   * disappears without a number against it (rooms, slabs, columns, beams — the
   * massing shell draws those; authored elements — the authoring layer does).
   */
  outOfScope: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export interface InteriorModel {
  /** Floor numbers present, ascending. */
  floors: number[];
  /** Keyed by `floorNo`. Plain objects, not Maps, so the model is JSON-comparable. */
  wallsByFloor: Record<number, WallInstance[]>;
  posesByFloor: Record<number, FamilyPose[]>;
  railingsByFloor: Record<number, RailingRun[]>;
  stats: InteriorStats;
}

export interface InteriorBuildOptions {
  /**
   * Draw envelope walls (and the windows hosted on them) too.
   *
   * Default FALSE: the procedural massing shell already draws the facade, and
   * drawing it twice z-fights. The flag governs walls and their hosted openings
   * TOGETHER — this layer never draws a window without the wall it punches.
   */
  includeExterior?: boolean;
}
