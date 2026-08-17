// src/lib/plan-symbols/catalog-dims.ts
//
// The one place that reads public/models/authoring/catalog.json for plan
// symbols: a per-family real-world footprint in mm, on the same local XZ
// plane as everything else here (catalog X = local width, catalog Z =
// local depth — see the Blender-vs-exported-frame note in
// src/lib/bim/family-insert.ts, which this mirrors).

import catalogJson from "../../../public/models/authoring/catalog.json";

interface CatalogEntry {
  id: string;
  widthM?: number;
  diameterM?: number;
  nativeDimsM?: { x: number; y: number; z: number };
}

const CATALOG_BY_ID: ReadonlyMap<string, CatalogEntry> = new Map(
  (catalogJson as { families: CatalogEntry[] }).families.map((f) => [f.id, f]),
);

export interface FootprintMm {
  widthMm: number;
  depthMm: number;
}

/** width (local X) / depth (local Z) footprint in mm, from the real authored geometry. */
export function catalogFootprintMm(familyId: string): FootprintMm | undefined {
  const entry = CATALOG_BY_ID.get(familyId);
  if (!entry) return undefined;
  const widthM = entry.widthM ?? entry.diameterM ?? entry.nativeDimsM?.x;
  const depthM = entry.nativeDimsM?.z ?? entry.diameterM ?? entry.nativeDimsM?.x;
  if (widthM === undefined || depthM === undefined) return undefined;
  return { widthMm: widthM * 1000, depthMm: depthM * 1000 };
}
