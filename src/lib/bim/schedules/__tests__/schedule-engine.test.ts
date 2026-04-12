// src/lib/bim/schedules/__tests__/schedule-engine.test.ts
// Unit tests for the schedule engine and CSV export.
// Uses vitest (already configured in the project).

import { describe, it, expect } from "vitest";
import { runSchedule } from "../schedule-engine";
import { scheduleToCsv } from "../schedule-csv-export";
import type { ScheduleDefinition } from "../schedule-types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface WallFixture {
  id: string;
  floorNo: number;
  thickness: number;   // metres
  height: number;
  length: number;
  area: number;
  uValue: number;
  material: string;
}

const WALLS: WallFixture[] = [
  { id: "W-01", floorNo: 1, thickness: 0.25, height: 3.2, length: 5.0, area: 16.0, uValue: 0.45, material: "RC" },
  { id: "W-02", floorNo: 1, thickness: 0.15, height: 3.2, length: 3.0, area: 9.6,  uValue: 0.60, material: "Brick" },
  { id: "W-03", floorNo: 2, thickness: 0.25, height: 3.2, length: 4.0, area: 12.8, uValue: 0.45, material: "RC" },
  { id: "W-04", floorNo: 2, thickness: 0.30, height: 3.0, length: 6.0, area: 18.0, uValue: 0.38, material: "RC" },
  { id: "W-05", floorNo: 3, thickness: 0.10, height: 2.8, length: 2.5, area: 7.0,  uValue: 0.80, material: "Timber" },
];

/** Minimal schedule definition that operates on WallFixture objects */
const wallDef: ScheduleDefinition = {
  id: "test-wall",
  name: "Test Wall Schedule",
  category: "wall",
  columns: [
    { id: "id",        label: "ID",             accessor: (el) => (el as WallFixture).id },
    { id: "floorNo",   label: "Floor",          accessor: (el) => (el as WallFixture).floorNo },
    { id: "thickness", label: "Thickness (mm)", accessor: (el) => Math.round((el as WallFixture).thickness * 1000) },
    { id: "area",      label: "Area (m²)",      accessor: (el) => (el as WallFixture).area },
    { id: "uValue",    label: "U-Value",        accessor: (el) => (el as WallFixture).uValue },
    { id: "material",  label: "Material",       accessor: (el) => (el as WallFixture).material },
  ],
};

// ---------------------------------------------------------------------------
// 1. Filter tests
// ---------------------------------------------------------------------------

describe("runSchedule — filtering", () => {
  it("no filters → returns all elements", () => {
    const result = runSchedule(wallDef, WALLS);
    expect(result.rowCount).toBe(5);
    expect(result.rows).toHaveLength(5);
  });

  it("gt filter: thickness > 200mm returns subset (W-01, W-03, W-04)", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "thickness", op: "gt", value: 200 }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(3);
    const ids = result.rows.map((r) => r["id"]);
    expect(ids).toContain("W-01");
    expect(ids).toContain("W-03");
    expect(ids).toContain("W-04");
    expect(ids).not.toContain("W-02");  // 150mm
    expect(ids).not.toContain("W-05");  // 100mm
  });

  it("lt filter: thickness < 200mm returns W-02, W-05", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "thickness", op: "lt", value: 200 }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(2);
    const ids = result.rows.map((r) => r["id"]);
    expect(ids).toContain("W-02");
    expect(ids).toContain("W-05");
  });

  it("eq filter: material = RC returns 3 walls", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "material", op: "eq", value: "RC" }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(3);
  });

  it("neq filter: material != RC returns 2 walls", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "material", op: "neq", value: "RC" }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(2);
  });

  it("contains filter: material contains 'r' (case-insensitive) returns all 5 walls", () => {
    // "RC".toLowerCase()     = "rc"     → contains "r" → YES (3 walls)
    // "Brick".toLowerCase()  = "brick"  → contains "r" → YES (1 wall)
    // "Timber".toLowerCase() = "timber" → contains "r" → YES (1 wall)
    // All 5 walls match.
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "material", op: "contains", value: "r" }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(5);
  });

  it("contains filter: material contains 'brick' (case-insensitive) returns only W-02", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "material", op: "contains", value: "brick" }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]["id"]).toBe("W-02");
  });

  it("multiple filters (AND): floorNo=2 AND thickness>200 → W-03, W-04", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [
        { column: "floorNo", op: "eq",  value: 2   },
        { column: "thickness", op: "gt", value: 200 },
      ],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(2);
    const ids = result.rows.map((r) => r["id"]);
    expect(ids).toContain("W-03");
    expect(ids).toContain("W-04");
  });
});

