// src/lib/energy/__tests__/lighting-load.test.ts
// Phase 01 (Honest Physics), D-01/D-02/T-01-01 — the one lighting-load
// computation. AGENTS.md: assert what a disclosure string CLAIMS, not that a
// keyword appears — the default-hours assertion below parses the number back
// out of the sentence and checks it reproduces the value it describes.

import { describe, it, expect } from "vitest";
import { modeledLightingLoad } from "../lighting-load";
import { USE_CODE_OPERATING_HOURS } from "../equipment-specs";

function materialsWithLpd(lpd: number) {
  return { lighting: { lightingPowerDensity: lpd, controlType: "manual" as const, lampType: "led" as const } };
}

describe("modeledLightingLoad", () => {
  it("D-01: kwh = (lpd * area * hours) / 1000, lifted from use-retrofit-scenario.ts's validated formula", () => {
    const load = modeledLightingLoad({
      materials: materialsWithLpd(10),
      conditionedFloorAreaSqm: 1000,
      mainPurpsCd: "14000", // office — USE_CODE_OPERATING_HOURS 4380
    });
    expect(load.lpdWPerSqm).toBe(10);
    expect(load.hoursPerYear).toBe(4380);
    expect(load.kwh).toBe((10 * 1000 * 4380) / 1000);
  });

  it("D-02: a 주용도코드 present in USE_CODE_OPERATING_HOURS returns exactly that table's hours", () => {
    for (const [code, hours] of Object.entries(USE_CODE_OPERATING_HOURS)) {
      const load = modeledLightingLoad({
        materials: materialsWithLpd(8),
        conditionedFloorAreaSqm: 500,
        mainPurpsCd: code,
      });
      expect(load.hoursPerYear).toBe(hours);
      expect(load.provenance.source).toBe("use_code_hours");
    }
  });

  it("an absent-from-table 주용도코드 falls back to the 2500 h default, and the assumption sentence reproduces that exact number", () => {
    const load = modeledLightingLoad({
      materials: materialsWithLpd(8),
      conditionedFloorAreaSqm: 500,
      mainPurpsCd: "10000-does-not-exist",
    });
    expect(load.hoursPerYear).toBe(2500);
    expect(load.provenance.source).toBe("default_hours");
    // Parse the number back out of the sentence rather than checking for a
    // keyword (AGENTS.md, "the label lies while the number is right").
    expect(load.provenance.source === "default_hours" && load.provenance.assumption).toContain(
      String(load.hoursPerYear),
    );
  });

  it("no 주용도코드 at all also falls back to the default, naming the absence rather than an empty code", () => {
    const load = modeledLightingLoad({
      materials: materialsWithLpd(8),
      conditionedFloorAreaSqm: 500,
    });
    expect(load.hoursPerYear).toBe(2500);
    expect(load.provenance.source).toBe("default_hours");
    expect(load.provenance.source === "default_hours" && load.provenance.assumption).toContain("주용도코드가 없어");
    expect(load.provenance.source === "default_hours" && load.provenance.assumption).toContain("2500");
  });

  it("T-01-01: clamps non-finite or negative LPD, area and hours to 0 before multiplying", () => {
    expect(
      modeledLightingLoad({ materials: materialsWithLpd(NaN), conditionedFloorAreaSqm: 1000, mainPurpsCd: "14000" }).kwh,
    ).toBe(0);
    expect(
      modeledLightingLoad({ materials: materialsWithLpd(-5), conditionedFloorAreaSqm: 1000, mainPurpsCd: "14000" }).kwh,
    ).toBe(0);
    expect(
      modeledLightingLoad({ materials: materialsWithLpd(10), conditionedFloorAreaSqm: -100, mainPurpsCd: "14000" }).kwh,
    ).toBe(0);
    expect(
      modeledLightingLoad({ materials: materialsWithLpd(10), conditionedFloorAreaSqm: Infinity, mainPurpsCd: "14000" }).kwh,
    ).toBe(0);
  });

  it("zero LPD is a real (if unusual) input, not a clamp target — kwh is legitimately 0", () => {
    const load = modeledLightingLoad({
      materials: materialsWithLpd(0),
      conditionedFloorAreaSqm: 1000,
      mainPurpsCd: "14000",
    });
    expect(load.lpdWPerSqm).toBe(0);
    expect(load.kwh).toBe(0);
  });
});
