// src/lib/generative/session/navigation.ts
//
// Semantic navigation (brief §16, §17, §54).
//
// The model is browsed by what things ARE — building, system, level, space —
// not by a flat list of 3,000 element ids. Two things depend on this tree:
//
//   - selection scope: "restudy the core on levels 3–5" only means something if
//     the user can express "the core on levels 3–5" in one click, and the edit
//     request carries it to the reasoning layer as `scope`;
//   - locking: you lock "structure", not 42 individual columns.
//
// Built from the emitted BIM snapshot rather than the spec, because the spec
// declares intent while the snapshot is what actually exists. A program item
// that solved into zero rooms must not appear here as if it were built.

import type { BimElement, BimModelSnapshot, BimSystem } from "@/lib/bim/model/types";
import { parseFloorNoFromLevelId } from "@/lib/bim/model/types";

import type { ModificationScope } from "../client";
import { LOCKABLE_SYSTEMS, SYSTEM_LABEL, levelLock, systemLock } from "./locks";

export interface NavNode {
  /** Stable across rebuilds: derived from identity, never from array position. */
  id: string;
  label: string;
  kind: "building" | "system" | "level" | "category" | "space";
  /** Elements underneath this node. */
  count: number;
  detail?: string;
  children: NavNode[];
  /** What an edit means when this node is selected. */
  scope: ModificationScope;
  /** Present when the node can be locked as a unit. */
  lockToken?: string;
  system?: BimSystem;
  floorNo?: number;
}

/** Element ids per scope are capped: a scope is a description, not a payload. */
const MAX_SCOPE_IDS = 200;
/** Rooms listed individually per level before the list is summarised. */
const MAX_SPACES_PER_LEVEL = 60;

function idsOf(elements: BimElement[]): string[] {
  return elements.slice(0, MAX_SCOPE_IDS).map((e) => e.id);
}

function floorNoOf(element: BimElement): number | null {
  return element.levelId ? parseFloorNoFromLevelId(element.levelId) : null;
}

export function buildNavigationTree(snapshot: BimModelSnapshot): NavNode {
  const elements = snapshot.elements;

  /* --- systems --- */
  const bySystem = new Map<BimSystem, BimElement[]>();
  for (const element of elements) {
    if (!element.system) continue;
    const bucket = bySystem.get(element.system);
    if (bucket) bucket.push(element);
    else bySystem.set(element.system, [element]);
  }

  const systemNodes: NavNode[] = LOCKABLE_SYSTEMS.filter((system) =>
    bySystem.has(system),
  ).map((system) => {
    const members = bySystem.get(system) ?? [];

    const byCategory = new Map<string, BimElement[]>();
    for (const element of members) {
      const bucket = byCategory.get(element.category);
      if (bucket) bucket.push(element);
      else byCategory.set(element.category, [element]);
    }

    const categories: NavNode[] = [...byCategory.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([category, members2]) => ({
        id: `system:${system}/category:${category}`,
        label: category,
        kind: "category" as const,
        count: members2.length,
        children: [],
        system,
        scope: {
          kind: "selection" as const,
          label: `${SYSTEM_LABEL[system]} · ${category}`,
          elementIds: idsOf(members2),
        },
      }));

    return {
      id: `system:${system}`,
      label: SYSTEM_LABEL[system],
      kind: "system" as const,
      count: members.length,
      detail: `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`,
      children: categories,
      system,
      lockToken: systemLock(system),
      scope: {
        kind: "system" as const,
        label: `${SYSTEM_LABEL[system]} system`,
        elementIds: idsOf(members),
      },
    };
  });

  /* --- levels --- */
  const byFloor = new Map<number, BimElement[]>();
  for (const element of elements) {
    const floorNo = floorNoOf(element);
    if (floorNo === null) continue;
    const bucket = byFloor.get(floorNo);
    if (bucket) bucket.push(element);
    else byFloor.set(floorNo, [element]);
  }

  const levelNodes: NavNode[] = [...snapshot.levels]
    // Top-down: the way a level list reads in every BIM tool.
    .sort((a, b) => b.floorNo - a.floorNo)
    .map((level) => {
      const members = byFloor.get(level.floorNo) ?? [];
      const rooms = members.filter((e) => e.kind === "room");

      const spaces: NavNode[] = rooms.slice(0, MAX_SPACES_PER_LEVEL).map((room) => {
        const area = room.instanceParameters.areaM2;
        const name = room.instanceParameters.name;
        return {
          id: `space:${room.id}`,
          label: typeof name === "string" ? name : room.id,
          kind: "space" as const,
          count: 1,
          detail: typeof area === "number" ? `${area.toFixed(1)} m²` : undefined,
          children: [],
          floorNo: level.floorNo,
          scope: {
            kind: "space" as const,
            label: typeof name === "string" ? name : room.id,
            floorNos: [level.floorNo],
            elementIds: [room.id],
          },
        };
      });

      if (rooms.length > MAX_SPACES_PER_LEVEL) {
        spaces.push({
          id: `space-overflow:${level.floorNo}`,
          label: `+${rooms.length - MAX_SPACES_PER_LEVEL} more spaces`,
          kind: "category",
          count: rooms.length - MAX_SPACES_PER_LEVEL,
          children: [],
          floorNo: level.floorNo,
          scope: {
            kind: "level",
            label: level.name,
            floorNos: [level.floorNo],
          },
        });
      }

      return {
        id: `level:${level.floorNo}`,
        label: level.name,
        kind: "level" as const,
        count: members.length,
        detail: `${rooms.length} space${rooms.length === 1 ? "" : "s"} · ${level.elevation.toFixed(1)} m`,
        children: spaces,
        floorNo: level.floorNo,
        lockToken: levelLock(level.floorNo),
        scope: {
          kind: "level" as const,
          label: level.name,
          floorNos: [level.floorNo],
        },
      };
    });

  return {
    id: "building",
    label: "Whole building",
    kind: "building",
    count: elements.length,
    detail: `${snapshot.levels.length} levels · ${elements.length.toLocaleString()} elements`,
    scope: { kind: "building", label: "Whole building" },
    children: [
      {
        id: "group:systems",
        label: "Systems",
        kind: "category",
        count: systemNodes.reduce((sum, node) => sum + node.count, 0),
        children: systemNodes,
        scope: { kind: "building", label: "Whole building" },
      },
      {
        id: "group:levels",
        label: "Levels",
        kind: "category",
        count: levelNodes.reduce((sum, node) => sum + node.count, 0),
        children: levelNodes,
        scope: {
          kind: "selection",
          label: "All levels",
          floorNos: snapshot.levels.map((l) => l.floorNo),
        },
      },
    ],
  };
}

/** Depth-first lookup — the tree is small enough that indexing it is overkill. */
export function findNavNode(root: NavNode, id: string): NavNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNavNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Levels a selection covers, for the 3D isolation view. A system selection
 * spans every level, which is why it returns null rather than an empty list —
 * "no restriction" and "nothing" must not look the same to the renderer.
 */
export function isolationFloors(scope: ModificationScope | null): number[] | null {
  if (!scope) return null;
  if (scope.floorNos && scope.floorNos.length > 0) return [...scope.floorNos];
  return null;
}
