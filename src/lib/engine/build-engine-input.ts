// src/lib/engine/build-engine-input.ts
//
// Pure adapter: BuildingRecipe + fidelity provenance -> BimEngineInput.
// Honest gating (AFF-6): the engine is only offered a footprint when the
// UI's footprintSource is an actual building outline ("cad" | "ifc" |
// "building"). A "parcel" (cadastral lot boundary) or null (era-estimate
// rectangle) is NOT a real footprint, so this returns null rather than
// fabricating one — callers must treat null as "engine unavailable".

import type { BimEngineInput } from "./types";
import type { BuildingRecipe } from "../procedural/types";
import type { FootprintSource } from "../fidelity/input-provenance";

export interface BuildEngineInputArgs {
  pk: string;
  title?: string;
  recipe: BuildingRecipe;
  footprintSource: FootprintSource;
  ledgerHeit: number;
  measuredHeightM: number | null;
}

/**
 * One closed ring centered at the origin, meters, XZ-plane (repo convention
 * — see src/lib/cad/README.md). first === last vertex (closed).
 */
function rectangleRings(w: number, d: number): [number, number][][] {
  const hw = w / 2;
  const hd = d / 2;
  return [[
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
    [-hw, -hd],
  ]];
}

export function buildEngineInput(args: BuildEngineInputArgs): BimEngineInput | null {
  const { pk, title, recipe, footprintSource, ledgerHeit, measuredHeightM } = args;

  // AFF-6: a lot boundary is not a building outline, and an era-estimate
  // rectangle is not a real footprint either — the engine is not applicable.
  if (footprintSource === "parcel" || footprintSource === null) {
    return null;
  }

  const rings = recipe.footprintPolygon ?? rectangleRings(recipe.footprintWidth, recipe.footprintDepth);

  const aboveFloors = recipe.floors.filter((f) => f.type === "above").length;
  const floors = Math.max(1, aboveFloors || recipe.floors.length);

  const ledger = ledgerHeit > 0 ? { heightM: ledgerHeit } : undefined;
  const params = { floors };

  if (footprintSource === "cad") {
    // Sub-confidence (exact/converted/traced) is not known at this layer —
    // "cad-converted" is the conservative Slice-1 default for any CAD-sourced
    // footprint reaching the UI without finer provenance.
    return {
      pk,
      title,
      cadFootprint: { rings, source: "cad-converted" },
      ledger,
      params,
    };
  }

  if (footprintSource === "ifc") {
    // IFC is an authoritative building outline.
    return {
      pk,
      title,
      cadFootprint: { rings, source: "cad-exact" },
      ledger,
      params,
    };
  }

  // footprintSource === "building" (VWorld measured outline)
  return {
    pk,
    title,
    vworldFootprint: {
      rings,
      measuredHeightM: measuredHeightM ?? undefined,
      groundFloors: floors,
    },
    ledger,
    params,
  };
}
