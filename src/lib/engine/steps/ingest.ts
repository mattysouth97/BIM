import type { BimEngineInput, SpatialFeature } from "../types";

// Per CLAUDE.md: zero values (platArea=0, heit=0, bcRat=0, ...) from public
// registry data mean "data unavailable", not "zero" — a height/floors feature
// with a <= 0 value must never be emitted as an authoritative source, or it
// would silently win priority over a real (positive) source, or worse become
// the sole source and divide-by-zero downstream in fuse.ts.
function isUsablePositive(value: number | undefined | null): value is number {
  return value != null && value > 0;
}

export function ingest(input: BimEngineInput): SpatialFeature[] {
  const out: SpatialFeature[] = [];
  if (input.cadFootprint) out.push({ kind: "footprint", footprint: input.cadFootprint.rings, source: input.cadFootprint.source });
  if (input.vworldFootprint) {
    out.push({ kind: "footprint", footprint: input.vworldFootprint.rings, source: "vworld-measured" });
    // No height feature. VWorld's building layer (LT_C_SPBD) carries no height:
    // 34 production buildings returned `height: null` in every one, and four
    // upstream bboxes returned the same ten keys with no `buld_hg` among them
    // (P2-25). The emission that used to sit here could not fire, and an
    // evidence kind nothing can justify is the kind of tier that later reads
    // as a supplier that exists. Outline and storey count DO arrive here.
    if (isUsablePositive(input.vworldFootprint.groundFloors)) out.push({ kind: "floors", floors: input.vworldFootprint.groundFloors, source: "vworld-measured" });
  }
  if (isUsablePositive(input.ledger?.heightM)) out.push({ kind: "height", heightM: input.ledger!.heightM, source: "ledger" });
  if (isUsablePositive(input.ledger?.floors)) out.push({ kind: "floors", floors: input.ledger!.floors, source: "ledger" });
  if (isUsablePositive(input.params?.heightM)) out.push({ kind: "height", heightM: input.params!.heightM, source: "manual" });
  if (isUsablePositive(input.params?.floors)) out.push({ kind: "floors", floors: input.params!.floors, source: "manual" });
  return out;
}
