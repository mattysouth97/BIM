// src/lib/generative/generate/types.ts
//
// The contract between the procedural generators and the BIM graph emitter.
//
// Everything here is METRES in the engine's local XZ frame, origin at the
// footprint centre — the same frame `BuildingRecipe.footprintPolygon` uses.
// (The mm→m boundary is spec-to-recipe.ts and massing.ts; nothing downstream
// of this file sees millimetres.)
//
// These are NOT BIM elements. They are the geometric result of solving the
// spec. `graph/emit.ts` turns them into real `BimElement`s with ids, types,
// parameters, host relationships and provenance.

import type { SpaceType } from "../spec/building-spec";
import type { Polygon } from "./massing";

/** Axis-aligned rectangle by extents. Min/max beats centre+size for subdivision. */
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const rectWidth = (r: Rect) => r.maxX - r.minX;
export const rectDepth = (r: Rect) => r.maxZ - r.minZ;
export const rectArea = (r: Rect) => Math.max(0, rectWidth(r)) * Math.max(0, rectDepth(r));
export const rectCentre = (r: Rect): [number, number] => [
  (r.minX + r.maxX) / 2,
  (r.minZ + r.maxZ) / 2,
];

/** Do two rects overlap by more than a tolerance? Touching edges do not count. */
export function rectsOverlap(a: Rect, b: Rect, tolerance = 1e-6): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    b.minX < a.maxX - tolerance &&
    a.minZ < b.maxZ - tolerance &&
    b.minZ < a.maxZ - tolerance
  );
}

/** Length of shared edge between two rects; 0 when they do not touch. */
export function sharedEdgeLength(a: Rect, b: Rect, tolerance = 1e-3): number {
  const touchesVertically =
    Math.abs(a.maxX - b.minX) < tolerance || Math.abs(b.maxX - a.minX) < tolerance;
  if (touchesVertically) {
    const overlap = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    return Math.max(0, overlap);
  }
  const touchesHorizontally =
    Math.abs(a.maxZ - b.minZ) < tolerance || Math.abs(b.maxZ - a.minZ) < tolerance;
  if (touchesHorizontally) {
    const overlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    return Math.max(0, overlap);
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Spaces                                                              */
/* ------------------------------------------------------------------ */

export interface PlacedSpace {
  /** Stable within a generation, e.g. "SPACE-L02-004". */
  id: string;
  /** `ProgramItem.id` this space satisfies. Empty for solver-created corridors. */
  programId: string;
  type: SpaceType;
  label: string;
  floorNo: number;
  rect: Rect;
  areaSqm: number;
  /** True for corridors and lobbies the circulation graph is built from. */
  isCirculation: boolean;
  /** Space ids sharing a wall of usable length. */
  adjacentSpaceIds: string[];
  /** Touches the building perimeter, so it can host windows. */
  hasExteriorWall: boolean;
  /** Reachable from an entrance through circulation. Set by the circulation pass. */
  reachable: boolean;
}

/* ------------------------------------------------------------------ */
/* Core                                                                */
/* ------------------------------------------------------------------ */

export interface CoreComponent {
  id: string;
  kind: "stair" | "elevator" | "shaft";
  /** For shafts: "mechanical" | "electrical" | "plumbing" | "telecom" | "refuse". */
  subKind?: string;
  rect: Rect;
  /** Inclusive level span this component runs through. */
  fromFloorNo: number;
  toFloorNo: number;
}

export interface CoreLayout {
  rect: Rect;
  components: CoreComponent[];
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

export type WallRole = "exterior" | "interior" | "core";

export interface GeneratedWall {
  id: string;
  floorNo: number;
  start: [number, number];
  end: [number, number];
  thicknessM: number;
  heightM: number;
  role: WallRole;
  /** Space ids this wall bounds — 1 for exterior, up to 2 for partitions. */
  boundsSpaceIds: string[];
  /** Which compass face this wall sits on, for exterior walls only. */
  side?: "north" | "south" | "east" | "west";
}

export interface GeneratedOpening {
  id: string;
  floorNo: number;
  hostWallId: string;
  kind: "door" | "window";
  /** Centre of the opening in world XZ. */
  position: [number, number];
  widthM: number;
  heightM: number;
  /** Above finished floor. 0 for doors. */
  sillM: number;
  /** For doors: the two spaces it connects. */
  connectsSpaceIds?: [string, string];
}

export interface GeneratedColumn {
  id: string;
  floorNo: number;
  x: number;
  z: number;
  sizeM: number;
  /** Grid label it sits on, e.g. "B-3". */
  gridRef: string;
}

export interface GeneratedBeam {
  id: string;
  floorNo: number;
  start: [number, number];
  end: [number, number];
  depthM: number;
  widthM: number;
}

export interface GeneratedSlab {
  id: string;
  floorNo: number;
  polygon: Polygon;
  thicknessM: number;
  areaSqm: number;
}

export interface GeneratedGridLine {
  id: string;
  name: string;
  axis: "x" | "z";
  offset: number;
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

export interface GeneratedLevel {
  floorNo: number;
  name: string;
  /** Elevation of this level's finished floor, metres, grade = 0. */
  elevationM: number;
  heightM: number;
  usage: string;
  /** Plate outline for this level. */
  polygon: Polygon;
  plateAreaSqm: number;
}

/** Everything the procedural pass produced, before it becomes BIM elements. */
export interface GeneratedBuilding {
  levels: GeneratedLevel[];
  grids: GeneratedGridLine[];
  core: CoreLayout;
  spaces: PlacedSpace[];
  walls: GeneratedWall[];
  openings: GeneratedOpening[];
  columns: GeneratedColumn[];
  beams: GeneratedBeam[];
  slabs: GeneratedSlab[];
  /** Deterministic metrics computed from the geometry above, never estimated. */
  metrics: BuildingMetrics;
}

export interface BuildingMetrics {
  floorCount: number;
  buildingHeightM: number;
  grossAreaSqm: number;
  netAreaSqm: number;
  circulationAreaSqm: number;
  circulationRatio: number;
  coreAreaSqm: number;
  coreRatio: number;
  facadeAreaSqm: number;
  windowAreaSqm: number;
  windowToWallRatio: number;
  roomCount: number;
  doorCount: number;
  windowCount: number;
  columnCount: number;
  spaceAreaByType: Record<string, number>;
  spaceCountByType: Record<string, number>;
}
