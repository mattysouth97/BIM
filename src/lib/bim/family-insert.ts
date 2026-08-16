// Insertion height for rebuilt authoring families.
// Catalog bounds are Blender XYZ (X width, Y depth, Z height). After
// export_yup, three.js Y = Blender Z.

import catalog from "../../../public/models/authoring/catalog.json";

interface CatalogFamily {
  id: string;
  origin?: string;
  heightM?: number;
  boundsMin?: number[];
  boundsMax?: number[];
}

const FAMILIES = (catalog as { families: CatalogFamily[] }).families;
const BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

export function catalogFamily(typeId: string): CatalogFamily | undefined {
  return BY_ID.get(typeId);
}

/**
 * Mesh-local Y of the opening sill / threshold.
 *   0          — origin is on the sill (rebuilt LOD3 windows, doors)
 *   -height/2  — origin is the opening centre (course-kit windows)
 */
export function familySillLocalY(typeId: string): number {
  const spec = BY_ID.get(typeId);
  if (!spec) return 0;
  const h = Number(spec.heightM) || 0;
  const minZ = spec.boundsMin?.[2];
  const maxZ = spec.boundsMax?.[2];
  if (minZ === undefined || maxZ === undefined) {
    if (spec.origin === "opening-center") return h ? -h / 2 : 0;
    return 0;
  }
  // LOD3 rebuild: head at +height, stool / stool-apron hangs below 0.
  if (h > 0 && Math.abs(maxZ - h) < 0.25 && minZ > -h * 0.6) return 0;
  // Course kit: symmetric about Y=0.
  if (h > 0 && Math.abs(minZ + h / 2) < 0.25) return -h / 2;
  if (Math.abs(minZ) < 0.12) return 0;
  if (spec.origin === "opening-center") return h ? -h / 2 : 0;
  return 0;
}

export function hostedInsertY(input: {
  typeId: string;
  kind: string;
  levelElevation: number;
  sillHeightMm?: number;
  baseOffsetMm?: number;
}): number {
  const base = input.levelElevation + Number(input.baseOffsetMm ?? 0) / 1000;
  if (input.kind === "window") {
    const sill = Number(input.sillHeightMm ?? 900) / 1000;
    return base + sill - familySillLocalY(input.typeId);
  }
  return base;
}
