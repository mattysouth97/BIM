// Derive Revit-style schedule elements from the twin.
// Autonomous: no authored instances. One wall per facade per floor,
// aggregated openings, plant from HVAC materials, one zone per floor.

import type { BuildingRecipe, FacadeConfig, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties, WallAssembly } from "@/lib/material-types";
import type { MepEquipmentParams } from "@/lib/layers/mep-equipment-params";

export type WallOrientation = "N" | "S" | "E" | "W";

export interface DerivedWallElement {
  id: string;
  floorNo: number;
  orientation: WallOrientation;
  thickness: number;
  height: number;
  length: number;
  area: number;
  uValue: number;
  material: string;
}

export interface DerivedOpeningElement {
  id: string;
  type: "window" | "door";
  floorNo: number;
  width: number;
  height: number;
  uValue: number;
  material: string;
  count: number;
}

export interface DerivedMepElement {
  id: string;
  equipmentType: string;
  floorNo: number;
  capacity: number;
  width: number;
  height: number;
  depth: number;
  count: number;
}

export interface DerivedRoomElement {
  id: string;
  name: string;
  floorNo: number;
  area: number;
  perimeter: number;
  use: string;
  height: number;
}

export interface TwinElementSource {
  recipe: BuildingRecipe;
  materials?: MaterialProperties;
  equipment?: MepEquipmentParams;
}

export interface DerivedTwinElements {
  walls: DerivedWallElement[];
  openings: DerivedOpeningElement[];
  mep: DerivedMepElement[];
  rooms: DerivedRoomElement[];
}

const ORIENTATIONS: WallOrientation[] = ["N", "S", "E", "W"];

/** +Z is south in the twin frame. N/S run along width; E/W along depth. */
function sideLength(recipe: BuildingRecipe, orientation: WallOrientation): number {
  return orientation === "N" || orientation === "S"
    ? recipe.footprintWidth
    : recipe.footprintDepth;
}

function wallAssembly(
  materials: MaterialProperties | undefined,
  orientation: WallOrientation,
): WallAssembly | undefined {
  return materials?.envelope.walls.find((w) => w.orientation === orientation);
}

function wallMaterialName(
  materials: MaterialProperties | undefined,
  orientation: WallOrientation,
): string {
  const layers = wallAssembly(materials, orientation)?.layers ?? [];
  const named = layers.find((l) => l.name);
  return named?.name ?? "외벽";
}

function windowCountOnSide(
  length: number,
  height: number,
  facade: FacadeConfig,
  wwr: number,
): number {
  const wallArea = length * height;
  const glassArea = wallArea * Math.max(0, Math.min(1, wwr));
  const unit = facade.windowWidth * facade.windowHeight;
  if (unit <= 0 || glassArea <= 0) return 0;
  return Math.max(1, Math.round(glassArea / unit));
}

function wwrFor(
  materials: MaterialProperties | undefined,
  orientation: WallOrientation,
  facade: FacadeConfig,
): number {
  const fromMat = materials?.envelope.windows.windowToWallRatio[orientation];
  if (typeof fromMat === "number" && fromMat > 0) return fromMat;
  return facade.windowRatio;
}

function isResidential(mainPurpsCd: string): boolean {
  return mainPurpsCd.startsWith("01") || mainPurpsCd.startsWith("02");
}

function useLabel(floor: FloorSpec, recipe: BuildingRecipe): string {
  return floor.useCode ?? recipe.mainPurpsCd ?? "-";
}

function footprintPerimeter(recipe: BuildingRecipe): number {
  return 2 * (recipe.footprintWidth + recipe.footprintDepth);
}

function footprintArea(recipe: BuildingRecipe): number {
  return recipe.footprintWidth * recipe.footprintDepth;
}

export function deriveWallElements(source: TwinElementSource): DerivedWallElement[] {
  const { recipe, materials } = source;
  const walls: DerivedWallElement[] = [];

  for (const floor of recipe.floors) {
    for (const orientation of ORIENTATIONS) {
      const length = sideLength(recipe, orientation);
      const height = floor.height;
      const assembly = wallAssembly(materials, orientation);
      walls.push({
        id: `W-${floor.floorNo}-${orientation}`,
        floorNo: floor.floorNo,
        orientation,
        thickness: recipe.wallThickness,
        height,
        length: Math.round(length * 100) / 100,
        area: Math.round(length * height * 100) / 100,
        uValue: assembly?.uValue ?? 0,
        material: wallMaterialName(materials, orientation),
      });
    }
  }

  return walls;
}

