// src/lib/generative/blueprint/builders.ts
//
// Ergonomic constructors for the native schematic editor. Every helper is pure
// and returns a NEW spec — the editor's undo stack stores snapshots, so
// mutating in place would silently rewrite history.
//
// Everything these produce is USER_PROVIDED at confidence 1: the user drew it.
// A reader that INFERS geometry from an image builds the same structures with
// its own provenance instead, which is exactly why provenance is a value on the
// field rather than a flag on the spec.
//
// Determinism: no Math.random, no Date.now. Ids come from the caller; the only
// derived id is the blueprint's own, slugged from its name.

import type { Provenanced, SpaceType } from "../spec/building-spec";
import type {
  AnchorKind,
  BlueprintBoundary,
  BlueprintPlacement,
  BlueprintSpec,
  BoundaryLoop,
  CirculationEdge,
  CirculationNode,
  CoreIntent,
  CurveSegment,
  DesignAnchor,
  FidelityMode,
  Hold,
  PointMm,
  Region,
  SchematicPlacementTool,
  SpatialZone,
  VoidIntent,
} from "./blueprint-spec";
import { blueprintPlacements } from "./blueprint-spec";

type BoundaryRole = BlueprintBoundary["role"];
type VoidKind = VoidIntent["kind"]["value"];
type CoreContent = CoreIntent["contents"][number];
type CirculationNodeKind = CirculationNode["kind"];
type EdgeGeometry = CirculationEdge["geometry"];

/** Provenance stamp for anything the user drew. */
export function userValue<T>(
  value: T,
  reason = "Drawn by the user in the schematic editor.",
): Provenanced<T> {
  return { value, source: "USER_PROVIDED", confidence: 1, reason };
}

const point = (xMm: number, zMm: number): PointMm => ({
  xMm: Math.round(xMm),
  zMm: Math.round(zMm),
});

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "blueprint";
}

/* ------------------------------------------------------------------ */
/* Loops                                                               */
/* ------------------------------------------------------------------ */

function chainLines(points: PointMm[]): CurveSegment[] {
  const segments: CurveSegment[] = [];
  for (let i = 0; i < points.length; i += 1) {
    segments.push({
      kind: "line",
      startMm: points[i],
      endMm: points[(i + 1) % points.length],
    });
  }
  return segments;
}

/**
 * Axis-aligned rectangle from its minimum corner. Wound counter-clockwise in
 * the XZ plane so every loop this module produces has one consistent winding.
 */
export function makeRectLoop(
  id: string,
  rect: { xMm: number; zMm: number; widthMm: number; depthMm: number },
): BoundaryLoop {
  const { xMm, zMm, widthMm, depthMm } = rect;
  return {
    id,
    segments: chainLines([
      point(xMm, zMm),
      point(xMm + widthMm, zMm),
      point(xMm + widthMm, zMm + depthMm),
      point(xMm, zMm + depthMm),
    ]),
  };
}

/**
 * Closed loop through the given points. The closing segment back to the first
 * point is added here, so callers must NOT repeat it.
 */
export function makePolyLoop(id: string, points: readonly PointMm[]): BoundaryLoop {
  if (points.length < 3) {
    throw new Error(`makePolyLoop("${id}") needs at least 3 points.`);
  }
  return { id, segments: chainLines(points.map((p) => point(p.xMm, p.zMm))) };
}

/* ------------------------------------------------------------------ */
/* Spec construction                                                   */
/* ------------------------------------------------------------------ */

/** A valid, empty blueprint in "guided" fidelity — the editor's starting page. */
export function emptyBlueprint(name: string): BlueprintSpec {
  return {
    schemaVersion: 1,
    id: slugify(name),
    name,
    source: "native-editor",
    coordinateSystem: {
      units: "mm",
      sourceScaleRatio: userValue(1, "Authored natively in millimetres."),
      method: "native",
      calibrated: true,
      calibrationConfidence: 1,
    },
    fidelityMode: "guided",
    fidelityOverrides: [],
    boundaries: [],
    voids: [],
    cores: [],
    anchors: [],
    axes: [],
    circulation: { nodes: [], edges: [] },
    zones: [],
    gridSystems: [],
    verticalRules: [],
    facadeRules: [],
    relationships: [],
    dimensions: [],
    placements: [],
    assumptions: [],
    uncertainty: [],
  };
}

