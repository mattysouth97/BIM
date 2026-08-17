// src/lib/generative/__tests__/blueprint-from-mesh.test.ts
//
// The 3D-mesh path, end to end, through the REAL dxf-parser: hand-written
// group-code streams → `extractMeshFacesFromDxfText` → `from-mesh` → a
// BlueprintSpec, or a typed failure that names what was tried.
//
// What these cases pin down:
//   · a slice at the suggested height reads the WALLS, to the millimetre;
//   · a face lying exactly in the cutting plane is skipped, and the walls
//     standing on that plane still contribute their base edges;
//   · a reflex corner survives — an L-shaped building does not become its
//     bounding box;
//   · the drawing's own $INSUNITS decides the size, once;
//   · when no cut closes an outline, the footprint projection takes over, and
//     when that closes nothing either the result is an honest failure with no
//     rectangle invented in its place.

import { describe, it, expect } from "vitest";

import { extractMeshFacesFromDxfText } from "@/lib/cad/doc/extract-mesh-faces";
import { mapDxfTextToDoc } from "@/lib/cad/doc/map-dxf-to-doc";
import type { PointMm } from "@/lib/generative/blueprint/blueprint-spec";
import {
  ASSUMED_FLOOR_TO_FLOOR_M,
  extractBlueprintFromMesh,
  meshStats,
  projectMeshFootprint,
  sliceMeshToSegments,
  type MeshFace,
} from "@/lib/generative/blueprint/from-mesh";

import {
  BOX_DXF,
  BOX_MM_DXF,
  EMPTY_DXF,
  FLAT_SLAB_DXF,
  L_DXF,
  OPEN_PANELS_DXF,
  PLAN_2D_DXF,
  POLYFACE_DXF,
} from "./mesh-dxf-fixture";

function faces(dxfText: string): MeshFace[] {
  return extractMeshFacesFromDxfText(dxfText).faces;
}

/** Every distinct corner of the boundary loop, as millimetre points. */
function boundaryPoints(loopSegments: Array<{ kind: string; startMm?: PointMm }>): PointMm[] {
  return loopSegments.map((segment) => {
    if (segment.kind !== "line" || !segment.startMm) {
      throw new Error(`Unexpected segment kind "${segment.kind}" in a mesh boundary.`);
    }
    return segment.startMm;
  });
}

function hasPoint(points: PointMm[], xMm: number, zMm: number, tolMm = 1): boolean {
  return points.some(
    (p) => Math.abs(p.xMm - xMm) <= tolMm && Math.abs(p.zMm - zMm) <= tolMm,
  );
}

