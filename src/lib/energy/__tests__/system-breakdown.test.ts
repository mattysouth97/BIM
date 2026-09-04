import { describe, it, expect } from "vitest";
import { SYSTEM_RATIOS, calculateSystemBreakdown } from "../system-breakdown";
import { calculateAnnualDemand } from "../annual-demand";
import { calculateHeatLoss } from "../heat-loss";
import { SEOUL_CLIMATE } from "../climate-data";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

// ── Test fixtures (adapted from annual-demand.test.ts) ─────────────────────

function makeMaterials(heatingEff = 87, coolingEff = 3.5): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2015,
    envelope: {
      walls: [
        { orientation: "N", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "S", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "E", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
        { orientation: "W", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
      ],
      roof: { uValue: 0.15, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.22, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: 1.5,
        shgc: 0.35,
        vlt: 0.5,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 1.5,
        shadingCoefficient: 0.4,
        windowToWallRatio: { N: 0.4, S: 0.4, E: 0.4, W: 0.4 },
      },
      foundation: { perimeterInsulationUValue: 0.3, groundTemperature: 13.5, moistureBarrier: "polyethylene" },
      airtightness: { ach50: 1.5, equivalentLeakageArea: 50, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: heatingEff, capacity: 20 },
      cooling: { systemType: "split", efficiency: coolingEff, capacity: 10 },
      ventilation: { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.5 },
      dhw: { systemType: "gas-boiler", efficiency: 85, storageVolume: 100 },
    },
    lighting: { lightingPowerDensity: 6, controlType: "manual", lampType: "led" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.04, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 3, hotWaterDemand: 40 },
  };
}

/** All-above-grade recipe (mirrors annual-demand.test.ts) */
function makeRecipe(floorCount = 10, mainPurpsCd = "02000"): BuildingRecipe {
  const w = 11.2;
  const d = 7.5;
  const fh = 2.9;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * fh,
    height: fh,
    isGroundFloor: i === 0,
  }));

  return {
    footprintWidth: w,
    footprintDepth: d,
    floors,
    totalHeight: floorCount * fh,
    wallThickness: 0.332,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd,
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.35, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.582 },
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
    siteWidth: 20,
    siteDepth: 15,
    buildingName: "Test Building",
    address: "Seoul",
  };
}

/**
 * Mixed recipe: 2 basement floors (type: "below") + N above-grade floors (type: "above").
 * Exercises the f.type === "above" filter — critical for Pitfall 4 (perFloor length mismatch).
 */
