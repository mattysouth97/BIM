import { describe, it, expect } from "vitest";
import { ingest } from "../ingest";

const RING: [number, number][][] = [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]];

describe("ingest", () => {
  it("emits a footprint feature from CAD, preserving its provenance", () => {
    const f = ingest({ pk: "x", cadFootprint: { rings: RING, source: "cad-exact" } });
    expect(f.find((x) => x.kind === "footprint")).toMatchObject({ source: "cad-exact", footprint: RING });
  });
  it("emits height + floors from ledger, and floors from vworld groundFloors", () => {
    const f = ingest({ pk: "x", ledger: { heightM: 12, floors: 4 }, vworldFootprint: { rings: RING, groundFloors: 3 } });
    expect(f.filter((x) => x.kind === "height").map((x) => x.source)).toContain("ledger");
    expect(f.filter((x) => x.kind === "floors").map((x) => x.source)).toEqual(expect.arrayContaining(["ledger", "vworld-measured"]));
  });
  it("emits manual params as manual-sourced features", () => {
    const f = ingest({ pk: "x", params: { floors: 2, heightM: 7 } });
    expect(f.find((x) => x.kind === "floors" && x.source === "manual")).toBeTruthy();
    expect(f.find((x) => x.kind === "height" && x.source === "manual")).toBeTruthy();
  });

  it("does not emit a floors/height feature when the value is <= 0 (0 means data unavailable, per CLAUDE.md)", () => {
    const f = ingest({
      pk: "x",
      cadFootprint: { rings: RING, source: "cad-exact" },
      ledger: { floors: 0, heightM: 0 },
      vworldFootprint: { rings: RING, groundFloors: 0 },
      params: { floors: 0, heightM: 0 },
    });
    expect(f.find((x) => x.kind === "floors")).toBeUndefined();
    expect(f.find((x) => x.kind === "height")).toBeUndefined();
  });

  // P2-25: LT_C_SPBD carries an outline and a storey count, never a height.
  // The emission that used to sit in ingest could not fire on any input.
  it("never sources a height from the VWorld layer, whatever it is handed", () => {
    const f = ingest({
      pk: "x",
      vworldFootprint: { rings: RING, groundFloors: 5 },
      ledger: { heightM: 12 },
    });
    expect(f.filter((x) => x.kind === "height").map((x) => x.source)).toEqual(["ledger"]);
    expect(f.some((x) => x.kind === "footprint" && x.source === "vworld-measured")).toBe(true);
    expect(f.some((x) => x.kind === "floors" && x.source === "vworld-measured")).toBe(true);
  });

  it("does not emit a floors/height feature for negative values either", () => {
    const f = ingest({ pk: "x", ledger: { floors: -1, heightM: -5 } });
    expect(f.find((x) => x.kind === "floors")).toBeUndefined();
    expect(f.find((x) => x.kind === "height")).toBeUndefined();
  });
});
