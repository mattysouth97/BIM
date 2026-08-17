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

import { getAuthoringFamily, type AuthoringToolId } from "@/lib/bim/family-catalog";
import { resolveParameter } from "@/lib/bim/model/parameters";
import type { BimElement, BimKind, BimModelSnapshot, BimType } from "@/lib/bim/model/types";

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

/** Numeric/string overrides a symbol's evaluation cares about — only the ones present on this element. */
export interface PlanSymbolParams {
  widthMm?: number;
  heightMm?: number;
  hand?: "left" | "right";
  facing?: "in" | "out";
}

/**
 * One placed family, ready for the symbol registry: `symbolFor(familyId)` for
 * an authored element (whose typeId IS the AuthoringFamily id), or the
 * `KIND_TO_TOOL` tool-default for a GENERATED_*-typed element, which has no
 * family id to look up.
 */
export interface PlanSymbolInstance {
  id: string;
  familyId: string | null;
  typeId: string;
  kind: BimKind;
  xMm: number;
  zMm: number;
  rotationRad: number;
  params: PlanSymbolParams;
  /** The host wall's real thickness, when resolvable — sizes a hosted door/window's wall-cut lines. */
  hostWallThicknessMm?: number;
}

export interface LevelPlan {
  rooms: PlanRect[];
  coreParts: PlanRect[];
  walls: PlanLine[];
  columns: PlanColumn[];
  symbols: PlanSymbolInstance[];
  bounds: BoundsMm | null;
}

/**
 * The kinds a plan symbol is drawn for, beyond the room/core/wall/column
 * shapes this file already renders directly. `annotation` elements (tags,
 * dimensions, notes) live in `BimModelSnapshot.documents`, not `elements`,
 * and carry no AuthoringToolId — nothing here to symbolise.
 */
const SYMBOL_KINDS: ReadonlySet<BimKind> = new Set<BimKind>([
  "door",
  "window",
  "furniture",
  "lighting",
  "stair",
  "railing",
  "mep-instance",
]);

/**
 * Tool bucket a GENERATED_*-typed element's kind maps to, so a generated
 * instance (no resolvable AuthoringFamily id) still gets a real tool-default
 * symbol instead of the registry's bare bbox fallback. Authored elements never
 * need this — their typeId already resolves via `getAuthoringFamily`.
 */
export const KIND_TO_TOOL: Partial<Record<BimKind, AuthoringToolId>> = {
  door: "door",
  window: "window",
  furniture: "furniture",
  lighting: "lighting",
  stair: "stair",
  railing: "railing",
  // Generated MEP instances (src/lib/bim/model/hydrate.ts) are always
  // category "Mechanical Equipment" — no finer discrimination is available.
  "mep-instance": "equipment",
};

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

/** First element of kind "wall" with this id, searched across the whole snapshot (a hosted opening's wall need not share its exact filter pass). */
function findWall(snapshot: BimModelSnapshot, wallId: string | null): BimElement | null {
  if (!wallId) return null;
  return snapshot.elements.find((el) => el.id === wallId && el.kind === "wall") ?? null;
}

function symbolParams(kind: BimKind, type: BimType | undefined, element: BimElement): PlanSymbolParams {
  const params: PlanSymbolParams = {};
  const widthMm = resolveParameter(type, element.instanceParameters, "widthMm");
  if (typeof widthMm === "number") params.widthMm = widthMm;
  const heightMm = resolveParameter(type, element.instanceParameters, "heightMm");
  if (typeof heightMm === "number") params.heightMm = heightMm;
  if (kind === "door") {
    const hand = stringParam(element, "hand");
    if (hand === "left" || hand === "right") params.hand = hand;
  }
  if (kind === "door" || kind === "window") {
    const facing = stringParam(element, "facing");
    if (facing === "in" || facing === "out") params.facing = facing;
  }
  return params;
}

/**
 * A door/window's own placement.rotationY is not trustworthy for orientation
 * — generated openings (src/lib/generative/graph/emit.ts) always emit 0
 * regardless of the host wall's heading. The host wall's own rotationY (its
 * run direction) is the real orientation; fall back to the element's own
 * rotation only when no host wall resolves.
 */
function symbolInstance(snapshot: BimModelSnapshot, element: BimElement): PlanSymbolInstance {
  const family = getAuthoringFamily(element.typeId);
  const type = snapshot.types[element.typeId];

  let rotationRad = element.placement.rotationY;
  let hostWallThicknessMm: number | undefined;
  if (element.kind === "door" || element.kind === "window") {
    const host = findWall(snapshot, element.hostId);
    if (host) {
      rotationRad = host.placement.rotationY;
      const thicknessMm = numberParam(host, "thicknessMm");
      if (thicknessMm !== null) hostWallThicknessMm = thicknessMm;
    }
  }

  return {
    id: element.id,
    familyId: family ? family.id : null,
    typeId: element.typeId,
    kind: element.kind,
    xMm: element.placement.x * M_TO_MM,
    zMm: element.placement.z * M_TO_MM,
    rotationRad,
    params: symbolParams(element.kind, type, element),
    ...(hostWallThicknessMm !== undefined ? { hostWallThicknessMm } : {}),
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
  const symbols: PlanSymbolInstance[] = [];

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
      continue;
    }

    if (SYMBOL_KINDS.has(element.kind)) {
      symbols.push(symbolInstance(snapshot, element));
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

  return { rooms, coreParts, walls, columns, symbols, bounds };
}
