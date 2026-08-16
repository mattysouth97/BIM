import { describe, it, expect } from "vitest";
import { inferLod, resolveRevitIdentity } from "../revit-identity";

describe("inferLod", () => {
  it("maps ledger estimates to LOD 200", () => {
    expect(inferLod("code-estimate")).toBe(200);
    expect(inferLod(undefined)).toBe(200);
  });

  it("maps IFC imports to LOD 300", () => {
    expect(inferLod("ifc-import")).toBe(300);
    expect(inferLod("ifc-model")).toBe(300);
  });

  it("maps user/cert input to LOD 350", () => {
    expect(inferLod("user-input")).toBe(350);
    expect(inferLod("energy-cert")).toBe(350);
  });
});

describe("resolveRevitIdentity", () => {
  it("returns Wall : Basic Wall : Exterior type for RC walls", () => {
    const id = resolveRevitIdentity({
      kind: "wall",
      strctCd: "11",
      wallThicknessM: 0.2,
    });
    expect(id.category).toBe("Walls");
    expect(id.family).toBe("Basic Wall");
    expect(id.type).toContain("200mm");
    expect(id.familyKind).toBe("system");
    expect(id.assetSlot).toBe("family.wall.basic");
    expect(id.displayEn).toContain("Walls : Basic Wall");
  });

  it("uses curtain-wall family when curtainWall is set", () => {
    const id = resolveRevitIdentity({ kind: "wall", curtainWall: true });
    expect(id.family).toBe("Curtain Wall");
    expect(id.assetSlot).toBe("family.wall.curtain");
  });

  it("classifies windows as loadable families", () => {
    const id = resolveRevitIdentity({ kind: "window" });
    expect(id.category).toBe("Windows");
    expect(id.familyKind).toBe("loadable");
    expect(id.assetSlot).toBe("family.window.fixed");
  });

  it("classifies columns with size type", () => {
    const id = resolveRevitIdentity({ kind: "column", columnSizeM: 0.6 });
    expect(id.category).toBe("Structural Columns");
    expect(id.type).toBe("600 x 600 mm");
    expect(id.assetSlot).toBe("family.column.rectangular");
  });

  it("maps MEP selection onto mechanical equipment", () => {
    const id = resolveRevitIdentity({
      equipment: {
        equipmentId: "mep-1",
        subLayerId: "mep-hvac",
        componentType: "chiller",
        floorNo: 4,
        specs: {
          categoryKo: "냉방기",
          categoryEn: "Cooling Plant",
          capacity: "12 kW",
          installYear: 2015,
          annualKwh: 1000,
          efficiencyGrade: 2,
          efficiencyGradeLabel: "2등급",
          gradeColor: "#22c55e",
          dataSource: "estimated-from-era",
          standardRef: "KS B 6364",
        },
      },
    });
    expect(id.category).toBe("Mechanical Equipment");
    expect(id.family).toBe("Chiller");
    expect(id.type).toBe("Cooling Plant");
    expect(id.assetSlot).toBe("family.mep.chiller");
  });
});
