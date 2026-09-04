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
  // Was ledger-vs-vworld until the VWorld height tier came out: that layer
  // supplies an outline and a storey count, never a height (P2-25), so the two
  // could never disagree. Manual input is the other height source that exists.
  it("records a height conflict when ledger and manual input disagree > 10%", () => {
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 10, floors: 3 }, params: { heightM: 13 } };
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

  it("carries facade params through with facadeSource 'era-estimate' when input.facade is set", () => {
    const facade = { windowWidth: 1.4, windowHeight: 1.6, sillHeight: 0.8, windowSpacing: 2.2 };
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 10, floors: 3 }, facade };
    const { model } = fuse(input, ingest(input));
    expect(model.facade).toEqual(facade);
    expect(model.facadeSource).toBe("era-estimate");
  });

  it("model.facade is null when input.facade is not set", () => {
    const input = { pk: "p", cadFootprint: { rings: RING, source: "cad-exact" as const }, ledger: { heightM: 10, floors: 3 } };
    const { model } = fuse(input, ingest(input));
    expect(model.facade).toBeNull();
    expect(model.facadeSource).toBe("era-estimate");
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