function makeMixedRecipe(aboveCount = 10, mainPurpsCd = "02000"): BuildingRecipe {
  const w = 11.2;
  const d = 7.5;
  const fh = 2.9;

  const basementFloors: FloorSpec[] = [
    { floorNo: -2, label: "B2", type: "below", y: -2 * fh, height: fh, isGroundFloor: false },
    { floorNo: -1, label: "B1", type: "below", y: -fh, height: fh, isGroundFloor: false },
  ];

  const aboveFloors: FloorSpec[] = Array.from({ length: aboveCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * fh,
    height: fh,
    isGroundFloor: i === 0,
  }));

  const allFloors = [...basementFloors, ...aboveFloors];

  return {
    footprintWidth: w,
    footprintDepth: d,
    floors: allFloors,
    totalHeight: aboveCount * fh,
    wallThickness: 0.332,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd,
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.35, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.582 },
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
    siteWidth: 20,
    siteDepth: 15,
    buildingName: "Test Mixed Building",
    address: "Seoul",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("calculateSystemBreakdown", () => {
  it("HVAC attribution equals calculateAnnualDemand().totalDemand (EA-01c, D2)", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe(10);

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);

    // Independently compute the expected HVAC value from the degree-day engine
    const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
    const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

    expect(breakdown.hvac).toBeCloseTo(demand.totalDemand, 5);
  });

  it("total equals sum of the four system buckets (EA-01b)", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe(10);

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);
    const expectedTotal = breakdown.hvac + breakdown.lighting + breakdown.dhw + breakdown.plugLoads;

    expect(breakdown.total).toBeCloseTo(expectedTotal, 5);
  });

  it("perFloor length equals count of above-grade floors only (EA-01a, D3)", () => {
    const materials = makeMaterials();
    // 2 basements + 10 above-grade = 12 total floors, but perFloor should have 10 entries
    const recipe = makeMixedRecipe(10);

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);

    const aboveCount = recipe.floors.filter((f) => f.type === "above").length;
    expect(aboveCount).toBe(10); // sanity-check the fixture
    expect(breakdown.perFloor).toHaveLength(aboveCount);
    // Also confirm basements are excluded: total floors = 12, perFloor = 10
    expect(recipe.floors.length).toBe(12);
    expect(breakdown.perFloor.length).toBe(10);
  });

  it("every *DataSource field carries the correct runtime string (EA-01d, D4)", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe(10);

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);

    // Per CONTEXT.md D4 — "actual" | "estimated-ratio" | "estimated-inferred"
    // All four fields must be "estimated-ratio" in Phase 23 (Phase 26 introduces "actual")
    expect(breakdown.hvacDataSource).toBe("estimated-ratio");
    expect(breakdown.lightingDataSource).toBe("estimated-ratio");
    expect(breakdown.dhwDataSource).toBe("estimated-ratio");
    expect(breakdown.plugLoadsDataSource).toBe("estimated-ratio");
  });

  it("mainPurpsCd prefix '14' selects office ratios: hvac/total ≈ 0.55 (D6, D7)", () => {
    const materials = makeMaterials();
    // Office: 업무시설 = 14000 per the 건축물대장 주용도코드 table
    const recipe = makeRecipe(10, "14000");

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);

    // hvac / total should be approximately 0.55 (office HVAC ratio per CONTEXT.md D6)
    const hvacFraction = breakdown.hvac / breakdown.total;
    expect(hvacFraction).toBeCloseTo(0.55, 2);
  });

  it("mainPurpsCd prefix '02' (공동주택 MOLIT 02) selects RESIDENTIAL ratios (P1-04)", () => {
    const materials = makeMaterials();
    // Apartment: mainPurpsCd "02000" — 공동주택 per MOLIT 건축물대장 주용도코드
    const recipe = makeRecipe(10, "02000");

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);

    // Residential profile: HVAC 50%, DHW 25% — NOT the office 0.55/0.10.
    expect(breakdown.hvac / breakdown.total).toBeCloseTo(0.50, 2);
    expect(breakdown.dhw / breakdown.total).toBeCloseTo(0.25, 2);
  });

  it("mainPurpsCd prefix '02' selects residential ratios (DHW-dominant, different from office)", () => {
    const materials = makeMaterials();

    const officeRecipe = makeRecipe(10, "14000");      // 업무시설: HVAC 55%
    const residentialRecipe = makeRecipe(10, "02000"); // 공동주택: HVAC 50%

    const officeBreakdown = calculateSystemBreakdown(materials, officeRecipe, SEOUL_CLIMATE);
    const residentialBreakdown = calculateSystemBreakdown(materials, residentialRecipe, SEOUL_CLIMATE);

    const officeHvacFraction = officeBreakdown.hvac / officeBreakdown.total;
    const residentialHvacFraction = residentialBreakdown.hvac / residentialBreakdown.total;

    // Residential HVAC fraction differs from office (office=0.55, residential=0.50)
    expect(officeHvacFraction).not.toBeCloseTo(residentialHvacFraction, 2);

    // Residential DHW fraction is larger (0.25 vs 0.10 for office) — DHW-dominant
    const officeDhwFraction = officeBreakdown.dhw / officeBreakdown.total;
    const residentialDhwFraction = residentialBreakdown.dhw / residentialBreakdown.total;
    expect(residentialDhwFraction).toBeGreaterThan(officeDhwFraction);
  });

  it("prefix '14' (업무시설 office) vs '02' (residential): office HVAC-heavier, residential DHW-dominant (P1-04)", () => {
    const materials = makeMaterials();

    const officeRecipe = makeRecipe(10, "14000");      // 업무시설 — HVAC 55%
    const residentialRecipe = makeRecipe(10, "02000"); // 공동주택 — HVAC 50%

    const officeBreakdown = calculateSystemBreakdown(materials, officeRecipe, SEOUL_CLIMATE);
    const residentialBreakdown = calculateSystemBreakdown(materials, residentialRecipe, SEOUL_CLIMATE);

    expect(officeBreakdown.hvac / officeBreakdown.total).toBeCloseTo(0.55, 2);
    expect(residentialBreakdown.hvac / residentialBreakdown.total).toBeCloseTo(0.50, 2);

    // Residential DHW fraction is larger (0.25 vs 0.10 for office) — DHW-dominant
    const officeDhwFraction = officeBreakdown.dhw / officeBreakdown.total;
    const residentialDhwFraction = residentialBreakdown.dhw / residentialBreakdown.total;
    expect(residentialDhwFraction).toBeGreaterThan(officeDhwFraction);
  });

  it("prefix '07' (판매시설 retail) selects the lighting-heavy retail profile (P1-04)", () => {
    const materials = makeMaterials();
    const breakdown = calculateSystemBreakdown(materials, makeRecipe(10, "07000"), SEOUL_CLIMATE);

    expect(breakdown.lighting / breakdown.total).toBeCloseTo(0.40, 2);
  });

  it("de-researched prefixes '11'/'13' fall back to DEFAULT_RATIOS (P1-04 honesty)", () => {
    const materials = makeMaterials();
    // 노유자시설 (11) and 운동시설 (13) have no researched profiles — the honest
    // outcome is the generic mixed-use default, not a wrong specific binding.
    for (const cd of ["11000", "13000"]) {
      const breakdown = calculateSystemBreakdown(materials, makeRecipe(10, cd), SEOUL_CLIMATE);
      expect(breakdown.hvac / breakdown.total).toBeCloseTo(0.42, 2);
      expect(breakdown.total).toBeGreaterThan(0);
    }
  });

  it("unknown mainPurpsCd falls back to DEFAULT_RATIOS with valid positive breakdown", () => {
    const materials = makeMaterials();
    // "99999" has no matching prefix — should fall back to DEFAULT_RATIOS
    const recipe = makeRecipe(10, "99999");

    const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);

    // All four values must be positive
    expect(breakdown.hvac).toBeGreaterThan(0);
    expect(breakdown.lighting).toBeGreaterThan(0);
    expect(breakdown.dhw).toBeGreaterThan(0);
    expect(breakdown.plugLoads).toBeGreaterThan(0);

    // Arithmetic identity must hold
    const expectedTotal = breakdown.hvac + breakdown.lighting + breakdown.dhw + breakdown.plugLoads;
    expect(breakdown.total).toBeCloseTo(expectedTotal, 5);
  });
});

