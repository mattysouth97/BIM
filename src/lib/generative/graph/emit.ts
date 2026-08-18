// src/lib/generative/graph/emit.ts
//
// GeneratedBuilding (geometry) → BimModelSnapshot (semantic BIM graph).
//
// This is where "Mesh047" would have been, and deliberately is not. Every
// element that comes out of here is a real BIM object with a category, a type,
// a level, host relationships, editable parameters, a building system, an
// explicit dependency list and honest provenance. The BIM graph — not this
// module's output and not the reasoning transcript — is the source of truth.

import {
  GENERATED_CEILING_TYPE,
  GENERATED_DOOR_TYPE,
  GENERATED_FLOOR_TYPE,
  GENERATED_ROOF_TYPE,
  GENERATED_ROOM_TYPE,
  GENERATED_WALL_TYPE,
  GENERATED_WINDOW_TYPE,
  levelIdForFloor,
  type BimElement,
  type BimGrid,
  type BimLevel,
  type BimModelSnapshot,
  type BimSystem,
  type BimType,
} from "@/lib/bim/model/types";

import type { BuildingSpec } from "../spec/building-spec";
import { polygonBounds, ringArea, type Polygon } from "../generate/massing";
import { rectCentre, rectArea, type GeneratedBuilding } from "../generate/types";

const GENERATED_COLUMN_TYPE = "generated-column";
const GENERATED_BEAM_TYPE = "generated-beam";
const GENERATED_STAIR_TYPE = "generated-stair";
const GENERATED_ELEVATOR_TYPE = "generated-elevator";
const GENERATED_SHAFT_TYPE = "generated-shaft";
const GENERATED_CURTAIN_TYPE = "generated-curtain-wall";

export {
  GENERATED_BEAM_TYPE,
  GENERATED_COLUMN_TYPE,
  GENERATED_CURTAIN_TYPE,
  GENERATED_ELEVATOR_TYPE,
  GENERATED_SHAFT_TYPE,
  GENERATED_STAIR_TYPE,
};

export interface EmitInput {
  buildingPk: string;
  generationId: string;
  spec: BuildingSpec;
  building: GeneratedBuilding;
  /** Preserved across regeneration — see `mergeGenerated`. */
  authoredElements?: BimElement[];
}

const round = (n: number, dp = 3) => Number(n.toFixed(dp));

/* ------------------------------------------------------------------ */
/* Plate outlines                                                      */
/* ------------------------------------------------------------------ */

// A slab's own outline, carried into the BIM graph.
//
// Without this the level's real plate stops at the geometry layer: `areaM2`
// alone cannot tell a courtyard ring from a solid rectangle of the same area,
// and holes are never walled (see partitions.ts), so nothing else in the
// snapshot records that the plate has one. `BuildingRecipe` carries the
// footprint for the renderer; the slab element is where the BIM graph carries
// it — the same place IFC keeps a slab's profile.

/** Millimetre resolution: the units the spec is authored in, so no outline the
 *  compiler could produce loses anything on the way through. */
const OUTLINE_DP = 3;

function roundPolygon(polygon: Polygon): [number, number][][] {
  return polygon.map((ring) =>
    ring.map(([x, z]): [number, number] => [round(x, OUTLINE_DP), round(z, OUTLINE_DP)]),
  );
}

function ringPerimeter(ring: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    total += Math.hypot(x2 - x1, z2 - z1);
  }
  return total;
}

