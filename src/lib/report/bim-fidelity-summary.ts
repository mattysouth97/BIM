// src/lib/report/bim-fidelity-summary.ts
//
// Pure derivation of a "BIM Fidelity / IFC" report section from the Agentic
// BIM Engine's pure (counting-session) result. No React, no I/O, no WASM.
//
// Honesty (per src/lib/engine's HITL contract): a category's `measured`
// count is exactly the number of elements whose per-element confidence
// (sconf) clears ENGINE_CONSTANTS.HITL_THRESHOLD — the SAME threshold the
// engine itself uses to flag an element for human review. This can never
// present an estimated (HITL-flagged) element as measured, and never
// hardcodes a duplicate of the threshold.

import { ENGINE_CONSTANTS } from "@/lib/engine";
import type { BimEngineResult, ElementKind } from "@/lib/engine";
import type { ReportSection } from "./report-types";

export interface BimFidelityCategoryBreakdown {
  kind: ElementKind;
  /** Elements whose sconf >= ENGINE_CONSTANTS.HITL_THRESHOLD. */
  measured: number;
  /** Elements whose sconf < ENGINE_CONSTANTS.HITL_THRESHOLD (HITL-flagged). */
  estimated: number;
  total: number;
}

export interface BimFidelitySummary {
  /** Average per-element confidence (0-1) across every generated element. */
  overallFidelity: number;
  totalElements: number;
  /** Count of elements below the HITL threshold (same as result.hitlFlags.length). */
  hitlFlagCount: number;
  /**
   * Fixed order: wall, slab, window, door — always all four entries, even
   * when a category has zero generated elements (never silently dropped).
   */
  categories: BimFidelityCategoryBreakdown[];
}

const CATEGORY_ORDER: ElementKind[] = ["wall", "slab", "window", "door"];

/**
 * Derive the BIM fidelity summary from a (pure, counting-session) engine
 * result. `null` in (engine unavailable — no real footprint, AFF-6) ⇒ `null`
 * out. Callers must render their own explicit "unavailable" state rather
 * than fabricating a summary.
 */
export function buildBimFidelitySummary(
  result: BimEngineResult | null
): BimFidelitySummary | null {
  if (!result) return null;

  const { elements, hitlFlags } = result;
  const totalElements = elements.length;
  const overallFidelity =
    totalElements > 0
      ? elements.reduce((sum, e) => sum + e.sconf, 0) / totalElements
      : 0;

  const categories: BimFidelityCategoryBreakdown[] = CATEGORY_ORDER.map(
    (kind) => {
      const kindElements = elements.filter((e) => e.kind === kind);
      const measured = kindElements.filter(
        (e) => e.sconf >= ENGINE_CONSTANTS.HITL_THRESHOLD
      ).length;
      return {
        kind,
        measured,
        estimated: kindElements.length - measured,
        total: kindElements.length,
      };
    }
  );

  return {
    overallFidelity,
    totalElements,
    hitlFlagCount: hitlFlags.length,
    categories,
  };
}

const CATEGORY_LABELS: Record<ElementKind, string> = {
  wall: "Walls",
  slab: "Slabs",
  window: "Windows",
  door: "Door",
};

/**
 * Build the "BIM Fidelity / IFC" report section(s) — consumable by every
 * export surface that already understands `ReportSection` (PDF via
 * report-engine.ts's `extraSections` param, and the in-app preview via the
 * generic section renderer). `null` summary ⇒ a single honest "unavailable"
 * text section — never fabricated numbers (AFF-6).
 */
export function buildBimFidelitySections(
  summary: BimFidelitySummary | null
): ReportSection[] {
  if (!summary) {
    return [
      {
        title: "BIM Fidelity / IFC",
        titleKo: "BIM 충실도 / IFC",
        content: {
          type: "text",
          text:
            "IFC/BIM export is unavailable for this building — there is no CAD or building-outline footprint. A cadastral parcel boundary or an era-estimate rectangle is not a real building footprint, so no BIM fidelity data can be honestly reported. Upload a CAD drawing or use a building with a measured outline to enable it.",
        },
      },
    ];
  }

  const overallPct = `${(summary.overallFidelity * 100).toFixed(1)}%`;

  return [
    {
      title: "BIM Fidelity / IFC",
      titleKo: "BIM 충실도 / IFC",
      content: {
        type: "key-value",
        items: [
          { label: "Overall Fidelity", value: overallPct },
          { label: "Total Elements", value: String(summary.totalElements) },
          {
            label: "HITL-Flagged Elements",
            value: String(summary.hitlFlagCount),
          },
        ],
      },
    },
    {
      title: "BIM Element Confidence by Category",
      titleKo: "요소별 BIM 신뢰도",
      content: {
        type: "table",
        headers: ["Category", "Measured", "Estimated", "Total"],
        rows: summary.categories.map((c) => [
          CATEGORY_LABELS[c.kind],
          String(c.measured),
          String(c.estimated),
          String(c.total),
        ]),
      },
    },
  ];
}
