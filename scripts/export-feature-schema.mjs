#!/usr/bin/env node
// scripts/export-feature-schema.mjs
// Emits public/releases/v0.1.0/schema.json — a JSON Schema (draft-07) derived
// from FEATURE_SCHEMA in src/lib/portfolio/features.ts — Phase 35 Task 4/8.
//
// Usage:
//   node scripts/export-feature-schema.mjs [outPath]
//   node scripts/export-feature-schema.mjs --stdout   (print JSON to stdout, no file write)
//
// Default outPath: public/releases/v0.1.0/schema.json
//
// PARITY NOTE: This is a parallel plain-JS mirror of FEATURE_SCHEMA in
// src/lib/portfolio/features.ts, following the same convention as
// scripts/extract-features.mjs (Task 3). Both files MUST stay in sync.
// scripts/ci-check-plan.mjs (Task 11 CI guard) enforces schema-drift
// detection by regenerating this file and diffing against the committed
// public/releases/<latest>/schema.json.
//
// When you change FEATURE_SCHEMA in features.ts, mirror the change here.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// ─── Mirrored from src/lib/portfolio/features.ts FEATURE_SCHEMA ─────────────
// Source of truth: src/lib/portfolio/features.ts

const FEATURE_SCHEMA = {
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
};

// ─── JSON Schema (draft-07) builder ──────────────────────────────────────────

function buildJsonSchema(featureSchema) {
  const properties = {};
  for (const field of featureSchema.fields) {
    properties[field.name] = {
      type: "number",
      description: field.description,
      "x-unit": field.unit,
      "x-group": field.group,
    };
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://bim.example/releases/portfolio-feature-vector.schema.json",
    title: "PortfolioFeatureVector",
    description:
      "v7.0 Prediction Data Product — feature vector derivable solely from public data (건축물대장 + footprint geometry + era priors). Schema version tracks src/lib/portfolio/features.ts FEATURE_SCHEMA.version.",
    type: "object",
    version: featureSchema.version,
    properties,
    required: featureSchema.fields.map((f) => f.name),
    additionalProperties: false,
  };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const stdoutOnly = args.includes("--stdout");
  const positional = args.filter((a) => !a.startsWith("--"));

  const outPath = positional[0]
    ? path.resolve(REPO_ROOT, positional[0])
    : path.join(REPO_ROOT, "public", "releases", "v0.1.0", "schema.json");

  const schema = buildJsonSchema(FEATURE_SCHEMA);
  const json = JSON.stringify(schema, null, 2) + "\n";

  if (stdoutOnly) {
    process.stdout.write(json);
    return;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, json, "utf8");
  process.stderr.write(`Wrote ${path.relative(REPO_ROOT, outPath)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
