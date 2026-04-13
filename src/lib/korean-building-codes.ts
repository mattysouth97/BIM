// src/lib/korean-building-codes.ts
// Korean building energy code standards by era
// Sources: 건축물의 에너지절약설계기준, 녹색건축물 조성 지원법

import type { BuildingEra } from "./material-types";

/** Wall U-value requirements by era and climate zone (W/(m²·K)) */
export const WALL_U_VALUES: Record<BuildingEra, { residential: number; nonResidential: number }> = {
  "pre-1970": { residential: 2.0, nonResidential: 2.5 },     // No code — typical values
  "1970-1989": { residential: 1.05, nonResidential: 1.2 },   // First energy code 1979
  "1990-1999": { residential: 0.58, nonResidential: 0.7 },   // 1991 revision
  "2000-2009": { residential: 0.47, nonResidential: 0.58 },  // 2001 EPI introduced
  "2010-2019": { residential: 0.27, nonResidential: 0.35 },  // 2013 passive influence
  "2020+":     { residential: 0.15, nonResidential: 0.22 },  // Zero energy roadmap
};

/** Roof U-value requirements by era (W/(m²·K)) */
export const ROOF_U_VALUES: Record<BuildingEra, { residential: number; nonResidential: number }> = {
  "pre-1970": { residential: 1.5, nonResidential: 2.0 },
  "1970-1989": { residential: 0.58, nonResidential: 0.7 },
  "1990-1999": { residential: 0.35, nonResidential: 0.41 },
  "2000-2009": { residential: 0.29, nonResidential: 0.35 },
  "2010-2019": { residential: 0.18, nonResidential: 0.25 },
  "2020+":     { residential: 0.12, nonResidential: 0.15 },
};

/** Floor U-value (ground contact) by era (W/(m²·K)) */
export const FLOOR_U_VALUES: Record<BuildingEra, { residential: number; nonResidential: number }> = {
  "pre-1970": { residential: 1.2, nonResidential: 1.5 },
  "1970-1989": { residential: 0.7, nonResidential: 0.9 },
  "1990-1999": { residential: 0.45, nonResidential: 0.58 },
  "2000-2009": { residential: 0.35, nonResidential: 0.47 },
  "2010-2019": { residential: 0.23, nonResidential: 0.29 },
  "2020+":     { residential: 0.15, nonResidential: 0.2 },
};

/** Window U-value by era (W/(m²·K)) */
export const WINDOW_U_VALUES: Record<BuildingEra, number> = {
  "pre-1970": 5.8,   // Single glass, aluminum frame
  "1970-1989": 3.84, // Double glass introduced
  "1990-1999": 3.37, // Improved frames
  "2000-2009": 2.1,  // Low-E double
  "2010-2019": 1.5,  // Triple or high-perf double
  "2020+": 0.9,      // Triple Low-E with argon
};

/** Window SHGC by era */
export const WINDOW_SHGC: Record<BuildingEra, number> = {
  "pre-1970": 0.82,
  "1970-1989": 0.76,
  "1990-1999": 0.65,
  "2000-2009": 0.45,
  "2010-2019": 0.35,
  "2020+": 0.25,
};

/** Glazing type by era */
export const GLAZING_TYPE: Record<BuildingEra, { glassType: "single" | "double" | "triple"; coating: "none" | "low-e" | "reflective"; gasFill: "air" | "argon" | "krypton"; frameMaterial: "aluminum" | "pvc" | "wood" | "thermal-break-aluminum" }> = {
  "pre-1970": { glassType: "single", coating: "none", gasFill: "air", frameMaterial: "aluminum" },
  "1970-1989": { glassType: "double", coating: "none", gasFill: "air", frameMaterial: "aluminum" },
  "1990-1999": { glassType: "double", coating: "none", gasFill: "air", frameMaterial: "aluminum" },
  "2000-2009": { glassType: "double", coating: "low-e", gasFill: "air", frameMaterial: "thermal-break-aluminum" },
  "2010-2019": { glassType: "double", coating: "low-e", gasFill: "argon", frameMaterial: "thermal-break-aluminum" },
  "2020+": { glassType: "triple", coating: "low-e", gasFill: "argon", frameMaterial: "pvc" },
};

