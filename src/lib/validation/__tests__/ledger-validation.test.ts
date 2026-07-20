// src/lib/validation/__tests__/ledger-validation.test.ts
// P2-13 WP4 — Ledger-fact validation: generated volume vs totArea,
// floor count vs grndFlrCnt/ugrndFlrCnt. Warn at ±15%; skip when zero.

import { describe, it, expect } from "vitest";
import {
  validateAgainstLedger,
  type LedgerFacts,
  type GeneratedTwinFacts,
  type LedgerValidationResult,
} from "../ledger-validator";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeLedger(overrides: Partial<LedgerFacts> = {}): LedgerFacts {
  return {
    totArea: 1000,        // m² total floor area from 건축물대장
    grndFlrCnt: 10,       // above-ground floors
    ugrndFlrCnt: 2,       // below-ground floors
    ...overrides,
  };
}

function makeTwin(overrides: Partial<GeneratedTwinFacts> = {}): GeneratedTwinFacts {
  return {
    generatedGrossArea: 1000, // m² (footprint × total floors × typical floor height — approximate)
    aboveGroundFloors: 10,
    belowGroundFloors: 2,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WP4-A: floor count divergence
// ─────────────────────────────────────────────────────────────────────────────

describe("validateAgainstLedger — floor count", () => {
  it("no warning when generated floor count equals ledger grndFlrCnt", () => {
    const result = validateAgainstLedger(makeLedger(), makeTwin());
    expect(result.warnings.filter(w => w.field === "floorCount")).toHaveLength(0);
  });

  it("warning when generated above-ground floors differ from grndFlrCnt", () => {
    const result = validateAgainstLedger(
      makeLedger({ grndFlrCnt: 10 }),
      makeTwin({ aboveGroundFloors: 14 }) // +4 floors = +40% divergence
    );
    const warns = result.warnings.filter(w => w.field === "floorCount");
    expect(warns).toHaveLength(1);
    expect(warns[0].divergencePct).toBeGreaterThan(15);
  });

  it("warning message states the divergence magnitude", () => {
    const result = validateAgainstLedger(
      makeLedger({ grndFlrCnt: 10 }),
      makeTwin({ aboveGroundFloors: 14 })
    );
    const warn = result.warnings.find(w => w.field === "floorCount");
    expect(warn!.message).toMatch(/\d+(\.\d+)?%/); // must include a percentage figure
  });

  it("no floor-count warning when grndFlrCnt is 0 (zero = unavailable)", () => {
    const result = validateAgainstLedger(
      makeLedger({ grndFlrCnt: 0 }),
      makeTwin({ aboveGroundFloors: 10 })
    );
    expect(result.warnings.filter(w => w.field === "floorCount")).toHaveLength(0);
  });

  it("below-ground floor count warns when differs from ugrndFlrCnt", () => {
    const result = validateAgainstLedger(
      makeLedger({ ugrndFlrCnt: 2 }),
      makeTwin({ belowGroundFloors: 5 }) // +3 floors
    );
    const warns = result.warnings.filter(w => w.field === "basementFloorCount");
    expect(warns.length).toBeGreaterThan(0);
  });

  it("no basement warning when ugrndFlrCnt is 0 (unavailable)", () => {
    const result = validateAgainstLedger(
      makeLedger({ ugrndFlrCnt: 0 }),
      makeTwin({ belowGroundFloors: 2 })
    );
    expect(result.warnings.filter(w => w.field === "basementFloorCount")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP4-B: gross area / volume divergence
// ─────────────────────────────────────────────────────────────────────────────

describe("validateAgainstLedger — gross area divergence", () => {
  it("no area warning when generatedGrossArea is within ±15% of totArea", () => {
    // 14% above — still within threshold
    const result = validateAgainstLedger(
      makeLedger({ totArea: 1000 }),
      makeTwin({ generatedGrossArea: 1140 })
    );
    expect(result.warnings.filter(w => w.field === "grossArea")).toHaveLength(0);
  });

  it("area warning when generatedGrossArea is >15% above totArea", () => {
    // 20% above
    const result = validateAgainstLedger(
      makeLedger({ totArea: 1000 }),
      makeTwin({ generatedGrossArea: 1200 })
    );
    const warns = result.warnings.filter(w => w.field === "grossArea");
    expect(warns).toHaveLength(1);
    expect(warns[0].divergencePct).toBeCloseTo(20, 0);
  });

  it("area warning when generatedGrossArea is >15% below totArea", () => {
    // 20% below
    const result = validateAgainstLedger(
      makeLedger({ totArea: 1000 }),
      makeTwin({ generatedGrossArea: 800 })
    );
    const warns = result.warnings.filter(w => w.field === "grossArea");
    expect(warns).toHaveLength(1);
    expect(warns[0].divergencePct).toBeCloseTo(20, 0);
  });

  it("area warning message states the magnitude and direction", () => {
    const result = validateAgainstLedger(
      makeLedger({ totArea: 1000 }),
      makeTwin({ generatedGrossArea: 1200 })
    );
    const warn = result.warnings.find(w => w.field === "grossArea");
    expect(warn!.message).toMatch(/\d+(\.\d+)?%/);
  });

  it("no area warning when totArea is 0 (zero = unavailable)", () => {
    const result = validateAgainstLedger(
      makeLedger({ totArea: 0 }),
      makeTwin({ generatedGrossArea: 5000 })
    );
    expect(result.warnings.filter(w => w.field === "grossArea")).toHaveLength(0);
  });

  it("exact match produces no warnings and result.valid is true", () => {
    const result = validateAgainstLedger(makeLedger(), makeTwin());
    expect(result.warnings).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP4-C: result shape
// ─────────────────────────────────────────────────────────────────────────────

describe("validateAgainstLedger — result shape", () => {
  it("result has valid, warnings array, and checked fields", () => {
    const result: LedgerValidationResult = validateAgainstLedger(makeLedger(), makeTwin());
    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("result.valid is false when any warning is present", () => {
    const result = validateAgainstLedger(
      makeLedger({ grndFlrCnt: 10 }),
      makeTwin({ aboveGroundFloors: 20 })
    );
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("all warnings have field, divergencePct, and message properties", () => {
    const result = validateAgainstLedger(
      makeLedger({ grndFlrCnt: 10, totArea: 1000 }),
      makeTwin({ aboveGroundFloors: 20, generatedGrossArea: 2000 })
    );
    for (const w of result.warnings) {
      expect(typeof w.field).toBe("string");
      expect(typeof w.divergencePct).toBe("number");
      expect(typeof w.message).toBe("string");
      expect(w.message.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP4-D: threshold boundary
// ─────────────────────────────────────────────────────────────────────────────

describe("validateAgainstLedger — ±15% threshold boundary", () => {
  it("exactly 15% divergence does NOT trigger a warning (boundary inclusive)", () => {
    const result = validateAgainstLedger(
      makeLedger({ totArea: 1000 }),
      makeTwin({ generatedGrossArea: 1150 }) // exactly +15%
    );
    expect(result.warnings.filter(w => w.field === "grossArea")).toHaveLength(0);
  });

  it("15.01% divergence DOES trigger a warning", () => {
    const result = validateAgainstLedger(
      makeLedger({ totArea: 1000 }),
      makeTwin({ generatedGrossArea: 1151 }) // +15.1%
    );
    expect(result.warnings.filter(w => w.field === "grossArea")).toHaveLength(1);
  });
});
