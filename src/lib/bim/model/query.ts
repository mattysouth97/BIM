// src/lib/bim/model/query.ts
// Single filter engine for schedules, selection, visibility, and APIs.

import type { BimElement, BimModelSnapshot, BimQuery } from "./types";

export function queryElements(model: BimModelSnapshot, query: BimQuery = {}): BimElement[] {
  return model.elements.filter((el) => matchesQuery(el, query));
}

export function matchesQuery(el: BimElement, query: BimQuery): boolean {
  if (query.category && el.category !== query.category) return false;
  if (query.kind && el.kind !== query.kind) return false;
  if (query.levelId && el.levelId !== query.levelId) return false;
  if (query.typeId && el.typeId !== query.typeId) return false;
  if (query.origin && el.origin !== query.origin) return false;
  if (query.hostId && el.hostId !== query.hostId) return false;
  return true;
}

export function authoredPoses(model: BimModelSnapshot): BimElement[] {
  return model.elements.filter((el) => el.origin === "authored" && el.visible);
}

/** Map BIM elements back into the schedule-engine row shapes. */
export function scheduleSourceForCategory(
  model: BimModelSnapshot,
  category: "wall" | "opening" | "mep" | "room",
): unknown[] {
  if (category === "wall") {
    return queryElements(model, { kind: "wall" }).map((el) => {
      const type = model.types[el.typeId];
      const thicknessMm = Number(type?.parameters.thicknessMm ?? 200);
      return {
        id: el.mark || el.id,
        floorNo: Number(el.levelId?.replace("level:", "") ?? 0),
        thickness: thicknessMm / 1000,
        height: Number(el.instanceParameters.unconnectedHeightM ?? 0),
        length: Number(el.instanceParameters.lengthM ?? 0),
        area: Number(el.instanceParameters.areaM2 ?? 0),
        uValue: Number(el.instanceParameters.uValue ?? 0),
        material: String(el.instanceParameters.material ?? type?.typeName ?? ""),
      };
    });
  }
  if (category === "opening") {
    return queryElements(model, {}).filter((el) => el.kind === "door" || el.kind === "window").map((el) => {
      const type = model.types[el.typeId];
      return {
        id: el.mark || el.id,
        type: el.kind === "door" ? "door" : "window",
        floorNo: Number(el.levelId?.replace("level:", "") ?? 0),
        width: Number(type?.parameters.widthMm ?? el.instanceParameters.widthMm ?? 900) / 1000,
        height: Number(type?.parameters.heightMm ?? el.instanceParameters.heightMm ?? 2100) / 1000,
        uValue: Number(el.instanceParameters.uValue ?? 0),
        material: String(el.instanceParameters.material ?? ""),
        count: Number(el.instanceParameters.count ?? 1),
      };
    });
  }
  if (category === "mep") {
    return queryElements(model, { kind: "mep-instance" }).map((el) => ({
      id: el.mark || el.id,
      equipmentType: String(el.instanceParameters.equipmentType ?? el.family),
      floorNo: Number(el.levelId?.replace("level:", "") ?? 0),
      capacity: Number(el.instanceParameters.capacity ?? 0),
      width: Number(el.instanceParameters.width ?? 0),
      height: Number(el.instanceParameters.height ?? 0),
      depth: Number(el.instanceParameters.depth ?? 0),
      count: Number(el.instanceParameters.count ?? 1),
    }));
  }
  return queryElements(model, { kind: "room" }).map((el) => ({
    id: el.mark || el.id,
    name: String(el.instanceParameters.name ?? el.mark),
    floorNo: Number(el.levelId?.replace("level:", "") ?? 0),
    area: Number(el.instanceParameters.areaM2 ?? 0),
    perimeter: Number(el.instanceParameters.perimeterM ?? 0),
    use: String(el.instanceParameters.use ?? ""),
    height: Number(el.instanceParameters.unconnectedHeightM ?? 0),
  }));
}
