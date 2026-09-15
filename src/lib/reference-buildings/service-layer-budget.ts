import type { ReferenceBuildingManifest } from "./manifest";

/**
 * Draw-call ceiling for service/MEP layers.
 *
 * Detail layers already assert `<= 200` and material-fabric layers already
 * assert `<= 300` (see `material-fabric.test.ts`'s `NO_MATERIAL_FABRIC`
 * register). Service layers asserted nothing until this module existed,
 * which is how Sixty5 `plumbing.glb` shipped needing 2,462 draw calls with
 * no build-time complaint. This is the same ceiling the material-fabric
 * register already holds, and its stance carries over verbatim: the budget
 * is a render-performance guard, so a building goes without the layer
 * rather than the guard being raised for it. A named waiver, not a raised
 * ceiling, is the only way past a breach that must ship anyway.
 *
 * `drawCalls` is what decides whether a layer is usable — an instanced
 * shape costs one draw call however often it is placed (see
 * `manifest.ts`'s `serviceLayers` doc comment).
 */
export const SERVICE_LAYER_DRAW_CALL_BUDGET = 300;

/** A named, dated exception to `SERVICE_LAYER_DRAW_CALL_BUDGET`. */
export interface ServiceLayerWaiver {
  /** The draw-call count read at `measuredOn`. Growth past it fails. */
  measuredDrawCalls: number;
  /** `YYYY-MM-DD`, the date `measuredDrawCalls` was read. */
  measuredOn: string;
  /** Why the layer ships anyway, citing only figures from its own manifest row, 300, or the overage. */
  reason: string;
}

/**
 * Layers that exceed `SERVICE_LAYER_DRAW_CALL_BUDGET` today, keyed
 * `${buildingId}/${layerId}`.
 *
 * An entry here is a debt record, not an exemption to reach for. Deleting
 * an entry re-arms the 300 ceiling for that layer — the next build that
 * publishes it above 300 fails as `over_budget`. This register is never
 * the way to admit a NEW layer over budget; it exists only for the five
 * breaches that were already live in production before this ceiling did.
 */
export const SERVICE_LAYER_BUDGET_WAIVERS: Record<string, ServiceLayerWaiver> = {
  "sixty5/plumbing": {
    measuredDrawCalls: 2462,
    measuredOn: "2026-09-16",
    reason:
      "2462 draw calls, 2162 over the 300 ceiling. 14980 distinct geometries " +
      "collapse into only 2456 instanced shapes, placed 59312 times across " +
      "22596 elements — an instanced shape costs one draw call however " +
      "often it is placed, and this file needs many. Published before any " +
      "service-layer ceiling existed and live in production; the ceiling " +
      "lands as a waiver rather than the removal of shipped MEP geometry.",
  },
  "sixty5/electrical": {
    measuredDrawCalls: 824,
    measuredOn: "2026-09-16",
    reason:
      "824 draw calls, 524 over the 300 ceiling. 8692 distinct geometries " +
      "collapse into 820 instanced shapes, placed 68662 times across 19604 " +
      "elements. Published before any service-layer ceiling existed and " +
      "live in production; the ceiling lands as a waiver rather than the " +
      "removal of shipped MEP geometry.",
  },
  "sixty5/hvac": {
    measuredDrawCalls: 750,
    measuredOn: "2026-09-16",
    reason:
      "750 draw calls, 450 over the 300 ceiling. 6477 distinct geometries " +
      "collapse into 745 instanced shapes, placed 32230 times across 11948 " +
      "elements. Published before any service-layer ceiling existed and " +
      "live in production; the ceiling lands as a waiver rather than the " +
      "removal of shipped MEP geometry.",
  },
  "west-riverside-hospital/hvac": {
    measuredDrawCalls: 737,
    measuredOn: "2026-09-16",
    reason:
      "737 draw calls, 437 over the 300 ceiling. 10020 distinct geometries " +
      "collapse into 733 instanced shapes, placed 14403 times across 19670 " +
      "elements. Published before any service-layer ceiling existed and " +
      "live in production; the ceiling lands as a waiver rather than the " +
      "removal of shipped MEP geometry.",
  },
  "bs-medical-dental-clinic/plumbing": {
    measuredDrawCalls: 407,
    measuredOn: "2026-09-16",
    reason:
      "407 draw calls, 107 over the 300 ceiling. 3681 distinct geometries " +
      "collapse into 402 instanced shapes, placed 7872 times across 6587 " +
      "elements. Published before any service-layer ceiling existed and " +
      "live in production; the ceiling lands as a waiver rather than the " +
      "removal of shipped MEP geometry.",
  },
};

