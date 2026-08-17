// src/lib/generative/blueprint/from-mesh.ts
//
// 3D MESH → schematic. The reader for drawings that hold no plan at all: a
// 3DFACE/polyface export of a building is a pile of triangles, and the floor
// plan a person wants out of it does not exist in the file — it has to be
// CONSTRUCTED. This module does that construction and says, in the spec it
// returns, exactly which construction it used and how much it is worth.
//
// UNITS IN: METRES, already scaled (the DXF `$INSUNITS` factor is applied once,
// upstream in `extract-mesh-faces.ts`). `unitScaleAlreadyApplied: true` is a
// required option so a caller cannot forget which side of that line it is on.
//
// FRAME: the DXF frame. X/Y is the plan, Z is up. The blueprint's plan frame is
// (xMm, zMm), so plan X → xMm and plan Y → zMm — the same mapping `from-cad.ts`
// already uses. Mesh Z (height) never reaches the blueprint; it only chooses
// WHERE the plan is cut.
//
// TWO CONSTRUCTIONS, in this order:
//
//   1. SLICE — intersect every triangle with a horizontal plane and read the
//      resulting 2D segment soup with the ordinary `interpretSegments` core.
//      This is the better reading: a cut at window height crosses the WALLS,
//      so what comes out is a wall plan, with courtyards and shafts as real
//      inner loops.
//   2. PROJECTION — drop every face to XY and union them. This is a footprint,
//      not a plan: it says where the building sits, and nothing about what is
//      inside it. Used only when the slice finds no closed boundary.
//
// Neither is a measurement, and neither is allowed to pretend otherwise: the
// blueprint comes back carrying an assumption naming the method, an uncertainty
// entry on the boundary, and a storey estimate that states its own assumption.
// When both constructions fail the result is a typed failure — never a
// rectangle invented from the bounding box.
//
// Determinism: no Math.random, no Date.now, no iteration over unordered maps.
// The same faces always produce a byte-identical blueprint.

import {
  ringArea,
  largestPolygon,
  unionAll,
  type Polygon,
  type Ring,
  type Vec2,
} from "../geom";
import type { Provenanced } from "../spec/building-spec";
import {
  addBoundary,
  addVoid,
  emptyBlueprint,
  makePolyLoop,
  userValue,
} from "./builders";
import {
  BlueprintSpecSchema,
  type BlueprintAssumption,
  type BlueprintSpec,
  type InterpretationUncertainty,
  type PointMm,
} from "./blueprint-spec";
import { interpretSegments, type SegmentInputMm } from "./from-segments";

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

/** One mesh corner, METRES, DXF frame (X/Y plan, Z up). */
export interface MeshVertex {
  x: number;
  y: number;
  z: number;
}

/**
 * One flat face: a triangle (3 corners) or a quad (4). More corners are
 * accepted and fan-triangulated, but nothing in the DXF mesh entities this
 * project reads can produce them.
 */
export interface MeshFace {
  vertices: MeshVertex[];
  /** Originating CAD layer, when the source knew one. Carried into segments. */
  layer?: string;
}

/* ------------------------------------------------------------------ */
/* Stated assumptions, as constants so tests can name them             */
/* ------------------------------------------------------------------ */

/**
 * Floor-to-floor used to turn a mesh's height into a storey count. 3.5 m is a
 * mid-rise commercial average; a residential block is nearer 2.9 m and a
 * warehouse has one storey whatever its height. This is a SUGGESTION for the
 * import dialog to show, never a fact written into the spec's geometry.
 */
export const ASSUMED_FLOOR_TO_FLOOR_M = 3.5;

/**
 * How far above the mesh's lowest point the default cut is taken. 1.2 m is
 * above every plinth and below every ceiling, and — the reason it matters — it
 * is not coplanar with the ground slab, which is the one height at which the
 * slice would read the floor instead of the walls.
 */
export const DEFAULT_SLICE_ABOVE_MIN_Z_M = 1.2;

/** A slice is a section through a model; it is inferred, not measured. */
export const SLICE_CONFIDENCE = 0.6;
/** A footprint says less than a section does, so it is worth less. */
export const PROJECTION_CONFIDENCE = 0.5;

/** Void area at/above this reads as a courtyard, below it as a shaft. */
const SHAFT_MAX_AREA_SQM = 25;

