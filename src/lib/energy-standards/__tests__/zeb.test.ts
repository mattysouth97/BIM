import { describe, expect, it } from "vitest";
import { zebGradeOf } from "../zeb";

describe("zebGradeOf — 제2024-893호 grade table", () => {
  it("classifies by self-sufficiency when production is high", () => {
    const result = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 100,
      primaryEnergyProductionKwhPerM2: 125,
      residential: false,
    });
    expect(result.grade).toBe("ZEB_PLUS");
    expect(result.selfSufficiencyPct).toBeCloseTo(125, 9);
    expect(result.earnedBy === "self_sufficiency" || result.earnedBy === "both").toBe(true);
  });

  it("classifies by residual primary energy for 비주거", () => {
    // Residual 40 < 50 → ZEB_3 (fails ZEB_2's < 10).
    const result = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 140,
      primaryEnergyProductionKwhPerM2: 100,
      residential: false,
    });
    expect(result.grade).toBe("ZEB_3");
    expect(result.residualPrimaryKwhPerM2).toBeCloseTo(40, 9);
  });

  it("uses the 주거 thresholds for residential buildings", () => {
    // Residual 5 kWh/m²: 주거 ZEB_1 (< 10) but 비주거 only ZEB_2 (< 10).
    const residential = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 55,
      primaryEnergyProductionKwhPerM2: 50,
      residential: true,
    });
    const nonResidential = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 55,
      primaryEnergyProductionKwhPerM2: 50,
      residential: false,
    });
    expect(residential.grade).toBe("ZEB_1");
    expect(nonResidential.grade).toBe("ZEB_2");
  });

  it("self-sufficiency boundaries are inclusive (≥)", () => {
    expect(
      zebGradeOf({
        primaryEnergyDemandKwhPerM2: 100,
        primaryEnergyProductionKwhPerM2: 100,
        residential: false,
      }).grade
    ).toBe("ZEB_1");
    expect(
      zebGradeOf({
        primaryEnergyDemandKwhPerM2: 100,
        primaryEnergyProductionKwhPerM2: 20,
        residential: true,
      }).grade
    ).toBe("ZEB_5");
  });

  it("residual boundaries are exclusive (<)", () => {
    // Residual exactly 90 fails 주거 ZEB_5's < 90; self-sufficiency 10% fails ≥ 20.
    const result = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 100,
      primaryEnergyProductionKwhPerM2: 10,
      residential: true,
    });
    expect(result.grade).toBe("NONE");
    expect(result.earnedBy).toBeNull();
  });

  it("a building with no renewables and high demand earns no grade", () => {
    const result = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 250,
      primaryEnergyProductionKwhPerM2: 0,
      residential: false,
    });
    expect(result.grade).toBe("NONE");
    expect(result.selfSufficiencyPct).toBe(0);
  });

  it("zero demand yields a null self-sufficiency ratio, not Infinity", () => {
    const result = zebGradeOf({
      primaryEnergyDemandKwhPerM2: 0,
      primaryEnergyProductionKwhPerM2: 50,
      residential: false,
    });
    expect(result.selfSufficiencyPct).toBeNull();
    // Residual −50 < −30 → ZEB_1 via residual for 비주거.
    expect(result.grade).toBe("ZEB_1");
    expect(result.earnedBy).toBe("residual_primary");
  });

  it("better inputs never yield a worse grade (monotonicity sweep)", () => {
    const order = ["NONE", "ZEB_5", "ZEB_4", "ZEB_3", "ZEB_2", "ZEB_1", "ZEB_PLUS"];
    let best = 0;
    for (let production = 0; production <= 260; production += 10) {
      const rank = order.indexOf(
        zebGradeOf({
          primaryEnergyDemandKwhPerM2: 200,
          primaryEnergyProductionKwhPerM2: production,
          residential: false,
        }).grade
      );
      expect(rank).toBeGreaterThanOrEqual(best);
      best = rank;
    }
  });
});
