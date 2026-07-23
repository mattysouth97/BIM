import { describe, it, expect } from "vitest";
import {
  classifyElement,
  structureFamilyFor,
  ifcDisplayLine,
} from "../ifc-classification";

describe("structureFamilyFor", () => {
  it("maps ledger strctCd prefixes to families", () => {
    expect(structureFamilyFor("11")).toBe("rc");
    expect(structureFamilyFor("21")).toBe("rc");
    expect(structureFamilyFor("12")).toBe("src");
    expect(structureFamilyFor("13")).toBe("steel");
    expect(structureFamilyFor("15")).toBe("timber");
    expect(structureFamilyFor("22")).toBe("masonry");
  });

  it("returns unknown for missing/unmapped codes", () => {
    expect(structureFamilyFor(undefined)).toBe("unknown");
    expect(structureFamilyFor("99")).toBe("unknown");
  });
});

describe("classifyElement", () => {
  it("classifies slabs and roofs as IfcSlab with predefined types", () => {
    const slab = classifyElement("slab", { strctCd: "11" })!;
    expect(slab.ifcClass).toBe("IfcSlab");
    expect(slab.predefinedType).toBe("FLOOR");
    expect(slab.loadBearing).toBe(true);
    expect(slab.isExternal).toBe(false);

    const roof = classifyElement("roof", { strctCd: "11" })!;
    expect(roof.predefinedType).toBe("ROOF");
    expect(roof.isExternal).toBe(true);
  });

  it("classifies columns as load-bearing IfcColumn", () => {
    for (const t of ["column", "structural-column"]) {
      const c = classifyElement(t, { strctCd: "13" })!;
      expect(c.ifcClass).toBe("IfcColumn");
      expect(c.loadBearing).toBe(true);
      expect(c.materialEn).toBe("Structural steel");
    }
  });

  it("walls bear load only in masonry structures", () => {
    expect(classifyElement("solidPanel", { strctCd: "22" })!.loadBearing).toBe(true);
    expect(classifyElement("solidPanel", { strctCd: "11" })!.loadBearing).toBe(false);
  });

  it("glass is IfcWindow normally, IfcCurtainWall in curtain-wall mode", () => {
    expect(classifyElement("glass")!.ifcClass).toBe("IfcWindow");
    expect(classifyElement("glass", { curtainWall: true })!.ifcClass).toBe("IfcCurtainWall");
    expect(classifyElement("glass")!.loadBearing).toBe(false);
  });

  it("mullions are IfcMember.MULLION", () => {
    for (const t of ["hMullion", "vMullion"]) {
      const c = classifyElement(t)!;
      expect(c.ifcClass).toBe("IfcMember");
      expect(c.predefinedType).toBe("MULLION");
    }
  });

  it("returns null for non-building element types", () => {
    expect(classifyElement("cooling-branch")).toBeNull();
    expect(classifyElement("unknown-thing")).toBeNull();
  });
});

describe("ifcDisplayLine", () => {
  it("renders class.predefinedType with bearing and material per language", () => {
    const slab = classifyElement("slab", { strctCd: "11" })!;
    expect(ifcDisplayLine(slab, "ko")).toBe("IfcSlab.FLOOR · 내력 · 철근콘크리트");
    expect(ifcDisplayLine(slab, "en")).toBe(
      "IfcSlab.FLOOR · load-bearing · Reinforced concrete"
    );
  });

  it("omits predefinedType when absent", () => {
    const col = classifyElement("column", { strctCd: "11" })!;
    expect(ifcDisplayLine(col, "en")).toBe("IfcColumn · load-bearing · Reinforced concrete");
  });
});
