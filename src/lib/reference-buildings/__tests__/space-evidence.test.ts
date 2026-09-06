// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allSpaceBoundaries, withMeasuredSpaceAreas } from "../../../../scripts/lib/ifc-space-evidence.mjs";
import { extractAssemblies, extractStoreys } from "../../../../scripts/lib/ifc-envelope.mjs";
import { classifyRoofs } from "../../../../scripts/lib/ifc-horizontal.mjs";

describe("IFC source evidence fallback", () => {
  it("includes second-level boundaries and deduplicates a subtype also returned by a base query", () => {
    const one = { expressID: 1 }, two = { expressID: 2 }, three = { expressID: 3 };
    const file = { byType: (type: number) => ({ 10: [one, two], 11: [two], 12: [three] })[type] ?? [] };
    expect(allSpaceBoundaries(file, { IFCRELSPACEBOUNDARY: 10, IFCRELSPACEBOUNDARY1STLEVEL: 11, IFCRELSPACEBOUNDARY2NDLEVEL: 12 })).toEqual([one, two, three]);
    expect(allSpaceBoundaries(file, { IFCRELSPACEBOUNDARY: 10 })).toEqual([one, two]);
  });

  it("keeps quantities including an explicit zero ahead of solid geometry, and missing evidence missing", () => {
    const spaces = [{ expressID: 1, floorAreaSqm: 6 }, { expressID: 2, floorAreaSqm: 0 }, { expressID: 3, floorAreaSqm: null, areaQuantityName: null }, { expressID: 4, floorAreaSqm: null }, { expressID: 5, floorAreaSqm: null }];
    const footprints = new Map([[1, { areaSqm: 9, source: "solid" }], [2, { areaSqm: 9, source: "solid" }], [3, { areaSqm: 7.65432, source: "solid" }], [4, { areaSqm: 2, source: "footprint" }]]);
    const rows = withMeasuredSpaceAreas(spaces, footprints);
    expect(rows[0]).toBe(spaces[0]); expect(rows[1]).toBe(spaces[1]);
    expect(rows[2]).toMatchObject({ floorAreaSqm: 7.654, floorAreaSource: "solid_plan_union", areaQuantityName: null });
    expect(rows[3]).toMatchObject({ floorAreaSqm: 2, floorAreaSource: "footprint_representation" });
    expect(rows[4].floorAreaSqm).toBeNull();
  });

  it("composes nested storey placements in metres only when the elevation attribute is absent", () => {
    const rows = [
      { expressID: 1, Name: "ground", Elevation: { _representationValue: 0 }, ObjectPlacement: 30 },
      { expressID: 2, Name: "upper", Elevation: null, ObjectPlacement: 31 },
    ];
    const refs: Record<number, unknown> = {
      30: { RelativePlacement: 40 }, 31: { RelativePlacement: 41, PlacementRelTo: 30 },
      40: { Location: 50 }, 41: { Location: 51 },
      50: { Coordinates: [0, 0, 100] }, 51: { Coordinates: [0, 0, 3450] },
    };
    const file = { byType: () => rows, units: { lengthToMetres: 0.001 }, deref: (ref: number) => refs[ref], ref: (id: number) => `ifc://test#${id}` };
    const result = extractStoreys(file, { IFCBUILDINGSTOREY: 1 });
    expect(result[0].elevationM).toBe(0); // zero attribute wins over 0.1 m placement
    expect(result[1]).toMatchObject({ elevationM: 3.55, elevationSource: "ObjectPlacement" });
    expect(result[0].floorToFloorHeightM).toBe(3.55);
  });

  it("uses declared roof-covering scope without calling a source FLOORING value ROOFING", () => {
    const rows = [
      { typeName: "IfcCovering", predefinedType: "FLOORING", name: "Roofing_Gravel" },
      { typeName: "IfcCovering", predefinedType: "ROOFING", name: "Attica_Cap" },
      { typeName: "IfcCovering", predefinedType: "FLOORING", name: "IndoorFloor" },
    ];
    const result = classifyRoofs(rows, { coveringNameMatch: ["Roofing_Gravel"], excludeNames: ["Attica"] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ predefinedType: "FLOORING", basis: "declared roof covering name" });
  });

  it("publishes source conductivity only with a verified SI policy and a citable positive property", () => {
    const refs: Record<number, unknown> = {
      1: { expressID: 1, Material: { value: 2 }, LayerThickness: 0.1 },
      2: { expressID: 2, Name: "Insulation" },
      3: { expressID: 3, Name: "ThermalConductivity", NominalValue: { _representationValue: 0.04 }, Unit: null },
    };
    const file = { units: { lengthToMetres: 1 }, deref: (ref: number | { value: number }) => refs[typeof ref === "number" ? ref : ref.value], ref: (id: number) => `ifc://test#${id}`,
      byType: (type: number) => type === 10 ? [{ Material: { value: 2 }, Properties: [3] }] : [{ expressID: 4, LayerSetName: "Wall", MaterialLayers: [1] }] };
    const types = { IFCMATERIALPROPERTIES: 10, IFCMATERIALLAYERSET: 11 };
    expect(extractAssemblies(file, types)[0].layers[0].sourceThermalProperties).toBeUndefined();
    expect(extractAssemblies(file, types, { thermalPropertiesInSI: true })[0].layers[0].sourceThermalProperties).toEqual({ conductivityWPerMK: 0.04, ref: "ifc://test#3" });
    (refs[3] as { Unit: unknown }).Unit = { value: 99 };
    expect(extractAssemblies(file, types, { thermalPropertiesInSI: true })[0].layers[0].sourceThermalProperties).toBeUndefined();
  });
});
