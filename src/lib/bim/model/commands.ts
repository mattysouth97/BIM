// src/lib/bim/model/commands.ts
// Domain services — UI and future AI agents call these, not stores directly.

import { createElementId, type ElementKind } from "../element-id";
import { getAuthoringFamily } from "../family-catalog";
import { applyLevelMove, applyTypeParameterChange, type GraphEffect } from "./graph";
import { moveLevelElevation, renameLevel } from "./levels";
import { typeFromAuthoringFamily } from "./parameters";
import { wallAxis, rectangleFromCorners, type Xz } from "./geometry";
import { nearestWall } from "./snap";
import { familySemantics } from "../family-semantics";
import type {
  BimDocumentItem,
  BimElement,
  BimKind,
  BimModelSnapshot,
  BimParamValue,
  BimPlacement,
} from "./types";

export interface CommandResult {
  model: BimModelSnapshot;
  effects: GraphEffect[];
  recipeFloorEdits?: Record<string, { height?: number }>;
}

export function setTypeParameter(
  model: BimModelSnapshot,
  typeId: string,
  name: string,
  value: BimParamValue,
): CommandResult {
  const next = applyTypeParameterChange(model, typeId, name, value);
  return { model: next.model, effects: next.effects };
}

export function setInstanceParameter(
  model: BimModelSnapshot,
  elementId: string,
  name: string,
  value: BimParamValue,
): CommandResult {
  const elements = model.elements.map((el) =>
    el.id === elementId
      ? { ...el, instanceParameters: { ...el.instanceParameters, [name]: value }, mark: name === "mark" ? String(value) : el.mark }
      : el,
  );
  return {
    model: { ...model, elements },
    effects: [{ kind: "schedule-dirty" }],
  };
}

export function changeElementType(
  model: BimModelSnapshot,
  elementId: string,
  typeId: string,
): CommandResult {
  const type = model.types[typeId];
  if (!type) return { model, effects: [] };
  const elements = model.elements.map((el) =>
    el.id === elementId ? { ...el, typeId, family: type.family, category: type.category } : el,
  );
  return {
    model: { ...model, elements },
    effects: [{ kind: "type-changed", typeId }, { kind: "schedule-dirty" }],
  };
}

export function setLevelElevation(
  model: BimModelSnapshot,
  levelId: string,
  elevation: number,
): CommandResult {
  const moved = moveLevelElevation(model.levels, levelId, elevation);
  const applied = applyLevelMove(model, moved.levels);
  return {
    model: applied.model,
    effects: applied.effects,
    recipeFloorEdits: moved.floorEdits,
  };
}

export function setLevelName(
  model: BimModelSnapshot,
  levelId: string,
  name: string,
): CommandResult {
  return {
    model: { ...model, levels: renameLevel(model.levels, levelId, name) },
    effects: [{ kind: "level-moved", levelId }],
  };
}

export function placeInstance(input: {
  model: BimModelSnapshot;
  typeId: string;
  buildingPk: string;
  levelId: string | null;
  hostId: string | null;
  placement: BimPlacement;
  mark?: string;
}): CommandResult {
  const type =
    input.model.types[input.typeId] ??
    (() => {
      const family = getAuthoringFamily(input.typeId);
      return family ? typeFromAuthoringFamily(family) : undefined;
    })();
  if (!type) return { model: input.model, effects: [] };

  const kind = kindFromCategory(type.category);
  const id = String(createElementId(toElementKind(kind)));
  const mark = input.mark ?? nextMark(input.model, kind);

  const semantics = familySemantics(type.id);
  const element: BimElement = {
    id,
    origin: "authored",
    kind,
    category: type.category,
    family: type.family,
    typeId: type.id,
    buildingPk: input.buildingPk,
    levelId: input.levelId,
    hostId: input.hostId,
    mark,
    instanceParameters: {
      mark,
      sillHeightMm: kind === "window" ? 900 : 0,
      baseOffsetMm: 0,
      hand: kind === "door" ? "left" : "",
      facing: kind === "door" || kind === "window" ? "out" : "",
    },
    placement: input.placement,
    phaseCreated: "new",
    visible: true,
    ifcClass: semantics?.ifcClass ?? type.ifcClass,
    emsTag: semantics?.emsCapable ? `${mark}` : undefined,
    assetId: semantics?.emsCapable ? `ASSET-${mark}` : undefined,
    connectors: semantics?.connectors.map((c) => ({
      id: c.id,
      system: c.system,
      direction: c.direction,
    })),
  };

  const types = input.model.types[type.id]
    ? input.model.types
    : { ...input.model.types, [type.id]: type };

  return {
    model: { ...input.model, types, elements: [...input.model.elements, element] },
    effects: [{ kind: "schedule-dirty" }],
  };
}

