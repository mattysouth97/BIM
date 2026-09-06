import { describe, it, expect } from "vitest";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { SEOUL_CLIMATE } from "@/lib/energy/climate-data";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, VENTILATION_ELEMENT_NAME } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { calculateCO2 } from "@/lib/energy/co2-emissions";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import {
  deliveredFromDemand,
  buildingTypeForGrade,
} from "@/lib/energy/delivered-from-demand";
import { applyPhaseToMaterials } from "@/lib/bim/phases/apply-phase";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import { computeRetrofitDelta } from "../retrofit-delta";

function makeMaterials(overrides?: Partial<{
  wallU: number;
  roofU: number;
  floorU: number;
  windowU: number;
  ventType: MaterialProperties["hvac"]["ventilation"]["type"];
  airflowRate: number;
  lpd: number;
}>): MaterialProperties {
  const wallU = overrides?.wallU ?? 0.8;
  const roofU = overrides?.roofU ?? 0.6;
  const floorU = overrides?.floorU ?? 0.7;
  const windowU = overrides?.windowU ?? 3.2;

  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 1995,
    envelope: {
      walls: (["N", "S", "E", "W"] as const).map((orientation) => ({
        orientation,
        uValue: wallU,
        rValue: 1 / wallU,
        layers: [],
        thermalBridge: 0.05,
        surfaceArea: 100,
      })),
      roof: { uValue: roofU, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: floorU, layers: [], groundContactResistance: 0.4 },
      windows: {
        uValue: windowU,
        shgc: 0.6,
        vlt: 0.7,
        glassType: "single",
        coating: "none",
        gasFill: "air",
        frameMaterial: "aluminum",
        airLeakageRate: 4,
        shadingCoefficient: 0.7,
        windowToWallRatio: { N: 0.3, S: 0.3, E: 0.3, W: 0.3 },
      },
      foundation: { perimeterInsulationUValue: 0.5, groundTemperature: 13, moistureBarrier: "none" },
      airtightness: { ach50: 8, equivalentLeakageArea: 120, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: 0.8, capacity: 100 },
      cooling: { systemType: "split", efficiency: 2.8, capacity: 80 },
      ventilation: {
        type: overrides?.ventType ?? "mechanical-exhaust",
        heatRecoveryEfficiency: 0,
        airflowRate: overrides?.airflowRate ?? 0.5,
      },
      dhw: { systemType: "gas-boiler", efficiency: 0.75, storageVolume: 200 },
    },
    lighting: {
      lightingPowerDensity: overrides?.lpd ?? 18,
      controlType: "manual",
      lampType: "fluorescent",
    },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.04, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 3, hotWaterDemand: 40 },
  };
}

function makeRecipe(floorCount = 5): BuildingRecipe {
  const floorHeight = 3;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * floorHeight,
    height: floorHeight,
    isGroundFloor: i === 0,
  }));

  return {
    footprintWidth: 20,
    footprintDepth: 15,
    floors,
    totalHeight: floorCount * floorHeight,
    wallThickness: 0.3,
    era: "1990-1999",
    strctCd: "21",
    mainPurpsCd: "14000",
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.3, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 40,
    siteDepth: 30,
    buildingName: "Delta Test Building",
    address: "Seoul",
  };
}

const CLIMATE = SEOUL_CLIMATE;

function delta(measureIds: string[], materials = makeMaterials(), recipe = makeRecipe()) {
  const result = computeRetrofitDelta({ materials, recipe, climate: CLIMATE, measureIds });
  expect(result).not.toBeNull();
  return result!;
}

