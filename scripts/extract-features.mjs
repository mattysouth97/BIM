#!/usr/bin/env node
// scripts/extract-features.mjs
// Node CLI wrapper for the portfolio feature extractor — Phase 35 Task 3.
//
// Usage:
//   echo '{"building":{...},"geometry":{...}}' | node scripts/extract-features.mjs
//   cat rows.jsonl | node scripts/extract-features.mjs --batch
//
// stdin  : JSON object { building: BuildingRecord, geometry: FootprintGeometry }
// stdout : JSON object PortfolioFeatureVector
//
// With --batch:
//   stdin  : JSONL (one { building, geometry } per line)
//   stdout : JSONL (one PortfolioFeatureVector per line)
//
// Exit codes: 0 = success, 1 = parse/schema error
//
// PARITY NOTE: This is a parallel plain-JS implementation of
// src/lib/portfolio/feature-extractor.ts. Both files MUST produce identical
// output for all valid inputs. The smoke test in
// src/lib/portfolio/__tests__/extract-features-cli.test.ts enforces parity
// on the 2018-concrete-apt fixture. Task 11 CI guard extends this to all 9
// fixtures.
//
// When you change the TS extractor, mirror the change here. The encoding
// tables (structure type, use type, climate zone, era priors) are copied
// verbatim with comments referencing the source constants in
// src/lib/korean-building-codes.ts and src/lib/material-types.ts.

import { createInterface } from "readline";

// ─── Encoding tables (mirrored from TS sources) ──────────────────────────────

/** BuildingEra → wall U-value { residential, nonResidential } W/(m²·K)
 *  Source: WALL_U_VALUES in src/lib/korean-building-codes.ts */
const WALL_U_VALUES = {
  "pre-1970":  { residential: 2.0,  nonResidential: 2.5  },
  "1970-1989": { residential: 1.05, nonResidential: 1.2  },
  "1990-1999": { residential: 0.58, nonResidential: 0.7  },
  "2000-2009": { residential: 0.47, nonResidential: 0.58 },
  "2010-2019": { residential: 0.27, nonResidential: 0.35 },
  "2020+":     { residential: 0.15, nonResidential: 0.22 },
};

/** BuildingEra → window U-value W/(m²·K)
 *  Source: WINDOW_U_VALUES in src/lib/korean-building-codes.ts */
const WINDOW_U_VALUES = {
  "pre-1970":  5.8,
  "1970-1989": 3.84,
  "1990-1999": 3.37,
  "2000-2009": 2.1,
  "2010-2019": 1.5,
  "2020+":     0.9,
};

/** BuildingEra → window SHGC
 *  Source: WINDOW_SHGC in src/lib/korean-building-codes.ts */
const WINDOW_SHGC = {
  "pre-1970":  0.82,
  "1970-1989": 0.76,
  "1990-1999": 0.65,
  "2000-2009": 0.45,
  "2010-2019": 0.35,
  "2020+":     0.25,
};

/** BuildingEra → lighting power density prior W/m²
 *  Derived from Korean energy-code timeline (no era table in
 *  korean-building-codes.ts; see feature-extractor.ts LIGHTING_LPD_BY_ERA). */
const LIGHTING_LPD_BY_ERA = {
  "pre-1970":  12,
  "1970-1989": 12,
  "1990-1999": 10,
  "2000-2009": 8,
  "2010-2019": 6,
  "2020+":     6,
};

// ─── Helper functions ────────────────────────────────────────────────────────

/** Classify era from a YYYYMMDD date string.
 *  Source: classifyEra in src/lib/material-types.ts */
function classifyEra(dateStr) {
  if (!dateStr || dateStr.trim() === "" || dateStr.length < 4) return "1990-1999";
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year)) return "1990-1999";
  if (year < 1970) return "pre-1970";
  if (year < 1990) return "1970-1989";
  if (year < 2000) return "1990-1999";
  if (year < 2010) return "2000-2009";
  if (year < 2020) return "2010-2019";
  return "2020+";
}

/** Encode strctCd → 0–4.
 *  Source: encodeStructureType in feature-extractor.ts */
function encodeStructureType(strctCd) {
  switch (strctCd) {
    case "22": case "23": case "24": case "25": return 0; // masonry
    case "11": case "12": case "14": case "21": case "42": return 1; // RC
    case "13": return 2; // steel
    case "15": return 3; // wood
    default: return 4;
  }
}

/** Encode useCode → 0–4.
 *  Source: encodeUseType in feature-extractor.ts */
function encodeUseType(useCode) {
  const prefix = (useCode || "").slice(0, 2);
  switch (prefix) {
    case "01": case "02": return 0; // residential
    case "14": return 1; // office
    case "03": case "04": case "05": return 2; // mixed
    case "07": case "16": return 3; // retail
    default: return 4;
  }
}

