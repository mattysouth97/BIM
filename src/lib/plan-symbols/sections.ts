// src/lib/plan-symbols/sections.ts
//
// The eight Figma catalog sections (RmCCr8pOFvqq4dzGZTJkFl cover file), as
// data. Section 08 "System Kit" is metadata-only in Figma — no symbols are
// authored for it, and no AuthoringFamily maps to it here.
//
// sectionForFamily() resolves every one of the 102 AUTHORING_FAMILIES to
// exactly one of the seven symbol-bearing sections: id-prefix overrides are
// checked first (some electrical-tool families are really energy/BEMS/ESS
// devices per the Figma taxonomy), then the tool falls back to its
// discipline mapping.

import { AUTHORING_FAMILIES, type AuthoringFamily, type AuthoringToolId } from "@/lib/bim/family-catalog";

export type SectionId =
  | "architecture"
  | "structure"
  | "mechanical"
  | "electrical"
  | "plumbing-fire"
  | "energy-bems"
  | "furniture-site"
  | "system-kit";

export interface SectionDef {
  id: SectionId;
  numberLabel: string;
  nameEn: string;
  /** True for section 08: cover-defined in Figma, but holds no symbol library. */
  metadataOnly?: boolean;
}

export const SECTIONS: SectionDef[] = [
  { id: "architecture", numberLabel: "01", nameEn: "Architecture" },
  { id: "structure", numberLabel: "02", nameEn: "Structure" },
  { id: "mechanical", numberLabel: "03", nameEn: "Mechanical" },
  { id: "electrical", numberLabel: "04", nameEn: "Electrical" },
  { id: "plumbing-fire", numberLabel: "05", nameEn: "Plumbing & Fire" },
  { id: "energy-bems", numberLabel: "06", nameEn: "Energy / BEMS / ESS" },
  { id: "furniture-site", numberLabel: "07", nameEn: "Furniture & Site" },
  { id: "system-kit", numberLabel: "08", nameEn: "System Kit", metadataOnly: true },
];

/** Symbol-bearing sections only — the ones an authoring pass actually fills. */
export const SYMBOL_SECTION_IDS: SectionId[] = SECTIONS.filter((s) => !s.metadataOnly).map((s) => s.id);

/**
 * Checked before the tool mapping, in order. An id matching any prefix here
 * lands in that section regardless of its `tool` bucket — e.g. an
 * "energy-smart-meter" is tool "electrical" but reads as energy/BEMS in the
 * Figma taxonomy.
 */
const ID_PREFIX_OVERRIDES: ReadonlyArray<{ prefix: string; section: SectionId }> = [
  { prefix: "bems-", section: "energy-bems" },
  { prefix: "energy-", section: "energy-bems" },
  { prefix: "ess-", section: "energy-bems" },
  { prefix: "ev-", section: "energy-bems" },
];

const TOOL_SECTION: Record<AuthoringToolId, SectionId> = {
  wall: "architecture",
  door: "architecture",
  window: "architecture",
  floor: "architecture",
  roof: "architecture",
  ceiling: "architecture",
  column: "structure",
  beam: "structure",
  foundation: "structure",
  stair: "structure",
  railing: "structure",
  equipment: "mechanical",
  electrical: "electrical",
  lighting: "electrical",
  plumbing: "plumbing-fire",
  fire: "plumbing-fire",
  furniture: "furniture-site",
  planting: "furniture-site",
  site: "furniture-site",
};

export function sectionForFamily(family: AuthoringFamily): SectionId {
  for (const override of ID_PREFIX_OVERRIDES) {
    if (family.id.startsWith(override.prefix)) return override.section;
  }
  const section = TOOL_SECTION[family.tool];
  if (!section) {
    throw new Error(`plan-symbols/sections: no section mapping for tool "${family.tool}" (family ${family.id})`);
  }
  return section;
}

export function familiesForSection(sectionId: SectionId): AuthoringFamily[] {
  return AUTHORING_FAMILIES.filter((f) => sectionForFamily(f) === sectionId);
}

/** Per-section family counts, in SECTIONS order. Symbol-bearing sections only. */
export function sectionCounts(): Record<SectionId, number> {
  const counts = {} as Record<SectionId, number>;
  for (const id of SYMBOL_SECTION_IDS) counts[id] = 0;
  for (const family of AUTHORING_FAMILIES) {
    const id = sectionForFamily(family);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
