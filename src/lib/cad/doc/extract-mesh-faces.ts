// src/lib/cad/doc/extract-mesh-faces.ts
//
// The 3D half of the DXF read path. `map-dxf-to-doc.ts` maps the 2D entities a
// drawing holds and SKIPS 3DFACE and polyface POLYLINEs — correctly, because a
// CadDocument is a 2D document and there is no honest 2D entity to turn a
// triangle into. This module reads those same entities as what they are: a mesh.
//
// Deliberately PARALLEL to `map-dxf-to-doc.ts`, not folded into it. A
// CadDocument has one plane and one set of layer semantics; carrying triangles
// through it would mean either flattening them (a lie about the geometry) or
// giving every consumer of `CadEntity` a third dimension it has no use for.
//
// UNITS: metres. The `$INSUNITS` factor is resolved by
// `resolveDxfUnitScale` — the SAME function the 2D mapper uses, so a file's
// mesh and its 2D entities can never end up at different scales.
//
// FRAME: unchanged from the file. X/Y is plan, Z is up.
//
// Pure module — no React, no DOM, no Three. Never throws.

import DxfParser, { type IDxf } from "dxf-parser";

import { resolveDxfUnitScale } from "./map-dxf-to-doc";
// Type-only: the mesh contract belongs to the reader that consumes it
// (`blueprint/from-mesh.ts`), and a type import leaves no runtime dependency
// from the CAD layer on the generative layer.
import type { MeshFace, MeshVertex } from "@/lib/generative/blueprint/from-mesh";

export type { MeshFace, MeshVertex };

type RawEntity = Record<string, unknown> & { type: string; layer?: string };

/**
 * 3D entity types dxf-parser has no handler for. It drops them without a
 * trace, so they are counted from the raw group-code stream instead — a file
 * whose geometry is all MESH entities must not be reported as "no geometry".
 */
const UNREADABLE_3D_TYPES = [
  "MESH",
  "3DSOLID",
  "BODY",
  "REGION",
  "SURFACE",
  "PLANESURFACE",
] as const;

export interface MeshFaceStats {
  /** 3DFACE entities that yielded at least one corner set. */
  threeDFaceCount: number;
  /** POLYLINE entities flagged as polyface meshes. */
  polyfaceMeshCount: number;
  /** Face records read out of those polyface meshes. */
  polyfaceFaceCount: number;
  /** Face entities whose corners did not describe a face at all. */
  degenerateSkipped: number;
  /**
   * Entity types present in the file that carry geometry nothing here can
   * read, and how many of each. Reported, never silently dropped.
   */
  unreadEntityTypes: Record<string, number>;
}

