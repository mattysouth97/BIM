// src/lib/interior/families.ts
//
// Generated elements → poses of the family GLBs that already exist.
//
// Nothing new is modelled here. The 102 Blender-authored families in
// public/models/authoring/ are the only geometry this layer places, and a
// generated door becomes the SAME `door-single-flush-910.glb` a human would
// have placed by hand — scaled to the width and height the generator actually
// solved for, not to the family's authored size.
//
// Mapping table (kind/category → family), and where each scale factor comes
// from:
//
//   kind      category              family id                  scale
//   ────────  ────────────────────  ─────────────────────────  ──────────────────────────────
//   door      Doors                 door-single-flush-910      x widthMm/910, y heightMm/2100
//   window    Windows               window-fixed-1200x1500     x widthMm/1200, y heightMm/1500
//   stair     Stairs                stair-run-8riser           y/z storey rise / 1.45 m
//   mep-inst. Specialty Equipment   — (elevator: none exists)  —
//   mep-inst. Shafts                — (a shaft is a void)      —
//
// Scale is a MULTIPLIER on the family's authored size, read from
// catalog.json's `nativeDimsM` — which is in the exported three.js frame
// (x = width, y = height, z = depth; `blenderXYZ` is the pre-export order).
// The same frame note is in src/lib/bim/family-insert.ts and
// src/lib/plan-symbols/catalog-dims.ts; this file mirrors both.

import catalogJson from "../../../public/models/authoring/catalog.json";
import {
  AUTHORING_FAMILIES,
  authoringFamilyUrl,
  getAuthoringFamily,
} from "@/lib/bim/family-catalog";
import { familySillLocalY } from "@/lib/bim/family-insert";
import type { BimElement, BimLevel, BimModelSnapshot } from "@/lib/bim/model/types";

import {
  MIN_GEOMETRY_M,
  indexLevels,
  isAuthored,
  isExteriorWall,
  isOpening,
  levelOf,
  numberParam,
  projectOnAxis,
  stringParam,
  typedNumber,
  wallAxisOf,
  type LevelIndex,
} from "./snapshot-read";
import { round6, roundTriple } from "./transform";
import type { FamilyPose, InteriorBuildOptions, SkippedElement } from "./types";

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

interface CatalogEntry {
  id: string;
  /** Nominal opening/component width, metres. Smaller than the bbox when a frame laps the reveal. */
  widthM?: number;
  heightM?: number;
  nativeDimsM?: { x: number; y: number; z: number };
}

const CATALOG: ReadonlyMap<string, CatalogEntry> = new Map(
  (catalogJson as { families: CatalogEntry[] }).families.map((f) => [f.id, f]),
);

export interface NativeDims {
  widthM: number;
  heightM: number;
  depthM: number;
}

/**
 * The family's authored size in the exported (three.js) frame.
 *
 * Width/height prefer the NOMINAL `widthM`/`heightM` over the bounding box:
 * `window-fixed-1200x1500` is a 1200×1500 hole in a 1240×1510 frame, and
 * scaling by the nominal is what keeps the frame lapping the reveal by the
 * proportion it was authored with.
 */
export function nativeDims(familyId: string): NativeDims | null {
  const entry = CATALOG.get(familyId);
  if (!entry) return null;
  const dims = entry.nativeDimsM;
  const widthM = entry.widthM ?? dims?.x;
  const heightM = entry.heightM ?? dims?.y;
  const depthM = dims?.z;
  if (!widthM || !heightM || !depthM) return null;
  return { widthM, heightM, depthM };
}

/* ------------------------------------------------------------------ */
/* The mapping                                                         */
/* ------------------------------------------------------------------ */

export const DOOR_FAMILY_ID = "door-single-flush-910";
export const WINDOW_FAMILY_ID = "window-fixed-1200x1500";
export const STAIR_FAMILY_ID = "stair-run-8riser";
export const RAILING_FAMILY_ID = "railing-guard-1m";

/**
 * There is no elevator/lift GLB in the catalog — all 102 entries were checked,
 * and the nearest thing (`Specialty Equipment`) is where emit.ts files a lift
 * car, not a family that draws one. So a generated elevator is OMITTED and
 * LOGGED rather than faked with a box or a stand-in family.
 *
 * `families-catalog.test.ts` re-checks the catalog, so the day an elevator
 * family is authored, this constant is what fails and asks to be filled in.
 */
export const ELEVATOR_FAMILY_ID: string | null = null;

export const COLUMN_FAMILY_ID = "column-struct-round-450";
export const LIGHT_FAMILY_ID = "light-troffer-600";
export const FURNITURE_FAMILY_ID = "furniture-desk";