/** Airtightness by era (ACH at 50Pa) */
export const AIRTIGHTNESS: Record<BuildingEra, number> = {
  "pre-1970": 15.0,
  "1970-1989": 10.0,
  "1990-1999": 6.0,
  "2000-2009": 3.5,
  "2010-2019": 1.5,
  "2020+": 0.6,
};

/** Window-to-wall ratio by era and use type */
export const WINDOW_RATIOS: Record<BuildingEra, { residential: number; office: number; factory: number; retail: number; default: number }> = {
  "pre-1970": { residential: 0.15, office: 0.20, factory: 0.05, retail: 0.25, default: 0.15 },
  "1970-1989": { residential: 0.20, office: 0.30, factory: 0.08, retail: 0.30, default: 0.22 },
  "1990-1999": { residential: 0.25, office: 0.40, factory: 0.10, retail: 0.40, default: 0.28 },
  "2000-2009": { residential: 0.30, office: 0.50, factory: 0.12, retail: 0.50, default: 0.35 },
  "2010-2019": { residential: 0.35, office: 0.55, factory: 0.12, retail: 0.55, default: 0.40 },
  "2020+": { residential: 0.40, office: 0.55, factory: 0.15, retail: 0.55, default: 0.42 },
};

/** Floor height by era and use type (meters) */
export const FLOOR_HEIGHTS: Record<BuildingEra, { residential: number; commercial: number; factory: number }> = {
  "pre-1970": { residential: 2.7, commercial: 3.0, factory: 4.5 },
  "1970-1989": { residential: 2.7, commercial: 3.3, factory: 5.0 },
  "1990-1999": { residential: 2.8, commercial: 3.6, factory: 5.5 },
  "2000-2009": { residential: 2.9, commercial: 3.8, factory: 6.0 },
  "2010-2019": { residential: 2.9, commercial: 3.9, factory: 6.0 },
  "2020+": { residential: 3.0, commercial: 4.0, factory: 6.5 },
};

/** Typical wall layers by structure type */
export const WALL_LAYERS: Record<string, { name: string; thickness: number; thermalConductivity: number; density: number; specificHeat: number }[]> = {
  "rc": [
    { name: "외장마감", thickness: 20, thermalConductivity: 1.0, density: 1800, specificHeat: 920 },
    { name: "콘크리트", thickness: 200, thermalConductivity: 1.6, density: 2300, specificHeat: 880 },
    { name: "단열재(EPS)", thickness: 100, thermalConductivity: 0.036, density: 20, specificHeat: 1450 },
    { name: "석고보드", thickness: 12, thermalConductivity: 0.17, density: 750, specificHeat: 1090 },
  ],
  "src": [
    { name: "외장패널", thickness: 15, thermalConductivity: 0.5, density: 1200, specificHeat: 840 },
    { name: "콘크리트", thickness: 150, thermalConductivity: 1.6, density: 2300, specificHeat: 880 },
    { name: "단열재(XPS)", thickness: 120, thermalConductivity: 0.034, density: 30, specificHeat: 1450 },
    { name: "석고보드", thickness: 12, thermalConductivity: 0.17, density: 750, specificHeat: 1090 },
  ],
  "steel": [
    { name: "커튼월유리", thickness: 24, thermalConductivity: 1.0, density: 2500, specificHeat: 840 },
    { name: "공기층", thickness: 50, thermalConductivity: 0.025, density: 1.2, specificHeat: 1005 },
    { name: "단열재(PIR)", thickness: 80, thermalConductivity: 0.023, density: 32, specificHeat: 1450 },
    { name: "내장재", thickness: 10, thermalConductivity: 0.17, density: 750, specificHeat: 1090 },
  ],
  "masonry": [
    { name: "벽돌", thickness: 190, thermalConductivity: 0.84, density: 1800, specificHeat: 840 },
    { name: "공기층", thickness: 20, thermalConductivity: 0.025, density: 1.2, specificHeat: 1005 },
    { name: "단열재(EPS)", thickness: 50, thermalConductivity: 0.036, density: 20, specificHeat: 1450 },
    { name: "석고보드", thickness: 12, thermalConductivity: 0.17, density: 750, specificHeat: 1090 },
  ],
  "timber": [
    { name: "외장목재", thickness: 20, thermalConductivity: 0.15, density: 500, specificHeat: 1630 },
    { name: "구조목재", thickness: 140, thermalConductivity: 0.15, density: 500, specificHeat: 1630 },
    { name: "단열재(글라스울)", thickness: 100, thermalConductivity: 0.04, density: 24, specificHeat: 840 },
    { name: "석고보드", thickness: 12, thermalConductivity: 0.17, density: 750, specificHeat: 1090 },
  ],
};

