// src/lib/fidelity/__tests__/input-provenance.test.ts
// TDD tests for P2-27: deriveInputProvenance pure function.
// Write FIRST (RED) — function does not yet exist.

import { describe, it, expect } from "vitest";
import { deriveInputProvenance } from "../input-provenance";

describe("deriveInputProvenance — footprint field", () => {
  it("CAD sources (cad/ifc/building) → footprint measured", () => {
    for (const src of ["cad", "ifc", "building"] as const) {
      const result = deriveInputProvenance({
        footprintSource: src,
        ledgerHeit: 0,
        measuredHeightM: null,
        calibrationApplied: false,
      });
      expect(result.footprint, `source=${src}`).toBe("measured");
    }
  });

  it("parcel source → footprint estimated (lot boundary ≠ building)", () => {
    const result = deriveInputProvenance({
      footprintSource: "parcel",
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: false,
    });
    expect(result.footprint).toBe("estimated");
  });

  it("null source (era box) → footprint estimated", () => {
    const result = deriveInputProvenance({
      footprintSource: null,
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: false,
    });
    expect(result.footprint).toBe("estimated");
  });
});

describe("deriveInputProvenance — heights field", () => {
  it("ledger heit > 0 → heights measured", () => {
    const result = deriveInputProvenance({
      footprintSource: null,
      ledgerHeit: 15,
      measuredHeightM: null,
      calibrationApplied: false,
    });
    expect(result.heights).toBe("measured");
  });

  it("VWorld measured height only (heit=0) → heights measured", () => {
    // AFF-6: ledger heit=0 means unavailable; VWorld measured is the fallback
    const result = deriveInputProvenance({
      footprintSource: "building",
      ledgerHeit: 0,
      measuredHeightM: 12.5,
      calibrationApplied: false,
    });
    expect(result.heights).toBe("measured");
  });

  it("calibrationApplied → heights measured", () => {
    const result = deriveInputProvenance({
      footprintSource: null,
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: true,
    });
    expect(result.heights).toBe("measured");
  });

  it("no height sources → heights estimated", () => {
    const result = deriveInputProvenance({
      footprintSource: null,
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: false,
    });
    expect(result.heights).toBe("estimated");
  });

  it("zero measuredHeightM → heights estimated (AFF-6: zero means unavailable)", () => {
    const result = deriveInputProvenance({
      footprintSource: null,
      ledgerHeit: 0,
      measuredHeightM: 0,
      calibrationApplied: false,
    });
    expect(result.heights).toBe("estimated");
  });
});

describe("deriveInputProvenance — facade field", () => {
  it("calibration applied → facade measured", () => {
    const result = deriveInputProvenance({
      footprintSource: null,
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: true,
    });
    expect(result.facade).toBe("measured");
  });

  it("no calibration → facade estimated (era defaults)", () => {
    const result = deriveInputProvenance({
      footprintSource: "building",
      ledgerHeit: 20,
      measuredHeightM: 20,
      calibrationApplied: false,
    });
    expect(result.facade).toBe("estimated");
  });
});

describe("deriveInputProvenance — truth table (combined)", () => {
  it("parcel + no heights + no calibration → all estimated", () => {
    const result = deriveInputProvenance({
      footprintSource: "parcel",
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: false,
    });
    expect(result).toEqual({
      footprint: "estimated",
      heights: "estimated",
      facade: "estimated",
    });
  });

  it("building source + ledger heit + calibration → all measured", () => {
    const result = deriveInputProvenance({
      footprintSource: "building",
      ledgerHeit: 18,
      measuredHeightM: null,
      calibrationApplied: true,
    });
    expect(result).toEqual({
      footprint: "measured",
      heights: "measured",
      facade: "measured",
    });
  });

  it("ifc source + no heights + no calibration → footprint measured, heights+facade estimated", () => {
    const result = deriveInputProvenance({
      footprintSource: "ifc",
      ledgerHeit: 0,
      measuredHeightM: null,
      calibrationApplied: false,
    });
    expect(result).toEqual({
      footprint: "measured",
      heights: "estimated",
      facade: "estimated",
    });
  });
});
