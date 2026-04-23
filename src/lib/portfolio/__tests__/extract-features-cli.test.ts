// src/lib/portfolio/__tests__/extract-features-cli.test.ts
// Smoke test: CLI (scripts/extract-features.mjs) produces identical output to
// the TS extractor for the 2018 concrete apt fixture (post-2010 × residential).
//
// This is the behavioural-parity enforcement for Task 3.
// Task 11 CI guard extends parity coverage to all 9 matrix fixtures.

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { extractFeatures } from "../feature-extractor";
import type { BuildingRecord } from "../../types";
import type { FootprintGeometry } from "../types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");
const CLI_PATH = path.join(REPO_ROOT, "scripts", "extract-features.mjs");

// ── 2018 concrete apt fixture (mirrors the post-2010 × residential test) ──
const BUILDING_2018_APT: BuildingRecord = {
  pk: "11110-300-00-2018",
  name: "테스트 건물",
  address: "서울특별시 종로구 테스트로 1",
  useCode: "02000",
  useName: "공동주택",
  structureCode: "21",
  structureName: "철근콘크리트구조",
  floorsAbove: 25,
  floorsBelow: 3,
  totalArea: 25000,
  buildingArea: 1000,
  siteArea: 4000,
  coverageRatio: 25,
  floorAreaRatio: 625,
  approvalDate: "20181215",
  permitDate: "20160601",
  constructionDate: "20170101",
  roofType: "01",
  height: 75,
};

const GEOMETRY_2018_APT: FootprintGeometry = {
  outerRing: [
    [126.977, 37.575],
    [126.987, 37.575],
    [126.987, 37.580],
    [126.977, 37.580],
  ],
  areaSqm: 1000,
  perimeterM: 130,
  aspectRatio: 1.4,
};

describe("extract-features CLI — behavioural parity smoke test", () => {
  it("CLI output matches TS extractFeatures for the 2018-apt fixture", () => {
    // Expected output from the TS extractor (ground truth)
    const expected = extractFeatures(BUILDING_2018_APT, GEOMETRY_2018_APT);

    // Spawn the CLI with the fixture as stdin JSON
    const input = JSON.stringify({ building: BUILDING_2018_APT, geometry: GEOMETRY_2018_APT });
    const result = spawnSync(process.execPath, [CLI_PATH], {
      input,
      encoding: "utf8",
      timeout: 10_000,
    });

    if (result.error) {
      throw new Error(`CLI spawn failed: ${result.error.message}`);
    }

    expect(result.status, `CLI stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout.trim()).not.toBe("");

    const cliOutput = JSON.parse(result.stdout.trim());

    // Every field must match exactly (deep equal covers all 20 fields)
    expect(cliOutput).toEqual(expected);
  });

  it("CLI --batch mode produces one output line per input line", () => {
    const row = JSON.stringify({ building: BUILDING_2018_APT, geometry: GEOMETRY_2018_APT });
    const batchInput = [row, row].join("\n");

    const result = spawnSync(process.execPath, [CLI_PATH, "--batch"], {
      input: batchInput,
      encoding: "utf8",
      timeout: 10_000,
    });

    expect(result.status, `CLI stderr: ${result.stderr}`).toBe(0);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);

    const expected = extractFeatures(BUILDING_2018_APT, GEOMETRY_2018_APT);
    for (const line of lines) {
      expect(JSON.parse(line)).toEqual(expected);
    }
  });

  it("CLI exits with code 1 on malformed JSON", () => {
    const result = spawnSync(process.execPath, [CLI_PATH], {
      input: "not-json",
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
  });

  it("CLI exits with code 1 when building field is missing", () => {
    const input = JSON.stringify({ geometry: GEOMETRY_2018_APT });
    const result = spawnSync(process.execPath, [CLI_PATH], {
      input,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
  });
});