export const INTERIOR_FAMILY_IDS = [
  DOOR_FAMILY_ID,
  WINDOW_FAMILY_ID,
  STAIR_FAMILY_ID,
  RAILING_FAMILY_ID,
  COLUMN_FAMILY_ID,
  LIGHT_FAMILY_ID,
  FURNITURE_FAMILY_ID,
] as const;

/** Every family this layer can place actually exists in the catalog + family list. */
export function assertFamiliesExist(): string[] {
  const missing: string[] = [];
  for (const id of INTERIOR_FAMILY_IDS) {
    if (!CATALOG.has(id) || !AUTHORING_FAMILIES.some((f) => f.id === id)) missing.push(id);
  }
  return missing;
}

/** The core component kind emit.ts stamped on this element, if any. */
function componentKind(element: BimElement): string | null {
  return stringParam(element, "componentKind");
}

/**
 * A schematic-authored family instance (pillar, light, desk). Generated
 * structural columns use type `generated-column` and stay with the massing
 * shell; only placements whose typeId is a real authoring family are posed.
 */
export function isSchematicFamilyElement(element: BimElement): boolean {
  if (isAuthored(element) || element.visible === false) return false;
  if (
    element.kind !== "column" &&
    element.kind !== "lighting" &&
    element.kind !== "furniture"
  ) {
    return false;
  }
  return getAuthoringFamily(element.typeId) !== undefined;
}

/** Is this element one this layer draws as a family GLB? */
export function isPoseLaneElement(element: BimElement): boolean {
  if (isAuthored(element)) return false;
  if (element.visible === false) return false;
  if (isOpening(element)) return true;
  if (element.kind === "stair") return true;
  // Lift cars and shafts: attempted, so their absence is logged rather than silent.
  if (element.kind === "mep-instance" && element.system === "core") return true;
  if (isSchematicFamilyElement(element)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export interface FamilyBuildResult {
  poses: FamilyPose[];
  skipped: SkippedElement[];
  drawnElementIds: Set<string>;
}

export function buildFamilyPoses(
  snapshot: BimModelSnapshot,
  options: InteriorBuildOptions = {},
): FamilyBuildResult {
  const levels = indexLevels(snapshot);
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]));
  const poses: FamilyPose[] = [];
  const skipped: SkippedElement[] = [];
  const drawnElementIds = new Set<string>();

  for (const element of snapshot.elements) {
    if (!isPoseLaneElement(element)) continue;

    const level = levelOf(levels, element);
    if (!level) {
      skipped.push(skip(element, "no-level", `levelId ${element.levelId ?? "null"}`));
      continue;
    }

    const result = isOpening(element)
      ? poseOpening(snapshot, element, level, byId, options)
      : element.kind === "stair"
        ? poseStair(element, level, levels)
        : isSchematicFamilyElement(element)
          ? poseSchematicFamily(element, level, levels)
          : poseCoreEquipment(element);

    if (result === null) continue; // out of scope, counted by build.ts
    if ("reason" in result) {
      skipped.push(skip(element, result.reason, result.detail));
      continue;
    }
    poses.push(result);
    drawnElementIds.add(element.id);
  }

  poses.sort(
    (a, b) =>
      a.floorNo - b.floorNo ||
      (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0),
  );
  return { poses, skipped, drawnElementIds };
}

type PoseFailure = { reason: SkippedElement["reason"]; detail: string };

/* ------------------------------------------------------------------ */
/* Doors + windows                                                     */
/* ------------------------------------------------------------------ */

/**
 * A hosted opening's pose.
 *
 * ORIENTATION: the opening's own `placement.rotationY` is 0 for every generated
 * door and window (emit.ts writes a literal 0), so it is not orientation — it
 * is the absence of one. The HOST WALL is authoritative, exactly as
 * `symbolInstance` in schematic/plan-model.ts already decided for 2D. In 3D the
 * yaw is derived from the host's endpoints rather than copied from its
 * `placement.rotationY`, because the generated walls store the plan angle there
 * (opposite sign to a three.js Y rotation) — see snapshot-read.ts.
 *
 * HEIGHT: `levelElevation + sill − familySillLocalY(family) × scaleY`. At
 * scale 1 this is exactly `hostedInsertY()` from bim/family-insert.ts; the
 * scale factor is the part that function cannot know, because the local sill
 * offset of a centre-origin family moves when the family is stretched.
 */