export interface MeshFaceExtraction {
  /** Faces in METRES, plan XY, Z up. Empty when the file holds no mesh. */
  faces: MeshFace[];
  stats: MeshFaceStats;
  unitScaleToMeters: number;
  /** Raw `$INSUNITS`; absent when the file declared none. */
  insUnits?: number;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Raw-text scan for the entity types dxf-parser drops                 */
/* ------------------------------------------------------------------ */

/**
 * Count entity types dxf-parser never surfaces, by walking the group-code
 * stream: a line holding exactly "0" is followed by an entity/section name.
 */
export function countUnreadable3dEntities(text: string): Record<string, number> {
  const wanted = new Set<string>(UNREADABLE_3D_TYPES);
  const counts: Record<string, number> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (lines[i].trim() !== "0") continue;
    const name = lines[i + 1].trim().toUpperCase();
    if (!wanted.has(name)) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

/**
 * 3D transform for an INSERT: the block's plan placement (scale, rotation,
 * translation) applied in XY, with Z scaled and translated but never rotated.
 * DXF block rotation is about the Z axis, so this is the whole of it for the
 * axis-aligned inserts a building export produces.
 */
interface Insert3d {
  atX: number;
  atY: number;
  atZ: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
}

function applyInsert(v: MeshVertex, t: Insert3d): MeshVertex {
  const x = (v.x - t.baseX) * t.sx;
  const y = (v.y - t.baseY) * t.sy;
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  return {
    x: t.atX + x * c - y * s,
    y: t.atY + x * s + y * c,
    z: t.atZ + (v.z - t.baseZ) * t.sz,
  };
}

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function readVertex(raw: unknown, scale: number): MeshVertex | null {
  const q = raw as { x?: unknown; y?: unknown; z?: unknown } | undefined;
  if (typeof q?.x !== "number" || typeof q?.y !== "number") return null;
  if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return null;
  return { x: q.x * scale, y: q.y * scale, z: num(q.z, 0) * scale };
}

/** Faces from a 3DFACE. dxf-parser appends an empty vertex object; it is dropped. */
function facesFrom3dFace(raw: RawEntity, scale: number, layer: string): MeshFace | null {
  const corners: MeshVertex[] = [];
  for (const rawVertex of (raw.vertices as unknown[] | undefined) ?? []) {
    const vertex = readVertex(rawVertex, scale);
    if (vertex) corners.push(vertex);
  }
  if (corners.length < 3) return null;
  return { vertices: corners.slice(0, 4), layer };
}

/**
 * Faces from a polyface-mesh POLYLINE. Its VERTEX list interleaves mesh
 * vertices (coordinates) with face records (1-based indices in codes 71–74,
 * negative when the edge is invisible, 0 when the corner is unused).
 */
function facesFromPolyface(
  raw: RawEntity,
  scale: number,
  layer: string,
): { faces: MeshFace[]; degenerate: number } {
  const points: MeshVertex[] = [];
  const records: number[][] = [];

  for (const rawVertex of (raw.vertices as unknown[] | undefined) ?? []) {
    const v = rawVertex as Record<string, unknown>;
    const indices = [v.faceA, v.faceB, v.faceC, v.faceD];
    const isFaceRecord = indices.some((i) => typeof i === "number" && i !== 0);
    if (isFaceRecord) {
      records.push(
        indices
          .filter((i): i is number => typeof i === "number" && i !== 0)
          .map((i) => Math.abs(i)),
      );
      continue;
    }
    const point = readVertex(rawVertex, scale);
    if (point) points.push(point);
  }

  const faces: MeshFace[] = [];
  let degenerate = 0;
  for (const record of records) {
    const corners: MeshVertex[] = [];
    for (const index of record) {
      const point = points[index - 1];
      if (point) corners.push(point);
    }
    if (corners.length < 3) {
      degenerate += 1;
      continue;
    }
    faces.push({ vertices: corners.slice(0, 4), layer });
  }
  return { faces, degenerate };
}

function walkEntities(
  rawEntities: RawEntity[],
  scale: number,
  dxf: IDxf,
  depth: number,
  transform: Insert3d | null,
  out: MeshFace[],
  stats: MeshFaceStats,
  warnings: string[],
): void {
  for (const raw of rawEntities) {
    const layer = typeof raw.layer === "string" ? raw.layer : "0";
    const place = (face: MeshFace): MeshFace =>
      transform === null
        ? face
        : { ...face, vertices: face.vertices.map((v) => applyInsert(v, transform)) };

    if (raw.type === "3DFACE") {
      const face = facesFrom3dFace(raw, scale, layer);
      if (face === null) {
        stats.degenerateSkipped += 1;
        continue;
      }
      stats.threeDFaceCount += 1;
      out.push(place(face));
      continue;
    }

    if (raw.type === "POLYLINE") {
      if (raw.isPolyfaceMesh === true) {
        stats.polyfaceMeshCount += 1;
        const { faces, degenerate } = facesFromPolyface(raw, scale, layer);
        stats.polyfaceFaceCount += faces.length;
        stats.degenerateSkipped += degenerate;
        for (const face of faces) out.push(place(face));
      } else if (raw.is3dPolygonMesh === true) {
        // An M×N polygon mesh's grid dimensions (codes 71/72) are not exposed
        // by dxf-parser, so its vertices cannot be assembled into faces.
        stats.unreadEntityTypes["POLYLINE (polygon mesh)"] =
          (stats.unreadEntityTypes["POLYLINE (polygon mesh)"] ?? 0) + 1;
        warnings.push(
          "A POLYLINE polygon mesh was found; its M×N grid is not readable through this parser, so it was skipped.",
        );
      }
      continue;
    }

    if (raw.type === "INSERT" && depth < 4) {
      const r = raw as Record<string, unknown>;
      const blockName = typeof r.name === "string" ? r.name : undefined;
      const block = blockName
        ? (
            dxf.blocks as unknown as
              | Record<string, { entities?: RawEntity[]; position?: unknown } | undefined>
              | undefined
          )?.[blockName]
        : undefined;
      if (!block?.entities?.length) continue;
      const at = (r.position ?? {}) as Record<string, unknown>;
      const base = (block.position ?? {}) as Record<string, unknown>;
      const local: Insert3d = {
        atX: num(at.x, 0) * scale,
        atY: num(at.y, 0) * scale,
        atZ: num(at.z, 0) * scale,
        baseX: num(base.x, 0) * scale,
        baseY: num(base.y, 0) * scale,
        baseZ: num(base.z, 0) * scale,
        sx: num(r.xScale, 1),
        sy: num(r.yScale, 1),
        sz: num(r.zScale, 1),
        rot: (num(r.rotation, 0) * Math.PI) / 180,
      };
      const nested: MeshFace[] = [];
      walkEntities(block.entities, scale, dxf, depth + 1, local, nested, stats, warnings);
      for (const face of nested) out.push(place(face));
    }
  }
}

/** Read every mesh face a parsed DXF holds, in metres. */
export function extractMeshFaces(dxf: IDxf, rawText?: string): MeshFaceExtraction {
  const warnings: string[] = [];
  const { declaredInsUnits, scale, unitless } = resolveDxfUnitScale(dxf);
  if (unitless) warnings.push("Unitless DXF — assuming meters for the mesh too.");

  const stats: MeshFaceStats = {
    threeDFaceCount: 0,
    polyfaceMeshCount: 0,
    polyfaceFaceCount: 0,
    degenerateSkipped: 0,
    unreadEntityTypes: rawText ? countUnreadable3dEntities(rawText) : {},
  };

  const faces: MeshFace[] = [];
  walkEntities(
    (dxf.entities ?? []) as unknown as RawEntity[],
    scale,
    dxf,
    0,
    null,
    faces,
    stats,
    warnings,
  );

  for (const [type, count] of Object.entries(stats.unreadEntityTypes)) {
    warnings.push(`${count} ${type} entity/entities carry 3D geometry this reader cannot open.`);
  }

  return {
    faces,
    stats,
    unitScaleToMeters: scale,
    ...(declaredInsUnits !== undefined ? { insUnits: declaredInsUnits } : {}),
    warnings,
  };
}

/** DXF text → mesh faces. Never throws; a parse failure returns no faces. */
export function extractMeshFacesFromDxfText(text: string): MeshFaceExtraction {
  let dxf: IDxf | null = null;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch {
    dxf = null;
  }
  if (!dxf) {
    return {
      faces: [],
      stats: {
        threeDFaceCount: 0,
        polyfaceMeshCount: 0,
        polyfaceFaceCount: 0,
        degenerateSkipped: 0,
        unreadEntityTypes: countUnreadable3dEntities(text),
      },
      unitScaleToMeters: 1,
      warnings: ["The DXF could not be parsed, so no mesh could be read from it."],
    };
  }
  return extractMeshFaces(dxf, text);
}
