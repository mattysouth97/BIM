// src/lib/bim/ifc-classification.ts
// P2-22 — IFC 4 classification for procedural structural elements.
//
// Real BIM viewers (Revit, Solibri, BIMvision) always answer three questions
// on selection: what IFC class is this, is it load-bearing, and what is it
// made of. This module maps our procedural mesh identities
// (userData.type: slab/column/roof/solidPanel/glass/mullion) plus the
// ledger's structure code (strctCd) onto that vocabulary so the twin speaks
// standard BIM instead of internal names.
//
// Scope note: this is a CLASSIFICATION of procedurally-generated geometry —
// honest display metadata, not an authored IFC model. GlobalIds/spatial
// containment are out of scope until real IFC export.

import { STRUCTURE_TO_WALL_KEY } from "@/lib/korean-building-codes";

/** Structural material family derived from the ledger structure code. */
export type StructureFamily = "rc" | "src" | "steel" | "timber" | "masonry" | "unknown";

export const FAMILY_LABELS: Record<StructureFamily, { ko: string; en: string }> = {
  rc:      { ko: "철근콘크리트", en: "Reinforced concrete" },
  src:     { ko: "철골철근콘크리트", en: "Steel-reinforced concrete (SRC)" },
  steel:   { ko: "철골", en: "Structural steel" },
  timber:  { ko: "목구조", en: "Timber" },
  masonry: { ko: "조적조", en: "Masonry" },
  unknown: { ko: "구조 미상", en: "Unknown structure" },
};

/** Resolve the structural family from a ledger strctCd (2-digit prefix). */
export function structureFamilyFor(strctCd?: string): StructureFamily {
  if (!strctCd) return "unknown";
  const key = STRUCTURE_TO_WALL_KEY[strctCd.slice(0, 2)];
  return (key as StructureFamily | undefined) ?? "unknown";
}

export interface IfcClassification {
  /** IFC 4 entity, e.g. "IfcColumn" */
  ifcClass: string;
  /** IFC PredefinedType enum value where the class has one (e.g. slab FLOOR/ROOF) */
  predefinedType?: string;
  /** Pset_*Common.LoadBearing */
  loadBearing: boolean;
  /** Pset_*Common.IsExternal */
  isExternal: boolean;
  /** Structural material family + display labels */
  family: StructureFamily;
  materialKo: string;
  materialEn: string;
}

/**
 * Classify a procedural element by its mesh identity.
 *
 * @param elementType  userData.type of the mesh ("slab", "column",
 *                     "structural-column", "roof", "solidPanel", "glass",
 *                     "hMullion", "vMullion")
 * @param opts.strctCd     ledger structure code (drives material + wall bearing)
 * @param opts.curtainWall true when the facade runs in curtain-wall mode
 *                         (glass classifies as IfcCurtainWall, not IfcWindow)
 * @returns classification, or null for non-building elements
 */
export function classifyElement(
  elementType: string,
  opts: { strctCd?: string; curtainWall?: boolean } = {}
): IfcClassification | null {
  const family = structureFamilyFor(opts.strctCd);
  const material = FAMILY_LABELS[family];
  const base = { family, materialKo: material.ko, materialEn: material.en };

  switch (elementType) {
    case "slab":
      return { ...base, ifcClass: "IfcSlab", predefinedType: "FLOOR", loadBearing: true, isExternal: false };
    case "roof":
      return { ...base, ifcClass: "IfcSlab", predefinedType: "ROOF", loadBearing: true, isExternal: true };
    case "column":
    case "structural-column":
      return { ...base, ifcClass: "IfcColumn", loadBearing: true, isExternal: false };
    case "solidPanel":
      // Masonry walls bear load; frame-structure walls are infill.
      return { ...base, ifcClass: "IfcWall", loadBearing: family === "masonry", isExternal: true };
    case "glass":
      return opts.curtainWall
        ? { ...base, ifcClass: "IfcCurtainWall", loadBearing: false, isExternal: true }
        : { ...base, ifcClass: "IfcWindow", loadBearing: false, isExternal: true };
    case "hMullion":
    case "vMullion":
      return { ...base, ifcClass: "IfcMember", predefinedType: "MULLION", loadBearing: false, isExternal: true };
    default:
      return null;
  }
}

/**
 * Compact display line used by tooltips/overlays, e.g.
 * "IfcSlab.FLOOR · 내력 · 철근콘크리트" / "IfcSlab.FLOOR · load-bearing · Reinforced concrete".
 */
export function ifcDisplayLine(c: IfcClassification, lang: "ko" | "en"): string {
  const cls = c.predefinedType ? `${c.ifcClass}.${c.predefinedType}` : c.ifcClass;
  const bearing = c.loadBearing
    ? lang === "ko" ? "내력" : "load-bearing"
    : lang === "ko" ? "비내력" : "non-load-bearing";
  const material = lang === "ko" ? c.materialKo : c.materialEn;
  return `${cls} · ${bearing} · ${material}`;
}