/** Coplanarity / point-identity tolerance, metres. One micron. */
const EPS_M = 1e-6;

/** Loops smaller than this are mesh noise, not rooms. */
const MIN_LOOP_AREA_SQM_DEFAULT = 1;

const M_TO_MM = 1000;

/* ------------------------------------------------------------------ */
/* Triangulation                                                       */
/* ------------------------------------------------------------------ */

export type Triangle = [MeshVertex, MeshVertex, MeshVertex];

const sameVertex = (a: MeshVertex, b: MeshVertex): boolean =>
  Math.abs(a.x - b.x) <= EPS_M &&
  Math.abs(a.y - b.y) <= EPS_M &&
  Math.abs(a.z - b.z) <= EPS_M;

/** Twice the area of a 3D triangle — |(b-a) × (c-a)|. */
function triangleDoubleArea(t: Triangle): number {
  const ux = t[1].x - t[0].x;
  const uy = t[1].y - t[0].y;
  const uz = t[1].z - t[0].z;
  const vx = t[2].x - t[0].x;
  const vy = t[2].y - t[0].y;
  const vz = t[2].z - t[0].z;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.hypot(cx, cy, cz);
}

/**
 * Fan-triangulate one face, after dropping repeated corners. A 3DFACE stores a
 * triangle as a quad with its last corner doubled, which is why the dedupe
 * comes first: without it every triangle would arrive as one real triangle
 * plus one zero-area sliver.
 */
export function triangulateFace(face: MeshFace): Triangle[] {
  const corners: MeshVertex[] = [];
  for (const vertex of face.vertices) {
    if (
      !Number.isFinite(vertex.x) ||
      !Number.isFinite(vertex.y) ||
      !Number.isFinite(vertex.z)
    ) {
      continue;
    }
    if (corners.length > 0 && sameVertex(corners[corners.length - 1], vertex)) continue;
    corners.push(vertex);
  }
  while (corners.length > 1 && sameVertex(corners[0], corners[corners.length - 1])) {
    corners.pop();
  }
  if (corners.length < 3) return [];

  const out: Triangle[] = [];
  for (let i = 1; i < corners.length - 1; i += 1) {
    const triangle: Triangle = [corners[0], corners[i], corners[i + 1]];
    if (triangleDoubleArea(triangle) <= EPS_M) continue;
    out.push(triangle);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export interface MeshStats {
  faceCount: number;
  /** Faces after quad splitting and degenerate removal. */
  triangleCount: number;
  /** Total corners read, before deduplication. */
  vertexCount: number;
  /** Faces that carried no non-degenerate triangle at all. */
  degenerateFaceCount: number;
  minZ: number;
  maxZ: number;
  zRangeM: number;
  /**
   * Where a cut would be taken by default: `minZ` + 1.2 m. Zero-height meshes
   * still get a suggestion — it simply will not intersect anything, and the
   * projection takes over.
   */
  suggestedSliceZ: number;
  /** `round(zRange / 3.5)`, at least 1. An estimate, and labelled as one. */
  estimatedFloors: number;
}

export function meshStats(faces: MeshFace[]): MeshStats {
  let minZ = Infinity;
  let maxZ = -Infinity;
  let vertexCount = 0;
  let triangleCount = 0;
  let degenerateFaceCount = 0;

  for (const face of faces) {
    vertexCount += face.vertices.length;
    for (const vertex of face.vertices) {
      if (!Number.isFinite(vertex.z)) continue;
      if (vertex.z < minZ) minZ = vertex.z;
      if (vertex.z > maxZ) maxZ = vertex.z;
    }
    const triangles = triangulateFace(face);
    if (triangles.length === 0) degenerateFaceCount += 1;
    triangleCount += triangles.length;
  }

  const hasZ = Number.isFinite(minZ) && Number.isFinite(maxZ);
  const lo = hasZ ? minZ : 0;
  const hi = hasZ ? maxZ : 0;
  const zRangeM = hi - lo;

  return {
    faceCount: faces.length,
    triangleCount,
    vertexCount,
    degenerateFaceCount,
    minZ: lo,
    maxZ: hi,
    zRangeM,
    suggestedSliceZ: lo + DEFAULT_SLICE_ABOVE_MIN_Z_M,
    estimatedFloors: Math.max(1, Math.round(zRangeM / ASSUMED_FLOOR_TO_FLOOR_M)),
  };
}

/* ------------------------------------------------------------------ */
/* (a) Slice                                                           */
/* ------------------------------------------------------------------ */

/** One cut edge, METRES, in the plan frame (X/Y of the mesh). */
export interface SliceSegment {
  start: Vec2;
  end: Vec2;
  layer?: string;
}

export interface MeshSliceResult {
  segments: SliceSegment[];
  trianglesTested: number;
  /**
   * Triangles lying exactly IN the cutting plane. Their intersection with the
   * plane is the whole triangle, not an edge, so there is no honest segment to
   * emit — see the note on `sliceMeshToSegments`.
   */
  coplanarTrianglesSkipped: number;
  /** Faces that held no triangle with area. */
  degenerateFacesSkipped: number;
}

/** Intersect one triangle with the plane z = `z`; null when it misses it. */
function sliceTriangle(triangle: Triangle, z: number): [Vec2, Vec2] | null {
  const d = [triangle[0].z - z, triangle[1].z - z, triangle[2].z - z];
  const points: Vec2[] = [];

  const push = (p: Vec2): void => {
    for (const existing of points) {
      if (Math.abs(existing[0] - p[0]) <= EPS_M && Math.abs(existing[1] - p[1]) <= EPS_M) {
        return;
      }
    }
    points.push(p);
  };

  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const a = triangle[i];
    const b = triangle[j];
    const da = d[i];
    const db = d[j];
    const aOn = Math.abs(da) <= EPS_M;
    const bOn = Math.abs(db) <= EPS_M;

    if (aOn && bOn) {
      // The edge itself lies in the plane — the cut IS that edge. This is how a
      // wall standing on the cut height still contributes its base line.
      push([a.x, a.y]);
      push([b.x, b.y]);
      continue;
    }
    if (aOn) {
      push([a.x, a.y]);
      continue;
    }
    if (bOn) continue; // picked up when this vertex is the `a` of the next edge
    if (da * db < 0) {
      const t = da / (da - db);
      push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]);
    }
  }

  if (points.length < 2) return null;
  const [p, q] = points;
  if (Math.abs(p[0] - q[0]) <= EPS_M && Math.abs(p[1] - q[1]) <= EPS_M) return null;
  return [p, q];
}