// ---------------------------------------------------------------------------
// 2. Sort tests
// ---------------------------------------------------------------------------

describe("runSchedule — sorting", () => {
  it("sort ascending by thickness: W-05(100) < W-02(150) < W-01(250) = W-03(250) < W-04(300)", () => {
    const def: ScheduleDefinition = { ...wallDef, sortBy: "thickness" };
    const result = runSchedule(def, WALLS);
    const thicknesses = result.rows.map((r) => r["thickness"] as number);
    expect(thicknesses[0]).toBe(100);
    expect(thicknesses[1]).toBe(150);
    expect(thicknesses[thicknesses.length - 1]).toBe(300);
    // Verify overall ascending order
    for (let i = 1; i < thicknesses.length; i++) {
      expect(thicknesses[i]).toBeGreaterThanOrEqual(thicknesses[i - 1]);
    }
  });

  it("sort descending by thickness (prefix -): W-04(300) first, W-05(100) last", () => {
    const def: ScheduleDefinition = { ...wallDef, sortBy: "-thickness" };
    const result = runSchedule(def, WALLS);
    const thicknesses = result.rows.map((r) => r["thickness"] as number);
    expect(thicknesses[0]).toBe(300);
    expect(thicknesses[thicknesses.length - 1]).toBe(100);
    for (let i = 1; i < thicknesses.length; i++) {
      expect(thicknesses[i]).toBeLessThanOrEqual(thicknesses[i - 1]);
    }
  });

  it("sort ascending by area: smallest first", () => {
    const def: ScheduleDefinition = { ...wallDef, sortBy: "area" };
    const result = runSchedule(def, WALLS);
    const areas = result.rows.map((r) => r["area"] as number);
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeGreaterThanOrEqual(areas[i - 1]);
    }
  });

  it("sort by material (lexicographic): Brick < RC < Timber", () => {
    const def: ScheduleDefinition = { ...wallDef, sortBy: "material" };
    const result = runSchedule(def, WALLS);
    const materials = result.rows.map((r) => r["material"] as string);
    expect(materials[0]).toBe("Brick");
    expect(materials[materials.length - 1]).toBe("Timber");
  });
});

// ---------------------------------------------------------------------------
// 3. Group-by tests
// ---------------------------------------------------------------------------

