import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ReferenceBuildingManifest } from "../manifest";
import { envelopeConstructions } from "../constructions";
import { materialSelectionGap, selectedMaterialConstruction } from "../material-selection";

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/reference-buildings/bs-medical-dental-clinic/manifest.json"), "utf8")) as ReferenceBuildingManifest;

describe("surface material selection", () => {
  it("finds an assigned assembly outside the default envelope list by its exact source ref", () => {
    const shown = envelopeConstructions(manifest);
    const binding = manifest.materialFabric!.bindings.find((entry) => entry.assemblyRef && !shown.some((construction) => construction.ref === entry.assemblyRef))!;
    expect(binding).toBeDefined();
    const selected = selectedMaterialConstruction(manifest, { binding, revision: 1 });
    expect(selected?.ref).toBe(binding.assemblyRef);
    expect(selected?.name).toBe(binding.assemblyName);
    expect(shown.some((construction) => construction.id === selected?.id)).toBe(false);
  });

  it("never substitutes another stack when a matching association is missing", () => {
    const binding = manifest.materialFabric!.bindings[0];
    expect(selectedMaterialConstruction(manifest, { binding: { ...binding, assemblyRef: "ifc://missing.ifc#1" }, revision: 1 })).toBeNull();
    expect(selectedMaterialConstruction(manifest, { binding: { ...binding, assemblyRef: null }, revision: 1 })).toBeNull();
    expect(materialSelectionGap({ ...binding, status: "single_material" }, false)).toContain("single material");
    expect(materialSelectionGap({ ...binding, status: "ambiguous" }, false)).toContain("Several material assignments");
    expect(materialSelectionGap({ ...binding, status: "unassigned" }, true)).toContain("확인되지 않았습니다");
  });
});
