import { describe, it, expect } from "vitest";
import type { MaterialProperties } from "@/lib/material-types";
import { KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import {
  applyPhaseToMaterials,
  pvRoofTypeFromId,
  BOILER_UPGRADE_EFFICIENCY,
  HEAT_PUMP_COP,
  HRV_EFFECTIVENESS,
  LED_TARGET_LPD,
  LED_SMART_TARGET_LPD,
  PV_TILT_DEG,
} from "../apply-phase";

function makeMaterials(): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 1995,
    envelope: {
      walls: [
        { orientation: "N", uValue: 0.8, rValue: 1.25, layers: [], thermalBridge: 0.1, surfaceArea: 100 },
      ],
      roof: { uValue: 0.6, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.7, layers: [], groundContactResistance: 0.4 },
      windows: {
        uValue: 3.2,
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
      ventilation: { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0.3 },
      dhw: { systemType: "gas-boiler", efficiency: 0.75, storageVolume: 200 },
    },
    lighting: { lightingPowerDensity: 12, controlType: "manual", lampType: "fluorescent" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.1, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 4, hotWaterDemand: 20 },
  };
}

describe("applyPhaseToMaterials", () => {
  it("leaves existing phase untouched (same reference)", () => {
    const materials = makeMaterials();
    expect(applyPhaseToMaterials(materials, "existing")).toBe(materials);
  });

  it("applies all 2020 envelope targets when measure ids are omitted", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit");
    expect(next.envelope.walls[0].uValue).toBe(KOREAN_2020_TARGET_U_VALUES.wall);
    expect(next.envelope.windows.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.window);
    expect(next.envelope.windows.glassType).toBe("triple");
    expect(next.envelope.roof.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.roof);
    expect(next.envelope.groundFloor.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.floor);
  });

  it("applies only the selected measures", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", [
      "envelope-window-replacement",
    ]);
    expect(next.envelope.windows.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.window);
    expect(next.envelope.walls[0].uValue).toBe(0.8);
    expect(next.envelope.roof.uValue).toBe(0.6);
  });

  it("does not mutate the source", () => {
    const materials = makeMaterials();
    applyPhaseToMaterials(materials, "retrofit");
    expect(materials.envelope.walls[0].uValue).toBe(0.8);
  });

  it("omitting measure ids still stops at the envelope", () => {
    // The autonomous design-intent phase is envelope-only by definition;
    // the plant/lighting/PV rules below must not leak into it.
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit");
    expect(next.hvac.heating.efficiency).toBe(0.8);
    expect(next.lighting.lightingPowerDensity).toBe(12);
    expect(next.renewable.solarPV.installed).toBe(false);
  });
});