export function deriveOpeningElements(source: TwinElementSource): DerivedOpeningElement[] {
  const { recipe, materials } = source;
  const openings: DerivedOpeningElement[] = [];
  const glazing = materials?.envelope.windows;
  const frame = glazing?.frameMaterial ?? "aluminum";

  for (const floor of recipe.floors) {
    let windowCount = 0;
    for (const orientation of ORIENTATIONS) {
      const length = sideLength(recipe, orientation);
      const wwr = wwrFor(materials, orientation, recipe.facade);
      windowCount += windowCountOnSide(length, floor.height, recipe.facade, wwr);
    }

    if (windowCount > 0) {
      openings.push({
        id: `WIN-${floor.floorNo}`,
        type: "window",
        floorNo: floor.floorNo,
        width: recipe.facade.windowWidth,
        height: recipe.facade.windowHeight,
        uValue: glazing?.uValue ?? 0,
        material: frame,
        count: windowCount,
      });
    }

    const doorCount = floor.isGroundFloor
      ? 1
      : isResidential(recipe.mainPurpsCd)
        ? 1
        : 0;
    if (doorCount > 0) {
      openings.push({
        id: `DR-${floor.floorNo}`,
        type: "door",
        floorNo: floor.floorNo,
        width: 1.8,
        height: 2.1,
        uValue: glazing?.uValue ?? 0,
        material: frame,
        count: doorCount,
      });
    }
  }

  return openings;
}

export function deriveMepElements(source: TwinElementSource): DerivedMepElement[] {
  const { recipe, materials, equipment } = source;
  const hvac = materials?.hvac;
  const mep: DerivedMepElement[] = [];
  const ground = recipe.floors.find((f) => f.isGroundFloor)?.floorNo
    ?? recipe.floors[0]?.floorNo
    ?? 1;
  const roofFloor = recipe.floors[recipe.floors.length - 1]?.floorNo ?? ground;

  if (hvac && hvac.cooling.systemType !== "none" && hvac.cooling.capacity > 0) {
    mep.push({
      id: "MEP-CHL",
      equipmentType: "chiller",
      floorNo: roofFloor,
      capacity: hvac.cooling.capacity,
      width: equipment?.chiller.bodyWidth ?? 2.4,
      height: equipment?.chiller.bodyHeight ?? 1.5,
      depth: equipment?.chiller.bodyDepth ?? 1.8,
      count: 1,
    });
  }

  if (hvac && hvac.heating.capacity > 0) {
    mep.push({
      id: "MEP-BLR",
      equipmentType: "boiler",
      floorNo: ground,
      capacity: hvac.heating.capacity,
      width: (equipment?.boiler.radius ?? 0.5) * 2,
      height: equipment?.boiler.height ?? 1.8,
      depth: (equipment?.boiler.radius ?? 0.5) * 2,
      count: 1,
    });
  }

  const ahuPerFloor = equipment?.ahu.unitsPerFloor ?? 1;
  if (ahuPerFloor > 0 && recipe.floors.length > 0) {
    mep.push({
      id: "MEP-AHU",
      equipmentType: "ahu",
      floorNo: ground,
      capacity: hvac?.ventilation.airflowRate ?? 0,
      width: equipment?.ahu.width ?? 1.2,
      height: equipment?.ahu.height ?? 0.8,
      depth: equipment?.ahu.depth ?? 0.8,
      count: ahuPerFloor * recipe.floors.length,
    });
  }

  if (hvac) {
    mep.push({
      id: "MEP-DHW",
      equipmentType: "dhw",
      floorNo: ground,
      capacity: hvac.dhw.storageVolume,
      width: (equipment?.dhw.tankRadius ?? 0.6) * 2,
      height: equipment?.dhw.tankHeight ?? 1.8,
      depth: (equipment?.dhw.tankRadius ?? 0.6) * 2,
      count: 1,
    });
  }

  mep.push({
    id: "MEP-ELP",
    equipmentType: "electricalPanel",
    floorNo: ground,
    capacity: 0,
    width: equipment?.electricalPanel.width ?? 0.5,
    height: equipment?.electricalPanel.height ?? 0.8,
    depth: equipment?.electricalPanel.depth ?? 0.18,
    count: 1,
  });

  return mep;
}

export function deriveRoomElements(source: TwinElementSource): DerivedRoomElement[] {
  const { recipe } = source;
  const area = Math.round(footprintArea(recipe) * 100) / 100;
  const perimeter = Math.round(footprintPerimeter(recipe) * 100) / 100;

  return recipe.floors.map((floor) => ({
    id: `RM-${floor.floorNo}`,
    name: floor.label,
    floorNo: floor.floorNo,
    area,
    perimeter,
    use: useLabel(floor, recipe),
    height: floor.height,
  }));
}

export function deriveTwinElements(source: TwinElementSource): DerivedTwinElements {
  return {
    walls: deriveWallElements(source),
    openings: deriveOpeningElements(source),
    mep: deriveMepElements(source),
    rooms: deriveRoomElements(source),
  };
}