describe("runSchedule — grouping", () => {
  it("groupBy material: produces group-header sentinels before each material block", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      sortBy: "material",
      groupBy: "material",
    };
    const result = runSchedule(def, WALLS);

    // rowCount should not include header sentinels
    expect(result.rowCount).toBe(5);

    // Total rows includes sentinel rows (3 groups: Brick, RC, Timber)
    const sentinels = result.rows.filter((r) => r._isGroupHeader === true);
    expect(sentinels).toHaveLength(3);
    const groupValues = sentinels.map((s) => s._groupValue);
    expect(groupValues).toContain("Brick");
    expect(groupValues).toContain("RC");
    expect(groupValues).toContain("Timber");

    // Total rows = 5 data + 3 sentinels
    expect(result.rows).toHaveLength(8);
  });

  it("sentinel rows have _isGroupHeader = true and _groupValue set", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      sortBy: "material",
      groupBy: "material",
    };
    const result = runSchedule(def, WALLS);
    for (const row of result.rows.filter((r) => r._isGroupHeader)) {
      expect(row._isGroupHeader).toBe(true);
      expect(typeof row._groupValue).toBe("string");
    }
  });

  it("data rows following group header match that group's value", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      sortBy: "material",
      groupBy: "material",
    };
    const result = runSchedule(def, WALLS);
    let currentGroup: string | undefined;
    for (const row of result.rows) {
      if (row._isGroupHeader) {
        currentGroup = row._groupValue as string;
      } else {
        expect(row["material"]).toBe(currentGroup);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. CSV export tests
// ---------------------------------------------------------------------------

describe("scheduleToCsv", () => {
  it("produces UTF-8 BOM prefix", () => {
    const result = runSchedule(wallDef, WALLS);
    const csv = scheduleToCsv(result);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("first non-BOM row is the header with correct column labels", () => {
    const result = runSchedule(wallDef, WALLS);
    const csv = scheduleToCsv(result);
    const lines = csv.slice(1).split("\n").filter(Boolean); // remove BOM then split
    expect(lines[0]).toBe("ID,Floor,Thickness (mm),Area (m²),U-Value,Material");
  });

  it("data row count after header matches rowCount (no group headers in row count)", () => {
    const result = runSchedule(wallDef, WALLS);
    const csv = scheduleToCsv(result);
    const lines = csv.slice(1).split("\n").filter(Boolean);
    // lines[0] = header, rest = data rows (no groups applied, so 5 data rows)
    expect(lines.length - 1).toBe(result.rowCount);
  });

  it("CSV rows match visible data rows (grouped schedule)", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      sortBy: "material",
      groupBy: "material",
      filters: [{ column: "thickness", op: "gt", value: 100 }], // excludes W-05
    };
    const result = runSchedule(def, WALLS);
    const csv = scheduleToCsv(result);
    const lines = csv.slice(1).split("\n").filter(Boolean);

    // Header + group sentinels + 4 data rows (W-01, W-02, W-03, W-04)
    const headerCount = 1;
    const dataRowCount = result.rows.filter((r) => !r._isGroupHeader).length;
    const sentinelCount = result.rows.filter((r) => r._isGroupHeader).length;
    expect(lines.length).toBe(headerCount + dataRowCount + sentinelCount);
  });

  it("CSV contains the correct IDs in order for a filtered + sorted result", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "thickness", op: "gt", value: 200 }],
      sortBy: "area",
    };
    const result = runSchedule(def, WALLS);
    const csv = scheduleToCsv(result);
    const lines = csv.slice(1).split("\n").filter(Boolean);
    // lines[0] = header, [1] = first data row (smallest area among >200mm)
    // W-03 area=12.8 < W-01 area=16.0 < W-04 area=18.0
    expect(lines[1]).toMatch(/W-03/);
    expect(lines[2]).toMatch(/W-01/);
    expect(lines[3]).toMatch(/W-04/);
  });

  it("fields containing commas are quoted", () => {
    const commaWall = [{ id: "W-C1", floorNo: 1, thickness: 0.25, height: 3.2, length: 5.0, area: 16.0, uValue: 0.45, material: "RC, Plaster" }];
    const result = runSchedule(wallDef, commaWall);
    const csv = scheduleToCsv(result);
    expect(csv).toContain('"RC, Plaster"');
  });

  it("empty element array returns BOM + header only", () => {
    const result = runSchedule(wallDef, []);
    const csv = scheduleToCsv(result);
    const lines = csv.slice(1).split("\n").filter(Boolean);
    expect(lines).toHaveLength(1); // header only
  });
});

// ---------------------------------------------------------------------------
// 5. Edge-case / robustness tests
// ---------------------------------------------------------------------------

describe("runSchedule — edge cases", () => {
  it("accessor that throws returns '-' for that cell", () => {
    const badDef: ScheduleDefinition = {
      ...wallDef,
      columns: [
        ...wallDef.columns,
        {
          id: "exploder",
          label: "Bad",
          accessor: () => { throw new Error("boom"); },
        },
      ],
    };
    expect(() => runSchedule(badDef, WALLS)).not.toThrow();
    const result = runSchedule(badDef, WALLS);
    for (const row of result.rows) {
      expect(row["exploder"]).toBe("-");
    }
  });

  it("empty elements array returns zero rowCount", () => {
    const result = runSchedule(wallDef, []);
    expect(result.rowCount).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("filter on missing column returns no rows", () => {
    const def: ScheduleDefinition = {
      ...wallDef,
      filters: [{ column: "nonexistent", op: "eq", value: "x" }],
    };
    const result = runSchedule(def, WALLS);
    expect(result.rowCount).toBe(0);
  });

  it("definition is preserved in result", () => {
    const result = runSchedule(wallDef, WALLS);
    expect(result.definition).toBe(wallDef);
  });
});