function bounds(points: PointMm[]) {
  const xs = points.map((p) => p.xMm);
  const zs = points.map((p) => p.zMm);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/* ------------------------------------------------------------------ */
/* (a) A rectangular single-storey box                                 */
/* ------------------------------------------------------------------ */

describe("mesh extraction — rectangular box", () => {
  it("reads 3DFACE walls, floor and roof out of the real parser", () => {
    const extraction = extractMeshFacesFromDxfText(BOX_DXF);
    // 4 walls + floor + roof, each one 3DFACE.
    expect(extraction.stats.threeDFaceCount).toBe(6);
    expect(extraction.faces).toHaveLength(6);
    // dxf-parser appends an empty trailing vertex; it must not survive.
    for (const face of extraction.faces) expect(face.vertices).toHaveLength(4);
    expect(extraction.unitScaleToMeters).toBe(1);
    expect(extraction.insUnits).toBe(6);
  });

  it("suggests a cut 1.2 m up and one storey at the 3.5 m assumption", () => {
    const stats = meshStats(faces(BOX_DXF));
    expect(stats.minZ).toBe(0);
    expect(stats.maxZ).toBe(3);
    expect(stats.suggestedSliceZ).toBeCloseTo(1.2, 9);
    expect(stats.estimatedFloors).toBe(1);
    // Six quads, two triangles each.
    expect(stats.triangleCount).toBe(12);
    expect(stats.degenerateFaceCount).toBe(0);
  });

  it("cuts the four walls into one rectangle, to the millimetre", () => {
    const slice = sliceMeshToSegments(faces(BOX_DXF), 1.2);
    // One joined segment per wall; the slabs at z=0 and z=3 are simply missed.
    expect(slice.segments).toHaveLength(4);
    expect(slice.coplanarTrianglesSkipped).toBe(0);

    const outcome = extractBlueprintFromMesh(faces(BOX_DXF), {
      name: "box",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.facts.method).toBe("slice");
    expect(outcome.facts.sliceZ).toBeCloseTo(1.2, 9);
    expect(outcome.facts.boundaryAreaSqm).toBeCloseTo(60, 3);

    const points = boundaryPoints(outcome.blueprint.boundaries[0].loop.segments);
    expect(points).toHaveLength(4);
    for (const [x, z] of [
      [0, 0],
      [10_000, 0],
      [10_000, 6000],
      [0, 6000],
    ]) {
      expect(hasPoint(points, x, z)).toBe(true);
    }
  });

  it("skips a face lying exactly in the cut, and still reads the walls on it", () => {
    // Cutting at z = 0 puts the FLOOR in the plane. A coplanar face's
    // intersection with the plane is the face, not a line, so it is skipped —
    // while the wall faces standing on that plane contribute their base edges,
    // which is what still closes the rectangle.
    const slice = sliceMeshToSegments(faces(BOX_DXF), 0);
    expect(slice.coplanarTrianglesSkipped).toBe(2); // the floor quad's two triangles
    expect(slice.segments).toHaveLength(4);

    const outcome = extractBlueprintFromMesh(faces(BOX_DXF), {
      name: "box-at-grade",
      sliceZ: 0,
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.facts.boundaryAreaSqm).toBeCloseTo(60, 3);
  });

  it("says how the plan was made, and does not claim to have measured it", () => {
    const outcome = extractBlueprintFromMesh(faces(BOX_DXF), {
      name: "box",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const method = outcome.blueprint.assumptions.find((a) => a.id === "mesh-extraction");
    expect(method).toBeDefined();
    expect(method?.statement).toContain("SECTION");
    expect(method?.statement).toContain("1.20 m");
    expect(method?.confidence).toBeCloseTo(0.6, 9);

    const floors = outcome.blueprint.assumptions.find(
      (a) => a.id === "mesh-floor-estimate",
    );
    expect(floors?.statement).toContain(String(ASSUMED_FLOOR_TO_FLOOR_M));

    const boundaryId = outcome.blueprint.boundaries[0].loop.id;
    const note = outcome.blueprint.uncertainty.find((u) => u.targetId === boundaryId);
    expect(note).toBeDefined();
    expect(note?.confidence).toBeCloseTo(0.6, 9);
  });
});

/* ------------------------------------------------------------------ */
/* (b) An L-shaped building                                            */
/* ------------------------------------------------------------------ */

describe("mesh extraction — L-shaped plan", () => {
  it("keeps the reflex corner instead of reading the bounding box", () => {
    const outcome = extractBlueprintFromMesh(faces(L_DXF), {
      name: "L block",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const points = boundaryPoints(outcome.blueprint.boundaries[0].loop.segments);
    expect(points).toHaveLength(6);
    // The notch: 20×20 would be 400 m², the L is 336 m².
    expect(outcome.facts.boundaryAreaSqm).toBeCloseTo(336, 3);
    expect(hasPoint(points, 12_000, 12_000)).toBe(true); // the reflex corner
    const box = bounds(points);
    expect(box.maxX - box.minX).toBe(20_000);
    expect(box.maxZ - box.minZ).toBe(20_000);
  });

  it("estimates three storeys from a 9 m mesh, and says the assumption", () => {
    const stats = meshStats(faces(L_DXF));
    expect(stats.zRangeM).toBeCloseTo(9, 9);
    expect(stats.estimatedFloors).toBe(3); // 9 / 3.5 → 2.57 → 3
  });
});

/* ------------------------------------------------------------------ */
/* (c) Units                                                           */
/* ------------------------------------------------------------------ */

describe("mesh extraction — units", () => {
  it("applies $INSUNITS = 4 once, so a millimetre model reads the same size", () => {
    const extraction = extractMeshFacesFromDxfText(BOX_MM_DXF);
    expect(extraction.insUnits).toBe(4);
    expect(extraction.unitScaleToMeters).toBe(0.001);

    const stats = meshStats(extraction.faces);
    expect(stats.maxZ).toBeCloseTo(3, 9);
    expect(stats.suggestedSliceZ).toBeCloseTo(1.2, 9);

    const outcome = extractBlueprintFromMesh(extraction.faces, {
      name: "box-mm",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.facts.boundaryAreaSqm).toBeCloseTo(60, 3);

    const box = bounds(boundaryPoints(outcome.blueprint.boundaries[0].loop.segments));
    expect(box.maxX - box.minX).toBe(10_000);
    expect(box.maxZ - box.minZ).toBe(6000);
  });

  it("reads a polyface-mesh POLYLINE, which the 2D mapper skips", () => {
    const extraction = extractMeshFacesFromDxfText(POLYFACE_DXF);
    expect(extraction.stats.polyfaceMeshCount).toBe(1);
    expect(extraction.stats.polyfaceFaceCount).toBe(1);
    expect(extraction.faces[0].vertices).toHaveLength(4);

    // The same entity is invisible to the 2D document model.
    const doc = mapDxfTextToDoc(POLYFACE_DXF, "polyface.dxf");
    expect(doc.entities).toHaveLength(0);
    expect(doc.stats.skipped.POLYLINE).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* (d) Slice miss → projection                                         */
/* ------------------------------------------------------------------ */

describe("mesh extraction — fallback to the footprint", () => {
  it("projects when every face sits below the cut", () => {
    const meshFaces = faces(FLAT_SLAB_DXF);
    const slice = sliceMeshToSegments(meshFaces, meshStats(meshFaces).suggestedSliceZ);
    expect(slice.segments).toHaveLength(0);

    const footprint = projectMeshFootprint(meshFaces);
    expect(footprint.polygons).toHaveLength(1);

    const outcome = extractBlueprintFromMesh(meshFaces, {
      name: "slab",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.facts.method).toBe("projection");
    expect(outcome.facts.boundaryAreaSqm).toBeCloseTo(60, 3);

    const statement = outcome.blueprint.assumptions.find(
      (a) => a.id === "mesh-extraction",
    )?.statement;
    expect(statement).toContain("Projected");
    expect(statement).toContain("attempted first");

    const note = outcome.blueprint.uncertainty[0];
    expect(note.interpretation).toContain("FOOTPRINT");
    expect(note.confidence).toBeCloseTo(0.5, 9);
  });

  it("skips the cut entirely when the caller asks for the footprint", () => {
    const outcome = extractBlueprintFromMesh(faces(BOX_DXF), {
      name: "box-footprint",
      method: "projection",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.facts.method).toBe("projection");
    expect(outcome.facts.boundaryAreaSqm).toBeCloseTo(60, 3);
    expect(
      outcome.blueprint.assumptions.find((a) => a.id === "mesh-extraction")?.statement,
    ).toContain("not attempted");
  });

  it("drops vertical faces from the projection instead of counting them as area", () => {
    // A wall-only mesh projects to nothing: its faces are edge-on to the ground.
    const footprint = projectMeshFootprint(faces(L_DXF));
    expect(footprint.polygons).toHaveLength(0);
    expect(footprint.degenerateProjectionsSkipped).toBe(6);
  });
});

/* ------------------------------------------------------------------ */
/* (e) Honest failure                                                  */
/* ------------------------------------------------------------------ */

describe("mesh extraction — honest failure", () => {
  it("fails by name when neither the cut nor the projection closes", () => {
    const outcome = extractBlueprintFromMesh(faces(OPEN_PANELS_DXF), {
      name: "panels",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.error.code).toBe("MESH_NO_CLOSED_BOUNDARY");
    expect(outcome.error.detail.length).toBeGreaterThan(0);
    expect(outcome.error.detail.join(" ")).toContain("closed no area");
    // Nothing was invented: the stats are reported, no blueprint is.
    expect(outcome.stats.faceCount).toBe(2);
    expect(outcome).not.toHaveProperty("blueprint");
  });

  it("names an empty mesh rather than pretending it cut something", () => {
    const outcome = extractBlueprintFromMesh([], {
      name: "nothing",
      unitScaleAlreadyApplied: true,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("NO_MESH_FACES");
  });
});

/* ------------------------------------------------------------------ */
/* (f) Determinism                                                     */
/* ------------------------------------------------------------------ */

describe("mesh extraction — determinism", () => {
  it("produces a byte-identical blueprint from the same file", () => {
    const first = extractBlueprintFromMesh(faces(L_DXF), {
      name: "L block",
      unitScaleAlreadyApplied: true,
    });
    const second = extractBlueprintFromMesh(faces(L_DXF), {
      name: "L block",
      unitScaleAlreadyApplied: true,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("reads the same plate whatever order the faces arrive in", () => {
    const forward = faces(L_DXF);
    const reversed = [...forward].reverse();
    const a = extractBlueprintFromMesh(forward, {
      name: "L block",
      unitScaleAlreadyApplied: true,
    });
    const b = extractBlueprintFromMesh(reversed, {
      name: "L block",
      unitScaleAlreadyApplied: true,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.facts.boundaryAreaSqm).toBeCloseTo(a.facts.boundaryAreaSqm, 6);

    const key = (points: PointMm[]) =>
      points
        .map((p) => `${p.xMm},${p.zMm}`)
        .sort()
        .join(" ");
    expect(key(boundaryPoints(b.blueprint.boundaries[0].loop.segments))).toBe(
      key(boundaryPoints(a.blueprint.boundaries[0].loop.segments)),
    );
  });
});

/* ------------------------------------------------------------------ */
/* (g) The 2D path is untouched                                        */
/* ------------------------------------------------------------------ */

describe("mesh extraction — 2D drawings are left alone", () => {
  it("finds no mesh in an ordinary 2D plan", () => {
    const extraction = extractMeshFacesFromDxfText(PLAN_2D_DXF);
    expect(extraction.faces).toHaveLength(0);
    expect(extraction.stats.threeDFaceCount).toBe(0);

    // …and the 2D mapper still reads it exactly as before.
    const doc = mapDxfTextToDoc(PLAN_2D_DXF, "plan.dxf");
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].kind).toBe("polyline");
    expect(doc.unitScaleToMeters).toBe(0.001);
    expect(doc.insUnits).toBe(4);
  });

  it("finds neither geometry nor mesh in an empty drawing", () => {
    expect(extractMeshFacesFromDxfText(EMPTY_DXF).faces).toHaveLength(0);
    expect(mapDxfTextToDoc(EMPTY_DXF, "empty.dxf").entities).toHaveLength(0);
  });
});