/**
 * Fuse the segments one face produced. A quad is cut as two triangles, so a
 * plain wall panel comes back as two collinear halves meeting at the fan
 * diagonal; joining them here restores the single wall line the face really
 * describes, and keeps the split point out of the finished ring.
 */
function joinCollinear(parts: Array<[Vec2, Vec2]>): Array<[Vec2, Vec2]> {
  const open = parts.map(([a, b]): [Vec2, Vec2] => [[...a], [...b]]);
  let merged = true;
  while (merged && open.length > 1) {
    merged = false;
    outer: for (let i = 0; i < open.length; i += 1) {
      for (let j = i + 1; j < open.length; j += 1) {
        const joined = joinPair(open[i], open[j]);
        if (!joined) continue;
        open.splice(j, 1);
        open[i] = joined;
        merged = true;
        break outer;
      }
    }
  }
  return open;
}

function joinPair(a: [Vec2, Vec2], b: [Vec2, Vec2]): [Vec2, Vec2] | null {
  const near = (p: Vec2, q: Vec2): boolean =>
    Math.abs(p[0] - q[0]) <= EPS_M && Math.abs(p[1] - q[1]) <= EPS_M;
  const collinear = (p: Vec2, q: Vec2, r: Vec2): boolean =>
    Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) <= 1e-9;

  const pairs: Array<[Vec2, Vec2, Vec2]> = [
    [a[0], a[1], b[1]], // a.end meets b.start
    [a[0], a[1], b[0]], // a.end meets b.end
    [a[1], a[0], b[1]], // a.start meets b.start
    [a[1], a[0], b[0]], // a.start meets b.end
  ];
  const joints: Array<[Vec2, Vec2]> = [
    [a[1], b[0]],
    [a[1], b[1]],
    [a[0], b[0]],
    [a[0], b[1]],
  ];

  for (let i = 0; i < pairs.length; i += 1) {
    const [keepA, sharedA, far] = pairs[i];
    const [jointA, jointB] = joints[i];
    if (!near(jointA, jointB)) continue;
    if (!collinear(keepA, sharedA, far)) continue;
    return [keepA, far];
  }
  return null;
}

