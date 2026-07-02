// src/lib/energy/__tests__/fixtures/golden-corpus-generator.ts
// Deterministic BuildingRecipe samples covering the Korean building typology space.
// Used to generate golden-corpus.json for v7.0 regression gating.

import type { BuildingRecipe, FloorSpec, FacadeConfig, SlabConfig, ColumnConfig, RoofConfig, MaterialRefs } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingEra } from "@/lib/material-types";
import {
  WALL_U_VALUES,
  ROOF_U_VALUES,
  FLOOR_U_VALUES,
  WINDOW_U_VALUES,
  WINDOW_SHGC,
  WINDOW_RATIOS,
  FLOOR_HEIGHTS,
} from "@/lib/korean-building-codes";

// ---------------------------------------------------------------------------
// Helper: build floor specs
// ---------------------------------------------------------------------------
function makeFloors(count: number, floorHeight: number): FloorSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * floorHeight,
    height: floorHeight,
    isGroundFloor: i === 0,
  }));
}

// ---------------------------------------------------------------------------
// Helper: minimal MaterialRefs (visual only — not used by energy engine)
// ---------------------------------------------------------------------------
function makeMaterialRefs(): MaterialRefs {
  return {
    wall:        { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    glass:       { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
    mullion:     { color: "#808890", roughness: 0.4, metalness: 0.6 },
    slab:        { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    column:      { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    roof:        { color: "#808080", roughness: 0.8, metalness: 0.1 },
    groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
  };
}

// ---------------------------------------------------------------------------
// Helper: build facade config
// ---------------------------------------------------------------------------
function makeFacade(era: BuildingEra, mainPurpsCd: string): FacadeConfig {
  const useMap: Record<string, "residential" | "office" | "factory" | "retail" | "default"> = {
    "01000": "residential", "02000": "residential",
    "14000": "office",
    "17000": "factory", "18000": "factory",
    "07000": "retail", "11000": "retail",
  };
  const useCategory = useMap[mainPurpsCd] ?? "default";
  const wwr = WINDOW_RATIOS[era]?.[useCategory] ?? WINDOW_RATIOS[era]?.default ?? 0.3;

  return {
    windowWidth: 1.4, windowHeight: 1.6, sillHeight: 0.8, windowSpacing: 2.2,
    windowRatio: wwr,
    mullionDepth: 0.06, mullionWidth: 0.05,
    glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
  };
}

// ---------------------------------------------------------------------------
// Helper: build MaterialProperties from era + isResidential
// ---------------------------------------------------------------------------
function makeMaterials(
  era: BuildingEra,
  mainPurpsCd: string,
  opts?: {
    heatingEfficiency?: number;
    coolingEfficiency?: number;
    coolingSystemType?: "split" | "central-chiller" | "vrf" | "none";
  }
): MaterialProperties {
  const isRes = ["01000", "02000"].includes(mainPurpsCd);
  const wallU   = isRes ? WALL_U_VALUES[era].residential   : WALL_U_VALUES[era].nonResidential;
  const roofU   = isRes ? ROOF_U_VALUES[era].residential   : ROOF_U_VALUES[era].nonResidential;
  const floorU  = isRes ? FLOOR_U_VALUES[era].residential  : FLOOR_U_VALUES[era].nonResidential;
  const windowU = WINDOW_U_VALUES[era];
  const shgc    = WINDOW_SHGC[era];

  const useMap: Record<string, "residential" | "office" | "factory" | "retail" | "default"> = {
    "01000": "residential", "02000": "residential",
    "14000": "office",
    "17000": "factory", "18000": "factory",
    "07000": "retail", "11000": "retail",
  };
  const useCategory = useMap[mainPurpsCd] ?? "default";
  const wwr = WINDOW_RATIOS[era]?.[useCategory] ?? WINDOW_RATIOS[era]?.default ?? 0.3;

  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: parseInt(era === "pre-1970" ? "1965" : era === "2020+" ? "2022" : era.slice(0, 4), 10),
    envelope: {
      walls: [
        { orientation: "N", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "S", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "E", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
        { orientation: "W", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
      ],
      roof: { uValue: roofU, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: floorU, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: windowU, shgc, vlt: 0.5,
        glassType: era === "pre-1970" ? "single" : era === "2020+" ? "triple" : "double",
        coating: era === "pre-1970" || era === "1970-1989" ? "none" : "low-e",
        gasFill: era === "2010-2019" || era === "2020+" ? "argon" : "air",
        frameMaterial: era === "pre-1970" || era === "1970-1989" || era === "1990-1999" ? "aluminum"
          : era === "2020+" ? "pvc" : "thermal-break-aluminum",
        airLeakageRate: 1.5,
        shadingCoefficient: 0.4,
        windowToWallRatio: { N: wwr, S: wwr, E: wwr, W: wwr },
      },
      foundation: { perimeterInsulationUValue: 0.3, groundTemperature: 13.5, moistureBarrier: "polyethylene" },
      airtightness: { ach50: 3.5, equivalentLeakageArea: 50, testMethod: "estimated" },
    },
    hvac: {
      heating: {
        systemType: isRes ? "individual" : "central",
        fuelType: "gas",
        efficiency: opts?.heatingEfficiency ?? (isRes ? 87 : 88),
        capacity: 20,
      },
      cooling: {
        systemType: opts?.coolingSystemType ?? (isRes ? "split" : "central-chiller"),
        efficiency: opts?.coolingEfficiency ?? (isRes ? 3.5 : 4.0),
        capacity: 10,
      },
      ventilation: { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.5 },
      dhw: { systemType: "gas-boiler", efficiency: 85, storageVolume: 100 },
    },
    lighting: { lightingPowerDensity: isRes ? 6 : 10, controlType: "manual", lampType: "led" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: isRes ? 0.04 : 0.1, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: isRes ? 3 : 15, hotWaterDemand: isRes ? 40 : 10 },
  };
}

// ---------------------------------------------------------------------------
// Helper: assemble a full BuildingRecipe
// ---------------------------------------------------------------------------
interface RecipeSpec {
  name: string;
  footprintWidth: number;
  footprintDepth: number;
  floorCount: number;
  era: BuildingEra;
  strctCd: string;
  mainPurpsCd: string;
  wallThickness?: number;
  roofType?: "flat" | "gable" | "hip" | "sawtooth";
}

function buildRecipe(spec: RecipeSpec): { recipe: BuildingRecipe; materials: MaterialProperties } {
  const { era, mainPurpsCd, strctCd } = spec;
  const isResidential = ["01000", "02000"].includes(mainPurpsCd);
  const isFactory = ["17000", "18000"].includes(mainPurpsCd);
  const floorH = isFactory
    ? FLOOR_HEIGHTS[era].factory
    : isResidential
    ? FLOOR_HEIGHTS[era].residential
    : FLOOR_HEIGHTS[era].commercial;

  const floors = makeFloors(spec.floorCount, floorH);
  const totalHeight = spec.floorCount * floorH;
  const wallThickness = spec.wallThickness ?? 0.3;

  const roofType = spec.roofType ?? (
    isResidential && (era === "pre-1970") ? "hip"
    : isResidential && (era === "1970-1989" || era === "1990-1999") ? "gable"
    : "flat"
  );

  const recipe: BuildingRecipe = {
    footprintWidth: spec.footprintWidth,
    footprintDepth: spec.footprintDepth,
    floors,
    totalHeight,
    wallThickness,
    era,
    strctCd,
    mainPurpsCd,
    facade: makeFacade(era, mainPurpsCd),
    slab: { thickness: 0.2, overhang: 0 } satisfies SlabConfig,
    column: { spacing: 6, size: 0.4, inset: 0 } satisfies ColumnConfig,
    roof: {
      type: roofType,
      flatThickness: 0.3,
      gableHeight: 3.0,
      hipInset: 0.4,
    } satisfies RoofConfig,
    materials: makeMaterialRefs(),
    siteWidth: spec.footprintWidth + 10,
    siteDepth: spec.footprintDepth + 10,
    buildingName: spec.name,
    address: "Seoul",
  };

  const materials = makeMaterials(era, mainPurpsCd);

  return { recipe, materials };
}

// ---------------------------------------------------------------------------
// The 20 corpus samples
// ---------------------------------------------------------------------------
export interface CorpusSample {
  name: string;
  category: string;
  recipe: BuildingRecipe;
  materials: MaterialProperties;
}

export function generateGoldenCorpus(): CorpusSample[] {
  const samples: CorpusSample[] = [];

  // --- 5 Office buildings ---
  // 1. Small office, 1970s (RC, punched windows, poor insulation)
  {
    const { recipe, materials } = buildRecipe({
      name: "Office Small 1970s",
      footprintWidth: 15, footprintDepth: 12, floorCount: 5,
      era: "1970-1989", strctCd: "11", mainPurpsCd: "14000",
    });
    samples.push({ name: "Office Small 1970s", category: "office", recipe, materials });
  }
  // 2. Medium office, 1990s (RC, punched windows, moderate insulation)
  {
    const { recipe, materials } = buildRecipe({
      name: "Office Medium 1990s",
      footprintWidth: 25, footprintDepth: 18, floorCount: 10,
      era: "1990-1999", strctCd: "11", mainPurpsCd: "14000",
    });
    samples.push({ name: "Office Medium 1990s", category: "office", recipe, materials });
  }
  // 3. Large office, 2010s (SRC, curtain wall, good insulation)
  {
    const { recipe, materials } = buildRecipe({
      name: "Office Large 2010s",
      footprintWidth: 45, footprintDepth: 30, floorCount: 20,
      era: "2010-2019", strctCd: "12", mainPurpsCd: "14000",
    });
    samples.push({ name: "Office Large 2010s", category: "office", recipe, materials });
  }
  // 4. Small office, 2020s (Steel, curtain wall, near-zero energy)
  {
    const { recipe, materials } = buildRecipe({
      name: "Office Small 2020s",
      footprintWidth: 20, footprintDepth: 15, floorCount: 8,
      era: "2020+", strctCd: "13", mainPurpsCd: "14000",
    });
    samples.push({ name: "Office Small 2020s", category: "office", recipe, materials });
  }
  // 5. Pre-1970 vintage office (masonry, single-pane, minimal insulation)
  {
    const { recipe, materials } = buildRecipe({
      name: "Office Vintage Pre-1970",
      footprintWidth: 18, footprintDepth: 14, floorCount: 4,
      era: "pre-1970", strctCd: "22", mainPurpsCd: "14000",
      wallThickness: 0.4,
    });
    samples.push({ name: "Office Vintage Pre-1970", category: "office", recipe, materials });
  }

  // --- 5 Residential buildings ---
  // 6. Small apartment (5-story, 2000-2009, RC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Apt Small 2000s",
      footprintWidth: 14, footprintDepth: 10, floorCount: 5,
      era: "2000-2009", strctCd: "11", mainPurpsCd: "02000",
    });
    samples.push({ name: "Apt Small 2000s", category: "residential", recipe, materials });
  }
  // 7. Large apartment (20-story, 2010s, RC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Apt Large 2010s",
      footprintWidth: 22, footprintDepth: 16, floorCount: 20,
      era: "2010-2019", strctCd: "11", mainPurpsCd: "02000",
    });
    samples.push({ name: "Apt Large 2010s", category: "residential", recipe, materials });
  }
  // 8. Detached house (단독주택, pre-1970, timber/masonry, hip roof)
  {
    const { recipe, materials } = buildRecipe({
      name: "Detached House Pre-1970",
      footprintWidth: 10, footprintDepth: 8, floorCount: 1,
      era: "pre-1970", strctCd: "22", mainPurpsCd: "01000",
      roofType: "hip",
    });
    samples.push({ name: "Detached House Pre-1970", category: "residential", recipe, materials });
  }
  // 9. Row house (다세대주택, 1990s, RC, gable roof)
  {
    const { recipe, materials } = buildRecipe({
      name: "Row House 1990s",
      footprintWidth: 8, footprintDepth: 12, floorCount: 3,
      era: "1990-1999", strctCd: "11", mainPurpsCd: "01000",
      roofType: "gable",
    });
    samples.push({ name: "Row House 1990s", category: "residential", recipe, materials });
  }
  // 10. Mixed-use (주상복합, 2020s, SRC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Mixed-Use 2020s",
      footprintWidth: 30, footprintDepth: 22, floorCount: 15,
      era: "2020+", strctCd: "12", mainPurpsCd: "02000",
    });
    samples.push({ name: "Mixed-Use 2020s", category: "residential", recipe, materials });
  }

  // --- 4 Retail buildings ---
  // 11. Small shop (소매점, 1990s, masonry)
  {
    const { recipe, materials } = buildRecipe({
      name: "Retail Small Shop 1990s",
      footprintWidth: 10, footprintDepth: 8, floorCount: 2,
      era: "1990-1999", strctCd: "22", mainPurpsCd: "07000",
    });
    samples.push({ name: "Retail Small Shop 1990s", category: "retail", recipe, materials });
  }
  // 12. Strip mall (판매시설, 2000s, RC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Retail Strip Mall 2000s",
      footprintWidth: 40, footprintDepth: 20, floorCount: 3,
      era: "2000-2009", strctCd: "11", mainPurpsCd: "07000",
    });
    samples.push({ name: "Retail Strip Mall 2000s", category: "retail", recipe, materials });
  }
  // 13. Department store (백화점, 2010s, SRC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Department Store 2010s",
      footprintWidth: 80, footprintDepth: 60, floorCount: 8,
      era: "2010-2019", strctCd: "12", mainPurpsCd: "11000",
    });
    samples.push({ name: "Department Store 2010s", category: "retail", recipe, materials });
  }
  // 14. Supermarket (슈퍼마켓, 2020s, Steel)
  {
    const { recipe, materials } = buildRecipe({
      name: "Supermarket 2020s",
      footprintWidth: 50, footprintDepth: 40, floorCount: 2,
      era: "2020+", strctCd: "13", mainPurpsCd: "07000",
    });
    samples.push({ name: "Supermarket 2020s", category: "retail", recipe, materials });
  }

  // --- 3 Factory / Industrial buildings ---
  // 15. Light factory (공장, 1990s, steel sawtooth)
  {
    const { recipe, materials } = buildRecipe({
      name: "Factory Light 1990s",
      footprintWidth: 40, footprintDepth: 30, floorCount: 1,
      era: "1990-1999", strctCd: "13", mainPurpsCd: "17000",
    });
    samples.push({ name: "Factory Light 1990s", category: "factory", recipe, materials });
  }
  // 16. Heavy factory (공장, 1970s, RC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Factory Heavy 1970s",
      footprintWidth: 60, footprintDepth: 40, floorCount: 2,
      era: "1970-1989", strctCd: "11", mainPurpsCd: "17000",
    });
    samples.push({ name: "Factory Heavy 1970s", category: "factory", recipe, materials });
  }
  // 17. Warehouse (창고, 2010s, Steel flat)
  {
    const { recipe, materials } = buildRecipe({
      name: "Warehouse 2010s",
      footprintWidth: 70, footprintDepth: 50, floorCount: 1,
      era: "2010-2019", strctCd: "13", mainPurpsCd: "18000",
      roofType: "flat",
    });
    samples.push({ name: "Warehouse 2010s", category: "factory", recipe, materials });
  }

  // --- 3 Special use buildings ---
  // 18. School (학교, 1990s, RC, gable)
  {
    const { recipe, materials } = buildRecipe({
      name: "School 1990s",
      footprintWidth: 35, footprintDepth: 16, floorCount: 4,
      era: "1990-1999", strctCd: "11", mainPurpsCd: "10000",
    });
    samples.push({ name: "School 1990s", category: "special", recipe, materials });
  }
  // 19. Hospital (병원, 2000s, SRC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Hospital 2000s",
      footprintWidth: 50, footprintDepth: 35, floorCount: 8,
      era: "2000-2009", strctCd: "12", mainPurpsCd: "10000",
    });
    samples.push({ name: "Hospital 2000s", category: "special", recipe, materials });
  }
  // 20. Hotel (숙박시설, 2010s, SRC)
  {
    const { recipe, materials } = buildRecipe({
      name: "Hotel 2010s",
      footprintWidth: 30, footprintDepth: 25, floorCount: 12,
      era: "2010-2019", strctCd: "12", mainPurpsCd: "10000",
    });
    samples.push({ name: "Hotel 2010s", category: "special", recipe, materials });
  }

  return samples;
}