export function deleteInstance(model: BimModelSnapshot, elementId: string): CommandResult {
  const target = model.elements.find((el) => el.id === elementId);
  if (!target || target.origin !== "authored") return { model, effects: [] };
  return {
    model: { ...model, elements: model.elements.filter((el) => el.id !== elementId && el.hostId !== elementId) },
    effects: [{ kind: "schedule-dirty" }],
  };
}

export function duplicateType(model: BimModelSnapshot, typeId: string, typeName: string): CommandResult {
  const source = model.types[typeId];
  if (!source) return { model, effects: [] };
  const id = `${typeId}__copy_${Object.keys(model.types).length}`;
  const copy = { ...source, id, typeName, typeNameKo: typeName };
  return {
    model: { ...model, types: { ...model.types, [id]: copy } },
    effects: [{ kind: "type-changed", typeId: id }],
  };
}

function toElementKind(kind: BimKind): ElementKind {
  switch (kind) {
    case "wall":
    case "door":
    case "window":
    case "column":
    case "slab":
    case "mep-instance":
    case "annotation":
    case "level":
    case "grid":
      return kind;
    default:
      return "annotation";
  }
}

export function createWall(input: {
  model: BimModelSnapshot;
  typeId: string;
  buildingPk: string;
  levelId: string | null;
  start: Xz;
  end: Xz;
  heightM: number;
}): CommandResult {
  const axis = wallAxis(input.start, input.end);
  if (axis.length < 0.1) return { model: input.model, effects: [] };
  const placed = placeInstance({
    model: input.model,
    typeId: input.typeId,
    buildingPk: input.buildingPk,
    levelId: input.levelId,
    hostId: null,
    placement: { x: input.start.x, y: 0, z: input.start.z, rotationY: axis.headingY },
  });
  const created = placed.model.elements.find(
    (el) => el.origin === "authored" && !input.model.elements.some((b) => b.id === el.id),
  );
  if (!created) return placed;
  const elements = placed.model.elements.map((el) =>
    el.id === created.id
      ? {
          ...el,
          instanceParameters: {
            ...el.instanceParameters,
            startX: input.start.x,
            startZ: input.start.z,
            endX: input.end.x,
            endZ: input.end.z,
            lengthM: Math.round(axis.length * 100) / 100,
            unconnectedHeightM: input.heightM,
            scaleX: axis.length,
            scaleY: input.heightM / 3,
            scaleZ: 1,
          },
        }
      : el,
  );
  return { model: { ...placed.model, elements }, effects: placed.effects };
}

export function createFloorSketch(input: {
  model: BimModelSnapshot;
  typeId: string;
  buildingPk: string;
  levelId: string | null;
  a: Xz;
  b: Xz;
}): CommandResult {
  const rect = rectangleFromCorners(input.a, input.b);
  if (rect.area < 0.25) return { model: input.model, effects: [] };
  const placed = placeInstance({
    model: input.model,
    typeId: input.typeId,
    buildingPk: input.buildingPk,
    levelId: input.levelId,
    hostId: null,
    placement: {
      x: (rect.min.x + rect.max.x) / 2,
      y: 0,
      z: (rect.min.z + rect.max.z) / 2,
      rotationY: 0,
    },
  });
  const created = placed.model.elements.find(
    (el) => el.origin === "authored" && !input.model.elements.some((b) => b.id === el.id),
  );
  if (!created) return placed;
  const elements = placed.model.elements.map((el) =>
    el.id === created.id
      ? {
          ...el,
          instanceParameters: {
            ...el.instanceParameters,
            widthM: rect.width,
            depthM: rect.depth,
            areaM2: Math.round(rect.area * 100) / 100,
            scaleX: rect.width,
            scaleY: 1,
            scaleZ: rect.depth,
          },
        }
      : el,
  );
  return { model: { ...placed.model, elements }, effects: placed.effects };
}

