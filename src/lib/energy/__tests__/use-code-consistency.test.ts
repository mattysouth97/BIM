// src/lib/energy/__tests__/use-code-consistency.test.ts
// P1-04 — cross-module MOLIT 주용도코드 consistency oracle.
// SYSTEM_RATIOS (system-breakdown.ts) and USE_CODE_OPERATING_HOURS
// (equipment-specs.ts) must agree with the real MOLIT table on every shared
// prefix. If either module ever re-binds a code, this suite fails the build.

import { describe, it, expect } from "vitest";
import { SYSTEM_RATIOS } from "../system-breakdown";
import { USE_CODE_OPERATING_HOURS } from "../equipment-specs";

// Canonical MOLIT 건축물대장 주용도코드 categories (건축법 시행령 별표1).
// Only prefixes with researched profiles are listed; everything else is
// intentionally absent (falls back to DEFAULT_RATIOS / default hours).
const MOLIT_PREFIX_CATEGORY: Record<string, "residential" | "retail" | "office"> = {
  "01": "residential", // 단독주택
  "02": "residential", // 공동주택
  "07": "retail",      // 판매시설
  "14": "office",      // 업무시설
};

// Frozen CONTEXT.md D6/D7 profiles — the VALUES this item may not change.
const PROFILES = {
  residential: { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 },
  retail: { hvac: 0.45, lighting: 0.40, dhw: 0.03, plug: 0.12 },
  office: { hvac: 0.55, lighting: 0.25, dhw: 0.10, plug: 0.10 },
} as const;

// Mirror of the DHW residential heuristic in equipment-specs.ts (startsWith
// "01" | "02"). Kept as a literal here — the test is the consistency oracle.
const DHW_RESIDENTIAL_PREFIXES = ["01", "02"];

describe("MOLIT use-code consistency (P1-04)", () => {
  it("SYSTEM_RATIOS contains exactly the researched prefixes 01/02/07/14", () => {
    expect(Object.keys(SYSTEM_RATIOS).sort()).toEqual(["01", "02", "07", "14"]);
  });

  it("every SYSTEM_RATIOS row matches the canonical profile for its MOLIT category and sums to 1.0", () => {
    for (const [prefix, row] of Object.entries(SYSTEM_RATIOS)) {
      const category = MOLIT_PREFIX_CATEGORY[prefix];
      expect(category, `prefix ${prefix} must be in the canonical table`).toBeDefined();
      expect(row).toEqual(PROFILES[category]);
      const sum = row.hvac + row.lighting + row.dhw + row.plug;
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it("office operating hours live under 14000 (업무시설), not the old 12000 binding", () => {
    expect(USE_CODE_OPERATING_HOURS["14000"]).toBe(4380);
    // 12 = 수련시설 per MOLIT — must no longer carry the office hours.
    expect(USE_CODE_OPERATING_HOURS["12000"]).toBeUndefined();
  });

  it("operating-hours residential codes agree with the canonical table", () => {
    // 01000 단독주택 and 02000 공동주택 both carry the residential 2920 h.
    expect(USE_CODE_OPERATING_HOURS["01000"]).toBe(2920);
    expect(USE_CODE_OPERATING_HOURS["02000"]).toBe(2920);
  });

  it("DHW residential heuristic prefixes are exactly the SYSTEM_RATIOS residential rows", () => {
    const residentialRatioPrefixes = Object.entries(SYSTEM_RATIOS)
      .filter(([, row]) => row.dhw === PROFILES.residential.dhw && row.hvac === PROFILES.residential.hvac)
      .map(([prefix]) => prefix)
      .sort();
    expect(residentialRatioPrefixes).toEqual([...DHW_RESIDENTIAL_PREFIXES].sort());
  });
});