/** Encode climate zone from pk prefix.
 *  Source: encodeClimateZone in feature-extractor.ts */
function encodeClimateZone(pk) {
  const sidoPrefix = (pk || "").slice(0, 2);
  switch (sidoPrefix) {
    case "50": return 2; // Jeju
    case "26": case "29": case "31": case "46": case "48": return 1; // southern
    default: return 0; // central
  }
}

function isResidential(useCode) {
  const prefix = (useCode || "").slice(0, 2);
  return prefix === "01" || prefix === "02";
}

// ─── Core extract function ───────────────────────────────────────────────────

/**
 * Pure feature extraction — parallel implementation of extractFeatures in TS.
 * @param {object} building - BuildingRecord shape
 * @param {object} geometry - FootprintGeometry shape
 * @returns {object} PortfolioFeatureVector (20 fields, all numbers)
 */
function extractFeatures(building, geometry) {
  // construction year
  const dateStr = (building.approvalDate && building.approvalDate.length >= 4)
    ? building.approvalDate
    : building.permitDate;
  const constructionYear = (dateStr && dateStr.length >= 4)
    ? (parseInt(dateStr.slice(0, 4), 10) || 0)
    : 0;

  // era
  const era = classifyEra(dateStr);

  // building height — 0 sentinel → infer from floors
  const buildingHeightM = (building.height !== 0)
    ? building.height
    : building.floorsAbove * 3;

  // mainPurpsCode
  const mainPurpsCode = (building.useCode && building.useCode.trim() !== "")
    ? (parseInt(building.useCode, 10) || 0)
    : 0;

  // geometry
  const { areaSqm, perimeterM, aspectRatio } = geometry;
  const rawCompactness = (perimeterM > 0)
    ? (4 * Math.PI * areaSqm) / (perimeterM * perimeterM)
    : 0;
  const compactness = Math.min(1, Math.max(0, rawCompactness));

  // era priors
  const residential = isResidential(building.useCode);
  const wallUValuePrior = residential
    ? WALL_U_VALUES[era].residential
    : WALL_U_VALUES[era].nonResidential;
  const windowUValuePrior = WINDOW_U_VALUES[era];
  const windowShgcPrior = WINDOW_SHGC[era];
  const lightingPowerDensityPrior = LIGHTING_LPD_BY_ERA[era];

  // climate zone
  const climateZoneCode = encodeClimateZone(building.pk);

  return {
    gfaSqm:            building.totalArea,
    floorCountAbove:   building.floorsAbove,
    floorCountBelow:   building.floorsBelow,
    buildingHeightM,
    constructionYear,
    structureTypeCode: encodeStructureType(building.structureCode || ""),
    useTypeCode:       encodeUseType(building.useCode || ""),
    mainPurpsCode,
    bcRat:             building.coverageRatio,
    vlRat:             building.floorAreaRatio,
    platAreaSqm:       building.siteArea,
    footprintAreaSqm:  areaSqm,
    aspectRatio,
    perimeterM,
    compactness,
    wallUValuePrior,
    windowUValuePrior,
    windowShgcPrior,
    lightingPowerDensityPrior,
    climateZoneCode,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInput(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Input must be a JSON object");
  if (!obj.building || typeof obj.building !== "object") throw new Error("Missing field: building");
  if (!obj.geometry || typeof obj.geometry !== "object") throw new Error("Missing field: geometry");
  const g = obj.geometry;
  if (!Array.isArray(g.outerRing)) throw new Error("geometry.outerRing must be an array");
  if (typeof g.areaSqm !== "number") throw new Error("geometry.areaSqm must be a number");
  if (typeof g.perimeterM !== "number") throw new Error("geometry.perimeterM must be a number");
  if (typeof g.aspectRatio !== "number") throw new Error("geometry.aspectRatio must be a number");
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const isBatch = process.argv.includes("--batch");

if (isBatch) {
  // JSONL mode: one {building, geometry} per line → one PortfolioFeatureVector per line
  const rl = createInterface({ input: process.stdin });
  let lineNo = 0;
  let hadError = false;

  rl.on("line", (line) => {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) return; // skip blank lines
    try {
      const obj = JSON.parse(trimmed);
      validateInput(obj);
      const result = extractFeatures(obj.building, obj.geometry);
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch (err) {
      process.stderr.write(`Line ${lineNo}: ${err.message}\n`);
      hadError = true;
    }
  });

  rl.on("close", () => {
    process.exit(hadError ? 1 : 0);
  });
} else {
  // Single-object mode: read all stdin, parse once
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => {
    try {
      const obj = JSON.parse(raw);
      validateInput(obj);
      const result = extractFeatures(obj.building, obj.geometry);
      process.stdout.write(JSON.stringify(result) + "\n");
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
  });
}