/** Map structure codes to wall layer keys */
export const STRUCTURE_TO_WALL_KEY: Record<string, string> = {
  "11": "rc", "21": "rc",       // RC
  "12": "src", "42": "src",     // SRC
  "13": "steel",                 // Steel
  "14": "rc",                    // Precast (similar to RC)
  "15": "timber",                // Timber
  "22": "masonry", "23": "masonry", "24": "masonry", "25": "masonry", // Masonry variants
};

/** Regional ground temperatures (°C) by sido code prefix */
export const GROUND_TEMPERATURES: Record<string, number> = {
  "11": 13.5, // Seoul
  "26": 15.5, // Busan
  "27": 14.5, // Daegu
  "28": 13.0, // Incheon
  "29": 14.5, // Gwangju
  "30": 14.0, // Daejeon
  "31": 14.5, // Ulsan
  "36": 13.5, // Sejong
  "41": 13.0, // Gyeonggi
  "43": 12.5, // Chungbuk
  "44": 13.0, // Chungnam
  "45": 13.5, // Jeonbuk
  "46": 14.0, // Jeonnam
  "47": 13.5, // Gyeongbuk
  "48": 14.5, // Gyeongnam
  "50": 16.5, // Jeju
  "51": 11.5, // Gangwon
  "52": 13.5, // Jeonbuk (new code)
};

/** HVAC defaults by use type */
export const HVAC_DEFAULTS: Record<string, { heatingType: "individual" | "central" | "district"; fuelType: "gas" | "electric" | "oil" | "district-heat" | "heat-pump"; coolingType: "split" | "central-chiller" | "vrf" | "none"; heatingEfficiency: number; coolingEfficiency: number }> = {
  "01000": { heatingType: "individual", fuelType: "gas", coolingType: "split", heatingEfficiency: 0.87, coolingEfficiency: 3.5 },
  "02000": { heatingType: "central", fuelType: "gas", coolingType: "split", heatingEfficiency: 0.85, coolingEfficiency: 3.2 },
  "14000": { heatingType: "central", fuelType: "gas", coolingType: "central-chiller", heatingEfficiency: 0.88, coolingEfficiency: 4.0 },
  "17000": { heatingType: "individual", fuelType: "gas", coolingType: "none", heatingEfficiency: 0.82, coolingEfficiency: 0 },
  "18000": { heatingType: "individual", fuelType: "gas", coolingType: "none", heatingEfficiency: 0.80, coolingEfficiency: 0 },
  "default": { heatingType: "individual", fuelType: "gas", coolingType: "split", heatingEfficiency: 0.85, coolingEfficiency: 3.5 },
};

/** Lighting power density by use type (W/m²) */
export const LIGHTING_DEFAULTS: Record<string, { lpd: number; lampType: "fluorescent" | "led" | "halogen"; controlType: "manual" | "occupancy-sensor" | "daylight-dimming" | "combined" }> = {
  "01000": { lpd: 6, lampType: "led", controlType: "manual" },
  "02000": { lpd: 6, lampType: "led", controlType: "manual" },
  "14000": { lpd: 10, lampType: "led", controlType: "daylight-dimming" },
  "10000": { lpd: 12, lampType: "led", controlType: "occupancy-sensor" },
  "17000": { lpd: 8, lampType: "led", controlType: "manual" },
  "default": { lpd: 8, lampType: "led", controlType: "manual" },
};

/** Occupancy density by use type (persons/m²) */
export const OCCUPANCY_DEFAULTS: Record<string, { density: number; internalGain: number; hotWater: number }> = {
  "01000": { density: 0.04, internalGain: 3, hotWater: 40 },
  "02000": { density: 0.04, internalGain: 3, hotWater: 40 },
  "14000": { density: 0.1, internalGain: 15, hotWater: 10 },
  "10000": { density: 0.3, internalGain: 10, hotWater: 5 },
  "17000": { density: 0.02, internalGain: 20, hotWater: 15 },
  "07000": { density: 0.15, internalGain: 12, hotWater: 5 },
  "default": { density: 0.06, internalGain: 8, hotWater: 15 },
};
