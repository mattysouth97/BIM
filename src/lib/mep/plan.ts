// src/lib/mep/plan.ts
//
// Orchestrator: recipe (+ options) → canonical MepModel. Pure and
// deterministic — the same inputs always produce the same model (§41); a
// small keyed cache means the six consuming layer generators pay for one
// planning pass per recipe.

import type { BuildingRecipe } from "@/lib/procedural/types";
import { buildMepContext, type MepContextOptions } from "./context";
import { coordinateMepGraph } from "./coordinate";
import { deriveFittings } from "./fittings";
import { MepGraphBuilder } from "./graph";
import { assignFlowsAndSizes } from "./size";
import { planAirSystems, type PlanAccumulator } from "./systems/air";
import { planElectricalSystems } from "./systems/electrical";
import { planFireSystems } from "./systems/fire";
import { planHydronicSystems } from "./systems/hydronic";
import { planPlumbingSystems } from "./systems/plumbing";
import { nodeById, segmentLength, type MepModel } from "./types";

export type { MepModel };

export const MEP_GENERATOR_VERSION = "1.0.0";

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function inputKeyOf(recipe: BuildingRecipe, options: MepContextOptions): string {
  const fingerprint = JSON.stringify({
    v: MEP_GENERATOR_VERSION,
    w: recipe.footprintWidth,
    d: recipe.footprintDepth,
    poly: recipe.footprintPolygon ?? null,
    floors: recipe.floors.map((f) => [f.floorNo, f.type, f.y, f.height]),
    era: recipe.era,
    use: recipe.mainPurpsCd,
    core: recipe.serviceCore ?? null,
    col: recipe.column,
    roof: [recipe.roof.type, recipe.roof.flatThickness],
    h: recipe.totalHeight,
    opts: {
      rooms: options.cadRooms?.map((r) => r.polygon) ?? null,
      heat: options.heatingPlant ?? null,
    },
  });
  return fnv1a(fingerprint);
}

const cache = new Map<string, MepModel>();
const CACHE_LIMIT = 4;

/**
 * Plans the complete MEP network for a building. Deterministic; memoized by
 * an input fingerprint so repeated calls from the layer generators are free.
 */
export function planMepSystems(recipe: BuildingRecipe, options: MepContextOptions = {}): MepModel {
  const inputKey = inputKeyOf(recipe, options);
  const cached = cache.get(inputKey);
  if (cached) return cached;

  const ctx = buildMepContext(recipe, options);
  const g = new MepGraphBuilder();
  const acc: PlanAccumulator = { assumptions: [], risers: [] };

  // Planning order matters only for rule E4 (electrical last, so every
  // mechanical equipment node is known and becomes a load).
  planAirSystems(ctx, g, acc);
  planHydronicSystems(ctx, g, acc);
  planPlumbingSystems(ctx, g, acc);
  planFireSystems(ctx, g, acc);
  planElectricalSystems(ctx, g, acc);

  assignFlowsAndSizes(g.systems, g.nodes, g.segments);
  // Self-repair coordination (§28): local displacement of residual hard
  // clashes, then re-index so fittings reflect the repaired topology.
  coordinateMepGraph(g, ctx);
  const indices = assignFlowsAndSizes(g.systems, g.nodes, g.segments);
  const fittings = deriveFittings(g.systems, g.nodes, indices);

  acc.assumptions.push({
    id: "arch",
    ruleId: ctx.archetype.ruleId,
    text: `System archetype '${ctx.archetype.archetype}': ${ctx.archetype.reason}`,
    textKo: ctx.archetype.reason,
    basis: ctx.archetype.basis,
  });
  if (ctx.plantYBasis === "defaulted") {
    acc.assumptions.push({
      id: "plant-pit",
      ruleId: "A7",
      text: "No basement floor in the register — plant level defaulted to a −3.0 m pit.",
      textKo: "지하층 정보 없음 — 기계실 레벨 −3.0m 가정",
      basis: "defaulted",
    });
  }

  const nodes = nodeById({ nodes: g.nodes });
  let totalLengthM = 0;
  for (const seg of g.segments) totalLengthM += segmentLength(seg, nodes);

  const model: MepModel = {
    generatorVersion: MEP_GENERATOR_VERSION,
    inputKey,
    archetype: ctx.archetype.archetype,
    floors: ctx.floors.map((f) => ({ floorNo: f.floorNo, y: f.y, height: f.height, soffitY: f.soffitY })),
    systems: g.systems,
    nodes: g.nodes,
    segments: g.segments,
    fittings,
    zones: ctx.floors.flatMap((f) => f.zones),
    risers: acc.risers,
    assumptions: acc.assumptions,
    stats: {
      nodeCount: g.nodes.length,
      segmentCount: g.segments.length,
      fittingCount: fittings.length,
      terminalCount: g.nodes.filter((n) => n.terminal).length,
      totalLengthM: Math.round(totalLengthM * 10) / 10,
      systemCount: g.systems.length,
    },
  };

  cache.set(inputKey, model);
  if (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return model;
}

/** Test hook: clears the plan cache. */
export function clearMepPlanCache(): void {
  cache.clear();
}

/**
 * Planning options carried BY the recipe itself (classified CAD rooms from
 * the upload stage) — the standard way layer generators call the planner.
 */
export function mepOptionsFromRecipe(recipe: BuildingRecipe): MepContextOptions {
  if (recipe.cadRooms && recipe.cadRooms.length > 0) {
    return { cadRooms: recipe.cadRooms.map((polygon) => ({ polygon })) };
  }
  return {};
}

/** Convenience entry: plan with the recipe's own CAD evidence attached. */
export function planMepSystemsForRecipe(recipe: BuildingRecipe): MepModel {
  return planMepSystems(recipe, mepOptionsFromRecipe(recipe));
}
