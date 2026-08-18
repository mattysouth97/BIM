// src/lib/interior/index.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  THE SOLVED INTERIOR
// ─────────────────────────────────────────────────────────────────────────────
//
// The generative engine has always emitted a real interior — walls with real
// endpoints, doors hosted on those walls, windows with sills, stairs that span
// storeys — and the 3D viewer has only ever drawn the massing shell. This layer
// is the missing half: it turns a `BimModelSnapshot` into transforms and family
// poses that a React layer can mount, and it does that WITHOUT touching three,
// React, or the DOM, so the whole thing is testable as data.
//
//     buildInteriorModel(snapshot, { includeExterior })
//         ├── wallsByFloor    → InstancedMesh of unit boxes
//         ├── posesByFloor    → the authored GLBs, scaled to what was solved
//         ├── railingsByFloor → guard runs at the stair shafts
//         └── stats           → counts, plus an honest ledger of what it could
//                               not draw and what it deliberately did not
//
// ─── CONVENTIONS ─────────────────────────────────────────────────────────────
//
// UNITS       Metres, everywhere. The snapshot stores millimetres in parameters
//             (`widthMm`, `thicknessMm`, `sillHeightMm`) and metres in
//             `placement` and `BimLevel.elevation`; `snapshot-read.ts` is the
//             only place that conversion happens.
//
// FRAME       Y-up, right-handed, world XZ — the engine's frame, origin at the
//             footprint centre, shared with `BuildingRecipe.footprintPolygon`.
//
// HEIGHT      World Y comes from `BimLevel.elevation`, never from
//             `placement.y`: emit.ts writes 0 there for walls and core parts,
//             and for an opening it writes the SILL above finished floor.
//
// ROTATION    `rotationY` is a three.js Y rotation, ready for
//             `mesh.rotation.y` / `rotation={[0, rotationY, 0]}`. It is DERIVED
//             from wall endpoints via `headingYFromAxis` (atan2(−dz, dx)) and
//             is NOT `placement.rotationY` — generated walls store the plan
//             angle atan2(dz, dx) there, which has the opposite sign. Hosted
//             openings inherit their HOST WALL's rotation, the same rule
//             `schematic/plan-model.ts` applies in 2D.
//
// WALLS       Unit-box transforms: scale a `BoxGeometry(1,1,1)` by
//             `scale = [length, height, thickness]`, yaw by `rotationY`,
//             translate to `position`. `matrix` is that transform pre-composed
//             in `Matrix4.elements` order — `m.fromArray(w.matrix)` then
//             `instanced.setMatrixAt(i, m)`; remember `instanceMatrix
//             .needsUpdate = true`. Openings are cut by SPLITTING the wall into
//             piers, sill bands and header bands — no CSG anywhere.
//
// POSES       `scale` is a MULTIPLIER on the family's authored size
//             (catalog.json `nativeDimsM`), so 1 means "as authored". Feed
//             `url`/`position`/`scale`/`[0, rotationY, 0]` straight into the
//             `FamilyInstance` component in
//             `src/components/viewer/authoring-family-layer.tsx`.
//
// GROUPING    Everything is keyed by `floorNo` (the `level:<n>` suffix), so a
//             storey can be isolated, sectioned or faded without a second pass.
//
// PROVENANCE  Authored elements are EXCLUDED — `AuthoringFamilyLayer` already
//             draws those. Every instance carries `elementId`, so a viewport
//             click resolves to the real BIM element.
//
// DETERMINISM Same snapshot in, byte-identical model out: fixed sort keys, and
//             every float rounded to 6 dp.

export { buildInteriorModel, buildRailingRuns } from "./build";
export {
  COLUMN_FAMILY_ID,
  DOOR_FAMILY_ID,
  ELEVATOR_FAMILY_ID,
  FURNITURE_FAMILY_ID,
  INTERIOR_FAMILY_IDS,
  LIGHT_FAMILY_ID,
  RAILING_FAMILY_ID,
  STAIR_FAMILY_ID,
  WINDOW_FAMILY_ID,
  assertFamiliesExist,
  buildFamilyPoses,
  isPoseLaneElement,
  isSchematicFamilyElement,
  nativeDims,
  storeyRiseM,
  type FamilyBuildResult,
  type NativeDims,
} from "./families";
export {
  buildWallInstances,
  isWallLaneElement,
  wallHeightM,
  wallThicknessM,
  type WallBuildResult,
} from "./walls";
export {
  buildEnvelopePlates,
  isPlateLaneElement,
  plateBaseY,
  type PlateBuildResult,
} from "./plates";
export { composeTrs } from "./transform";
export {
  MIN_GEOMETRY_M,
  isCoreWall,
  isExteriorWall,
  wallAxisOf,
} from "./snapshot-read";
export {
  floorNoFromPlanLevelId,
  groupWallsForInstancing,
  interiorDrawList,
  itemsOnFloors,
  visibleFloorNos,
} from "./visible-floors";
export {
  interiorModelFor,
  interiorOptionsKey,
  planInteriorView,
  selectInteriorFloors,
} from "./view-select";
export type {
  EnvelopePlate,
  EnvelopePlateRole,
  FamilyPose,
  InteriorBuildOptions,
  InteriorModel,
  InteriorStats,
  Matrix4Elements,
  RailingRun,
  SkipReason,
  SkippedElement,
  WallInstance,
  WallSegmentRole,
} from "./types";
