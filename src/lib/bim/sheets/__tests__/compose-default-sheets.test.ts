import { describe, it, expect } from "vitest";
import { composeDefaultSheets } from "../compose-default-sheets";

describe("composeDefaultSheets", () => {
  it("emits four autonomous sheets with Korean names", () => {
    const sheets = composeDefaultSheets({
      buildingName: "데모 오피스 타워",
      locale: "ko",
      date: "2026-08-15",
      planViewId: "plan-1",
      elevationViewId: "elev-front",
    });
    expect(sheets).toHaveLength(4);
    expect(sheets.map((s) => s.id)).toEqual([
      "sheet-a101",
      "sheet-a201",
      "sheet-s101",
      "sheet-e101",
    ]);
    expect(sheets[0].name).toContain("평면도");
    expect(sheets[2].viewports.every((v) => v.kind === "schedule")).toBe(true);
    expect(sheets[0].titleBlock.buildingName).toBe("데모 오피스 타워");
    expect(sheets[0].titleBlock.date).toBe("2026-08-15");
  });

  it("uses the supplied view ids in viewports", () => {
    const sheets = composeDefaultSheets({
      buildingName: "Tower",
      locale: "en",
      planViewId: "plan-2",
      elevationViewId: "elev-back",
    });
    expect(sheets[0].viewports[0].targetId).toBe("plan-2");
    expect(sheets[1].viewports[0].targetId).toBe("elev-back");
  });
});
