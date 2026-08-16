// src/lib/bim/model/graph.ts
// Incremental invalidation: level change → hosted elements → rooms → views.

import type { BimElement, BimLevel, BimModelSnapshot } from "./types";

export type GraphEffect =
  | { kind: "level-moved"; levelId: string }
  | { kind: "hosted-moved"; elementId: string }
  | { kind: "room-updated"; elementId: string }
  | { kind: "type-changed"; typeId: string }
  | { kind: "view-dirty"; viewId: string }
  | { kind: "schedule-dirty" };

export function elementsOnLevel(model: BimModelSnapshot, levelId: string): BimElement[] {
  return model.elements.filter((el) => el.levelId === levelId);
}

export function hostedOn(model: BimModelSnapshot, hostId: string): BimElement[] {
  return model.elements.filter((el) => el.hostId === hostId);
}

/**
 * After a level elevation change, keep hosted instance Y in sync and
 * refresh room height from the new storey height.
 */
export function applyLevelMove(
  model: BimModelSnapshot,
  levels: BimLevel[],
): { model: BimModelSnapshot; effects: GraphEffect[] } {
  const byId = new Map(levels.map((l) => [l.id, l]));
  const effects: GraphEffect[] = [];
  const elements = model.elements.map((el) => {
    if (!el.levelId) return el;
    const level = byId.get(el.levelId);
    if (!level) return el;

    if (el.kind === "room") {
      effects.push({ kind: "room-updated", elementId: el.id });
      return {
        ...el,
        instanceParameters: {
          ...el.instanceParameters,
          unconnectedHeightM: level.height,
        },
        placement: { ...el.placement, y: level.elevation },
      };
    }

    if (el.origin === "authored") {
      effects.push({ kind: "hosted-moved", elementId: el.id });
      const offsetM = Number(el.instanceParameters.baseOffsetMm ?? 0) / 1000;
      const sillM = Number(el.instanceParameters.sillHeightMm ?? 0) / 1000;
      return {
        ...el,
        placement: { ...el.placement, y: level.elevation + offsetM + sillM },
      };
    }
    return el;
  });

  for (const level of levels) {
    effects.push({ kind: "level-moved", levelId: level.id });
    effects.push({ kind: "view-dirty", viewId: level.associatedViewId });
  }
  effects.push({ kind: "schedule-dirty" });

  return { model: { ...model, levels, elements }, effects };
}

export function applyTypeParameterChange(
  model: BimModelSnapshot,
  typeId: string,
  name: string,
  value: string | number | boolean,
): { model: BimModelSnapshot; effects: GraphEffect[] } {
  const current = model.types[typeId];
  if (!current) return { model, effects: [] };
  const types = {
    ...model.types,
    [typeId]: {
      ...current,
      parameters: { ...current.parameters, [name]: value },
    },
  };
  return {
    model: { ...model, types },
    effects: [{ kind: "type-changed", typeId }, { kind: "schedule-dirty" }],
  };
}