function poseOpening(
  snapshot: BimModelSnapshot,
  element: BimElement,
  level: BimLevel,
  byId: Map<string, BimElement>,
  options: InteriorBuildOptions,
): FamilyPose | PoseFailure | null {
  const host = element.hostId ? byId.get(element.hostId) : undefined;
  if (!host || host.kind !== "wall") {
    return { reason: "missing-host", detail: `hostId ${element.hostId ?? "null"}` };
  }
  // The wall is not drawn, so neither is its opening — this layer never leaves a
  // window floating in a facade it did not punch.
  if (!options.includeExterior && isExteriorWall(host)) return null;

  const axis = wallAxisOf(host);
  if (!axis) return { reason: "host-has-no-axis", detail: `host ${host.id}` };
  if (axis.lengthM < MIN_GEOMETRY_M) {
    return { reason: "host-has-no-axis", detail: `host ${host.id} has zero length` };
  }

  const familyId = element.kind === "door" ? DOOR_FAMILY_ID : WINDOW_FAMILY_ID;
  const dims = nativeDims(familyId);
  if (!dims) return { reason: "no-family", detail: `${familyId} missing from catalog.json` };

  const widthMm = typedNumber(snapshot, element, "widthMm");
  const heightMm = typedNumber(snapshot, element, "heightMm");
  if (widthMm === null || widthMm <= 0 || heightMm === null || heightMm <= 0) {
    return { reason: "zero-geometry", detail: `widthMm ${widthMm}, heightMm ${heightMm}` };
  }

  // Honest check, not a repair: an opening whose own XZ has drifted off its
  // host's centreline is a model defect, and silently re-projecting it would
  // hide the defect behind a correct-looking picture.
  const thicknessMm = typedNumber(snapshot, host, "thicknessMm") ?? 200;
  const { alongM, offsetM } = projectOnAxis(axis, {
    x: element.placement.x,
    z: element.placement.z,
  });
  const offTolerance = thicknessMm / 2000 + 0.05;
  if (offsetM > offTolerance) {
    return {
      reason: "opening-off-host",
      detail: `${offsetM.toFixed(3)} m off the centreline of ${host.id}`,
    };
  }
  if (alongM < -offTolerance || alongM > axis.lengthM + offTolerance) {
    return {
      reason: "opening-off-host",
      detail: `${alongM.toFixed(3)} m along a ${axis.lengthM.toFixed(3)} m wall`,
    };
  }

  const scaleX = widthMm / 1000 / dims.widthM;
  const scaleY = heightMm / 1000 / dims.heightM;
  const sillM = (typedNumber(snapshot, element, "sillHeightMm") ?? 0) / 1000;

  // `facing` is a user flip (bim/model/commands.ts `flipHosted`); generated
  // openings carry none, so the family's authored orientation is used as-is.
  const facing = stringParam(element, "facing");
  const rotationY = axis.headingY + (facing === "out" ? Math.PI : 0);

  const position = roundTriple([
    element.placement.x,
    level.elevation + sillM - familySillLocalY(familyId) * scaleY,
    element.placement.z,
  ]);

  return {
    id: `${element.id}#f`,
    elementId: element.id,
    familyId,
    url: authoringFamilyUrl(familyId),
    kind: element.kind,
    floorNo: level.floorNo,
    position,
    rotationY: round6(rotationY),
    scale: roundTriple([scaleX, scaleY, 1]),
    mirrored: stringParam(element, "hand") === "right",
  };
}

/* ------------------------------------------------------------------ */
/* Stairs                                                              */
/* ------------------------------------------------------------------ */

/** Floor-to-floor rise: the next level's elevation, or this level's stated height. */
export function storeyRiseM(level: BimLevel, levels: LevelIndex): number {
  const next = levels.byFloorNo.get(level.floorNo + 1);
  if (next) {
    const rise = next.elevation - level.elevation;
    if (rise > MIN_GEOMETRY_M) return rise;
  }
  return level.height > MIN_GEOMETRY_M ? level.height : 3;
}

/**
 * One straight run per storey, standing in the stair core component's own rect.
 *
 * `stair-run-8riser` is authored 1.20 m wide, rising 1.45 m over a 2.28 m going,
 * with its origin at the base of the first riser (catalog `origin:
 * "first-riser-nosing"`). Scaling Y and Z together preserves the authored pitch;
 * the run is only steepened when the component rect is too short to hold the
 * full going, because a stair that does not reach the next floor is worse than
 * a steep one.
 */
