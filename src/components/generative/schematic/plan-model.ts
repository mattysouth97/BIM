// src/components/generative/schematic/plan-model.ts
//
// BIM snapshot → one level's plan, in millimetres.
//
// Pure reading, no recomputation: a room rect here is the emitted Room element's
// own centre and size, a wall is its own start/end parameters. If the plan looks
// wrong, the model IS wrong — this file cannot flatter it.
//
// Elements carry metres (the model's unit); plans are drawn in millimetres so
// one transform serves both the schematic and the generated building.

import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";

import { mergeBounds, type BoundsMm } from "./view-transform";

/** Metres → millimetres. */
export const M_TO_MM = 1000;

export interface PlanRect {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  label: string;
  detail: string;
  /** Program key, for colouring. Empty for core parts. */
  programKey: string;
}

export interface PlanLine {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  exterior: boolean;
}

export interface PlanColumn {
  id: string;
  x: number;
  z: number;
}

export interface LevelPlan {
  rooms: PlanRect[];
  coreParts: PlanRect[];
  walls: PlanLine[];
  columns: PlanColumn[];
  bounds: BoundsMm | null;
}

const numberParam = (element: BimElement, key: string): number | null => {
  const value = element.instanceParameters[key];
  return typeof value === "number" ? value : null;
};

const stringParam = (element: BimElement, key: string): string | null => {
  const value = element.instanceParameters[key];
  return typeof value === "string" ? value : null;
};

/** Centre + widthM/depthM → a rect. Null when the element carries no extent. */
function rectFromCentre(
  element: BimElement,
  label: string,
  detail: string,
  programKey: string,
): PlanRect | null {
  const widthM = numberParam(element, "widthM");
  const depthM = numberParam(element, "depthM");
  if (widthM === null || depthM === null) return null;
  const cx = element.placement.x * M_TO_MM;
  const cz = element.placement.z * M_TO_MM;
  const halfW = (widthM * M_TO_MM) / 2;
  const halfD = (depthM * M_TO_MM) / 2;
  return {
    id: element.id,
    minX: cx - halfW,
    maxX: cx + halfW,
    minZ: cz - halfD,
    maxZ: cz + halfD,
    label,
    detail,
    programKey,
  };
}

export function readLevelPlan(
  snapshot: BimModelSnapshot,
  levelId: string,
): LevelPlan {
  const rooms: PlanRect[] = [];
  const coreParts: PlanRect[] = [];
  const walls: PlanLine[] = [];
  const columns: PlanColumn[] = [];

  for (const element of snapshot.elements) {
    if (element.levelId !== levelId || element.visible === false) continue;

    if (element.kind === "room") {
      const spaceType = stringParam(element, "spaceType") ?? "service";
      const areaM2 = numberParam(element, "areaM2");
      const rect = rectFromCentre(
        element,
        stringParam(element, "name") ?? element.id,
        areaM2 === null ? spaceType : `${spaceType} · ${areaM2.toFixed(0)} m²`,
        spaceType,
      );
      if (rect) rooms.push(rect);
      continue;
    }

    // Stairs, lifts and shafts: the core as it reads in plan.
    if (element.system === "core" && element.kind !== "wall") {
      const kind = stringParam(element, "componentKind") ?? element.family;
      const rect = rectFromCentre(element, kind, kind, "");
      if (rect) coreParts.push(rect);
      continue;
    }

    if (element.kind === "wall") {
      const x1 = numberParam(element, "startX");
      const z1 = numberParam(element, "startZ");
      const x2 = numberParam(element, "endX");
      const z2 = numberParam(element, "endZ");
      if (x1 === null || z1 === null || x2 === null || z2 === null) continue;
      walls.push({
        id: element.id,
        x1: x1 * M_TO_MM,
        z1: z1 * M_TO_MM,
        x2: x2 * M_TO_MM,
        z2: z2 * M_TO_MM,
        exterior: element.instanceParameters.exterior === true,
      });
      continue;
    }

    if (element.kind === "column") {
      columns.push({
        id: element.id,
        x: element.placement.x * M_TO_MM,
        z: element.placement.z * M_TO_MM,
      });
    }
  }

  let bounds: BoundsMm | null = null;
  for (const rect of [...rooms, ...coreParts]) {
    bounds = mergeBounds(bounds, {
      minX: rect.minX,
      maxX: rect.maxX,
      minZ: rect.minZ,
      maxZ: rect.maxZ,
    });
  }
  for (const wall of walls) {
    bounds = mergeBounds(bounds, {
      minX: Math.min(wall.x1, wall.x2),
      maxX: Math.max(wall.x1, wall.x2),
      minZ: Math.min(wall.z1, wall.z2),
      maxZ: Math.max(wall.z1, wall.z2),
    });
  }

  return { rooms, coreParts, walls, columns, bounds };
}
