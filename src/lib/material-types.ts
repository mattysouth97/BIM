// src/lib/material-types.ts
// Comprehensive material property types for building energy simulation
// Compatible with ECO2 energy evaluation software inputs

export type DataSource = "code-estimate" | "ifc-import" | "ifc-model" | "user-input" | "energy-cert";
export type Confidence = "estimated" | "measured" | "certified";

export interface MaterialProperties {
  source: DataSource;
  confidence: Confidence;
  codeYear: number; // Korean building code reference year

  envelope: {
    walls: WallAssembly[];
    roof: RoofAssembly;
    groundFloor: FloorAssembly;
    windows: GlazingProperties;
    foundation: FoundationProperties;
    airtightness: AirtightnessProperties;
  };

  hvac: HVACProperties;
  lighting: LightingProperties;
  renewable: RenewableProperties;
  occupancy: OccupancyProfile;
}

export interface WallAssembly {
  orientation: "N" | "S" | "E" | "W";
  uValue: number;
  rValue: number;
  layers: MaterialLayer[];
  thermalBridge: number;
  surfaceArea: number;
}

export interface MaterialLayer {
  name: string;
  thickness: number;
  thermalConductivity: number;
  density: number;
  specificHeat: number;
  vaporPermeability?: number;
}

export interface RoofAssembly {
  uValue: number;
  layers: MaterialLayer[];
  solarReflectance: number;
  emissivity: number;
  greenRoofCoverage: number;
}

export interface FloorAssembly {
  uValue: number;
  layers: MaterialLayer[];
  groundContactResistance: number;
}

export interface GlazingProperties {
  uValue: number;
  shgc: number;
  vlt: number;
  glassType: "single" | "double" | "triple";
  coating: "none" | "low-e" | "reflective";
  gasFill: "air" | "argon" | "krypton";
  frameMaterial: "aluminum" | "pvc" | "wood" | "thermal-break-aluminum";
  airLeakageRate: number;
  shadingCoefficient: number;
  windowToWallRatio: { N: number; S: number; E: number; W: number };
}

export interface FoundationProperties {
  perimeterInsulationUValue: number;
  groundTemperature: number;
  moistureBarrier: "none" | "polyethylene" | "bituminous";
}

export interface AirtightnessProperties {
  ach50: number;
  equivalentLeakageArea: number;
  testMethod: "blower-door" | "estimated";
}

export interface HVACProperties {
  heating: {
    systemType: "individual" | "central" | "district";
    fuelType: "gas" | "electric" | "oil" | "district-heat" | "heat-pump";
    efficiency: number;
    capacity: number;
  };
  cooling: {
    systemType: "split" | "central-chiller" | "vrf" | "none";
    efficiency: number;
    capacity: number;
    refrigerant?: string;
  };
  ventilation: {
    type: "natural" | "mechanical-exhaust" | "mechanical-supply" | "heat-recovery";
    heatRecoveryEfficiency: number;
    airflowRate: number;
  };
  dhw: {
    systemType: "gas-boiler" | "electric" | "heat-pump" | "solar-thermal";
    efficiency: number;
    storageVolume: number;
  };
}

export interface LightingProperties {
  lightingPowerDensity: number;
  controlType: "manual" | "occupancy-sensor" | "daylight-dimming" | "combined";
  lampType: "fluorescent" | "led" | "halogen";
}

export interface RenewableProperties {
  solarPV: {
    installed: boolean;
    capacity: number;
    panelType: "monocrystalline" | "polycrystalline" | "thin-film";
    tiltAngle: number;
    orientation: number;
    area: number;
  };
  solarThermal: {
    installed: boolean;
    collectorArea: number;
    efficiency: number;
  };
  geothermal: {
    installed: boolean;
    systemType: "closed-loop" | "open-loop";
    cop: number;
  };
}

export interface OccupancyProfile {
  occupancyDensity: number;
  weekdaySchedule: number[];
  weekendSchedule: number[];
  internalHeatGain: number;
  hotWaterDemand: number;
}

/** Era classification from permit date */
export type BuildingEra = "pre-1970" | "1970-1989" | "1990-1999" | "2000-2009" | "2010-2019" | "2020+";

export function classifyEra(pmsDay: string | undefined): BuildingEra {
  if (!pmsDay || pmsDay.trim() === "" || pmsDay.length < 4) return "1990-1999"; // default
  const year = parseInt(pmsDay.slice(0, 4), 10);
  if (isNaN(year)) return "1990-1999";
  if (year < 1970) return "pre-1970";
  if (year < 1990) return "1970-1989";
  if (year < 2000) return "1990-1999";
  if (year < 2010) return "2000-2009";
  if (year < 2020) return "2010-2019";
  return "2020+";
}
