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
});