/**
 * Cut the mesh at height `z` and return the 2D segments the cut produces.
 *
 * COPLANAR RULE. A triangle lying exactly in the cutting plane is SKIPPED and
 * counted, never turned into edges. Its intersection with the plane is a
 * filled region, not a line, so emitting its outline would draw the slab —
 * every interior edge of a triangulated floor included — on top of the plan.
 * The wall faces that MEET that plane still contribute: an edge of a
 * non-coplanar triangle that lies in the plane is emitted (see
 * `sliceTriangle`), which is exactly "coplanar geometry contributes its edges
 * only where adjacent geometry does not". The default cut height
 * (`minZ + 1.2 m`) sits clear of slab planes precisely so this rule is rarely
 * load-bearing.
 */
export function sliceMeshToSegments(faces: MeshFace[], z: number): MeshSliceResult {
  const segments: SliceSegment[] = [];
  let trianglesTested = 0;
  let coplanarTrianglesSkipped = 0;
  let degenerateFacesSkipped = 0;

  for (const face of faces) {
    const triangles = triangulateFace(face);
    if (triangles.length === 0) {
      degenerateFacesSkipped += 1;
      continue;
    }
    const parts: Array<[Vec2, Vec2]> = [];
    for (const triangle of triangles) {
      trianglesTested += 1;
      const coplanar =
        Math.abs(triangle[0].z - z) <= EPS_M &&
        Math.abs(triangle[1].z - z) <= EPS_M &&
        Math.abs(triangle[2].z - z) <= EPS_M;
      if (coplanar) {
        coplanarTrianglesSkipped += 1;
        continue;
      }
      const cut = sliceTriangle(triangle, z);
      if (cut) parts.push(cut);
    }
    for (const [start, end] of joinCollinear(parts)) {
      segments.push({ start, end, ...(face.layer ? { layer: face.layer } : {}) });
    }
  }

  return {
    segments,
    trianglesTested,
    coplanarTrianglesSkipped,
    degenerateFacesSkipped,
  };
}

/* ------------------------------------------------------------------ */
/* (b) Footprint projection                                            */
/* ------------------------------------------------------------------ */

export interface MeshFootprintResult {
  /** Union parts, largest first. `[outer, ...holes]` per the geom convention. */
  polygons: Polygon[];
  facesProjected: number;
  /** Faces whose XY projection encloses nothing — every vertical wall panel. */
  degenerateProjectionsSkipped: number;
}

/**
 * Drop every face to the XY plane and union the lot. Vertical faces project to
 * a line and drop out on their own; what survives is the shadow of the roofs
 * and slabs, which is the building's footprint.
 */
export function projectMeshFootprint(faces: MeshFace[]): MeshFootprintResult {
  const parts: Polygon[] = [];
  let facesProjected = 0;
  let degenerateProjectionsSkipped = 0;

  for (const face of faces) {
    const triangles = triangulateFace(face);
    if (triangles.length === 0) {
      degenerateProjectionsSkipped += 1;
      continue;
    }
    let contributed = false;
    for (const triangle of triangles) {
      const ring: Ring = triangle.map((v): Vec2 => [v.x, v.y]);
      if (ringArea(ring) <= 1e-9) continue;
      parts.push([ring]);
      contributed = true;
    }
    if (contributed) facesProjected += 1;
    else degenerateProjectionsSkipped += 1;
  }

  const merged = parts.length === 0 ? [] : unionAll(parts);
  const polygons = [...merged].sort(
    (a, b) => ringArea(b[0] ?? []) - ringArea(a[0] ?? []),
  );

  return { polygons, facesProjected, degenerateProjectionsSkipped };
}

/* ------------------------------------------------------------------ */
/* mm conversion                                                       */
/* ------------------------------------------------------------------ */

