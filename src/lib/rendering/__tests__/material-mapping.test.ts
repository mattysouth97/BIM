import { describe, expect, it } from "vitest";
import { MATERIAL_ONTOLOGY } from "../material-ontology";
import { MATERIAL_LIBRARY, getVisualMaterial } from "../material-library";
import { resolveVisualMaterialId } from "../bim-material-mapping";
import { clampAlbedoHex, isCadBlueGlass, srgbLuminance } from "../pbr-standards";

describe("material ontology and library", () => {
  it("has a library entry for every ontology node", () => {
    const ids = new Set(MATERIAL_LIBRARY.map((s) => s.id));
    for (const node of MATERIAL_ONTOLOGY) {
      expect(ids.has(node.id)).toBe(true);
      expect(getVisualMaterial(node.id).id).toBe(node.id);
    }
  });

  it("keeps dielectric albedos out of crushed black and blown white", () => {
    for (const spec of MATERIAL_LIBRARY) {
      if (spec.metalness >= 0.5) continue;
      const y = srgbLuminance(spec.albedo);
      expect(y).toBeGreaterThanOrEqual(0.04);
      expect(y).toBeLessThanOrEqual(0.94);
    }
  });

  it("clampAlbedoHex lifts a crushed black dielectric", () => {
    const next = clampAlbedoHex("#000000", false);
    expect(srgbLuminance(next)).toBeGreaterThanOrEqual(0.04);
  });

  it("recognises the legacy CAD blue glass", () => {
    expect(isCadBlueGlass("#88BBDD")).toBe(true);
    expect(isCadBlueGlass("#d5e0dc")).toBe(false);
  });
});

describe("BIM → visual material mapping", () => {
  it("maps masonry walls to brick", () => {
    expect(resolveVisualMaterialId({ strctCd: "22", era: "1990-1999", role: "wall" })).toBe("brick-weathered");
    expect(resolveVisualMaterialId({ strctCd: "22", era: "2010-2019", role: "wall" })).toBe("brick-red-clay");
  });

  it("maps RC walls by era", () => {
    expect(resolveVisualMaterialId({ strctCd: "11", era: "pre-1970", role: "wall" })).toBe("concrete-board-formed");
    expect(resolveVisualMaterialId({ strctCd: "11", era: "2020+", role: "wall" })).toBe("concrete-architectural");
  });

  it("maps modern apartments to stucco, not raw concrete", () => {
    expect(resolveVisualMaterialId({
      strctCd: "11",
      mainPurpsCd: "02000",
      era: "2010-2019",
      role: "wall",
    })).toBe("paint-stucco");
  });

  it("maps glazing by era without inventing engineering U-values", () => {
    expect(resolveVisualMaterialId({ era: "pre-1970", role: "glass" })).toBe("glass-clear");
    expect(resolveVisualMaterialId({ era: "2010-2019", role: "glass" })).toBe("glass-low-e");
    expect(resolveVisualMaterialId({ era: "2020+", role: "glass" })).toBe("glass-low-e");
  });

  it("maps pitched residential roofs to tile and flat roofs to membrane", () => {
    expect(resolveVisualMaterialId({ era: "pre-1970", role: "roof", roofType: "hip" })).toBe("roof-clay-tile");
    expect(resolveVisualMaterialId({ era: "2010-2019", role: "roof", roofType: "flat" })).toBe("roof-membrane");
  });

  it("maps steel factories to painted metal walls", () => {
    expect(resolveVisualMaterialId({
      strctCd: "13",
      mainPurpsCd: "17000",
      era: "2000-2009",
      role: "wall",
    })).toBe("metal-painted-steel");
  });

  it("never mutates the query object", () => {
    const query = { strctCd: "11", era: "2010-2019" as const, role: "wall" as const };
    const frozen = { ...query };
    resolveVisualMaterialId(query);
    expect(query).toEqual(frozen);
  });
});