/** Shared outline payload for a floor / ceiling / roof that follows a plate. */
function plateOutlineFields(polygon: Polygon, thicknessMm: number) {
  const outline = roundPolygon(polygon);
  const [outer, ...holes] = outline;
  const voidAreaM2 = holes.reduce((sum, hole) => sum + ringArea(hole), 0);
  const bounds =
    outer && outer.length > 0
      ? polygonBounds(outline)
      : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    outline,
    instanceParameters: {
      areaM2: round(Math.max(0, ringArea(outer ?? []) - voidAreaM2), 2),
      thicknessMm,
      outlineJson: JSON.stringify(outline),
      vertexCount: outer?.length ?? 0,
      voidCount: holes.length,
      voidAreaM2: round(voidAreaM2, 2),
      perimeterM: round(ringPerimeter(outer ?? []), 3),
      widthM: round(bounds.maxX - bounds.minX, 3),
      depthM: round(bounds.maxZ - bounds.minZ, 3),
    },
    placement: {
      x: round((bounds.minX + bounds.maxX) / 2),
      y: 0,
      z: round((bounds.minZ + bounds.maxZ) / 2),
      rotationY: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

function generatedTypes(spec: BuildingSpec): Record<string, BimType> {
  const ext = spec.dimensions.exteriorWallMm.value;
  const int = spec.dimensions.interiorWallMm.value;

  return {
    [GENERATED_WALL_TYPE]: {
      id: GENERATED_WALL_TYPE,
      category: "Walls",
      categoryKo: "벽",
      family: "Basic Wall",
      familyKo: "기본 벽",
      typeName: `Exterior ${ext}mm`,
      typeNameKo: `외부 ${ext}mm`,
      parameters: { thicknessMm: ext, structural: true, roomBounding: true },
      layers: ["Structure"],
      ifcClass: "IfcWall",
    },
    "generated-wall-interior": {
      id: "generated-wall-interior",
      category: "Walls",
      categoryKo: "벽",
      family: "Basic Wall",
      familyKo: "기본 벽",
      typeName: `Partition ${int}mm`,
      typeNameKo: `칸막이 ${int}mm`,
      parameters: { thicknessMm: int, structural: false, roomBounding: true },
      ifcClass: "IfcWall",
    },
    [GENERATED_CURTAIN_TYPE]: {
      id: GENERATED_CURTAIN_TYPE,
      category: "Curtain Walls",
      categoryKo: "커튼월",
      family: "Curtain Wall",
      familyKo: "커튼월",
      typeName: "Generated",
      typeNameKo: "생성",
      parameters: { mullionWidthMm: 60 },
      ifcClass: "IfcCurtainWall",
    },
    [GENERATED_FLOOR_TYPE]: {
      id: GENERATED_FLOOR_TYPE,
      category: "Floors",
      categoryKo: "바닥",
      family: "Floor",
      familyKo: "바닥",
      typeName: `Slab ${spec.structure.slabThicknessMm.value}mm`,
      typeNameKo: `슬래브 ${spec.structure.slabThicknessMm.value}mm`,
      parameters: { thicknessMm: spec.structure.slabThicknessMm.value },
      ifcClass: "IfcSlab",
    },
    [GENERATED_CEILING_TYPE]: {
      id: GENERATED_CEILING_TYPE,
      category: "Ceilings",
      categoryKo: "천장",
      family: "Compound Ceiling",
      familyKo: "복합 천장",
      typeName: "Gypsum 15mm",
      typeNameKo: "석고 15mm",
      parameters: { thicknessMm: 15 },
      ifcClass: "IfcCovering",
    },
    [GENERATED_ROOF_TYPE]: {
      id: GENERATED_ROOF_TYPE,
      category: "Roofs",
      categoryKo: "지붕",
      family: "Basic Roof",
      familyKo: "기본 지붕",
      typeName: spec.roof.type.value === "flat" ? "Warm Roof – Flat" : "Basic Roof",
      typeNameKo: spec.roof.type.value === "flat" ? "평지붕" : "기본 지붕",
      parameters: { thicknessMm: spec.structure.slabThicknessMm.value },
      ifcClass: "IfcRoof",
    },
    [GENERATED_COLUMN_TYPE]: {
      id: GENERATED_COLUMN_TYPE,
      category: "Structural Columns",
      categoryKo: "구조 기둥",
      family: "Rectangular Column",
      familyKo: "사각 기둥",
      typeName: `${spec.structure.columnMm.value}×${spec.structure.columnMm.value}mm`,
      typeNameKo: `${spec.structure.columnMm.value}×${spec.structure.columnMm.value}mm`,
      parameters: {
        widthMm: spec.structure.columnMm.value,
        depthMm: spec.structure.columnMm.value,
      },
      ifcClass: "IfcColumn",
    },
    [GENERATED_BEAM_TYPE]: {
      id: GENERATED_BEAM_TYPE,
      category: "Structural Framing",
      categoryKo: "구조 부재",
      family: "Beam",
      familyKo: "보",
      typeName: `Beam ${spec.structure.beamDepthMm.value}mm`,
      typeNameKo: `보 ${spec.structure.beamDepthMm.value}mm`,
      parameters: { depthMm: spec.structure.beamDepthMm.value },
      ifcClass: "IfcBeam",
    },
    [GENERATED_DOOR_TYPE]: {
      id: GENERATED_DOOR_TYPE,
      category: "Doors",
      categoryKo: "문",
      family: "Single-Flush",
      familyKo: "단여닫이",
      typeName: `${spec.dimensions.doorWidthMm.value}×${spec.dimensions.doorHeightMm.value}mm`,
      typeNameKo: `${spec.dimensions.doorWidthMm.value}×${spec.dimensions.doorHeightMm.value}mm`,
      parameters: {
        widthMm: spec.dimensions.doorWidthMm.value,
        heightMm: spec.dimensions.doorHeightMm.value,
      },
      ifcClass: "IfcDoor",
    },
    [GENERATED_WINDOW_TYPE]: {
      id: GENERATED_WINDOW_TYPE,
      category: "Windows",
      categoryKo: "창",
      family: "Fixed",
      familyKo: "고정창",
      typeName: "Generated",
      typeNameKo: "생성",
      parameters: {},
      ifcClass: "IfcWindow",
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
      ifcClass: "IfcSpace",
    },
    [GENERATED_STAIR_TYPE]: {
      id: GENERATED_STAIR_TYPE,
      category: "Stairs",
      categoryKo: "계단",
      family: "Stair",
      familyKo: "계단",
      typeName: "Generated",
      typeNameKo: "생성",
      parameters: {},
      ifcClass: "IfcStair",
    },
    [GENERATED_ELEVATOR_TYPE]: {
      id: GENERATED_ELEVATOR_TYPE,
      category: "Specialty Equipment",
      categoryKo: "특수 장비",
      family: "Elevator",
      familyKo: "승강기",
      typeName: "Passenger",
      typeNameKo: "승객용",
      parameters: {},
      ifcClass: "IfcTransportElement",
    },
    [GENERATED_SHAFT_TYPE]: {
      id: GENERATED_SHAFT_TYPE,
      category: "Shafts",
      categoryKo: "샤프트",
      family: "Shaft",
      familyKo: "샤프트",
      typeName: "Generated",
      typeNameKo: "생성",
      parameters: {},
      ifcClass: "IfcSpace",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

function base(input: {
  id: string;
  kind: BimElement["kind"];
  category: string;
  family: string;
  typeId: string;
  buildingPk: string;
  generationId: string;
  system: BimSystem;
  floorNo: number | null;
  dependsOn: string[];
}): Omit<BimElement, "instanceParameters" | "placement"> {
  return {
    id: input.id,
    origin: "generated",
    kind: input.kind,
    category: input.category,
    family: input.family,
    typeId: input.typeId,
    buildingPk: input.buildingPk,
    levelId: input.floorNo === null ? null : levelIdForFloor(input.floorNo),
    hostId: null,
    mark: input.id,
    phaseCreated: "new",
    visible: true,
    system: input.system,
    locked: false,
    dependsOn: input.dependsOn,
    generationSource: {
      type: "GENERATED",
      generationId: input.generationId,
      version: 1,
    },
  };
}

export function emitElements(input: EmitInput): BimElement[] {
  const { buildingPk, generationId, spec, building } = input;
  const elements: BimElement[] = [];
  const mk = (
    id: string,
    kind: BimElement["kind"],
    category: string,
    family: string,
    typeId: string,
    system: BimSystem,
    floorNo: number | null,
    dependsOn: string[],
  ) =>
    base({
      id,
      kind,
      category,
      family,
      typeId,
      buildingPk,
      generationId,
      system,
      floorNo,
      dependsOn,
    });

  /* --- slabs, ceilings, roof --- */
  // Floors, ceilings and the roof share one outline contract: the level's
  // plate in world XZ metres, the same rings `BuildingRecipe.footprintPolygon`
  // uses. That is what lets the 3D envelope mount to the schematic instead of
  // a bounding-box stand-in.
  const ceilingThicknessMm = 15;
  const plenumMm = spec.mep.ceilingPlenumMm;
  const levelByFloor = new Map(building.levels.map((level) => [level.floorNo, level]));

  for (const slab of building.slabs) {
    const plate = plateOutlineFields(slab.polygon, Math.round(slab.thicknessM * 1000));
    elements.push({
      ...mk(
        slab.id,
        "slab",
        "Floors",
        "Floor",
        GENERATED_FLOOR_TYPE,
        "structure",
        slab.floorNo,
        [levelIdForFloor(slab.floorNo)],
      ),
      instanceParameters: {
        ...plate.instanceParameters,
        areaM2: round(slab.areaSqm, 2),
      },
      placement: plate.placement,
    });

    const level = levelByFloor.get(slab.floorNo);
    if (level && level.usage !== "roof") {
      const heightAboveFloorMm = Math.max(
        0,
        Math.round(level.heightM * 1000) - plenumMm,
      );
      const ceiling = plateOutlineFields(slab.polygon, ceilingThicknessMm);
      elements.push({
        ...mk(
          `ceil:${slab.id}`,
          "ceiling",
          "Ceilings",
          "Compound Ceiling",
          GENERATED_CEILING_TYPE,
          "envelope",
          slab.floorNo,
          [levelIdForFloor(slab.floorNo), slab.id],
        ),
        instanceParameters: {
          ...ceiling.instanceParameters,
          plenumMm,
          heightAboveFloorMm,
        },
        placement: ceiling.placement,
      });
    }
  }

  const topLevel = building.levels
    .filter((level) => level.floorNo > 0 && level.usage !== "roof")
    .reduce<(typeof building.levels)[number] | null>(
      (best, level) => (!best || level.floorNo > best.floorNo ? level : best),
      null,
    );
  const topSlab = topLevel
    ? building.slabs.find((slab) => slab.floorNo === topLevel.floorNo)
    : undefined;
  if (topLevel && topSlab) {
    const roof = plateOutlineFields(
      topSlab.polygon,
      spec.structure.slabThicknessMm.value,
    );
    elements.push({
      ...mk(
        `roof:${topSlab.id}`,
        "roof",
        "Roofs",
        "Basic Roof",
        GENERATED_ROOF_TYPE,
        "roof",
        topLevel.floorNo,
        [levelIdForFloor(topLevel.floorNo), topSlab.id],
      ),
      instanceParameters: roof.instanceParameters,
      placement: roof.placement,
    });
  }

  /* --- rooms (spaces) --- */
  for (const space of building.spaces) {
    const [cx, cz] = rectCentre(space.rect);
    elements.push({
      ...mk(
        space.id,
        "room",
        "Rooms",
        "Room",
        GENERATED_ROOM_TYPE,
        space.isCirculation ? "circulation" : "partitions",
        space.floorNo,
        [levelIdForFloor(space.floorNo)],
      ),
      instanceParameters: {
        name: space.label,
        number: `${space.floorNo}.${space.id.slice(-3)}`,
        spaceType: space.type,
        areaM2: round(space.areaSqm, 2),
        widthM: round(space.rect.maxX - space.rect.minX, 2),
        depthM: round(space.rect.maxZ - space.rect.minZ, 2),
        programId: space.programId,
        isCirculation: space.isCirculation,
        hasExteriorWall: space.hasExteriorWall,
        // Surfaced so an inaccessible room is visible in Properties, not only
        // in the validation panel.
        accessible: space.reachable,
      },
      placement: { x: round(cx), y: 0, z: round(cz), rotationY: 0 },
    });
  }

  /* --- walls --- */
  for (const wall of building.walls) {
    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    const length = Math.hypot(ex - sx, ez - sz);
    const isExterior = wall.role === "exterior";
    const side = wall.side
      ? spec.facade.sides.find((s) => s.side === wall.side)
      : undefined;
    const isCurtain = isExterior && side?.system === "curtain-wall";

    elements.push({
      ...mk(
        wall.id,
        "wall",
        isCurtain ? "Curtain Walls" : "Walls",
        isCurtain ? "Curtain Wall" : "Basic Wall",
        isCurtain
          ? GENERATED_CURTAIN_TYPE
          : isExterior || wall.role === "core"
            ? GENERATED_WALL_TYPE
            : "generated-wall-interior",
        isExterior ? "envelope" : wall.role === "core" ? "core" : "partitions",
        wall.floorNo,
        [levelIdForFloor(wall.floorNo), ...wall.boundsSpaceIds],
      ),
      boundsSpaceIds: wall.boundsSpaceIds,
      instanceParameters: {
        lengthM: round(length, 3),
        unconnectedHeightM: round(wall.heightM, 3),
        thicknessMm: Math.round(wall.thicknessM * 1000),
        areaM2: round(length * wall.heightM, 2),
        role: wall.role,
        exterior: isExterior,
        structural: isExterior || wall.role === "core",
        startX: round(sx),
        startZ: round(sz),
        endX: round(ex),
        endZ: round(ez),
        ...(wall.side ? { facadeSide: wall.side } : {}),
      },
      placement: {
        x: round((sx + ex) / 2),
        y: 0,
        z: round((sz + ez) / 2),
        rotationY: round(Math.atan2(ez - sz, ex - sx), 4),
      },
    });
  }

  /* --- openings, hosted on their wall --- */
  for (const opening of building.openings) {
    const isDoor = opening.kind === "door";
    elements.push({
      ...mk(
        opening.id,
        isDoor ? "door" : "window",
        isDoor ? "Doors" : "Windows",
        isDoor ? "Single-Flush" : "Fixed",
        isDoor ? GENERATED_DOOR_TYPE : GENERATED_WINDOW_TYPE,
        "openings",
        opening.floorNo,
        [opening.hostWallId],
      ),
      // Real host relationship: deleting the wall must take the opening too.
      hostId: opening.hostWallId,
      instanceParameters: {
        widthMm: Math.round(opening.widthM * 1000),
        heightMm: Math.round(opening.heightM * 1000),
        sillHeightMm: Math.round(opening.sillM * 1000),
        areaM2: round(opening.widthM * opening.heightM, 2),
        ...(opening.connectsSpaceIds
          ? {
              connectsFrom: opening.connectsSpaceIds[0],
              connectsTo: opening.connectsSpaceIds[1],
            }
          : {}),
      },
      placement: {
        x: round(opening.position[0]),
        y: round(opening.sillM),
        z: round(opening.position[1]),
        rotationY: 0,
      },
    });
  }

  /* --- structure --- */
  for (const column of building.columns) {
    elements.push({
      ...mk(
        column.id,
        "column",
        "Structural Columns",
        "Rectangular Column",
        GENERATED_COLUMN_TYPE,
        "structure",
        column.floorNo,
        [levelIdForFloor(column.floorNo), `grid:${column.gridRef}`],
      ),
      instanceParameters: {
        widthMm: Math.round(column.sizeM * 1000),
        depthMm: Math.round(column.sizeM * 1000),
        gridRef: column.gridRef,
      },
      placement: { x: round(column.x), y: 0, z: round(column.z), rotationY: 0 },
    });
  }

  for (const beam of building.beams) {
    const [sx, sz] = beam.start;
    const [ex, ez] = beam.end;
    elements.push({
      ...mk(
        beam.id,
        "beam",
        "Structural Framing",
        "Beam",
        GENERATED_BEAM_TYPE,
        "structure",
        beam.floorNo,
        [levelIdForFloor(beam.floorNo)],
      ),
      instanceParameters: {
        lengthM: round(Math.hypot(ex - sx, ez - sz), 3),
        depthMm: Math.round(beam.depthM * 1000),
        widthMm: Math.round(beam.widthM * 1000),
      },
      placement: {
        x: round((sx + ex) / 2),
        y: 0,
        z: round((sz + ez) / 2),
        rotationY: round(Math.atan2(ez - sz, ex - sx), 4),
      },
    });
  }

  /* --- core components: one element per level so they stack visibly --- */
  for (const component of building.core.components) {
    const [cx, cz] = rectCentre(component.rect);
    const typeId =
      component.kind === "stair"
        ? GENERATED_STAIR_TYPE
        : component.kind === "elevator"
          ? GENERATED_ELEVATOR_TYPE
          : GENERATED_SHAFT_TYPE;
    const category =
      component.kind === "stair"
        ? "Stairs"
        : component.kind === "elevator"
          ? "Specialty Equipment"
          : "Shafts";

    for (const level of building.levels) {
      if (level.floorNo < component.fromFloorNo || level.floorNo > component.toFloorNo) {
        continue;
      }
      elements.push({
        ...mk(
          `${component.id}-L${level.floorNo}`,
          component.kind === "stair" ? "stair" : "mep-instance",
          category,
          component.kind,
          typeId,
          "core",
          level.floorNo,
          // Every storey of a core component depends on the component itself,
          // which is what makes "shafts not vertically aligned" checkable.
          [component.id, levelIdForFloor(level.floorNo)],
        ),
        instanceParameters: {
          coreComponentId: component.id,
          componentKind: component.kind,
          ...(component.subKind ? { shaftKind: component.subKind } : {}),
          areaM2: round(rectArea(component.rect), 2),
          widthM: round(component.rect.maxX - component.rect.minX, 2),
          depthM: round(component.rect.maxZ - component.rect.minZ, 2),
          servesFromFloor: component.fromFloorNo,
          servesToFloor: component.toFloorNo,
        },
        placement: { x: round(cx), y: 0, z: round(cz), rotationY: 0 },
      });
    }
  }

  return elements;
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

function levelsOf(building: GeneratedBuilding): BimLevel[] {
  return building.levels
    .slice()
    .sort((a, b) => a.floorNo - b.floorNo)
    .map((level) => ({
      id: levelIdForFloor(level.floorNo),
      name: level.name,
      elevation: round(level.elevationM, 3),
      height: round(level.heightM, 3),
      floorNo: level.floorNo,
      associatedViewId: `view:plan:${level.floorNo}`,
    }));
}

function gridsOf(building: GeneratedBuilding): BimGrid[] {
  return building.grids.map((grid) => ({
    id: grid.id,
    name: grid.name,
    axis: grid.axis,
    offset: round(grid.offset, 3),
  }));
}

/**
 * Regeneration rule (brief §42): USER EDIT > LOCKED > AI GENERATION > DEFAULT.
 *
 * A freshly generated element is dropped in favour of the existing one when the
 * existing one is locked, or has been modified by a human. Everything else is
 * replaced. This is what stops the engine overwriting the architect.
 */
export function mergeGenerated(
  previous: BimElement[],
  next: BimElement[],
): { elements: BimElement[]; preservedIds: string[] } {
  const protectedById = new Map<string, BimElement>();
  for (const element of previous) {
    const isProtected =
      element.locked === true ||
      element.origin === "authored" ||
      element.generationSource?.type === "MODIFIED" ||
      element.generationSource?.type === "AUTHORED";
    if (isProtected) protectedById.set(element.id, element);
  }

  const merged = next.filter((element) => !protectedById.has(element.id));
  return {
    elements: [...merged, ...protectedById.values()],
    preservedIds: [...protectedById.keys()],
  };
}

export function emitSnapshot(input: EmitInput): BimModelSnapshot {
  const generated = emitElements(input);
  const { elements } = mergeGenerated(input.authoredElements ?? [], generated);

  return {
    buildingPk: input.buildingPk,
    levels: levelsOf(input.building),
    grids: gridsOf(input.building),
    types: generatedTypes(input.spec),
    elements,
    documents: [],
    visibility: {},
  };
}