function poseStair(
  element: BimElement,
  level: BimLevel,
  levels: LevelIndex,
): FamilyPose | PoseFailure {
  const dims = nativeDims(STAIR_FAMILY_ID);
  if (!dims) return { reason: "no-family", detail: `${STAIR_FAMILY_ID} missing from catalog.json` };

  const rectWidthM = numberParam(element, "widthM") ?? 0;
  const rectDepthM = numberParam(element, "depthM") ?? 0;
  if (rectWidthM < MIN_GEOMETRY_M || rectDepthM < MIN_GEOMETRY_M) {
    return {
      reason: "zero-geometry",
      detail: `rect ${rectWidthM.toFixed(3)} × ${rectDepthM.toFixed(3)} m`,
    };
  }

  const riseM = storeyRiseM(level, levels);
  const riseScale = riseM / dims.heightM;

  // Run along the rect's longer axis; native +Z is the going, and Ry(π/2) sends
  // local +Z to world +X.
  const runAlongZ = rectDepthM >= rectWidthM;
  const runSpanM = runAlongZ ? rectDepthM : rectWidthM;
  const crossSpanM = runAlongZ ? rectWidthM : rectDepthM;

  const goingScale = Math.min(riseScale, runSpanM / dims.depthM);
  const widthScale = Math.min(1, crossSpanM / dims.widthM);
  if (goingScale < MIN_GEOMETRY_M || widthScale < MIN_GEOMETRY_M) {
    return { reason: "zero-geometry", detail: `run scale ${goingScale.toFixed(4)}` };
  }

  // Origin at the base of the first riser, set back to the rect's near edge so
  // the whole run lands inside the shaft it belongs to.
  const halfRun = runSpanM / 2;
  const position = roundTriple([
    element.placement.x - (runAlongZ ? 0 : halfRun),
    level.elevation,
    element.placement.z - (runAlongZ ? halfRun : 0),
  ]);

  return {
    id: `${element.id}#f`,
    elementId: element.id,
    familyId: STAIR_FAMILY_ID,
    url: authoringFamilyUrl(STAIR_FAMILY_ID),
    kind: element.kind,
    floorNo: level.floorNo,
    position,
    rotationY: round6(runAlongZ ? 0 : Math.PI / 2),
    scale: roundTriple([widthScale, riseScale, goingScale]),
    mirrored: false,
  };
}

/* ------------------------------------------------------------------ */
/* Schematic columns, lights, furniture                                */
/* ------------------------------------------------------------------ */

/**
 * A point-placed family compiled from the schematic. World Y follows the
 * family's host: columns and furniture sit on the finished floor; ceiling
 * lights sit on the storey soffit. Columns stretch in Y so they fill the
 * storey they were placed on.
 */
function poseSchematicFamily(
  element: BimElement,
  level: BimLevel,
  levels: LevelIndex,
): FamilyPose | PoseFailure {
  const familyId = element.typeId;
  const dims = nativeDims(familyId);
  if (!dims) return { reason: "no-family", detail: `${familyId} missing from catalog.json` };

  const family = getAuthoringFamily(familyId);
  const riseM = storeyRiseM(level, levels);
  const ceilingHosted =
    family?.host === "ceiling" || family?.origin === "ceiling-plane";

  let y = level.elevation;
  let scale: [number, number, number] = [1, 1, 1];

  if (element.kind === "column") {
    const scaleY = riseM / dims.heightM;
    if (scaleY < MIN_GEOMETRY_M) {
      return { reason: "zero-geometry", detail: `storey rise ${riseM.toFixed(3)} m` };
    }
    scale = [1, scaleY, 1];
  } else if (ceilingHosted) {
    y = level.elevation + riseM;
  }

  return {
    id: `${element.id}#f`,
    elementId: element.id,
    familyId,
    url: authoringFamilyUrl(familyId),
    kind: element.kind,
    floorNo: level.floorNo,
    position: roundTriple([element.placement.x, y, element.placement.z]),
    rotationY: round6(element.placement.rotationY),
    scale: roundTriple(scale),
    mirrored: false,
  };
}

/* ------------------------------------------------------------------ */
/* Lifts and shafts                                                    */
/* ------------------------------------------------------------------ */

function poseCoreEquipment(element: BimElement): FamilyPose | PoseFailure | null {
  const kind = componentKind(element);
  if (kind === "elevator") {
    if (ELEVATOR_FAMILY_ID === null) {
      return {
        reason: "no-family",
        detail: "no elevator family in the authoring catalog (102 GLBs)",
      };
    }
    return null;
  }
  if (kind === "shaft" || element.category === "Shafts") {
    return {
      reason: "no-family",
      detail: `${stringParam(element, "shaftKind") ?? "service"} shaft is a void, not a family`,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function skip(
  element: BimElement,
  reason: SkippedElement["reason"],
  detail: string,
): SkippedElement {
  return {
    elementId: element.id,
    kind: element.kind,
    category: element.category,
    reason,
    detail,
  };
}
