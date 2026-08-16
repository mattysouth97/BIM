// src/lib/bim/model/hydrate.ts
// Convert the existing twin (recipe + derived elements) into a BIM snapshot.
// Generated instances are re-derived every time; authored instances overlay.

import type { BuildingRecipe } from "@/lib/procedural/types";
import { AUTHORING_FAMILIES } from "../family-catalog";
import type { DerivedTwinElements } from "../derive/twin-elements";
import { typeFromAuthoringFamily } from "./parameters";
import { levelsFromRecipe } from "./levels";
import {
  GENERATED_DOOR_TYPE,
  GENERATED_FLOOR_TYPE,
  GENERATED_MEP_TYPE,
  GENERATED_ROOM_TYPE,
  GENERATED_WALL_TYPE,
  GENERATED_WINDOW_TYPE,
  levelIdForFloor,
  type BimElement,
  type BimModelSnapshot,
  type BimType,
} from "./types";

function generatedTypes(recipe: BuildingRecipe): Record<string, BimType> {
  const types: Record<string, BimType> = {
    [GENERATED_WALL_TYPE]: {
      id: GENERATED_WALL_TYPE,
      category: "Walls",
      categoryKo: "벽",
      family: "Basic Wall",
      familyKo: "기본 벽",
      typeName: `Exterior ${Math.round(recipe.wallThickness * 1000)}mm`,
      typeNameKo: `외부 ${Math.round(recipe.wallThickness * 1000)}mm`,
      parameters: {
        thicknessMm: Math.round(recipe.wallThickness * 1000),
        structural: true,
        roomBounding: true,
      },
      layers: ["Structure"],
      ifcClass: "IfcWall",
    },
    [GENERATED_FLOOR_TYPE]: {
      id: GENERATED_FLOOR_TYPE,
      category: "Floors",
      categoryKo: "바닥",
      family: "Floor",
      familyKo: "바닥",
      typeName: `Generic ${Math.round(recipe.slab.thickness * 1000)}mm`,
      typeNameKo: `일반 ${Math.round(recipe.slab.thickness * 1000)}mm`,
      parameters: { thicknessMm: Math.round(recipe.slab.thickness * 1000) },
    },
    [GENERATED_DOOR_TYPE]: {
      id: GENERATED_DOOR_TYPE,
      category: "Doors",
      categoryKo: "문",
      family: "Single-Flush",
      familyKo: "단여닫이",
      typeName: "Generic 1800mm",
      typeNameKo: "일반 1800mm",
      parameters: { widthMm: 1800, heightMm: 2100 },
    },
    [GENERATED_WINDOW_TYPE]: {
      id: GENERATED_WINDOW_TYPE,
      category: "Windows",
      categoryKo: "창",
      family: "Fixed",
      familyKo: "고정창",
      typeName: `${Math.round(recipe.facade.windowWidth * 1000)} x ${Math.round(recipe.facade.windowHeight * 1000)}mm`,
      typeNameKo: `${Math.round(recipe.facade.windowWidth * 1000)} × ${Math.round(recipe.facade.windowHeight * 1000)}mm`,
      parameters: {
        widthMm: Math.round(recipe.facade.windowWidth * 1000),
        heightMm: Math.round(recipe.facade.windowHeight * 1000),
      },
    },
    [GENERATED_ROOM_TYPE]: {
      id: GENERATED_ROOM_TYPE,
      category: "Rooms",
      categoryKo: "실",
      family: "Room",
      familyKo: "실",
      typeName: "Default",
      typeNameKo: "기본",
      parameters: {},
    },
    [GENERATED_MEP_TYPE]: {
      id: GENERATED_MEP_TYPE,
      category: "Mechanical Equipment",
      categoryKo: "기계 설비",
      family: "MEP Equipment",
      familyKo: "MEP 설비",
      typeName: "Generated",
      typeNameKo: "생성",
      parameters: {},
    },
  };

  for (const family of AUTHORING_FAMILIES) {
    types[family.id] = typeFromAuthoringFamily(family);
  }
  return types;
}

