// src/lib/material-inference.ts
// Pure function: building ledger data -> comprehensive material properties
// Used for energy simulation (ECO2-compatible) when no IFC/BIM data available

import type { BrTitleInfo, BrFloorInfo } from "./types";
import type { MaterialProperties, BuildingEra } from "./material-types";
import { classifyEra } from "./material-types";
import type { IFCMaterialResult, ExtractedMaterial } from "./ifc/ifc-material-extractor";
import {
  WALL_U_VALUES, ROOF_U_VALUES, FLOOR_U_VALUES,
  WINDOW_U_VALUES, WINDOW_SHGC, GLAZING_TYPE,
  AIRTIGHTNESS, WINDOW_RATIOS,
  WALL_LAYERS, STRUCTURE_TO_WALL_KEY,
  GROUND_TEMPERATURES, HVAC_DEFAULTS, LIGHTING_DEFAULTS, OCCUPANCY_DEFAULTS,
} from "./korean-building-codes";

// ── Helpers ─────────────────────────────────────

const ERA_ORDER: BuildingEra[] = [
  "pre-1970", "1970-1989", "1990-1999", "2000-2009", "2010-2019", "2020+",
];

/** Compare eras ordinally — returns true when `era` >= `target`. */
function eraAtLeast(era: BuildingEra, target: BuildingEra): boolean {
  return ERA_ORDER.indexOf(era) >= ERA_ORDER.indexOf(target);
}

function isResidential(mainPurpsCd: string): boolean {
  return ["01000", "02000"].includes(mainPurpsCd);
}

function getUseCategory(
  mainPurpsCd: string,
): "residential" | "office" | "factory" | "retail" | "default" {
  if (["01000", "02000"].includes(mainPurpsCd)) return "residential";
  if (mainPurpsCd === "14000") return "office";
  if (["17000", "18000"].includes(mainPurpsCd)) return "factory";
  if (["07000", "11000"].includes(mainPurpsCd)) return "retail";
  return "default";
}

function getWallLayers(strctCd: string, era: BuildingEra) {
  const key = STRUCTURE_TO_WALL_KEY[strctCd] || "rc";
  const baseLayers = WALL_LAYERS[key] || WALL_LAYERS["rc"];

  // Adjust insulation thickness by era
  const insulationMultiplier: Record<BuildingEra, number> = {
    "pre-1970": 0,
    "1970-1989": 0.3,
    "1990-1999": 0.6,
    "2000-2009": 1.0,
    "2010-2019": 1.8,
    "2020+": 2.5,
  };

  return baseLayers.map((layer) => {
    if (layer.name.includes("단열재")) {
      return {
        ...layer,
        thickness: Math.round(layer.thickness * (insulationMultiplier[era] || 1.0)),
      };
    }
    return { ...layer };
  });
}

// ── IFC override helpers ────────────────────────

/**
 * Find the first extracted material of a given element type that has a U-value.
 */
function findIfcUValue(
  materials: ExtractedMaterial[],
  elementType: ExtractedMaterial["elementType"],
): number | undefined {
  return materials.find((m) => m.elementType === elementType && m.uValue !== undefined)
    ?.uValue;
}

// ── Main inference function ─────────────────────

