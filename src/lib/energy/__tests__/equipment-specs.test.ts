import { describe, it, expect } from "vitest";
import {
  inferEquipmentSpecs,
  EQUIPMENT_GRADE_LABELS,
  EQUIPMENT_GRADE_COLORS,
  ERA_INSTALL_YEAR,
  HVAC_ERA_GRADE,
  ELECTRICAL_ERA_GRADE,
} from "../equipment-specs";
import type { EquipmentEfficiencyGrade } from "../equipment-specs";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BuildingEra } from "@/lib/material-types";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const BASE_RECIPE: Omit<BuildingRecipe, "era"> = {
  footprintWidth: 20,
  footprintDepth: 15,
  floors: [
    { floorNo: 1, label: "1F", type: "above", y: 0, height: 3, isGroundFloor: true },
    { floorNo: 2, label: "2F", type: "above", y: 3, height: 3, isGroundFloor: false },
    { floorNo: 3, label: "3F", type: "above", y: 6, height: 3, isGroundFloor: false },
  ],
  totalHeight: 9,
  wallThickness: 0.2,
  strctCd: "21",
  mainPurpsCd: "02000",
  facade: {
    windowWidth: 1.2,
    windowHeight: 1.5,
    sillHeight: 0.8,
    windowSpacing: 0.4,
    windowRatio: 0.4,
    mullionDepth: 0.05,
    mullionWidth: 0.06,
    glassInset: 0.02,
    solidPanelChance: 0.1,
    parapetHeight: 0.6,
    cornerInset: 0.3,
  },
  slab: { thickness: 0.2, overhang: 0.1 },
  column: { spacing: 5, size: 0.4, inset: 0.2 },
  roof: { type: "flat", flatThickness: 0.15, gableHeight: 0, hipInset: 0 },
  materials: {
    wall: { textureId: "concrete_clean", roughness: 0.8, metalness: 0 },
    glass: { textureId: "concrete_clean", roughness: 0.1, metalness: 0.1 },
    mullion: { textureId: "metal_panel", roughness: 0.4, metalness: 0.8 },
    slab: { textureId: "concrete_clean", roughness: 0.9, metalness: 0 },
    column: { textureId: "concrete_clean", roughness: 0.9, metalness: 0 },
    roof: { textureId: "roof_flat", roughness: 0.95, metalness: 0 },
    groundFloor: { textureId: "concrete_clean", roughness: 0.9, metalness: 0 },
  },
  siteWidth: 30,
  siteDepth: 25,
  buildingName: "Test Building",
  address: "Seoul",
};

function makeRecipe(era: BuildingEra): BuildingRecipe {
  return { ...BASE_RECIPE, era } as BuildingRecipe;
}

const recipe2020s = makeRecipe("2020+");
const recipePre1970 = makeRecipe("pre-1970");
const recipe1990s = makeRecipe("1990-1999");
const recipe2010s = makeRecipe("2010-2019");

// ---------------------------------------------------------------------------
// Test 1: cooling-plant in 2020+ era
// ---------------------------------------------------------------------------

describe("inferEquipmentSpecs — cooling-plant (2020+)", () => {
  it("returns HVAC category, grade 1, installYear 2022, dataSource estimated-from-era", () => {
    const spec = inferEquipmentSpecs({ type: "cooling-plant" }, recipe2020s);
    expect(spec.categoryKo).toBeTruthy();
    expect(spec.categoryKo).not.toBe("기타");
    // Korean HVAC label — should contain 냉방 or 냉각
    expect(spec.categoryKo).toMatch(/냉/);
    expect(spec.efficiencyGrade).toBe(1);
    expect(spec.dataSource).toBe("estimated-from-era");
    expect(spec.installYear).toBe(2022);
    expect(spec.efficiencyGradeLabel).toBe("1등급 (우수)");
    expect(spec.gradeColor).toBe("#16a34a");
  });
});

// ---------------------------------------------------------------------------
// Test 2: heating-boiler in pre-1970 — grade 5, installYear 1965
// ---------------------------------------------------------------------------