export function addBoundary(
  spec: BlueprintSpec,
  input: {
    loop: BoundaryLoop;
    floorNos: number[];
    role?: BoundaryRole;
    fidelity?: FidelityMode;
  },
): BlueprintSpec {
  const boundary: BlueprintBoundary = {
    loop: input.loop,
    floorNos: [...input.floorNos],
    role: input.role ?? "outline",
    ...(input.fidelity ? { fidelity: input.fidelity } : {}),
  };
  return { ...spec, boundaries: [...spec.boundaries, boundary] };
}

export function addVoid(
  spec: BlueprintSpec,
  input: {
    id: string;
    kind: VoidKind;
    region: Region;
    floorNos: number[];
    label?: string;
  },
): BlueprintSpec {
  const item: VoidIntent = {
    id: input.id,
    kind: userValue(input.kind),
    region: input.region,
    floorNos: [...input.floorNos],
    ...(input.label ? { label: input.label } : {}),
  };
  return { ...spec, voids: [...spec.voids, item] };
}

export function addCore(
  spec: BlueprintSpec,
  input: {
    id: string;
    region: Region;
    floorNos: number[];
    hold?: Hold;
    contents?: CoreContent[];
    label?: string;
  },
): BlueprintSpec {
  const item: CoreIntent = {
    id: input.id,
    region: input.region,
    hold: input.hold ?? { mode: "hard" },
    floorNos: [...input.floorNos],
    contents: [...(input.contents ?? [])],
    ...(input.label ? { label: input.label } : {}),
  };
  return { ...spec, cores: [...spec.cores, item] };
}

export function addAnchor(
  spec: BlueprintSpec,
  input: {
    id: string;
    kind: AnchorKind;
    positionMm: PointMm;
    /** Defaults to hard — a drawn anchor is a decision until softened. */
    hold?: Hold;
    floorNos?: number[];
    label?: string;
  },
): BlueprintSpec {
  const item: DesignAnchor = {
    id: input.id,
    kind: userValue(input.kind),
    positionMm: point(input.positionMm.xMm, input.positionMm.zMm),
    hold: input.hold ?? { mode: "hard" },
    floorNos: [...(input.floorNos ?? [])],
    ...(input.label ? { label: input.label } : {}),
  };
  return { ...spec, anchors: [...spec.anchors, item] };
}

export function addZone(
  spec: BlueprintSpec,
  input: {
    id: string;
    program: SpaceType;
    region: Region;
    floorNos: number[];
    memberIds?: string[];
    fidelity?: FidelityMode;
    label?: string;
  },
): BlueprintSpec {
  const item: SpatialZone = {
    id: input.id,
    program: userValue(input.program),
    region: input.region,
    floorNos: [...input.floorNos],
    memberIds: [...(input.memberIds ?? [])],
    ...(input.fidelity ? { fidelity: input.fidelity } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
  return { ...spec, zones: [...spec.zones, item] };
}

export function addCirculationNode(
  spec: BlueprintSpec,
  input: {
    id: string;
    kind: CirculationNodeKind;
    positionMm: PointMm;
    floorNos?: number[];
  },
): BlueprintSpec {
  const node: CirculationNode = {
    id: input.id,
    kind: input.kind,
    positionMm: point(input.positionMm.xMm, input.positionMm.zMm),
    floorNos: [...(input.floorNos ?? [])],
  };
  return {
    ...spec,
    circulation: { ...spec.circulation, nodes: [...spec.circulation.nodes, node] },
  };
}

export function addCirculationEdge(
  spec: BlueprintSpec,
  input: {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    kind?: CirculationEdge["kind"];
    geometry?: EdgeGeometry;
    widthMm?: number;
  },
): BlueprintSpec {
  const edge: CirculationEdge = {
    id: input.id,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    kind: input.kind ?? "horizontal",
    geometry: input.geometry ?? { mode: "direct" },
    ...(input.widthMm === undefined ? {} : { widthMm: Math.round(input.widthMm) }),
  };
  return {
    ...spec,
    circulation: { ...spec.circulation, edges: [...spec.circulation.edges, edge] },
  };
}

export function addPlacement(
  spec: BlueprintSpec,
  input: {
    id: string;
    familyId: string;
    tool: SchematicPlacementTool;
    positionMm: PointMm;
    floorNos: number[];
    rotationRad?: number;
  },
): BlueprintSpec {
  const item: BlueprintPlacement = {
    id: input.id,
    familyId: input.familyId,
    tool: input.tool,
    positionMm: point(input.positionMm.xMm, input.positionMm.zMm),
    rotationRad: input.rotationRad ?? 0,
    floorNos: [...input.floorNos],
  };
  return {
    ...spec,
    placements: [...blueprintPlacements(spec), item],
  };
}
