// src/lib/portfolio/features.ts
// Single source of truth for the v7.0 Prediction PortfolioFeatureVector.
// Every field is derivable from Korean public data only — building ledger
// (건축물대장) + footprint geometry + era priors + climate zone. NO user inputs.
//
// Consumed by:
//   - feature-extractor.ts (Task 3, same directory)
//   - scripts/export-feature-schema.mjs (Task 4 — emits ml/portfolio's features_schema.json)
//   - Python pipeline via ml/portfolio/schema.py

export interface PortfolioFeatureVector {
  // --- bldrgst ---
  /** Gross floor area (m²) */
  gfaSqm: number;
  /** Above-grade storey count */
  floorCountAbove: number;
  /** Below-grade storey count */
  floorCountBelow: number;
  /** Total above-grade height (m) */
  buildingHeightM: number;
  /** Four-digit construction year */
  constructionYear: number;
  /** Encoded structure type: 0=masonry, 1=concrete, 2=steel, 3=wood, 4=other */
  structureTypeCode: number;
  /** Encoded use type: 0=residential, 1=office, 2=mixed, 3=retail, 4=other */
  useTypeCode: number;
  /** Main-purpose subclassification numeric code (Korean building ledger main purpose code;
   *  kept as a number even though upstream is string-coded — caller must parse to integer) */
  mainPurpsCode: number;
  /** Building coverage ratio (건폐율), 0–1 */
  bcRat: number;
  /** Floor area ratio (용적률), can exceed 1 */
  vlRat: number;
  /** Plot area (m²) */
  platAreaSqm: number;

  // --- geometry ---
  /** Ground-floor footprint area (m²) */
  footprintAreaSqm: number;
  /** Long-axis / short-axis (≥1, unitless) */
  aspectRatio: number;
  /** Footprint perimeter (m) */
  perimeterM: number;
  /** 4π·A / P² (unitless, 0–1 where 1 = perfect circle) */
  compactness: number;

  // --- era_prior ---
  /** Wall U-value prior (W/m²K) */
  wallUValuePrior: number;
  /** Window U-value prior (W/m²K) */
  windowUValuePrior: number;
  /** Window solar heat gain coefficient prior, 0–1 */
  windowShgcPrior: number;
  /** Lighting power density prior (W/m²) */
  lightingPowerDensityPrior: number;

  // --- location ---
  /** Climate zone: 0=central, 1=southern, 2=jeju */
  climateZoneCode: number;
}

export const FEATURE_SCHEMA = {
  version: "1.0.0",
  fields: [
    { name: "gfaSqm",                    group: "bldrgst",   unit: "m^2",    description: "Gross floor area" },
    { name: "floorCountAbove",           group: "bldrgst",   unit: "floors", description: "Above-grade storey count" },
    { name: "floorCountBelow",           group: "bldrgst",   unit: "floors", description: "Below-grade storey count" },
    { name: "buildingHeightM",           group: "bldrgst",   unit: "m",      description: "Total above-grade height" },
    { name: "constructionYear",          group: "bldrgst",   unit: "year",   description: "Four-digit construction year" },
    { name: "structureTypeCode",         group: "bldrgst",   unit: "enum",   description: "Encoded structure type: 0=masonry, 1=concrete, 2=steel, 3=wood, 4=other" },
    { name: "useTypeCode",               group: "bldrgst",   unit: "enum",   description: "Encoded use type: 0=residential, 1=office, 2=mixed, 3=retail, 4=other" },
    { name: "mainPurpsCode",             group: "bldrgst",   unit: "code",   description: "Main-purpose subclassification numeric code from Korean building ledger" },
    { name: "bcRat",                     group: "bldrgst",   unit: "ratio",  description: "Building coverage ratio (건폐율), 0–1" },
    { name: "vlRat",                     group: "bldrgst",   unit: "ratio",  description: "Floor area ratio (용적률), can exceed 1" },
    { name: "platAreaSqm",               group: "bldrgst",   unit: "m^2",    description: "Plot area" },
    { name: "footprintAreaSqm",          group: "geometry",  unit: "m^2",    description: "Ground-floor footprint area" },
    { name: "aspectRatio",               group: "geometry",  unit: "unitless", description: "Long-axis divided by short-axis (≥1)" },
    { name: "perimeterM",                group: "geometry",  unit: "m",      description: "Footprint perimeter" },
    { name: "compactness",               group: "geometry",  unit: "unitless", description: "4π·A / P² — isoperimetric compactness (0–1, 1=circle)" },
    { name: "wallUValuePrior",           group: "era_prior", unit: "W/m^2K", description: "Wall U-value prior from era lookup table" },
    { name: "windowUValuePrior",         group: "era_prior", unit: "W/m^2K", description: "Window U-value prior from era lookup table" },
    { name: "windowShgcPrior",           group: "era_prior", unit: "unitless", description: "Window solar heat gain coefficient prior, 0–1" },
    { name: "lightingPowerDensityPrior", group: "era_prior", unit: "W/m^2",  description: "Lighting power density prior from era lookup table" },
    { name: "climateZoneCode",           group: "location",  unit: "enum",   description: "Climate zone: 0=central, 1=southern, 2=jeju" },
  ],
} as const;

export type FeatureSchemaField = (typeof FEATURE_SCHEMA.fields)[number];