export function inferMaterialProperties(
  title: BrTitleInfo,
  _floors: BrFloorInfo[],
  ifcMaterials?: IFCMaterialResult,
): MaterialProperties {
  const era = classifyEra(title.pmsDay);
  const mainUse = title.mainPurpsCd || "default";
  const isRes = isResidential(mainUse);
  const useCategory = getUseCategory(mainUse);
  const strctCd = title.strctCd || "11";
  const sidoPrefix = (title.sigunguCd || "11").slice(0, 2);

  // Envelope U-values
  const wallU = isRes ? WALL_U_VALUES[era].residential : WALL_U_VALUES[era].nonResidential;
  const roofU = isRes ? ROOF_U_VALUES[era].residential : ROOF_U_VALUES[era].nonResidential;
  const floorU = isRes ? FLOOR_U_VALUES[era].residential : FLOOR_U_VALUES[era].nonResidential;
  const windowU = WINDOW_U_VALUES[era];
  const shgc = WINDOW_SHGC[era];
  const glazing = GLAZING_TYPE[era];
  const ach50 = AIRTIGHTNESS[era];
  const wwr = WINDOW_RATIOS[era][useCategory] || WINDOW_RATIOS[era].default;
  const groundTemp = GROUND_TEMPERATURES[sidoPrefix] || 13.5;

  const wallLayers = getWallLayers(strctCd, era);
  const totalArea = Number(title.totArea) || 1000;
  const floorCount =
    (Number(title.grndFlrCnt) || 1) + (Number(title.ugrndFlrCnt) || 0);
  const floorArea = totalArea / Math.max(floorCount, 1);

  const hvacDefaults = HVAC_DEFAULTS[mainUse] || HVAC_DEFAULTS["default"];
  const lightingDefaults = LIGHTING_DEFAULTS[mainUse] || LIGHTING_DEFAULTS["default"];
  const occupancyDefaults = OCCUPANCY_DEFAULTS[mainUse] || OCCUPANCY_DEFAULTS["default"];

  // Estimate capacities from floor area
  const heatingCapacity = floorArea * 0.1; // ~100 W/m² heating load
  const coolingCapacity = floorArea * 0.12; // ~120 W/m² cooling load

  // ── IFC overrides (highest-confidence source) ──
  const hasIfc = ifcMaterials !== undefined;
  const ifcWallU = hasIfc ? findIfcUValue(ifcMaterials!.materials, "wall") : undefined;
  const ifcRoofU = hasIfc ? findIfcUValue(ifcMaterials!.materials, "roof") : undefined;
  const ifcWindowU = hasIfc ? findIfcUValue(ifcMaterials!.materials, "window") : undefined;
  const ifcSlabU = hasIfc ? findIfcUValue(ifcMaterials!.materials, "slab") : undefined;

  // Use IFC areas when available and non-zero; fall back to code estimates
  const ifcWallArea = hasIfc && ifcMaterials!.wallArea > 0 ? ifcMaterials!.wallArea : undefined;
  const ifcWindowArea =
    hasIfc && ifcMaterials!.windowArea > 0 ? ifcMaterials!.windowArea : undefined;

  // Determine source/confidence based on IFC availability
  const dataSource = hasIfc ? ("ifc-model" as const) : ("code-estimate" as const);
  const dataConfidence = hasIfc
    ? ifcMaterials!.confidence === "high"
      ? ("measured" as const)
      : ("estimated" as const)
    : ("estimated" as const);

  // Derive per-orientation wall surface area from IFC total (÷4) or code estimate
  const wallSurfacePerOrientation = ifcWallArea
    ? ifcWallArea / 4
    : floorArea * 0.3;

  // Derive WWR from IFC areas when available
  const ifcWwr =
    ifcWallArea && ifcWindowArea && ifcWallArea > 0
      ? Math.min(ifcWindowArea / ifcWallArea, 0.9)
      : undefined;

  return {
    source: dataSource,
    confidence: dataConfidence,
    codeYear: parseInt(title.pmsDay?.slice(0, 4) || "2000", 10),

    envelope: {
      walls: (["N", "S", "E", "W"] as const).map((orientation) => ({
        orientation,
        uValue: ifcWallU ?? wallU,
        rValue: 1 / (ifcWallU ?? wallU),
        layers: wallLayers,
        thermalBridge: eraAtLeast(era, "2020+") ? 0.01 : eraAtLeast(era, "2010-2019") ? 0.03 : 0.05,
        surfaceArea: wallSurfacePerOrientation,
      })),

      roof: {
        uValue: ifcRoofU ?? roofU,
        layers: [
          { name: "방수층", thickness: 5, thermalConductivity: 0.17, density: 1100, specificHeat: 1000 },
          {
            name: "단열재",
            thickness: eraAtLeast(era, "2020+") ? 250 : eraAtLeast(era, "2010-2019") ? 180 : 100,
            thermalConductivity: 0.034,
            density: 30,
            specificHeat: 1450,
          },
          { name: "콘크리트슬래브", thickness: 180, thermalConductivity: 1.6, density: 2300, specificHeat: 880 },
          { name: "천장마감", thickness: 10, thermalConductivity: 0.17, density: 750, specificHeat: 1090 },
        ],
        solarReflectance: eraAtLeast(era, "2010-2019") ? 0.65 : 0.3,
        emissivity: 0.9,
        greenRoofCoverage: 0,
      },

      groundFloor: {
        uValue: ifcSlabU ?? floorU,
        layers: [
          { name: "콘크리트슬래브", thickness: 200, thermalConductivity: 1.6, density: 2300, specificHeat: 880 },
          {
            name: "단열재",
            thickness: eraAtLeast(era, "2020+") ? 200 : eraAtLeast(era, "2010-2019") ? 120 : 60,
            thermalConductivity: 0.034,
            density: 30,
            specificHeat: 1450,
          },
          { name: "마감재", thickness: 30, thermalConductivity: 0.17, density: 800, specificHeat: 1000 },
        ],
        groundContactResistance: 0.5,
      },

      windows: {
        uValue: ifcWindowU ?? windowU,
        shgc,
        vlt: shgc + 0.15, // VLT is typically higher than SHGC
        ...glazing,
        airLeakageRate: eraAtLeast(era, "2010-2019") ? 1.0 : eraAtLeast(era, "2000-2009") ? 2.0 : 4.0,
        shadingCoefficient: shgc / 0.87,
        windowToWallRatio: ifcWwr
          ? { N: ifcWwr * 0.8, S: ifcWwr * 1.2, E: ifcWwr, W: ifcWwr }
          : { N: wwr * 0.8, S: wwr * 1.2, E: wwr, W: wwr },
      },

      foundation: {
        perimeterInsulationUValue: floorU * 1.2,
        groundTemperature: groundTemp,
        moistureBarrier: eraAtLeast(era, "2000-2009") ? "polyethylene" : "none",
      },

      airtightness: {
        ach50,
        equivalentLeakageArea: ach50 * 2,
        testMethod: "estimated",
      },
    },

    hvac: {
      heating: {
        systemType: hvacDefaults.heatingType,
        fuelType: hvacDefaults.fuelType,
        efficiency: hvacDefaults.heatingEfficiency,
        capacity: heatingCapacity,
      },
      cooling: {
        systemType: hvacDefaults.coolingType,
        efficiency: hvacDefaults.coolingEfficiency,
        capacity: coolingCapacity,
        refrigerant: eraAtLeast(era, "2020+") ? "R32" : "R410A",
      },
      ventilation: {
        type: eraAtLeast(era, "2020+")
          ? "heat-recovery"
          : eraAtLeast(era, "2010-2019")
            ? "mechanical-supply"
            : "natural",
        heatRecoveryEfficiency: eraAtLeast(era, "2020+") ? 0.75 : eraAtLeast(era, "2010-2019") ? 0.5 : 0,
        airflowRate: floorArea * 0.5,
      },
      dhw: {
        systemType: "gas-boiler",
        efficiency: eraAtLeast(era, "2020+") ? 0.95 : 0.85,
        storageVolume: isRes ? 200 : 500,
      },
    },

    lighting: {
      lightingPowerDensity: lightingDefaults.lpd,
      controlType: lightingDefaults.controlType,
      lampType: eraAtLeast(era, "2010-2019") ? "led" : lightingDefaults.lampType,
    },

    renewable: {
      solarPV: {
        installed: false,
        capacity: 0,
        panelType: "monocrystalline",
        tiltAngle: 30,
        orientation: 180,
        area: 0,
      },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },

    occupancy: {
      occupancyDensity: occupancyDefaults.density,
      weekdaySchedule: isRes
        ? [0.9,0.9,0.9,0.9,0.9,0.9,0.7,0.4,0.3,0.3,0.3,0.3,0.4,0.3,0.3,0.3,0.5,0.7,0.8,0.9,0.9,0.9,0.9,0.9]
        : [0,0,0,0,0,0,0.1,0.3,0.9,1,1,1,0.8,1,1,1,1,0.9,0.5,0.2,0.1,0,0,0],
      weekendSchedule: isRes
        ? [0.9,0.9,0.9,0.9,0.9,0.9,0.8,0.8,0.7,0.6,0.5,0.5,0.6,0.5,0.5,0.5,0.6,0.7,0.8,0.9,0.9,0.9,0.9,0.9]
        : [0,0,0,0,0,0,0,0,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0,0,0,0,0,0,0],
      internalHeatGain: occupancyDefaults.internalGain,
      hotWaterDemand: occupancyDefaults.hotWater,
    },
  };
}