describe("applyPhaseToMaterials — plant, lighting and PV", () => {
  it("boiler upgrade raises heating efficiency to the 95% it is priced at", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", ["hvac-boiler-upgrade"]);
    expect(next.hvac.heating.efficiency).toBe(BOILER_UPGRADE_EFFICIENCY);
  });

  it("boiler upgrade compares against the NORMALIZED efficiency, not the raw field", () => {
    // Seeded in percent (85), as several fixtures and the ledger path are. A
    // raw Math.max would keep 85 and silently skip the upgrade.
    const materials = makeMaterials();
    materials.hvac.heating.efficiency = 85;
    const next = applyPhaseToMaterials(materials, "retrofit", ["hvac-boiler-upgrade"]);
    expect(next.hvac.heating.efficiency).toBe(BOILER_UPGRADE_EFFICIENCY);
  });

  it("boiler upgrade never downgrades an already-better boiler", () => {
    const materials = makeMaterials();
    materials.hvac.heating.efficiency = 0.98;
    const next = applyPhaseToMaterials(materials, "retrofit", ["hvac-boiler-upgrade"]);
    expect(next.hvac.heating.efficiency).toBe(0.98);
  });

  it("heat-pump conversion sets COP 3.5 AND the carrier", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", ["hvac-heat-pump"]);
    expect(next.hvac.heating.efficiency).toBe(HEAT_PUMP_COP);
    // Without the fuel change, annual-demand would price heat-pump
    // electricity at the city-gas CO2 factor.
    expect(next.hvac.heating.fuelType).toBe("heat-pump");
  });

  it("HRV sets heat recovery to the 75% the measure is priced at", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", ["hvac-hrv"]);
    expect(next.hvac.ventilation.type).toBe("heat-recovery");
    expect(next.hvac.ventilation.heatRecoveryEfficiency).toBe(HRV_EFFECTIVENESS);
  });

  it("LED targets 8 W/m2, LED+smart targets 6 W/m2 — the same targets the measures price", () => {
    const led = applyPhaseToMaterials(makeMaterials(), "retrofit", ["lighting-led"]);
    expect(led.lighting.lightingPowerDensity).toBe(LED_TARGET_LPD);
    expect(led.lighting.lampType).toBe("led");
    expect(led.lighting.controlType).toBe("manual");

    const smart = applyPhaseToMaterials(makeMaterials(), "retrofit", ["lighting-led-smart"]);
    expect(smart.lighting.lightingPowerDensity).toBe(LED_SMART_TARGET_LPD);
    expect(smart.lighting.controlType).toBe("combined");
  });

  it("lighting targets never raise an already-efficient LPD", () => {
    const materials = makeMaterials();
    materials.lighting.lightingPowerDensity = 4;
    const next = applyPhaseToMaterials(materials, "retrofit", ["lighting-led-smart"]);
    expect(next.lighting.lightingPowerDensity).toBe(4);
  });

  it("PV is sized by the same function the measure's economics used", () => {
    const roofAreaSqm = 600;
    const expected = calculateSolarPotential(roofAreaSqm, "flat", "seoul", 130);
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", ["solar-pv-flat"], {
      roofAreaSqm,
    });
    expect(next.renewable.solarPV.installed).toBe(true);
    expect(next.renewable.solarPV.capacity).toBeCloseTo(expected.systemSizeKWp, 9);
    expect(next.renewable.solarPV.area).toBeCloseTo(
      roofAreaSqm * expected.roofUtilization,
      9,
    );
    expect(next.renewable.solarPV.tiltAngle).toBe(PV_TILT_DEG);
  });

  it("PV with no roof area supplied is left alone — an unsized array is not a fact", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", ["solar-pv-flat"]);
    expect(next.renewable.solarPV.installed).toBe(false);
    expect(next.renewable.solarPV.capacity).toBe(0);
  });

  it.each([0, 100])("adds PV without inventing existing area or combined pose (existing area %s)", (area) => {
    const materials = makeMaterials();
    materials.renewable.solarPV = {
      installed: true, capacity: 63.36, area,
      tiltAngle: 15, orientation: 120, panelType: "polycrystalline",
    };
    const original = structuredClone(materials);
    const next = applyPhaseToMaterials(materials, "retrofit", ["solar-pv-flat"], {
      roofAreaSqm: 600, geometricKWp: 4,
    });
    const pv = next.renewable.solarPV;
    expect(pv.capacity).toBeCloseTo(67.36, 9);
    expect(pv.area).toBe(area === 0 ? 0 : 117);
    expect(pv.tiltAngle).toBe(15);
    expect(pv.orientation).toBe(120);
    expect(pv.panelType).toBe("polycrystalline");
    expect(pv.retrofitAddition?.existing).toEqual(original.renewable.solarPV);
    expect(pv.retrofitAddition?.proposed).toEqual({
      installed: true, capacity: 4, area: 17,
      tiltAngle: 30, orientation: 180, panelType: "monocrystalline",
    });
    expect(pv.retrofitAddition?.sizingBasis).toBe("module-layout");
    expect(pv.retrofitAddition?.yieldBasis).toBe("representative-south-facing-assumption");
    expect(materials).toEqual(original);
  });

  it("preserves an unavailable existing capacity while recording the known proposal", () => {
    const materials = makeMaterials();
    materials.renewable.solarPV.installed = true;
    const next = applyPhaseToMaterials(materials, "retrofit", ["solar-pv-flat"], {
      roofAreaSqm: 600, geometricKWp: 4,
    });
    expect(next.renewable.solarPV.capacity).toBe(0);
    expect(next.renewable.solarPV.retrofitAddition?.proposed.capacity).toBe(4);
  });

  it("reapplying or resizing a proposal retains one unchanged original array", () => {
    const materials = makeMaterials();
    Object.assign(materials.renewable.solarPV, { installed: true, capacity: 63.36 });
    const context = { roofAreaSqm: 600, geometricKWp: 4 };
    const first = applyPhaseToMaterials(materials, "retrofit", ["solar-pv-flat"], context);
    const repeated = applyPhaseToMaterials(first, "retrofit", ["solar-pv-flat"], context);
    expect(repeated).toEqual(first);
    const resized = applyPhaseToMaterials(first, "retrofit", ["solar-pv-flat"], {
      ...context, geometricKWp: 8,
    });
    expect(resized.renewable.solarPV.capacity).toBeCloseTo(71.36, 9);
    expect(resized.renewable.solarPV.retrofitAddition?.proposed.area).toBe(34);
    expect(resized.renewable.solarPV.retrofitAddition?.existing).toEqual(materials.renewable.solarPV);
    expect(first.renewable.solarPV.capacity).toBeCloseTo(67.36, 9);
  });

  it.each([
    { roofAreaSqm: 600, geometricKWp: 0 },
    { roofAreaSqm: 0, geometricKWp: 4 },
    {},
  ])("keeps existing PV when no new array can be sized: %j", (context) => {
    const materials = makeMaterials();
    Object.assign(materials.renewable.solarPV, { installed: true, capacity: 63.36, tiltAngle: 15 });
    const next = applyPhaseToMaterials(materials, "retrofit", ["solar-pv-flat"], context);
    expect(next.renewable.solarPV).toEqual(materials.renewable.solarPV);
    expect(next.renewable.solarPV.retrofitAddition).toBeUndefined();
    expect(applyPhaseToMaterials(materials, "existing", ["solar-pv-flat"], context)).toBe(materials);
    expect(applyPhaseToMaterials(materials, "retrofit", [], context)).toBe(materials);
  });

  it("pvRoofTypeFromId reads the roof type out of the id, and rejects anything else", () => {
    expect(pvRoofTypeFromId("solar-pv-flat")).toBe("flat");
    expect(pvRoofTypeFromId("solar-pv-gable")).toBe("gable");
    expect(pvRoofTypeFromId("solar-pv-mansard")).toBeNull();
    expect(pvRoofTypeFromId("envelope-roof-insulation")).toBeNull();
  });

  it("an unknown measure id changes nothing", () => {
    const materials = makeMaterials();
    const next = applyPhaseToMaterials(materials, "retrofit", ["dhw-solar-thermal"]);
    expect(next).toEqual(materials);
  });
});
