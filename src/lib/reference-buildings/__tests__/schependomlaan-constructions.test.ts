import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CLINIC_LAYER_MAPPINGS,
  SCHEPENDOMLAAN_LAYER_MAPPINGS,
  directionFor,
  envelopeConstructions,
  layerMappingsFor,
  solveConstruction,
  solveConstructions,
} from "../constructions";
import type { ReferenceBuildingManifest } from "../manifest";

const load = (id: string) =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), `public/reference-buildings/${id}/manifest.json`),
      "utf8",
    ),
  ) as ReferenceBuildingManifest;

const manifest = load("schependomlaan");
const clinic = load("bs-medical-dental-clinic");

const byName = (name: string) => {
  const assembly = (manifest.assemblies ?? []).find((a) => a.name === name);
  if (!assembly) throw new Error(`no assembly named ${name}`);
  return solveConstruction(assembly, SCHEPENDOMLAAN_LAYER_MAPPINGS);
};

describe("the solver picks its table by manifest.id", () => {
  it("gives each building its own table, and an unknown id an empty one", () => {
    expect(layerMappingsFor("schependomlaan")).toBe(SCHEPENDOMLAAN_LAYER_MAPPINGS);
    expect(layerMappingsFor("bs-medical-dental-clinic")).toBe(CLINIC_LAYER_MAPPINGS);
    // Empty, not the Clinic's. A new building must show it has no table
    // rather than silently resolving nothing while looking healthy.
    expect(layerMappingsFor("some-future-building")).toEqual([]);
  });

  it("the Clinic's table would resolve nothing here, which is why there are two", () => {
    const dutchNames = new Set(
      (manifest.assemblies ?? []).flatMap((a) => a.layers.map((l) => l.name)),
    );
    const clinicNames = new Set(CLINIC_LAYER_MAPPINGS.map((m) => m.ifcName));
    expect([...dutchNames].filter((n) => clinicNames.has(n))).toEqual([]);
  });
});

describe("Schependomlaan constructions", () => {
  it("reads its layers from the shipped manifest, not from a fixture", () => {
    expect(manifest.assemblies?.length).toBe(28);
  });

  it("maps every layer name the model actually uses", () => {
    const used = new Set(
      (manifest.assemblies ?? []).flatMap((a) => a.layers.map((l) => l.name)),
    );
    expect(used.size).toBe(23);
    const mapped = new Set(SCHEPENDOMLAAN_LAYER_MAPPINGS.map((m) => m.ifcName));
    expect([...used].filter((n) => !mapped.has(n)).sort()).toEqual([]);
  });

  it("carries no row the model does not use", () => {
    const used = new Set(
      (manifest.assemblies ?? []).flatMap((a) => a.layers.map((l) => l.name)),
    );
    const stray = SCHEPENDOMLAAN_LAYER_MAPPINGS.filter((m) => !used.has(m.ifcName));
    expect(stray.map((m) => m.ifcName)).toEqual([]);
  });

  it("refuses a U-value rather than solving part of an assembly", () => {
    for (const solved of solveConstructions(manifest)) {
      if (solved.unresolved.length > 0) {
        expect(solved.uValueWPerM2K).toBeNull();
        expect(solved.result).toBeNull();
      } else {
        expect(solved.uValueWPerM2K).toBeGreaterThan(0);
      }
    }
  });

  it("names an assumption for every layer it resolves, and for the one it refuses", () => {
    for (const solved of solveConstructions(manifest)) {
      const withMapping = solved.layers.filter((l) => l.mapping !== null);
      expect(solved.assumptions.length).toBe(withMapping.length);
      for (const assumption of solved.assumptions) {
        expect(assumption.basisNote.length).toBeGreaterThan(20);
      }
    }
  });

  it("the one refused layer is refused on purpose, with its reason attached", () => {
    const mat = byName("IFC schoonloopmat");
    expect(mat.unresolved).toEqual(["12 Schoonloopmat"]);
    expect(mat.uValueWPerM2K).toBeNull();
    // A declared "unresolved" row keeps its mapping so the reason travels.
    expect(mat.layers[0].mapping?.basis).toBe("unresolved");
    expect(mat.assumptions[0].basisNote).toMatch(/no honest nearest match/);
  });

  it("gets the heat-flow direction from what the assembly is, in Dutch", () => {
    expect(byName("IFC_dakplaat_geisoleerd_Rc=4,00").direction).toBe("upward");
    expect(byName("IFC_verlaagd_plafond").direction).toBe("upward");
    expect(byName("IFC_vloer_geisoleerde_kanaalplaat_Rc=3,00").direction).toBe("downward");
    expect(byName("IFC_betonvloer_prefab_200mm").direction).toBe("downward");
    expect(byName("IFC_breedplaat_schil_60mm").direction).toBe("downward");
    expect(byName("IFC_kalkzandsteen_100mm").direction).toBe("horizontal");
    // A dakkapel is a DORMER: its zijwang is a vertical cheek, not a roof.
    // "dak" alone would have made it upward.
    expect(byName("IFC_dakkapel_zijwang").direction).toBe("horizontal");
  });

  it("the Clinic's directions are untouched by the Dutch rules", () => {
    expect(directionFor("Basic Wall:Exterior - Insul Panel on Mtl. Stud")).toBe("horizontal");
    expect(directionFor("Basic Roof:EPDM Membrane on Rigid Insul on Metal Deck")).toBe("upward");
    expect(directionFor("Floor:150mm Slab on Grade")).toBe("downward");
  });

  it("agrees with the independently derived envelope, to 1 %", () => {
    // schependomlaan-energy.ts solves the same stacks from the same ISO 6946
    // tables through its own calls. Two routes agreeing is the only reason
    // either number is worth anything.
    const roof = byName("IFC_dakplaat_geisoleerd_Rc=4,00");
    expect(roof.unresolved).toEqual([]);
    expect(roof.uValueWPerM2K).toBeCloseTo(0.1776, 3);

    // The cavity wall is NOT an assembly here — the model states three
    // leaves. Each solves on its own, and the insulation leaf alone lands
    // near the composite by coincidence: 110 mm of glass wool is most of the
    // wall's resistance either way.
    const insulation = byName("IFC_isolatie_110mm_glaswol");
    expect(insulation.unresolved).toEqual([]);
    expect(insulation.uValueWPerM2K).toBeCloseTo(0.3117, 3);

    const inner = byName("IFC_kalkzandsteen_100mm");
    expect(inner.uValueWPerM2K).toBeCloseTo(1 / (0.1 / 0.8 + 0.153), 3);
  });

  it("solves the ground floor to an air-to-air U that must NOT be used as a ground U", () => {
    const floor = byName("IFC_vloer_geisoleerde_kanaalplaat_Rc=3,00");
    expect(floor.unresolved).toEqual([]);
    // 0.2516 air-to-air against ISO 13370's 0.1637. Smaller than the Clinic's
    // 16x gap because this floor is genuinely insulated, but still the wrong
    // physics — SCHEPENDOMLAAN_GROUND_FLOOR is what the energy path uses.
    expect(floor.uValueWPerM2K).toBeCloseTo(0.2516, 3);
    expect(floor.uValueWPerM2K).toBeGreaterThan(0.1637);
  });
});

