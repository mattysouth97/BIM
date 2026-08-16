import type { BimEngineInput, SpatialFeature, FusedModel, Conflict, SourceKind } from "../types";
import { ENGINE_CONSTANTS } from "../types";

const FOOTPRINT_PRIORITY: SourceKind[] = ["cad-exact", "cad-converted", "cad-traced", "vworld-measured"];
const FLOORS_PRIORITY: SourceKind[] = ["ledger", "vworld-measured", "manual"];
const HEIGHT_PRIORITY: SourceKind[] = ["ledger", "vworld-measured", "manual"];

function rank(priority: SourceKind[], source: SourceKind): number {
  const idx = priority.indexOf(source);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

function pickHighestPriority(features: SpatialFeature[], priority: SourceKind[]): SpatialFeature | undefined {
  return features
    .filter((f) => rank(priority, f.source) !== Number.POSITIVE_INFINITY)
    .sort((a, b) => rank(priority, a.source) - rank(priority, b.source))[0];
}

function deltaPct(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b), Number.EPSILON);
  return (Math.abs(a - b) / base) * 100;
}

export function fuse(input: BimEngineInput, features: SpatialFeature[]): { model: FusedModel; conflicts: Conflict[] } {
  const footprintFeatures = features.filter((f) => f.kind === "footprint" && f.footprint);
  const chosenFootprint = pickHighestPriority(footprintFeatures, FOOTPRINT_PRIORITY);
  if (!chosenFootprint || !chosenFootprint.footprint) {
    throw new Error("no footprint");
  }

  const conflicts: Conflict[] = [];

  const floorsFeatures = features.filter((f) => f.kind === "floors" && f.floors != null);
  const chosenFloorsFeature = pickHighestPriority(floorsFeatures, FLOORS_PRIORITY);
  let floors: number;
  let floorsSource: SourceKind;
  if (chosenFloorsFeature && chosenFloorsFeature.floors != null) {
    // Defensive clamp: ingest.ts already filters out <= 0 floors values
    // (0 means "data unavailable", never authoritative — see CLAUDE.md), but
    // a floors <= 0 feature must never reach here and silently divide the
    // height into zero/negative storeys or produce zero elements downstream.
    floors = Math.max(1, chosenFloorsFeature.floors);
    floorsSource = chosenFloorsFeature.source;
  } else {
    floors = 1;
    floorsSource = "era-estimate";
  }

  {
    const sorted = floorsFeatures
      .filter((f) => f.floors != null)
      .sort((a, b) => rank(FLOORS_PRIORITY, a.source) - rank(FLOORS_PRIORITY, b.source));
    if (sorted.length >= 2) {
      const top = sorted[0];
      const next = sorted[1];
      const pct = deltaPct(top.floors as number, next.floors as number);
      if (pct > ENGINE_CONSTANTS.CONFLICT_TOLERANCE_PCT) {
        conflicts.push({
          field: "floors",
          sources: sorted.map((f) => ({ source: f.source, value: f.floors as number })),
          chosen: top.source,
          deltaPct: pct,
        });
      }
    }
  }

  const heightFeatures = features.filter((f) => f.kind === "height" && f.heightM != null);
  const chosenHeightFeature = pickHighestPriority(heightFeatures, HEIGHT_PRIORITY);
  let totalHeightM: number;
  let heightSource: SourceKind;
  if (chosenHeightFeature && chosenHeightFeature.heightM != null) {
    totalHeightM = chosenHeightFeature.heightM;
    heightSource = chosenHeightFeature.source;
  } else {
    const storeyHeight = input.defaultStoreyHeightM ?? ENGINE_CONSTANTS.DEFAULT_STOREY_HEIGHT_M;
    totalHeightM = floors * storeyHeight;
    heightSource = "era-estimate";
  }

  {
    const sorted = heightFeatures
      .filter((f) => f.heightM != null)
      .sort((a, b) => rank(HEIGHT_PRIORITY, a.source) - rank(HEIGHT_PRIORITY, b.source));
    if (sorted.length >= 2) {
      const top = sorted[0];
      const next = sorted[1];
      const pct = deltaPct(top.heightM as number, next.heightM as number);
      if (pct > ENGINE_CONSTANTS.CONFLICT_TOLERANCE_PCT) {
        conflicts.push({
          field: "height",
          sources: sorted.map((f) => ({ source: f.source, value: f.heightM as number })),
          chosen: top.source,
          deltaPct: pct,
        });
      }
    }
  }

  // Guard: floors is clamped to >= 1 above, but keep this division
  // divide-by-zero-proof independent of that upstream invariant.
  const storeyHeightM = totalHeightM / Math.max(1, floors);

  const model: FusedModel = {
    pk: input.pk,
    title: input.title ?? input.pk,
    footprint: chosenFootprint.footprint,
    footprintSource: chosenFootprint.source,
    floors,
    floorsSource,
    storeyHeightM,
    totalHeightM,
    heightSource,
    wallThicknessM: ENGINE_CONSTANTS.DEFAULT_WALL_THICKNESS_M,
    // Facade params are a direct passthrough from input (not a scored/prioritized
    // feature — see plan) — always "era-estimate" since the recipe that supplies
    // them is era-based, never a measured facade source.
    facade: input.facade ?? null,
    facadeSource: "era-estimate",
  };

  return { model, conflicts };
}
