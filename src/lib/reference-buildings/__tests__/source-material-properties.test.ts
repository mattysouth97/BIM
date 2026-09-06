import { describe, expect, it } from "vitest";
import { KLASSIQUA_LAYER_MAPPINGS, solveConstruction } from "../constructions";
import { sourceMaterialSample } from "../material-appearance";

const layer = (conductivityWPerMK: number, name = "Source concrete") => ({
  name, thicknessM: 0.2, ref: "ifc://source.ifc#12",
  sourceThermalProperties: { conductivityWPerMK, ref: "ifc://source.ifc#30" },
});
const assembly = (layers: ReturnType<typeof layer>[]) => ({
  id: "source-wall", name: "Wall", ref: "ifc://source.ifc#40", totalThicknessM: layers.reduce((n, x) => n + x.thicknessM, 0), layers,
});

describe("source thermal properties", () => {
  it("uses a cited source conductivity without a generic material mapping", () => {
    const solved = solveConstruction(assembly([layer(2)]), []);
    expect(solved.layers[0].resistanceM2KPerW).toBe(0.1);
    // This product's assembly calculator uses Korean wall film resistances.
    expect(solved.uValueWPerM2K).toBeCloseTo(1 / (0.11 + 0.1 + 0.043));
    expect(solved.assumptions).toEqual([]);
    expect(solved.layers[0].thermalSource?.ref).toBe("ifc://source.ifc#30");
    expect(solved.ref).toBe("ifc://source.ifc#40");
  });
  it("prefers a source property over a generic surrogate", () => {
    const solved = solveConstruction(assembly([layer(2)]), [{ ifcName: "Source concrete", basis: "generic_material", materialId: "st-brick", basisNote: "Surrogate" }]);
    expect(solved.layers[0].conductivityWPerMK).toBe(2);
    expect(solved.assumptions).toEqual([]);
    expect(solved.layers[0].mapping).toBeNull();
  });
  it("applies the documented insulation design factor once", () => {
    const solved = solveConstruction(assembly([layer(0.045, "Insulation_XPS_Lambda0.045_1970")]), KLASSIQUA_LAYER_MAPPINGS);
    expect(solved.layers[0].conductivityWPerMK).toBeCloseTo(0.04635, 8);
    expect(solved.layers[0].resistanceM2KPerW).toBeCloseTo(0.2 / 0.04635, 8);
    expect(solved.layers[0].thermalSource?.conversionRef).toContain("21727160");
  });
  it.each([0, -1, NaN, Infinity])("refuses invalid source conductivity %s", (value) => {
    const solved = solveConstruction(assembly([layer(value)]), []);
    expect(solved.uValueWPerM2K).toBeNull();
    expect(solved.unresolved).toHaveLength(1);
  });
  it("keeps an uncited property unresolved", () => {
    const input = layer(2);
    input.sourceThermalProperties.ref = "";
    expect(solveConstruction(assembly([input]), []).uValueWPerM2K).toBeNull();
  });
  it("does not turn source carpet, gravel or ceramic into insulation or masonry", () => {
    expect(sourceMaterialSample("klassiqua-office-1970", "Carpet_NeedleFelt_5mm").kind).toBe("carpet");
    expect(sourceMaterialSample("klassiqua-office-1970", "Gravel").kind).toBe("gravel");
    expect(sourceMaterialSample("klassiqua-office-1970", "Tile_Ceramic").kind).toBe("ceramic");
    expect(sourceMaterialSample("unreviewed-model", "Gravel").kind).toBe("unknown");
  });
});
