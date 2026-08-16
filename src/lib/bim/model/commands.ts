// src/lib/bim/model/commands.ts
// Domain services — UI and future AI agents call these, not stores directly.

import { createElementId, type ElementKind } from "../element-id";
import { getAuthoringFamily } from "../family-catalog";
import { applyLevelMove, applyTypeParameterChange, type GraphEffect } from "./graph";
import { moveLevelElevation, renameLevel } from "./levels";
import { typeFromAuthoringFamily } from "./parameters";
import type {
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
    instanceParameters: { mark, sillHeightMm: kind === "window" ? 900 : 0, baseOffsetMm: 0 },
    placement: input.placement,
    phaseCreated: "new",
    visible: true,
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

function kindFromCategory(category: string): BimKind {
  if (category === "Walls" || category === "Curtain Wall Mullions" || category === "Curtain Panels") return "wall";
  if (category === "Doors") return "door";
  if (category === "Windows") return "window";
  if (category === "Floors") return "slab";
  if (category === "Roofs") return "roof";
  if (category === "Ceilings") return "ceiling";
  if (category === "Columns" || category === "Structural Columns") return "column";
  if (category === "Rooms") return "room";
  if (category === "Lighting Fixtures") return "lighting";
  if (category === "Furniture") return "furniture";
  if (category.includes("Equipment") || category.includes("Plumbing")) return "mep-instance";
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
