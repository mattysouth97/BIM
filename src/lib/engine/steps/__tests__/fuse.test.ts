import { describe, it, expect } from "vitest";
import { fuse } from "../fuse";
import { ingest } from "../ingest";

const RING: [number, number][][] = [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]];

describe("fuse", () => {
  it("prefers CAD footprint and ledger height/floors", () => {
    const input = { pk: "p", title: "T", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 13.2, floors: 4 } };
    const { model } = fuse(input, ingest(input));
    expect(model.footprintSource).toBe("cad-exact");
    expect(model.floors).toBe(4);
    expect(model.totalHeightM).toBeCloseTo(13.2);
    expect(model.storeyHeightM).toBeCloseTo(3.3);
    expect(model.heightSource).toBe("ledger");
  });
  it("falls back to era-estimate height from floors when no height source", () => {
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-traced" as const }, params: { floors: 3 } };
    const { model } = fuse(input, ingest(input));
    expect(model.heightSource).toBe("era-estimate");
    expect(model.totalHeightM).toBeCloseTo(3 * 3.3);
  });
  it("records a height conflict when ledger and vworld disagree > 10%", () => {
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 10, floors: 3 }, vworldFootprint: { rings: RING, measuredHeightM: 13 } };
    const { conflicts } = fuse(input, ingest(input));
    expect(conflicts.find((c) => c.field === "height")).toMatchObject({ chosen: "ledger" });
  });
  it("throws when no footprint is available", () => {
    expect(() => fuse({ pk: "p", ledger: { floors: 2 } }, [])).toThrow(/footprint/i);
  });

  it("falls back to era-estimate floors (never 0/NaN) when the ledger reports floors: 0", () => {
    // ingest.ts drops <= 0 floors values, so fuse never sees a "floors: 0"
    // feature here — this is the intended honest fallback, not a defect.
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { floors: 0 } };
    const { model } = fuse(input, ingest(input));
    expect(model.floors).toBeGreaterThanOrEqual(1);
    expect(model.floorsSource).toBe("era-estimate");
    expect(Number.isFinite(model.storeyHeightM)).toBe(true);
    expect(Number.isNaN(model.storeyHeightM)).toBe(false);
  });

  it("defensively clamps floors to >= 1 even if a caller hands fuse() a raw floors:0 feature directly", () => {
    // Belt-and-suspenders: fuse.ts must not divide by zero even if some
    // future feature source bypasses ingest.ts's guard.
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const } };
    const features = [
      { kind: "footprint" as const, footprint: RING, source: "cad-exact" as const },
      { kind: "floors" as const, floors: 0, source: "ledger" as const },
    ];
    const { model } = fuse(input, features);
    expect(model.floors).toBe(1);
    expect(Number.isFinite(model.storeyHeightM)).toBe(true);
  });
});
