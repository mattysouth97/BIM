import type { BimEngineInput, SpatialFeature } from "../types";

export function ingest(input: BimEngineInput): SpatialFeature[] {
  const out: SpatialFeature[] = [];
  if (input.cadFootprint) out.push({ kind: "footprint", footprint: input.cadFootprint.rings, source: input.cadFootprint.source });
  if (input.vworldFootprint) {
    out.push({ kind: "footprint", footprint: input.vworldFootprint.rings, source: "vworld-measured" });
    if (input.vworldFootprint.measuredHeightM != null) out.push({ kind: "height", heightM: input.vworldFootprint.measuredHeightM, source: "vworld-measured" });
    if (input.vworldFootprint.groundFloors != null) out.push({ kind: "floors", floors: input.vworldFootprint.groundFloors, source: "vworld-measured" });
  }
  if (input.ledger?.heightM != null) out.push({ kind: "height", heightM: input.ledger.heightM, source: "ledger" });
  if (input.ledger?.floors != null) out.push({ kind: "floors", floors: input.ledger.floors, source: "ledger" });
  if (input.params?.heightM != null) out.push({ kind: "height", heightM: input.params.heightM, source: "manual" });
  if (input.params?.floors != null) out.push({ kind: "floors", floors: input.params.floors, source: "manual" });
  return out;
}
