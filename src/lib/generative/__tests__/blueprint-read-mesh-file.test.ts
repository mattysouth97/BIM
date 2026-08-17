// src/lib/generative/__tests__/blueprint-read-mesh-file.test.ts
//
// The seam where a 3D-only DXF stops being a dead end. `readCadFile` used to
// answer EMPTY_DRAWING for a file made of 3DFACEs — true, and useless. It now
// answers MESH_ONLY_DRAWING and hands back the mesh, and `importMeshDrawing`
// turns that into the same `{blueprint, report}` pair every other importer
// returns, so the dialog's preview/adopt flow needs no special case.
//
// EMPTY_DRAWING must still exist, unchanged, for a file that really is empty.

import { describe, it, expect } from "vitest";

import { importMeshDrawing } from "@/lib/generative/blueprint/import-mesh-file";
import { readCadFile } from "@/lib/generative/blueprint/read-cad-file";

import {
  BOX_DXF,
  BOX_MM_DXF,
  EMPTY_DXF,
  OPEN_PANELS_DXF,
  PLAN_2D_DXF,
} from "./mesh-dxf-fixture";

function dxfFile(name: string, text: string): File {
  const file = new File([text], name, { type: "application/dxf" });
  // happy-dom's File may lack .text(); the reader depends on it.
  if (typeof (file as { text?: () => Promise<string> }).text !== "function") {
    Object.defineProperty(file, "text", { value: async () => text });
  }
  return file;
}

describe("readCadFile — 3D-mesh drawings", () => {
  it("offers the mesh instead of calling a 3DFACE file empty", async () => {
    const result = await readCadFile(dxfFile("box.dxf", BOX_DXF));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("MESH_ONLY_DRAWING");
    expect(result.error.message).toContain("box.dxf");
    expect(result.error.message).toContain("3D model");
    expect(result.error.detail?.join(" ")).toContain("6 mesh face(s)");
    expect(result.mesh).toBeDefined();
    expect(result.mesh?.faces).toHaveLength(6);
    expect(result.mesh?.stats.estimatedFloors).toBe(1);
    expect(result.mesh?.unitScaleToMeters).toBe(1);
    expect(result.mesh?.documentId).toBe("box.dxf");
  });

  it("still calls a genuinely empty drawing empty", async () => {
    const result = await readCadFile(dxfFile("empty.dxf", EMPTY_DXF));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMPTY_DRAWING");
    expect(result.mesh).toBeUndefined();
  });

  it("leaves an ordinary 2D drawing on the 2D path", async () => {
    const result = await readCadFile(dxfFile("plan.dxf", PLAN_2D_DXF));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.entities).toHaveLength(1);
    expect(result).not.toHaveProperty("mesh");
  });
});

describe("importMeshDrawing", () => {
  it("returns a blueprint and a report the dialog can render", async () => {
    const read = await readCadFile(dxfFile("box.dxf", BOX_DXF));
    expect(read.ok).toBe(false);
    if (read.ok || !read.mesh) return;

    const outcome = importMeshDrawing(read.mesh, {
      fileName: "box.dxf",
      name: "box",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.blueprint.boundaries).toHaveLength(1);
    expect(outcome.facts.method).toBe("slice");
    expect(outcome.report.fileName).toBe("box.dxf");
    expect(outcome.report.boundaryAreaSqm).toBeCloseTo(60, 3);
    expect(outcome.report.loops.boundary).toBe(1);
    // A mesh has no layer roles to confirm — the table is honestly empty.
    expect(outcome.report.layers).toEqual([]);
    expect(outcome.report.mapping).toEqual([]);
  });

  it("carries the declared unit scale into the spec's provenance", async () => {
    const read = await readCadFile(dxfFile("box-mm.dxf", BOX_MM_DXF));
    if (read.ok || !read.mesh) throw new Error("expected a mesh-only read");

    const outcome = importMeshDrawing(read.mesh, { fileName: "box-mm.dxf" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.report.units.declared).toBe(true);
    expect(outcome.report.units.insUnits).toBe(4);
    expect(outcome.blueprint.coordinateSystem.calibrated).toBe(true);
    expect(
      outcome.blueprint.assumptions.find((a) => a.id === "cad-units")?.statement,
    ).toContain("$INSUNITS = 4");
  });

  it("honours the footprint toggle", async () => {
    const read = await readCadFile(dxfFile("box.dxf", BOX_DXF));
    if (read.ok || !read.mesh) throw new Error("expected a mesh-only read");

    const outcome = importMeshDrawing(read.mesh, { useProjection: true });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.facts.method).toBe("projection");
  });

  it("reports a mesh nothing closes as a typed failure, with a report", async () => {
    const read = await readCadFile(dxfFile("panels.dxf", OPEN_PANELS_DXF));
    if (read.ok || !read.mesh) throw new Error("expected a mesh-only read");

    const outcome = importMeshDrawing(read.mesh, { fileName: "panels.dxf" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("MESH_NO_CLOSED_BOUNDARY");
    expect(outcome.report.fileName).toBe("panels.dxf");
  });
});
