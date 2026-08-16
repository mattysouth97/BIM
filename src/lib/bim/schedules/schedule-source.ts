// src/lib/bim/schedules/schedule-source.ts
// Derive schedule-ready elements from the live twin (recipe + materials + MEP).
// Used until every procedural mesh is stamped into element-registry.

import type { BuildingRecipe } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import type { MepEquipmentParams } from "@/lib/layers/mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";
import { FAMILY_LABELS, structureFamilyFor } from "@/lib/bim/ifc-classification";
import type { ScheduleCategory, ScheduleDefinition, ScheduleResult } from "./schedule-types";
import { runSchedule } from "./schedule-engine";

export interface WallScheduleRow {
  id: string;
  thickness: number;
  uValue: number;
  area: number;
  material: string;
  height: number;
  length: number;
  floorNo: number;
}

export interface OpeningScheduleRow {
  id: string;
  type: "window" | "door";
  width: number;
  height: number;
  uValue: number;
  material: string;
  floorNo: number;
  count: number;
}

export interface MepScheduleRow {
  id: string;
  equipmentType: string;
  floorNo: number;
  capacity: number;
  width: number;
  height: number;
  depth: number;
  count: number;
}

export interface RoomScheduleRow {
  id: string;
  name: string;
  floorNo: number;
  area: number;
  perimeter: number;
  use: string;
  height: number;
}

export interface ScheduleElementBag {
  walls: WallScheduleRow[];
  openings: OpeningScheduleRow[];
  mep: MepScheduleRow[];
  rooms: RoomScheduleRow[];
}

const SIDES: Array<{ id: string; lengthKey: "footprintWidth" | "footprintDepth" }> = [
  { id: "N", lengthKey: "footprintWidth" },
  { id: "S", lengthKey: "footprintWidth" },
  { id: "E", lengthKey: "footprintDepth" },
  { id: "W", lengthKey: "footprintDepth" },
];

function avgWallU(materials?: MaterialProperties): number {
  const walls = materials?.envelope.walls ?? [];
  if (walls.length === 0) return 0.51;
  return walls.reduce((s, w) => s + w.uValue, 0) / walls.length;
}

function windowU(materials?: MaterialProperties): number {
  return materials?.envelope.windows.uValue ?? 2.4;
}

function wallMaterial(recipe: BuildingRecipe): string {
  return FAMILY_LABELS[structureFamilyFor(recipe.strctCd)].en;
}

/**
 * Build schedule source rows from the current twin parameters.
 * One wall per orientation per floor; aggregated openings; plant + per-floor MEP.
 */
export function collectScheduleElements(
  buildingPk: string,
  recipe: BuildingRecipe,
  materials?: MaterialProperties,
  equipment?: MepEquipmentParams
): ScheduleElementBag {
  const params = equipment ?? DEFAULT_MEP_EQUIPMENT_PARAMS;
  const thickness = recipe.wallThickness;
  const uWall = avgWallU(materials);
  const material = wallMaterial(recipe);
  const uWin = windowU(materials);
  const glassType = materials?.envelope.windows.glassType ?? "double";

  const walls: WallScheduleRow[] = [];
  const openings: OpeningScheduleRow[] = [];
  const rooms: RoomScheduleRow[] = [];

  for (const floor of recipe.floors) {
    const perimeter =
      2 * (recipe.footprintWidth + recipe.footprintDepth);

    for (const side of SIDES) {
      const length = recipe[side.lengthKey];
      const area = Math.round(length * floor.height * 100) / 100;
      walls.push({
        id: `${buildingPk}:wall:${floor.floorNo}:${side.id}`,
        thickness,
        uValue: uWall,
        area,
        material,
        height: floor.height,
        length,
        floorNo: floor.floorNo,
      });
    }

    const windowCount = Math.max(
      1,
      Math.round((perimeter / Math.max(recipe.facade.windowSpacing, 0.5)) * recipe.facade.windowRatio)
    );
    openings.push({
      id: `${buildingPk}:window:${floor.floorNo}`,
      type: "window",
      width: recipe.facade.windowWidth,
      height: recipe.facade.windowHeight,
      uValue: uWin,
      material: glassType,
      floorNo: floor.floorNo,
      count: windowCount,
    });

    if (floor.isGroundFloor) {
      openings.push({
        id: `${buildingPk}:door:${floor.floorNo}`,
        type: "door",
        width: 0.91,
        height: 2.1,
        uValue: Math.min(uWin, 2.8),
        material: "metal",
        floorNo: floor.floorNo,
        count: 1,
      });
    }

    const area = recipe.footprintWidth * recipe.footprintDepth;
    rooms.push({
      id: `${buildingPk}:room:${floor.floorNo}`,
      name: floor.label,
      floorNo: floor.floorNo,
      area: Math.round(area * 100) / 100,
      perimeter: Math.round(perimeter * 100) / 100,
      use: recipe.mainPurpsCd,
      height: floor.height,
    });
  }

  const roofFloor = recipe.floors[recipe.floors.length - 1]?.floorNo ?? 1;
  const mep: MepScheduleRow[] = [
    {
      id: `${buildingPk}:mep:chiller`,
      equipmentType: "chiller",
      floorNo: roofFloor,
      capacity: 0,
      width: params.chiller.bodyWidth,
      height: params.chiller.bodyHeight,
      depth: params.chiller.bodyDepth,
      count: 1,
    },
    {
      id: `${buildingPk}:mep:boiler`,
      equipmentType: "boiler",
      floorNo: roofFloor,
      capacity: 0,
      width: params.boiler.radius * 2,
      height: params.boiler.height,
      depth: params.boiler.radius * 2,
      count: 1,
    },
    {
      id: `${buildingPk}:mep:ahu`,
      equipmentType: "ahu",
      floorNo: 1,
      capacity: 0,
      width: params.ahu.width,
      height: params.ahu.height,
      depth: params.ahu.depth,
      count: Math.max(1, params.ahu.unitsPerFloor) * recipe.floors.length,
    },
    {
      id: `${buildingPk}:mep:dhw`,
      equipmentType: "dhw",
      floorNo: roofFloor,
      capacity: 0,
      width: params.dhw.tankRadius * 2,
      height: params.dhw.tankHeight,
      depth: params.dhw.tankRadius * 2,
      count: 1,
    },
    {
      id: `${buildingPk}:mep:lighting`,
      equipmentType: "lightingFixture",
      floorNo: 1,
      capacity: 0,
      width: params.lightingFixture.width,
      height: params.lightingFixture.height,
      depth: params.lightingFixture.depth,
      count: recipe.floors.length,
    },
    {
      id: `${buildingPk}:mep:electrical`,
      equipmentType: "electricalPanel",
      floorNo: 1,
      capacity: 0,
      width: params.electricalPanel.width,
      height: params.electricalPanel.height,
      depth: params.electricalPanel.depth,
      count: 1,
    },
  ];

  return { walls, openings, mep, rooms };
}

export function elementsForCategory(
  bag: ScheduleElementBag,
  category: ScheduleCategory
): unknown[] {
  switch (category) {
    case "wall":
      return bag.walls;
    case "window":
      return bag.openings.filter((o) => o.type === "window");
    case "door":
      return bag.openings.filter((o) => o.type === "door");
    case "mep":
      return bag.mep;
    case "room":
      return bag.rooms;
    default:
      return [];
  }
}

export function runBuildingSchedule(
  definition: ScheduleDefinition,
  bag: ScheduleElementBag
): ScheduleResult {
  return runSchedule(definition, elementsForCategory(bag, definition.category));
}