describe("the envelope list", () => {
  const envelope = envelopeConstructions(manifest);

  it("is not empty — the Clinic's keyword rule would have returned nothing", () => {
    expect(envelope.length).toBeGreaterThan(0);
    const clinicRule = /exterior|roof|slab on grade|foundation/i;
    expect((manifest.assemblies ?? []).filter((a) => clinicRule.test(a.name))).toEqual([]);
  });

  it("holds the twelve envelope assemblies and no interior partition", () => {
    const names = envelope.map((c) => c.name).sort();
    expect(names).toEqual([
      "IFC_baksteen_kopergeel_100mm_liggend",
      "IFC_baksteen_kopergeel_100mm_staand",
      "IFC_baksteen_roodbruin_100mm_liggend",
      "IFC_baksteen_roodbruin_100mm_staand",
      "IFC_dakkapel_zijwang",
      "IFC_dakplaat_geisoleerd_Rc=4,00",
      "IFC_isolatie_110mm_glaswol",
      "IFC_kalkzandsteen_100mm",
      "IFC_kalkzandsteen_120mm",
      "IFC_kozijn_90x114",
      "IFC_vloer_EPS_stortstrook_Rc=3,00",
      "IFC_vloer_geisoleerde_kanaalplaat_Rc=3,00",
    ]);
    // The 175/214/300 mm kalkzandsteen walls are internal and party walls; a
    // keyword rule on "kalkzandsteen" would have dragged all three in.
    expect(names.some((n) => /kalkzandsteen_(175|214|300)/.test(n))).toBe(false);
    expect(names.some((n) => /separatiewand|gipsblokken|HSB|verlaagd_plafond/.test(n))).toBe(false);
  });

  it("is sorted worst first, so the leakiest surface cannot hide", () => {
    const us = envelope.map((c) => c.uValueWPerM2K ?? -1);
    expect([...us]).toEqual([...us].sort((a, b) => b - a));
    expect(envelope[envelope.length - 1].name).toMatch(/dakplaat/);
  });

  it("leaves the Clinic's envelope list exactly as it was", () => {
    // Pinned in full, in order. Per-building predicates replaced a single
    // regex, and the one thing that must not have moved is the building
    // whose behaviour was already committed.
    expect(envelopeConstructions(clinic).map((c) => c.name)).toEqual([
      "Floor:150mm Slab on Grade",
      "Floor:150mm Exterior Slab on Grade",
      "Basic Wall:Foundation - Concrete (264mm)",
      "Basic Wall:Foundation - Concrete (300mm)",
      "Basic Roof:Standing Seam Metal Roof",
      "Basic Wall:Exterior - Insul Panel on Mtl. Stud",
      "Basic Roof:EPDM Membrane on Rigid Insul on Metal Deck",
    ]);
    // Worst first: the two slabs lead at air-to-air U ~3.9, which is itself
    // the wrong physics for a ground floor and is exactly why
    // CLINIC_GROUND_FLOOR exists. This list reports what the layer sets
    // resist, not what the energy path uses.
  });
});