/** One `serviceLayers` entry off a manifest, before it is flattened into a row. */
type ServiceLayerManifestEntry = NonNullable<ReferenceBuildingManifest["serviceLayers"]>[number];

/** The slice of a manifest this module needs — no filesystem, no Three.js, no Next. */
export interface ServiceLayerManifestInput {
  buildingId: string;
  serviceLayers?: readonly ServiceLayerManifestEntry[];
}

/** A flattened, checkable row: one service layer from one building's manifest. */
export interface ServiceLayerRow {
  key: string;
  buildingId: string;
  layerId: string;
  drawCalls: number;
  elements: number;
  triangleCount: number;
  distinctGeometries: number;
  instancedShapes: number;
  instancedPlacements: number;
}

/**
 * Flattens manifests into rows keyed `${buildingId}/${layerId}`. A manifest
 * with no `serviceLayers` contributes zero rows rather than throwing.
 */
export function collectServiceLayerRows(
  manifests: readonly ServiceLayerManifestInput[],
): ServiceLayerRow[] {
  const rows: ServiceLayerRow[] = [];
  for (const manifest of manifests) {
    for (const layer of manifest.serviceLayers ?? []) {
      rows.push({
        key: `${manifest.buildingId}/${layer.id}`,
        buildingId: manifest.buildingId,
        layerId: layer.id,
        drawCalls: layer.drawCalls,
        elements: layer.elements,
        triangleCount: layer.triangleCount,
        distinctGeometries: layer.distinctGeometries,
        instancedShapes: layer.instancedShapes,
        instancedPlacements: layer.instancedPlacements,
      });
    }
  }
  return rows;
}

export type ServiceLayerBudgetFindingKind =
  | "over_budget"
  | "waiver_grown"
  | "stale_waiver"
  | "orphan_waiver";

export interface ServiceLayerBudgetFinding {
  key: string;
  kind: ServiceLayerBudgetFindingKind;
  message: string;
}

/**
 * Checks `rows` against `SERVICE_LAYER_DRAW_CALL_BUDGET` and `waivers`.
 * Empty result means pass. Every figure quoted in a returned `message` is
 * computed from the row or the waiver, never hand-written, so the sentence
 * cannot drift from the number it describes.
 */
export function checkServiceLayerBudget(
  rows: readonly ServiceLayerRow[],
  waivers: Record<string, ServiceLayerWaiver> = SERVICE_LAYER_BUDGET_WAIVERS,
): ServiceLayerBudgetFinding[] {
  const findings: ServiceLayerBudgetFinding[] = [];
  const rowsByKey = new Map(rows.map((row) => [row.key, row] as const));

  for (const row of rows) {
    const waiver = waivers[row.key];

    if (!waiver) {
      if (row.drawCalls > SERVICE_LAYER_DRAW_CALL_BUDGET) {
        const overage = row.drawCalls - SERVICE_LAYER_DRAW_CALL_BUDGET;
        findings.push({
          key: row.key,
          kind: "over_budget",
          message:
            `${row.key}: ${row.drawCalls} draw calls, ${overage} over the ` +
            `${SERVICE_LAYER_DRAW_CALL_BUDGET} ceiling, and no waiver is on record.`,
        });
      }
      continue;
    }

    if (row.drawCalls <= SERVICE_LAYER_DRAW_CALL_BUDGET) {
      findings.push({
        key: row.key,
        kind: "stale_waiver",
        message:
          `${row.key}: measured ${waiver.measuredDrawCalls} on ${waiver.measuredOn}, ` +
          `now ${row.drawCalls} draw calls — at or under the ` +
          `${SERVICE_LAYER_DRAW_CALL_BUDGET} ceiling. Delete this waiver entry ` +
          `to re-arm the guard for this layer.`,
      });
      continue;
    }

    if (row.drawCalls > waiver.measuredDrawCalls) {
      findings.push({
        key: row.key,
        kind: "waiver_grown",
        message:
          `${row.key}: measured ${waiver.measuredDrawCalls} on ${waiver.measuredOn}, ` +
          `now ${row.drawCalls} draw calls — grown past the waived figure.`,
      });
    }
  }

  for (const key of Object.keys(waivers)) {
    if (!rowsByKey.has(key)) {
      findings.push({
        key,
        kind: "orphan_waiver",
        message:
          `${key}: this waiver key matched no published service layer. It makes ` +
          `no claim about that layer's draw-call count — the layer may have been ` +
          `renamed, removed, or never existed.`,
      });
    }
  }

  return findings;
}