function generatedElements(
  buildingPk: string,
  recipe: BuildingRecipe,
  derived: DerivedTwinElements,
): BimElement[] {
  const elements: BimElement[] = [];

  for (const wall of derived.walls) {
    elements.push({
      id: wall.id,
      origin: "generated",
      kind: "wall",
      category: "Walls",
      family: "Basic Wall",
      typeId: GENERATED_WALL_TYPE,
      buildingPk,
      levelId: levelIdForFloor(wall.floorNo),
      hostId: null,
      mark: wall.id,
      instanceParameters: {
        unconnectedHeightM: wall.height,
        lengthM: wall.length,
        areaM2: wall.area,
        material: wall.material,
      },
      placement: { x: 0, y: 0, z: 0, rotationY: 0 },
      phaseCreated: "existing",
      visible: true,
    });
  }

  for (const opening of derived.openings) {
    const isDoor = opening.type === "door";
    elements.push({
      id: opening.id,
      origin: "generated",
      kind: isDoor ? "door" : "window",
      category: isDoor ? "Doors" : "Windows",
      family: isDoor ? "Single-Flush" : "Fixed",
      typeId: isDoor ? GENERATED_DOOR_TYPE : GENERATED_WINDOW_TYPE,
      buildingPk,
      levelId: levelIdForFloor(opening.floorNo),
      hostId: `W-${opening.floorNo}-S`,
      mark: opening.id,
      instanceParameters: {
        count: opening.count,
        widthMm: Math.round(opening.width * 1000),
        heightMm: Math.round(opening.height * 1000),
        sillHeightMm: isDoor ? 0 : Math.round(recipe.facade.sillHeight * 1000),
        material: opening.material,
      },
      placement: { x: 0, y: 0, z: 0, rotationY: 0 },
      phaseCreated: "existing",
      visible: true,
    });
  }

  for (const room of derived.rooms) {
    elements.push({
      id: room.id,
      origin: "generated",
      kind: "room",
      category: "Rooms",
      family: "Room",
      typeId: GENERATED_ROOM_TYPE,
      buildingPk,
      levelId: levelIdForFloor(room.floorNo),
      hostId: null,
      mark: room.id,
      instanceParameters: {
        number: String(room.floorNo),
        name: room.name,
        areaM2: room.area,
        perimeterM: room.perimeter,
        use: room.use,
      },
      placement: { x: 0, y: 0, z: 0, rotationY: 0 },
      phaseCreated: "existing",
      visible: true,
    });
  }

  for (const mep of derived.mep) {
    elements.push({
      id: mep.id,
      origin: "generated",
      kind: "mep-instance",
      category: "Mechanical Equipment",
      family: mep.equipmentType,
      typeId: GENERATED_MEP_TYPE,
      buildingPk,
      levelId: levelIdForFloor(mep.floorNo),
      hostId: null,
      mark: mep.id,
      instanceParameters: {
        count: mep.count,
        capacity: mep.capacity,
        width: mep.width,
        height: mep.height,
        depth: mep.depth,
        equipmentType: mep.equipmentType,
      },
      placement: { x: 0, y: 0, z: 0, rotationY: 0 },
      phaseCreated: "existing",
      visible: true,
    });
  }

  return elements;
}

export function hydrateBimModel(input: {
  buildingPk: string;
  recipe: BuildingRecipe;
  derived: DerivedTwinElements;
  authoredElements?: BimElement[];
  typeOverrides?: Record<string, Partial<BimType>>;
}): BimModelSnapshot {
  const types = generatedTypes(input.recipe);
  if (input.typeOverrides) {
    for (const [id, patch] of Object.entries(input.typeOverrides)) {
      const base = types[id];
      types[id] = {
        ...(base ?? {
          id,
          category: "Generic",
          categoryKo: "일반",
          family: "Generic",
          familyKo: "일반",
          typeName: id,
          typeNameKo: id,
          parameters: {},
        }),
        ...patch,
        parameters: { ...(base?.parameters ?? {}), ...(patch.parameters ?? {}) },
      };
    }
  }

  const generated = generatedElements(input.buildingPk, input.recipe, input.derived);
  const levels = levelsFromRecipe(input.recipe);
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const authored = (input.authoredElements ?? [])
    .filter((el) => el.buildingPk === input.buildingPk && el.origin === "authored")
    .map((el) => {
      const level = el.levelId ? levelById.get(el.levelId) : undefined;
      if (!level) return el;
      const offsetM = Number(el.instanceParameters.baseOffsetMm ?? 0) / 1000;
      const sillM = Number(el.instanceParameters.sillHeightMm ?? 0) / 1000;
      return {
        ...el,
        placement: { ...el.placement, y: level.elevation + offsetM + sillM },
      };
    });

  return {
    buildingPk: input.buildingPk,
    levels,
    grids: defaultGrids(input.recipe),
    types,
    elements: [...generated, ...authored],
    documents: [],
    visibility: {},
  };
}

export function defaultGrids(recipe: BuildingRecipe): import("./types").BimGrid[] {
  const spacing = Math.max(recipe.column.spacing, 4);
  const grids: import("./types").BimGrid[] = [];
  let i = 0;
  for (let x = -recipe.footprintWidth / 2; x <= recipe.footprintWidth / 2 + 0.01; x += spacing) {
    grids.push({
      id: `grid:x:${i}`,
      name: String.fromCharCode(65 + (i % 26)),
      axis: "x",
      offset: x,
    });
    i += 1;
  }
  let n = 1;
  for (let z = -recipe.footprintDepth / 2; z <= recipe.footprintDepth / 2 + 0.01; z += spacing) {
    grids.push({
      id: `grid:z:${n}`,
      name: String(n),
      axis: "z",
      offset: z,
    });
    n += 1;
  }
  return grids;
}
