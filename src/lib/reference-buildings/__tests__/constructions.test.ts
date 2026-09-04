import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CLINIC_LAYER_MAPPINGS,
  solveConstruction,
  solveConstructions,
} from "../constructions";
import type { ReferenceBuildingManifest } from "../manifest";

const manifest = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "public/reference-buildings/bs-medical-dental-clinic/manifest.json",
    ),
    "utf8",
  ),
) as ReferenceBuildingManifest;

const byName = (name: string) => {
  const assembly = (manifest.assemblies ?? []).find((a) => a.name === name);
  if (!assembly) throw new Error(`no assembly named ${name}`);
  return solveConstruction(assembly);
};

describe("Clinic constructions", () => {
  it("reads its layers from the shipped manifest, not from a fixture", () => {
    // The point of this suite is that it runs against the artifact the app
    // serves. A fixture would let the two drift.
    expect(manifest.assemblies?.length).toBe(16);
  });

  it("refuses a U-value rather than solving part of an assembly", () => {
    // A U computed from four of five layers is not a worse U — it is a
    // different assembly's U. Every construction either resolves completely or
    // reports which layers it could not.
    for (const solved of solveConstructions(manifest)) {
      if (solved.unresolved.length > 0) {
        expect(solved.uValueWPerM2K).toBeNull();
        expect(solved.result).toBeNull();
      } else {
        expect(solved.uValueWPerM2K).toBeGreaterThan(0);
      }
    }
  });

  it("names an assumption for every layer it does resolve", () => {
    // No layer may contribute a resistance without a recorded reason: that is
    // the stated-versus-assumed invariant applied to the material mapping.
    for (const solved of solveConstructions(manifest)) {
      const resolved = solved.layers.filter((l) => l.mapping !== null);
      expect(solved.assumptions.length).toBe(resolved.length);
      for (const assumption of solved.assumptions) {
        expect(assumption.basisNote.length).toBeGreaterThan(20);
      }
    }
  });

  it("maps every layer name the Clinic actually uses", () => {
    // A name the model uses and the table does not cover is a gap in the
    // table, and it should fail here rather than quietly produce a null U.
    const used = new Set(
      (manifest.assemblies ?? []).flatMap((a) => a.layers.map((l) => l.name)),
    );
    const mapped = new Set(CLINIC_LAYER_MAPPINGS.map((m) => m.ifcName));
    const missing = [...used].filter((n) => !mapped.has(n));
    // 'Default' and 'Ceiling Tile' belong to suspended ceilings, which are not
    // envelope; they are deliberately unmapped.
    expect(missing.sort()).toEqual([
      "Ceiling Tile 600 x 600",
      "Default",
      "Laminate - Ivory, Matte",
    ]);
  });

  it("gets the heat-flow direction from what the assembly is", () => {
    expect(byName("Basic Wall:Exterior - Insul Panel on Mtl. Stud").direction).toBe(
      "horizontal",
    );
    expect(byName("Basic Roof:EPDM Membrane on Rigid Insul on Metal Deck").direction).toBe(
      "upward",
    );
    expect(byName("Floor:150mm Slab on Grade").direction).toBe("downward");
  });

  it("solves the ground slab, which states only concrete", () => {
    const slab = byName("Floor:150mm Slab on Grade");
    expect(slab.unresolved).toEqual([]);
    // 150 mm of concrete and nothing else is a very poor floor in air-to-air
    // terms. That figure must NOT be used as a ground floor U — ISO 13370
    // ground coupling applies, and an air-to-air number here once invented
    // 267 MWh/yr of heating.
    expect(slab.uValueWPerM2K).toBeGreaterThan(2);
  });

  it("shows the standing-seam roof for what it is: uninsulated", () => {
    const roof = byName("Basic Roof:Standing Seam Metal Roof");
    // Its 330 mm names no insulation at all — metal sheet, deck, joist zone.
    const names = roof.layers.map((l) => l.ifcName);
    expect(names.some((n) => /insulation/i.test(n))).toBe(false);
    if (roof.unresolved.length === 0) {
      // Worse than any code ceiling; this is the atrium roof, not a canopy.
      expect(roof.uValueWPerM2K).toBeGreaterThan(1);
    }
  });
});
