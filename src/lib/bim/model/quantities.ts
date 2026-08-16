// Model quantities derived from BIM geometry + type parameters.

import type { BimModelSnapshot } from "./types";

export interface QuantityRow {
  category: string;
  count: number;
  lengthM: number;
  areaM2: number;
  volumeM3: number;
}

export function quantifyModel(model: BimModelSnapshot): QuantityRow[] {
  const groups = new Map<string, QuantityRow>();
  for (const el of model.elements) {
    if (!el.visible) continue;
    const type = model.types[el.typeId];
    const row = groups.get(el.category) ?? {
      category: el.category,
      count: 0,
      lengthM: 0,
      areaM2: 0,
      volumeM3: 0,
    };
    const count = Number(el.instanceParameters.count ?? 1);
    const length = Number(el.instanceParameters.lengthM ?? 0);
    const area = Number(el.instanceParameters.areaM2 ?? 0);
    const thickness = Number(type?.parameters.thicknessMm ?? 0) / 1000;
    const height = Number(el.instanceParameters.unconnectedHeightM ?? 0);
    row.count += count;
    row.lengthM += length * count;
    row.areaM2 += (area || length * height) * count;
    if (thickness > 0) row.volumeM3 += (area || length * height) * thickness * count;
    groups.set(el.category, row);
  }
  return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
}