describe("inferEquipmentSpecs — heating-boiler (pre-1970)", () => {
  it("returns grade 5 and installYear 1965", () => {
    const spec = inferEquipmentSpecs({ type: "heating-boiler" }, recipePre1970);
    expect(spec.efficiencyGrade).toBe(5);
    expect(spec.installYear).toBe(1965);
    expect(spec.efficiencyGradeLabel).toBe("5등급 (불량)");
    expect(spec.dataSource).toBe("estimated-from-era");
  });

  it("era → grade monotonicity: newer era = better (lower) grade for HVAC", () => {
    const eras: BuildingEra[] = ["pre-1970", "1970-1989", "1990-1999", "2000-2009", "2010-2019", "2020+"];
    const grades = eras.map((era) => HVAC_ERA_GRADE[era]);
    // Each subsequent grade should be <= previous (lower number = better)
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i]).toBeLessThanOrEqual(grades[i - 1]);
    }
  });

  it("era → grade monotonicity: newer era = better (lower) grade for ELECTRICAL", () => {
    const eras: BuildingEra[] = ["pre-1970", "1970-1989", "1990-1999", "2000-2009", "2010-2019", "2020+"];
    const grades = eras.map((era) => ELECTRICAL_ERA_GRADE[era]);
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i]).toBeLessThanOrEqual(grades[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: lighting-fixture in 1990-1999 — grade 4, label "4등급 (미흡)"
// ---------------------------------------------------------------------------

describe("inferEquipmentSpecs — lighting-fixture (1990-1999)", () => {
  it("returns categoryEn containing Lighting and grade label 4등급 (미흡)", () => {
    const spec = inferEquipmentSpecs({ type: "lighting-fixture" }, recipe1990s);
    expect(spec.categoryEn).toMatch(/Lighting/i);
    expect(spec.efficiencyGradeLabel).toBe("4등급 (미흡)");
    expect(spec.efficiencyGrade).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Every known userData.type prefix returns dataSource
// ---------------------------------------------------------------------------

describe("inferEquipmentSpecs — dataSource on all known prefixes", () => {
  const knownTypes = [
    "cooling-plant",
    "cooling-riser",
    "cooling-return-riser",
    "cooling-branch",
    "cooling-flow-particles",
    "heating-boiler",
    "heating-riser",
    "heating-return-riser",
    "heating-floor-pipe",
    "heating-radiant-zone",
    "vent-ahu",
    "vent-airflow",
    "vent-duct",
    "lighting-fixture",
    "lighting-sensor",
    "lighting-panel",
    "dhw-storage-tank",
    "dhw-recirc-tank",
    "dhw-riser",
    "dhw-branch",
    "dhw-return",
    "dhw-fixture",
    "shell-slab",
    "shell-column",
    "shell-core-wall",
    "shell-envelope",
    "microgrid-pv",
    "microgrid-bess",
  ];

  it("every type returns dataSource = estimated-from-era or estimated-from-recipe", () => {
    for (const type of knownTypes) {
      const spec = inferEquipmentSpecs({ type }, recipe2020s);
      expect(
        spec.dataSource === "estimated-from-era" || spec.dataSource === "estimated-from-recipe",
        `Expected valid dataSource for type "${type}", got "${spec.dataSource}"`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: EQUIPMENT_GRADE_LABELS and EQUIPMENT_GRADE_COLORS
// ---------------------------------------------------------------------------

describe("EQUIPMENT_GRADE_LABELS and EQUIPMENT_GRADE_COLORS", () => {
  const grades: EquipmentEfficiencyGrade[] = [1, 2, 3, 4, 5];

  it("EQUIPMENT_GRADE_LABELS has non-empty Korean string for each grade", () => {
    for (const g of grades) {
      const label = EQUIPMENT_GRADE_LABELS[g];
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      // Should contain Korean grade marker
      expect(label).toMatch(/등급/);
    }
  });

  it("EQUIPMENT_GRADE_COLORS returns 7-character hex string for each grade", () => {
    for (const g of grades) {
      const color = EQUIPMENT_GRADE_COLORS[g];
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: Unknown type prefix returns fallback spec
// ---------------------------------------------------------------------------

describe("inferEquipmentSpecs — unknown type prefix", () => {
  it("returns a default spec for unknown type (categoryKo=기타 or non-null spec)", () => {
    const spec = inferEquipmentSpecs({ type: "unknown-foo" }, recipe2020s);
    // Either returns null (valid) or a fallback spec with categoryKo = "기타"
    if (spec !== null) {
      // If non-null, must be a valid spec with "기타" category
      expect(spec.categoryKo).toBe("기타");
      expect(spec.dataSource).toBe("estimated-from-recipe");
    }
    // If null is returned, the test passes (null is valid per spec)
  });
});

// ---------------------------------------------------------------------------
// Test 7: annualKwh is finite and > 0 for energy-consuming types
// ---------------------------------------------------------------------------

describe("inferEquipmentSpecs — annualKwh positive for energy-consuming types", () => {
  const energyTypes = [
    "cooling-plant",
    "heating-boiler",
    "lighting-fixture",
    "dhw-storage-tank",
  ];

  it("annualKwh is finite and > 0 for cooling/heating/lighting/dhw with valid recipe", () => {
    for (const type of energyTypes) {
      const spec = inferEquipmentSpecs({ type }, recipe2010s);
      expect(
        isFinite(spec.annualKwh),
        `Expected finite annualKwh for type "${type}", got ${spec.annualKwh}`
      ).toBe(true);
      expect(
        spec.annualKwh > 0,
        `Expected annualKwh > 0 for type "${type}", got ${spec.annualKwh}`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ERA_INSTALL_YEAR completeness
// ---------------------------------------------------------------------------

describe("ERA_INSTALL_YEAR", () => {
  const eras: BuildingEra[] = ["pre-1970", "1970-1989", "1990-1999", "2000-2009", "2010-2019", "2020+"];

  it("has a valid year for all 6 eras", () => {
    for (const era of eras) {
      const year = ERA_INSTALL_YEAR[era];
      expect(typeof year).toBe("number");
      expect(year).toBeGreaterThan(1900);
      expect(year).toBeLessThan(2030);
    }
  });
});