function ringToPointsMm(ring: Ring): PointMm[] {
  const out: PointMm[] = [];
  for (const [x, y] of ring) {
    const point: PointMm = { xMm: Math.round(x * M_TO_MM), zMm: Math.round(y * M_TO_MM) };
    const last = out[out.length - 1];
    if (last && last.xMm === point.xMm && last.zMm === point.zMm) continue;
    out.push(point);
  }
  while (
    out.length > 1 &&
    out[0].xMm === out[out.length - 1].xMm &&
    out[0].zMm === out[out.length - 1].zMm
  ) {
    out.pop();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

export type MeshExtractionMethod = "slice" | "projection";

export interface ExtractBlueprintFromMeshOptions {
  name: string;
  id?: string;
  /** Cut height, METRES, absolute in the mesh's own Z. Default: suggested. */
  sliceZ?: number;
  /**
   * `"auto"` (default) tries the slice and falls back to the projection;
   * `"projection"` skips the slice, which is what the dialog's
   * "바닥 투영 사용" toggle asks for.
   */
  method?: "auto" | "slice" | "projection";
  floorNos?: number[];
  source?: BlueprintSpec["source"];
  snapToleranceMm?: number;
  minLoopAreaSqm?: number;
  /** Trust in the mesh's UNITS (a separate question from the method). */
  calibrationConfidence?: number;
  /**
   * Required acknowledgement that `faces` are already in metres. The DXF unit
   * scale is applied exactly once, upstream; there is no second place it could
   * be applied by accident.
   */
  unitScaleAlreadyApplied: true;
}

export interface MeshExtractionFacts {
  method: MeshExtractionMethod;
  /** Present for `"slice"` only. */
  sliceZ?: number;
  stats: MeshStats;
  slice: Omit<MeshSliceResult, "segments">;
  boundaryAreaSqm: number;
  loopsDetected: number;
  voidCount: number;
  /** Union parts the projection found but did not use. */
  discardedFootprintParts: number;
  suggestedFloors: number;
}

export type MeshExtractionErrorCode = "NO_MESH_FACES" | "MESH_NO_CLOSED_BOUNDARY";

export interface MeshExtractionError {
  code: MeshExtractionErrorCode;
  message: string;
  /** One line per construction attempted, saying what it found. */
  detail: string[];
}

export type MeshExtractionOutcome =
  | { ok: true; blueprint: BlueprintSpec; facts: MeshExtractionFacts }
  | { ok: false; error: MeshExtractionError; stats: MeshStats };

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "mesh-schematic";
}

function inferred<T>(value: T, reason: string, confidence: number): Provenanced<T> {
  return { value, source: "INFERRED", confidence, reason };
}

/** The storey estimate, worded so the 3.5 m assumption is impossible to miss. */
function floorAssumption(stats: MeshStats): BlueprintAssumption {
  return {
    id: "mesh-floor-estimate",
    label: "Storey count",
    statement:
      `The mesh spans ${stats.minZ.toFixed(2)}–${stats.maxZ.toFixed(2)} m ` +
      `(${stats.zRangeM.toFixed(2)} m tall). At an ASSUMED ${ASSUMED_FLOOR_TO_FLOOR_M} m ` +
      `floor-to-floor that is about ${stats.estimatedFloors} storey(s). The mesh ` +
      `states no storey count; this plan describes one level.`,
    source: "INFERRED",
    confidence: 0.4,
  };
}

/**
 * Read a schematic out of a 3D mesh. Slice first, footprint second, honest
 * failure third — never a fabricated outline.
 */
export function extractBlueprintFromMesh(
  faces: MeshFace[],
  options: ExtractBlueprintFromMeshOptions,
): MeshExtractionOutcome {
  const stats = meshStats(faces);
  const detail: string[] = [];

  if (faces.length === 0 || stats.triangleCount === 0) {
    return {
      ok: false,
      stats,
      error: {
        code: "NO_MESH_FACES",
        message:
          "The file holds no mesh face with any area, so there is no solid to cut or project.",
        detail: [
          `${stats.faceCount} face(s) read, ${stats.degenerateFaceCount} of them degenerate.`,
        ],
      },
    };
  }

  const method = options.method ?? "auto";
  const sliceZ = options.sliceZ ?? stats.suggestedSliceZ;
  const floorNos = options.floorNos && options.floorNos.length > 0 ? options.floorNos : [1];
  const minLoopAreaSqm = options.minLoopAreaSqm ?? MIN_LOOP_AREA_SQM_DEFAULT;
  const slice = sliceMeshToSegments(faces, sliceZ);
  const sliceCounts: Omit<MeshSliceResult, "segments"> = {
    trianglesTested: slice.trianglesTested,
    coplanarTrianglesSkipped: slice.coplanarTrianglesSkipped,
    degenerateFacesSkipped: slice.degenerateFacesSkipped,
  };

  if (method !== "projection") {
    const segmentsMm: SegmentInputMm[] = slice.segments.map((segment) => ({
      startMm: {
        xMm: Math.round(segment.start[0] * M_TO_MM),
        zMm: Math.round(segment.start[1] * M_TO_MM),
      },
      endMm: {
        xMm: Math.round(segment.end[0] * M_TO_MM),
        zMm: Math.round(segment.end[1] * M_TO_MM),
      },
      ...(segment.layer ? { layer: segment.layer } : {}),
    }));

    if (segmentsMm.length === 0) {
      detail.push(
        `Slice at Z = ${sliceZ.toFixed(2)} m crossed no face (the mesh spans ` +
          `${stats.minZ.toFixed(2)}–${stats.maxZ.toFixed(2)} m).`,
      );
    } else {
      try {
        const read = interpretSegments(segmentsMm, [], {
          id: options.id ?? slugify(options.name),
          name: options.name,
          source: options.source ?? "dxf",
          floorNos,
          minLoopAreaSqm,
          ...(options.snapToleranceMm !== undefined
            ? { snapToleranceMm: options.snapToleranceMm }
            : {}),
          ...(options.calibrationConfidence !== undefined
            ? { calibrationConfidence: options.calibrationConfidence }
            : {}),
        });

        const boundaryId = read.blueprint.boundaries[0]?.loop.id;
        const blueprint = BlueprintSpecSchema.parse({
          ...read.blueprint,
          assumptions: [
            ...read.blueprint.assumptions,
            {
              id: "mesh-extraction",
              label: "How this plan was made",
              statement:
                `The file holds a 3D mesh and no floor plan. This plan is a horizontal ` +
                `SECTION through that mesh at Z = ${sliceZ.toFixed(2)} m ` +
                `(${DEFAULT_SLICE_ABOVE_MIN_Z_M} m above its lowest point by default), ` +
                `read from ${slice.segments.length} cut edge(s) across ` +
                `${slice.trianglesTested} triangle(s).`,
              source: "INFERRED",
              confidence: SLICE_CONFIDENCE,
            },
            floorAssumption(stats),
          ],
          uncertainty: [
            ...read.blueprint.uncertainty,
            ...(boundaryId === undefined
              ? []
              : [
                  {
                    targetId: boundaryId,
                    interpretation:
                      `This outline was cut out of a 3D mesh, not read from a drawn plan. ` +
                      `A different cut height would give a different outline, and nothing ` +
                      `in the mesh says which one the designer meant.`,
                    confidence: SLICE_CONFIDENCE,
                    evidence: "geometry" as const,
                  },
                ]),
          ],
        });

        return {
          ok: true,
          blueprint,
          facts: {
            method: "slice",
            sliceZ,
            stats,
            slice: sliceCounts,
            boundaryAreaSqm: read.stats.boundaryAreaSqm,
            loopsDetected: read.stats.loopsDetected,
            voidCount: blueprint.voids.length,
            discardedFootprintParts: 0,
            suggestedFloors: stats.estimatedFloors,
          },
        };
      } catch (caught) {
        detail.push(
          `Slice at Z = ${sliceZ.toFixed(2)} m produced ${segmentsMm.length} edge(s) but no ` +
            `closed loop: ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      }
    }
  }

  if (method === "slice") {
    return {
      ok: false,
      stats,
      error: {
        code: "MESH_NO_CLOSED_BOUNDARY",
        message: `No closed outline could be cut from this mesh at Z = ${sliceZ.toFixed(2)} m.`,
        detail,
      },
    };
  }

  /* --- projection --- */

  const footprint = projectMeshFootprint(faces);
  const outer = largestPolygon(footprint.polygons);
  const boundaryRing = outer?.[0];

  if (!outer || !boundaryRing || boundaryRing.length < 3) {
    detail.push(
      `Footprint projection unioned ${footprint.facesProjected} face(s) ` +
        `(${footprint.degenerateProjectionsSkipped} projected to nothing) and closed no area.`,
    );
    return {
      ok: false,
      stats,
      error: {
        code: "MESH_NO_CLOSED_BOUNDARY",
        message:
          "Neither a horizontal cut nor a footprint projection closed an outline in this mesh. " +
          "Nothing was invented in their place.",
        detail,
      },
    };
  }

  const boundaryAreaSqm = ringArea(boundaryRing);
  const boundaryPoints = ringToPointsMm(boundaryRing);
  if (boundaryPoints.length < 3) {
    detail.push(
      "The projected footprint collapses to fewer than three distinct millimetre points.",
    );
    return {
      ok: false,
      stats,
      error: {
        code: "MESH_NO_CLOSED_BOUNDARY",
        message: "The projected footprint encloses no area once rounded to millimetres.",
        detail,
      },
    };
  }

  let spec = emptyBlueprint(options.name);
  spec = addBoundary(spec, {
    loop: makePolyLoop("boundary", boundaryPoints),
    floorNos,
    role: "outline",
  });

  let voidSeq = 0;
  for (const hole of outer.slice(1)) {
    const points = ringToPointsMm(hole);
    if (points.length < 3) continue;
    const areaSqm = ringArea(hole);
    if (areaSqm < minLoopAreaSqm) continue;
    voidSeq += 1;
    const id = `void-${voidSeq}`;
    spec = addVoid(spec, {
      id,
      kind: areaSqm < SHAFT_MAX_AREA_SQM ? "shaft" : "courtyard",
      region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, points) },
      floorNos,
    });
  }

  const uncertainty: InterpretationUncertainty[] = [
    {
      targetId: "boundary",
      interpretation:
        "This is a FOOTPRINT, not a floor plan: the mesh was flattened onto the ground " +
        "plane because no horizontal cut through it closed an outline. It says where the " +
        "building sits and nothing about what is inside it.",
      confidence: PROJECTION_CONFIDENCE,
      evidence: "geometry",
    },
  ];
  if (footprint.polygons.length > 1) {
    uncertainty.push({
      targetId: "boundary",
      interpretation:
        `${footprint.polygons.length - 1} further disjoint footprint part(s) were found and ` +
        `not incorporated; only the largest became the boundary.`,
      confidence: 0.3,
      evidence: "geometry",
    });
  }

  const blueprint = BlueprintSpecSchema.parse({
    ...spec,
    id: options.id ?? slugify(options.name),
    source: options.source ?? "dxf",
    coordinateSystem: {
      ...spec.coordinateSystem,
      sourceScaleRatio: userValue(
        1,
        "Mesh coordinates were already metres; only metres → millimetres was applied.",
      ),
      calibrationConfidence: options.calibrationConfidence ?? PROJECTION_CONFIDENCE,
    },
    // `addVoid` stamps USER_PROVIDED — the editor's builders assume a person
    // drew the shape. A hole recovered from a projected mesh was INFERRED, so
    // the provenance is corrected here rather than shipping a confident lie.
    voids: spec.voids.map((item) => ({
      ...item,
      kind: inferred(
        item.kind.value,
        `Hole in the projected footprint, classified by area (shaft/courtyard threshold ${SHAFT_MAX_AREA_SQM} m²).`,
        PROJECTION_CONFIDENCE,
      ),
    })),
    assumptions: [
      {
        id: "mesh-extraction",
        label: "How this plan was made",
        statement:
          `Projected: ${footprint.facesProjected} mesh face(s) were dropped to the ground ` +
          `plane and unioned; the largest part (~${boundaryAreaSqm.toFixed(1)} m²) is the ` +
          `boundary. A horizontal cut was ${
            method === "projection" ? "not attempted" : "attempted first and closed nothing"
          }.`,
        source: "INFERRED",
        confidence: PROJECTION_CONFIDENCE,
      },
      floorAssumption(stats),
    ],
    uncertainty,
  });

  return {
    ok: true,
    blueprint,
    facts: {
      method: "projection",
      stats,
      slice: sliceCounts,
      boundaryAreaSqm,
      loopsDetected: footprint.polygons.length,
      voidCount: blueprint.voids.length,
      discardedFootprintParts: Math.max(0, footprint.polygons.length - 1),
      suggestedFloors: stats.estimatedFloors,
    },
  };
}