describe("computeRetrofitDelta", () => {
  it("returns null without a positive intensity floor area — no denominator, no kWh/m²", () => {
    const recipe = { ...makeRecipe(), floors: [] };
    expect(
      computeRetrofitDelta({
        materials: makeMaterials(),
        recipe,
        climate: CLIMATE,
        measureIds: ["envelope-wall-insulation"],
      }),
    ).toBeNull();
  });

  it("an empty selection is a zero delta on every engine output", () => {
    const d = delta([]);
    expect(d.isZeroDelta).toBe(true);
    expect(d.deltaSitePerSqm).toBe(0);
    expect(d.deltaPrimaryPerSqm).toBe(0);
    expect(d.deltaCo2PerSqm).toBe(0);
    expect(d.deltaTotalHCoefficient).toBe(0);
    expect(d.after.grade).toBe(d.before.grade);
    expect(d.changes).toHaveLength(0);
  });

  it("a measure whose target is already met yields a zero delta and no changes", () => {
    // Wall already at 0.10 W/m²·K, better than the 0.15 target the measure
    // aims for — apply-phase clamps with Math.min, so nothing moves.
    const d = delta(["envelope-wall-insulation"], makeMaterials({ wallU: 0.1 }));

    expect(d.isZeroDelta).toBe(true);
    expect(d.deltaTotalHCoefficient).toBe(0);
    expect(d.deltaSitePerSqm).toBe(0);
    expect(d.changes).toHaveLength(0);
    expect(d.measures).toHaveLength(1);
    expect(d.measures[0].changes).toHaveLength(0);
    expect(d.measures[0].pricedByEngine).toBe(false);
    expect(d.measures[0].unrecognized).toBe(false);
  });

  it("wall insulation moves the wall row and leaves every other row untouched", () => {
    const d = delta(["envelope-wall-insulation"]);

    const walls = d.elements.find((e) => e.element === "Walls")!;
    expect(walls.deltaHCoefficient).toBeLessThan(0);
    expect(walls.afterU).toBeLessThan(walls.beforeU);

    for (const el of d.elements) {
      if (el.element === "Walls") continue;
      expect(el.deltaHCoefficient).toBe(0);
      expect(el.afterU).toBe(el.beforeU);
      expect(el.afterArea).toBe(el.beforeArea);
    }

    // The whole-building movement is exactly the wall row's movement.
    expect(d.deltaTotalHCoefficient).toBeCloseTo(walls.deltaHCoefficient, 9);
  });

  it("the after run equals a direct engine run on the after-materials", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe();
    const ids = [
      "envelope-wall-insulation",
      "envelope-window-replacement",
      "hvac-boiler-upgrade",
    ];
    const d = delta(ids, materials, recipe);

    // Compose the engine by hand, exactly as useEnergyMetrics does.
    const q = envelopeQuantities(recipe);
    const afterMaterials = applyPhaseToMaterials(materials, "retrofit", ids, {
      roofAreaSqm: q.roofAreaSqm,
    });
    const heatLoss = calculateHeatLoss(afterMaterials, recipe, CLIMATE);
    const demand = calculateAnnualDemand(heatLoss, afterMaterials, recipe, CLIMATE);
    const rating = calculateEfficiencyRating(
      deliveredFromDemand(demand),
      q.intensityFloorAreaSqm,
      buildingTypeForGrade(afterMaterials, recipe.mainPurpsCd),
    );
    const co2 = calculateCO2(
      demand,
      q.intensityFloorAreaSqm,
      afterMaterials.hvac.heating.fuelType,
    );

    expect(d.after.heatLoss).toEqual(heatLoss);
    expect(d.after.demand).toEqual(demand);
    expect(d.after.sitePerSqm).toBe(demand.demandPerSqm);
    expect(d.after.primaryPerSqm).toBe(rating.primaryEnergyPerArea);
    expect(d.after.grade).toBe(rating.grade);
    expect(d.after.co2).toEqual(co2);
    expect(d.totalFloorAreaSqm).toBe(q.intensityFloorAreaSqm);
  });

  it("the before run is the untouched materials", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe();
    const d = delta(["envelope-roof-insulation"], materials, recipe);
    expect(d.before.heatLoss).toEqual(calculateHeatLoss(materials, recipe, CLIMATE));
    expect(d.before.materials).toBe(materials);
  });

  it("a change summary parses back to the numbers it explains", () => {
    const d = delta(["envelope-window-replacement"]);
    const u = d.changes.find((c) => c.field === "envelope.windows.uValue")!;

    // Parse the rendered sentence rather than asserting the words appear.
    const parsed = /^창호 U (\d+\.\d+) → (\d+\.\d+) W\/m²·K$/.exec(u.summaryKo);
    expect(parsed).not.toBeNull();
    const [, beforeStr, afterStr] = parsed!;

    expect(Number(beforeStr)).toBeCloseTo(d.before.materials.envelope.windows.uValue, 2);
    expect(Number(afterStr)).toBeCloseTo(d.after.materials.envelope.windows.uValue, 2);
    // And the number in the sentence is the U the engine actually charged.
    const windows = d.elements.find((e) => e.element === "Windows")!;
    expect(Number(beforeStr)).toBeCloseTo(windows.beforeU, 2);
    expect(Number(afterStr)).toBeCloseTo(windows.afterU, 2);
  });

  it("prices an envelope measure and reports it as priced", () => {
    const d = delta(["envelope-roof-insulation"]);
    const m = d.measures[0];
    expect(m.pricedByEngine).toBe(true);
    expect(m.soloDelta.totalHCoefficient).toBeLessThan(0);
    expect(m.soloDelta.sitePerSqm).toBeLessThan(0);
    for (const c of m.changes) {
      expect(c.pricedByEngine).toBe(true);
      expect(c.unpricedReasonKo).toBeUndefined();
    }
  });

  it("reports an LED measure as a real change the engine does not price", () => {
    const d = delta(["lighting-led-smart"]);
    const m = d.measures[0];

    // The field genuinely moved…
    const lpd = m.changes.find((c) => c.field === "lighting.lightingPowerDensity")!;
    expect(Number(lpd.before)).toBe(18);
    expect(Number(lpd.after)).toBe(6);
    // …and the run did not.
    expect(m.pricedByEngine).toBe(false);
    expect(d.isZeroDelta).toBe(true);
    expect(d.deltaSitePerSqm).toBe(0);
    // The absence is stated, not omitted.
    expect(lpd.pricedByEngine).toBe(false);
    expect(lpd.unpricedReasonKo).toContain("15 %");
    expect(lpd.unpricedReasonEn).toContain("15 %");
  });

  it("sizes PV from the measured roof surface and reports it as unpriced", () => {
    const recipe = makeRecipe();
    const q = envelopeQuantities(recipe);
    const d = delta(["solar-pv-flat"], makeMaterials(), recipe);
    const m = d.measures[0];

    expect(m.unrecognized).toBe(false);
    // Same sizing function the measure's own economics used.
    const expected = calculateSolarPotential(q.roofAreaSqm, "flat", "seoul", 130);
    expect(d.after.materials.renewable.solarPV.installed).toBe(true);
    expect(d.after.materials.renewable.solarPV.capacity).toBeCloseTo(expected.systemSizeKWp, 6);
    expect(d.after.materials.renewable.solarPV.area).toBeCloseTo(
      q.roofAreaSqm * expected.roofUtilization,
      6,
    );

    // The engine's renewable input is hard-coded to 0, so nothing moved.
    expect(m.pricedByEngine).toBe(false);
    expect(d.isZeroDelta).toBe(true);
    const cap = m.changes.find((c) => c.field === "renewable.solarPV.capacity")!;
    expect(cap.unit).toBe("kWp");
    expect(cap.unpricedReasonEn).toContain("renewable: 0");
    expect(cap.unpricedReasonKo).toContain("재생에너지를 0으로 고정");
  });

  it("an HRV on a mechanically-ventilated building reduces the air-exchange row", () => {
    const d = delta(["hvac-hrv"], makeMaterials({ ventType: "mechanical-exhaust", airflowRate: 0.5 }));
    const vent = d.elements.find((e) => e.element === VENTILATION_ELEMENT_NAME)!;
    expect(vent.afterU).toBeLessThan(vent.beforeU); // effective ACH
    expect(vent.deltaHCoefficient).toBeLessThan(0);
    expect(d.measures[0].pricedByEngine).toBe(true);
  });

  it("an HRV on a naturally-ventilated building ADDS air exchange, and says so as a rise", () => {
    // The engine ignores airflowRate while the type is "natural"; switching to
    // heat-recovery makes it read that flow for the first time. Pinned so
    // nobody "fixes" the sign by hiding the write — see apply-phase.ts.
    const d = delta(["hvac-hrv"], makeMaterials({ ventType: "natural", airflowRate: 0.4 }));
    const vent = d.elements.find((e) => e.element === VENTILATION_ELEMENT_NAME)!;
    expect(vent.deltaHCoefficient).toBeGreaterThan(0);
    expect(d.measures[0].soloDelta.totalHCoefficient).toBeGreaterThan(0);
    expect(d.measures[0].pricedByEngine).toBe(true);
  });

  it("a heat-pump conversion moves the heating fuel and the CO₂ split", () => {
    const d = delta(["hvac-heat-pump"]);
    expect(d.after.materials.hvac.heating.fuelType).toBe("heat-pump");
    expect(d.after.demand.fuelDemand?.fossilKwh).toBe(0);
    expect(d.before.demand.fuelDemand?.fossilKwh).toBeGreaterThan(0);
    expect(d.deltaCo2PerSqm).toBeLessThan(0);

    const fuel = d.changes.find((c) => c.field === "hvac.heating.fuelType")!;
    expect(fuel.summaryEn).toBe("Heating fuel gas → heat-pump");
  });

  it("flags an id apply-phase has no rule for instead of calling it a no-op", () => {
    const d = delta(["dhw-solar-thermal"]);
    expect(d.measures[0].unrecognized).toBe(true);
    expect(d.measures[0].changes).toHaveLength(0);
    expect(d.isZeroDelta).toBe(true);
  });

  it("element areas come from the engine's own rows, not a second derivation", () => {
    const recipe = makeRecipe();
    const q = envelopeQuantities(recipe);
    const d = delta(["envelope-wall-insulation"], makeMaterials(), recipe);

    const roof = d.elements.find((e) => e.element === "Roof")!;
    const floor = d.elements.find((e) => e.element === "Ground Floor")!;
    const vent = d.elements.find((e) => e.element === VENTILATION_ELEMENT_NAME)!;
    expect(roof.beforeArea).toBe(q.roofAreaSqm);
    expect(floor.beforeArea).toBe(q.planAreaSqm);
    expect(vent.beforeArea).toBe(q.volumeM3);

    // Walls + windows partition the gross wall the same way heat-loss.ts does.
    const walls = d.elements.find((e) => e.element === "Walls")!;
    const windows = d.elements.find((e) => e.element === "Windows")!;
    expect(walls.beforeArea + windows.beforeArea).toBeCloseTo(q.grossWallAreaSqm, 9);
  });

  it("does not mutate the materials it was given", () => {
    const materials = makeMaterials();
    delta(["envelope-wall-insulation", "hvac-boiler-upgrade", "solar-pv-flat"], materials);
    expect(materials.envelope.walls[0].uValue).toBe(0.8);
    expect(materials.hvac.heating.efficiency).toBe(0.8);
    expect(materials.renewable.solarPV.installed).toBe(false);
  });
});
