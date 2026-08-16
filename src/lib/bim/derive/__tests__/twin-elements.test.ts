import { describe, it, expect } from "vitest";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";
import {
  deriveTwinElements,
  deriveWallElements,
  deriveOpeningElements,
} from "../twin-elements";

function makeRecipe(floorCount = 3): BuildingRecipe {
  const fh = 3.2;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above",
    y: i * fh,
    height: fh,
    isGroundFloor: i === 0,
  }));
  return {
    footprintWidth: 20,
    footprintDepth: 12,
    floors,
    totalHeight: floorCount * fh,
    wallThickness: 0.3,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "14000",
    facade: {
      windowWidth: 1.6,
      windowHeight: 1.8,
      sillHeight: 0.7,
      windowSpacing: 2.4,
      windowRatio: 0.35,
      mullionDepth: 0.08,
      mullionWidth: 0.05,
      glassInset: 0.03,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 40,
    siteDepth: 24,
    buildingName: "Demo",
    address: "Seoul",
  };
}

function makeMaterials(): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2010,
    envelope: {
      walls: [
        { orientation: "N", uValue: 0.45, rValue: 2.2, layers: [{ name: "콘크리트", thickness: 0.2, thermalConductivity: 1.6, density: 2200, specificHeat: 880 }], thermalBridge: 0.05, surfaceArea: 80 },
        { orientation: "S", uValue: 0.45, rValue: 2.2, layers: [{ name: "콘크리트", thickness: 0.2, thermalConductivity: 1.6, density: 2200, specificHeat: 880 }], thermalBridge: 0.05, surfaceArea: 80 },
        { orientation: "E", uValue: 0.48, rValue: 2.1, layers: [], thermalBridge: 0.05, surfaceArea: 48 },
        { orientation: "W", uValue: 0.48, rValue: 2.1, layers: [], thermalBridge: 0.05, surfaceArea: 48 },
      ],
      roof: { uValue: 0.28, layers: [], solarReflectance: 0.4, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.35, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: 2.4,
        shgc: 0.5,
        vlt: 0.6,
        glassType: "double",
        coating: "none",
        gasFill: "air",
        frameMaterial: "aluminum",
        airLeakageRate: 2,
        shadingCoefficient: 0.6,
        windowToWallRatio: { N: 0.3, S: 0.4, E: 0.3, W: 0.3 },
      },
      foundation: { perimeterInsulationUValue: 0.4, groundTemperature: 13, moistureBarrier: "none" },
      airtightness: { ach50: 4, equivalentLeakageArea: 80, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: 0.87, capacity: 180 },
      cooling: { systemType: "central-chiller", efficiency: 3.2, capacity: 160 },
      ventilation: { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.6 },
      dhw: { systemType: "gas-boiler", efficiency: 0.8, storageVolume: 300 },
    },
    lighting: { lightingPowerDensity: 8, controlType: "manual", lampType: "fluorescent" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.1, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 5, hotWaterDemand: 20 },
  };
}

describe("deriveTwinElements", () => {
  it("emits four walls per floor with deterministic ids", () => {
    const walls = deriveWallElements({ recipe: makeRecipe(2) });
    expect(walls).toHaveLength(8);
    expect(walls.map((w) => w.id)).toEqual([
      "W-1-N", "W-1-S", "W-1-E", "W-1-W",
      "W-2-N", "W-2-S", "W-2-E", "W-2-W",
    ]);
    const south = walls.find((w) => w.id === "W-1-S")!;
    expect(south.length).toBe(20);
    expect(south.thickness).toBe(0.3);
  });

  it("pulls U-values and material names from the envelope", () => {
    const walls = deriveWallElements({
      recipe: makeRecipe(1),
      materials: makeMaterials(),
    });
    const north = walls.find((w) => w.orientation === "N")!;
    expect(north.uValue).toBe(0.45);
    expect(north.material).toBe("콘크리트");
  });

  it("counts windows from WWR and adds a ground-floor door", () => {
    const openings = deriveOpeningElements({
      recipe: makeRecipe(2),
      materials: makeMaterials(),
    });
    const win1 = openings.find((o) => o.id === "WIN-1");
    const door1 = openings.find((o) => o.id === "DR-1");
    const door2 = openings.find((o) => o.id === "DR-2");
    expect(win1?.type).toBe("window");
    expect(win1!.count).toBeGreaterThan(0);
    expect(door1?.count).toBe(1);
    expect(door2).toBeUndefined();
  });

  it("derives plant from HVAC materials", () => {
    const { mep, rooms } = deriveTwinElements({
      recipe: makeRecipe(3),
      materials: makeMaterials(),
      equipment: DEFAULT_MEP_EQUIPMENT_PARAMS,
    });
    expect(mep.map((m) => m.equipmentType)).toEqual(
      expect.arrayContaining(["chiller", "boiler", "ahu", "dhw", "electricalPanel"]),
    );
    expect(mep.find((m) => m.equipmentType === "chiller")?.capacity).toBe(160);
    expect(mep.find((m) => m.equipmentType === "ahu")?.count).toBe(3);
    expect(rooms).toHaveLength(3);
    expect(rooms[0].area).toBe(240);
    expect(rooms[0].perimeter).toBe(64);
  });

  it("is stable across calls", () => {
    const source = { recipe: makeRecipe(2), materials: makeMaterials() };
    expect(deriveTwinElements(source)).toEqual(deriveTwinElements(source));
  });
});