export function hostOnNearestWall(input: {
  model: BimModelSnapshot;
  typeId: string;
  buildingPk: string;
  levelId: string | null;
  point: Xz;
  y: number;
}): CommandResult {
  const walls = input.model.elements.filter(
    (el) => el.kind === "wall" && (!input.levelId || el.levelId === input.levelId),
  );
  const hit = nearestWall(input.point, walls);
  const host = hit?.wall;
  const point = hit?.point ?? input.point;
  const heading = host
    ? Number(host.placement.rotationY)
    : 0;
  return placeInstance({
    model: input.model,
    typeId: input.typeId,
    buildingPk: input.buildingPk,
    levelId: input.levelId ?? host?.levelId ?? null,
    hostId: host?.id ?? null,
    placement: { x: point.x, y: input.y, z: point.z, rotationY: heading },
  });
}

export function flipHosted(model: BimModelSnapshot, elementId: string, field: "hand" | "facing"): CommandResult {
  const el = model.elements.find((e) => e.id === elementId);
  if (!el) return { model, effects: [] };
  const current = String(el.instanceParameters[field] ?? "left");
  const next =
    field === "hand"
      ? current === "left" ? "right" : "left"
      : current === "out" ? "in" : "out";
  return setInstanceParameter(model, elementId, field, next);
}

export function addDocument(model: BimModelSnapshot, item: BimDocumentItem): CommandResult {
  return {
    model: { ...model, documents: [...(model.documents ?? []), item] },
    effects: [{ kind: "schedule-dirty" }],
  };
}

export function hideInView(
  model: BimModelSnapshot,
  viewId: string,
  payload: { elementId?: string; category?: string },
): CommandResult {
  const current = model.visibility[viewId] ?? { hiddenIds: [], hiddenCategories: [], isolatedIds: [] };
  const visibility = {
    ...model.visibility,
    [viewId]: {
      ...current,
      hiddenIds: payload.elementId && !current.hiddenIds.includes(payload.elementId)
        ? [...current.hiddenIds, payload.elementId]
        : current.hiddenIds,
      hiddenCategories:
        payload.category && !current.hiddenCategories.includes(payload.category)
          ? [...current.hiddenCategories, payload.category]
          : current.hiddenCategories,
    },
  };
  return { model: { ...model, visibility }, effects: [] };
}

function kindFromCategory(category: string): BimKind {
  if (category === "Walls" || category === "Curtain Wall Mullions" || category === "Curtain Panels") return "wall";
  if (category === "Doors") return "door";
  if (category === "Windows") return "window";
  if (category === "Floors") return "slab";
  if (category === "Roofs") return "roof";
  if (category === "Ceilings") return "ceiling";
  if (category === "Columns" || category === "Structural Columns") return "column";
  if (category === "Structural Framing") return "beam";
  if (category === "Rooms") return "room";
  if (category === "Lighting Fixtures") return "lighting";
  if (category === "Furniture" || category === "Casework") return "furniture";
  if (category.includes("Equipment") || category.includes("Plumbing") || category.includes("Fire") || category.includes("BEMS")) return "mep-instance";
  return "annotation";
}

function nextMark(model: BimModelSnapshot, kind: BimKind): string {
  const prefix =
    kind === "door" ? "D" :
    kind === "window" ? "W" :
    kind === "wall" ? "WA" :
    kind === "column" ? "C" :
    kind === "room" ? "R" :
    "E";
  const n = model.elements.filter((el) => el.kind === kind && el.origin === "authored").length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