describe("system ratio provenance (queue item 6 — the silent fallback)", () => {
  it("reports the matched 주용도코드 when the table has a row for it", () => {
    const breakdown = calculateSystemBreakdown(
      makeMaterials(),
      makeRecipe(10, "14000"),
      SEOUL_CLIMATE,
    );

    expect(breakdown.ratioProvenance).toEqual({
      source: "use_code",
      useCodePrefix: "14",
    });
  });

  it("says so, in words, when no row exists for the use code", () => {
    // 교육연구시설 (10000) has no researched ratio profile. Before this, it
    // silently received the mixed-use average and nothing anywhere recorded
    // that a default had been applied.
    const breakdown = calculateSystemBreakdown(
      makeMaterials(),
      makeRecipe(10, "10000"),
      SEOUL_CLIMATE,
    );

    expect(breakdown.ratioProvenance.source).toBe("generic_default");
    expect(breakdown.ratioProvenance.useCodePrefix).toBe("10");
    // The assumption has to identify WHICH code went unmatched, or a reader
    // cannot tell which of the four systems is unsourced.
    expect(
      breakdown.ratioProvenance.source === "generic_default" &&
        breakdown.ratioProvenance.assumption,
    ).toContain("10");
  });

  it("changes no energy number when it falls back", () => {
    // The whole point is to make an existing default visible, not to alter
    // what it computes. DEFAULT_RATIOS is 42/28/12/18 and must stay so.
    const breakdown = calculateSystemBreakdown(
      makeMaterials(),
      makeRecipe(10, "10000"),
      SEOUL_CLIMATE,
    );

    expect(breakdown.hvac / breakdown.total).toBeCloseTo(0.42, 6);
    expect(breakdown.lighting / breakdown.total).toBeCloseTo(0.28, 6);
    expect(breakdown.dhw / breakdown.total).toBeCloseTo(0.12, 6);
    expect(breakdown.plugLoads / breakdown.total).toBeCloseTo(0.18, 6);
  });

  it("changes no energy number when it matches", () => {
    const breakdown = calculateSystemBreakdown(
      makeMaterials(),
      makeRecipe(10, "14000"),
      SEOUL_CLIMATE,
    );

    expect(breakdown.hvac / breakdown.total).toBeCloseTo(0.55, 6);
  });

  it("reaches every row the table declares", () => {
    // A row that no use code can select would be dead weight pretending to be
    // a sourced profile.
    for (const prefix of Object.keys(SYSTEM_RATIOS)) {
      const breakdown = calculateSystemBreakdown(
        makeMaterials(),
        makeRecipe(10, `${prefix}000`),
        SEOUL_CLIMATE,
      );
      expect(breakdown.ratioProvenance).toEqual({
        source: "use_code",
        useCodePrefix: prefix,
      });
    }
  });
});
