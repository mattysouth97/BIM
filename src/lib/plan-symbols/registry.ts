// src/lib/plan-symbols/registry.ts
//
// symbolFor(familyId) never returns nothing. Resolution order:
//   1. an explicit graph registered for this exact family id (the eight
//      library/*.ts files, merged in library/index.ts);
//   2. the family's tool default (catalog-defaults.ts), re-sized to the
//      family's real catalog.json footprint where the template exposes
//      widthMm/depthMm params;
//   3. a bare bbox rect built straight from catalog.json (or, failing that,
//      a fixed placeholder size) — for ids the tool-mapped catalog doesn't
//      even know about.

import { getAuthoringFamily } from "@/lib/bim/family-catalog";

import { catalogFootprintMm } from "./catalog-dims";
import { TOOL_DEFAULTS } from "./catalog-defaults";
import type { SymbolGraph } from "./graph-types";

const FALLBACK_WIDTH_MM = 400;
const FALLBACK_DEPTH_MM = 400;

/** Last-resort rect for an id the catalog doesn't recognise at all. */
function bboxFallback(familyId: string): SymbolGraph {
  const dims = catalogFootprintMm(familyId);
  const widthMm = dims?.widthMm ?? FALLBACK_WIDTH_MM;
  const depthMm = dims?.depthMm ?? FALLBACK_DEPTH_MM;
  return {
    id: `${familyId}--bbox-fallback`,
    nodes: [{ op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm, depthMm }],
  };
}

/** Tool default, re-parameterised to this family's real footprint where the template supports it. */
function toolDefaultFor(familyId: string, template: SymbolGraph): SymbolGraph {
  const dims = catalogFootprintMm(familyId);
  if (!dims) return template;
  const params = { ...template.params };
  let changed = false;
  if (params.widthMm !== undefined) {
    params.widthMm = dims.widthMm;
    changed = true;
  }
  if (params.depthMm !== undefined) {
    params.depthMm = dims.depthMm;
    changed = true;
  }
  if (!changed) return template;
  return { ...template, id: `${familyId}--tool-default`, params };
}

const registered = new Map<string, SymbolGraph>();

/** Merge authored graphs into the registry, keyed by AuthoringFamily id. Later calls overwrite earlier ones. */
export function registerSymbols(entries: Record<string, SymbolGraph>): void {
  for (const [id, graph] of Object.entries(entries)) {
    registered.set(id, graph);
  }
}

/** Test-only: reset registered graphs between suites. */
export function clearRegisteredSymbols(): void {
  registered.clear();
}

export function symbolFor(familyId: string): SymbolGraph {
  const explicit = registered.get(familyId);
  if (explicit) return explicit;

  const family = getAuthoringFamily(familyId);
  if (family) {
    const template = TOOL_DEFAULTS[family.tool];
    if (template) return toolDefaultFor(familyId, template);
  }

  return bboxFallback(familyId);
}
