import type { BimElement, BimModelSnapshot, BimType } from "@/lib/bim/model/types";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

import type {
  CanonicalEnergyModel,
  Polygon2D,
  Space,
  Storey,
  ThermalZone,
} from "./types";

export const ENERGY_DIAGNOSTICS_BUILDING_PREFIX = "energy-diagnostics:" as const;

const ENERGY_ROOM_TYPE = "energy-diagnostics-room";

const ROOM_TYPE: BimType = Object.freeze({
  id: ENERGY_ROOM_TYPE,
  category: "Rooms",
  categoryKo: "공간",
  family: "energy-diagnostics-zone",
  familyKo: "에너지 진단 열구역",
  typeName: "Source-linked energy space",
  typeNameKo: "도면 근거 연결 에너지 공간",
  parameters: Object.freeze({}),
  ifcClass: "IfcSpace",
});

const OPAQUE_VISUAL = Object.freeze({
  color: "#b8b0a8",
  roughness: 0.9,
  metalness: 0,
});

const GLASS_VISUAL = Object.freeze({
  color: "#7fb7d5",
  roughness: 0.12,
  metalness: 0.18,
  transparent: true,
  opacity: 0.46,
});

export type CanonicalViewerBridge = Readonly<{
  buildingPk: string;
  title: BrTitleInfo;
  floors: readonly BrFloorInfo[];
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
  /** Canonical plan coordinate translated to the viewer's [0, 0] origin. */
  displayOrigin: readonly [x: number, y: number];
  warnings: readonly string[];
}>;

/**
 * Translate an engine recipe's canonical plan coordinates into the viewer's
 * origin-centred frame. This is a render-only copy: source facts and the
 * hashed simulation input remain in their original coordinate system.
 */
export function recipeAtViewerOrigin(
  recipe: BuildingRecipe,
  displayOrigin: readonly [x: number, y: number],
): BuildingRecipe {
  if (!recipe.footprintPolygon) return recipe;
  return {
    ...recipe,
    footprintPolygon: recipe.footprintPolygon.map((ring) =>
      ring.map(
        ([x, y]) =>
          [x - displayOrigin[0], y - displayOrigin[1]] as [number, number],
      ),
    ),
  };
}

type Bounds = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  depth: number;
  centerX: number;
  centerY: number;
}>;

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function polygonBounds(polygon: Polygon2D | null | undefined): Bounds | null {
  if (!polygon || polygon.length < 3) return null;
  const xs = polygon.map((point) => point[0]).filter(Number.isFinite);
  const ys = polygon.map((point) => point[1]).filter(Number.isFinite);
  if (xs.length < 3 || ys.length < 3) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 0.05),
    depth: Math.max(maxY - minY, 0.05),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function sortedStoreys(model: CanonicalEnergyModel): Storey[] {
  return [...model.geometry.storeys].sort(
    (left, right) =>
      finite(left.elevationM.value, 0) - finite(right.elevationM.value, 0) ||
      left.id.localeCompare(right.id),
  );
}

function floorSpecs(storeys: readonly Storey[], warnings: string[]): FloorSpec[] {
  return storeys.map((storey, index) => {
    const elevation = finite(storey.elevationM.value, index * 3);
    const height = Math.max(finite(storey.floorToFloorHeightM.value, 3), 0.1);
    if (storey.elevationM.value == null || storey.floorToFloorHeightM.value == null) {
      warnings.push(
        `${storey.id}: missing level geometry uses a display-only fallback; simulation remains blocked.`,
      );
    }
    return {
      floorNo: index + 1,
      label: storey.name,
      type: elevation < 0 ? "below" : "above",
      y: elevation,
      height,
      isGroundFloor: elevation >= 0 && !storeys
        .slice(0, index)
        .some((candidate) => finite(candidate.elevationM.value, 0) >= 0),
    };
  });
}

function representativePlate(model: CanonicalEnergyModel, storeys: readonly Storey[]) {
  const order = new Map(storeys.map((storey, index) => [storey.id, index]));
  return [...model.geometry.floorPlates]
    .filter((plate) => polygonBounds(plate.boundary.value) != null)
    .sort(
      (left, right) =>
        (order.get(left.storeyId) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.storeyId) ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    )[0];
}

function canonicalRoomElement(
  model: CanonicalEnergyModel,
  space: Space,
  zone: ThermalZone | undefined,
  zoneSpaceIndex: number,
  level: Storey,
  buildingPk: string,
  originX: number,
  originY: number,
  warnings: string[],
): BimElement | null {
  const bounds = polygonBounds(space.boundary.value);
  if (!bounds) {
    warnings.push(`${space.id}: invalid space boundary is omitted from the display overlay.`);
    return null;
  }
  const mappedIds = zone == null
    ? []
    : model.mappings.find((mapping) => mapping.canonicalObjectId === zone.id)?.threeObjectIds ?? [];
  const id = mappedIds[zoneSpaceIndex] ??
    (zoneSpaceIndex === 0 && mappedIds[0] ? mappedIds[0] : `energy-room:${space.id}`);
  const conditioned = space.conditioned.value === true;
  return {
    id,
    origin: "generated",
    kind: "room",
    category: "Rooms",
    family: "energy-diagnostics-zone",
    typeId: ENERGY_ROOM_TYPE,
    buildingPk,
    levelId: level.id,
    hostId: null,
    mark: space.id,
    instanceParameters: {
      name: text(space.name.value, space.id),
      spaceType: text(space.spaceType.value, "unassigned"),
      programId: zone?.stableKey ?? zone?.id ?? space.id,
      canonicalSpaceId: space.id,
      canonicalZoneId: zone?.id ?? `unassigned:${space.id}`,
      conditioned,
      widthM: bounds.width,
      depthM: bounds.depth,
      areaM2: finite(space.floorAreaSqm.value, bounds.width * bounds.depth),
      volumeM3: finite(space.volumeM3.value, bounds.width * bounds.depth * 3),
    },
    placement: {
      x: bounds.centerX - originX,
      y: finite(level.elevationM.value, 0),
      z: bounds.centerY - originY,
      rotationY: 0,
    },
    phaseCreated: "new",
    visible: true,
    ifcClass: "IfcSpace",
    generationSource: {
      type: "IMPORTED",
      generationId: model.modelVersion,
      version: 1,
    },
    system: "massing",
    dependsOn: [space.boundary.id, ...(zone ? [zone.id] : [])],
  };
}

/**
 * Converts canonical geometry into the existing BuildingScene/BIM snapshot
 * contracts. This is a display adapter only: fallbacks are returned with a
 * warning and never enter the simulation adapter or canonical facts.
 */
export function canonicalModelToViewerBridge(
  model: CanonicalEnergyModel,
): CanonicalViewerBridge {
  const warnings: string[] = [];
  const storeys = sortedStoreys(model);
  const floors = floorSpecs(storeys, warnings);
  const plate = representativePlate(model, storeys);
  const fallbackBoundary: Polygon2D = Object.freeze([
    Object.freeze([0, 0] as const),
    Object.freeze([20, 0] as const),
    Object.freeze([20, 15] as const),
    Object.freeze([0, 15] as const),
  ]);
  const boundary = plate?.boundary.value ?? fallbackBoundary;
  if (!plate?.boundary.value) {
    warnings.push(
      "No valid floor plate is available; a display-only 20 m × 15 m box is shown while simulation remains blocked.",
    );
  }
  const plateSignatures = new Set(
    model.geometry.floorPlates.map((candidate) =>
      JSON.stringify({
        boundary: candidate.boundary.value,
        voids: candidate.voidBoundaries.map((voidBoundary) => voidBoundary.value),
      }),
    ),
  );
  if (plateSignatures.size > 1) {
    warnings.push(
      "BuildingScene repeats the lowest valid floor plate; differing upper-floor plates and voids remain exact in the canonical model and are shown in the zone overlay.",
    );
  }
  const bounds = polygonBounds(boundary)!;
  const floorArea = model.geometry.floorPlates.reduce(
    (sum, candidate) => sum + finite(candidate.areaSqm.value, 0),
    0,
  );
  const aboveStoreys = floors.filter((floor) => floor.type === "above");
  const belowStoreys = floors.filter((floor) => floor.type === "below");
  const minElevation = floors.reduce((min, floor) => Math.min(min, floor.y), 0);
  const maxTop = floors.reduce(
    (max, floor) => Math.max(max, floor.y + floor.height),
    Math.max(3, minElevation + 3),
  );
  const openings = model.geometry.openings.filter(
    (opening) => opening.type === "window" || opening.type === "curtain_wall",
  );
  const averageOpeningWidth = openings.length > 0
    ? openings.reduce((sum, opening) => sum + finite(opening.widthM.value, 1.5), 0) /
      openings.length
    : 1.5;
  const averageOpeningHeight = openings.length > 0
    ? openings.reduce((sum, opening) => sum + finite(opening.heightM.value, 1.5), 0) /
      openings.length
    : 1.5;
  const averageSillHeight = openings.length > 0
    ? openings.reduce(
        (sum, opening) => sum + finite(opening.sillHeightM.value, 0.9),
        0,
      ) / openings.length
    : 0.9;
  const exteriorWallArea = model.geometry.surfaces
    .filter((surface) => surface.type === "exterior_wall")
    .reduce((sum, surface) => sum + finite(surface.areaSqm.value, 0), 0);
  const openingArea = openings.reduce(
    (sum, opening) => sum + finite(opening.areaSqm.value, 0),
    0,
  );
  const visualWindowRatio = exteriorWallArea > 0 && openingArea > 0
    ? Math.min(openingArea / exteriorWallArea, 0.85)
    : 0;
  if (openingArea > 0 && exteriorWallArea <= 0) {
    warnings.push(
      "Glazing exists without a valid exterior-wall area, so BuildingScene hides it instead of inventing a window ratio.",
    );
  }
  const buildingPk = `${ENERGY_DIAGNOSTICS_BUILDING_PREFIX}${model.building.id}`;
  const buildingName = text(model.building.name.value, model.project.name);
  const address = text(model.site.location.value, "Location not confirmed");
  const footprintRings = [
    boundary.map((point) => [
      point[0] - bounds.centerX,
      point[1] - bounds.centerY,
    ] as [number, number]),
    ...(plate?.voidBoundaries ?? []).flatMap((voidBoundary) =>
      voidBoundary.value == null
        ? []
        : [voidBoundary.value.map((point) => [
            point[0] - bounds.centerX,
            point[1] - bounds.centerY,
          ] as [number, number])],
    ),
  ];
  const recipe: BuildingRecipe = {
    footprintWidth: bounds.width,
    footprintDepth: bounds.depth,
    footprintPolygon: footprintRings,
    officialFloorAreaSqm: floorArea,
    floors,
    totalHeight: maxTop - minElevation,
    wallThickness: 0.2,
    era: "2020+",
    strctCd: "11",
    mainPurpsCd: "14000",
    facade: {
      windowWidth: Math.max(averageOpeningWidth, 0.2),
      windowHeight: Math.max(averageOpeningHeight, 0.2),
      sillHeight: Math.max(averageSillHeight, 0),
      windowSpacing: Math.max(averageOpeningWidth + 1, 1.2),
      windowRatio: visualWindowRatio,
      mullionDepth: 0.08,
      mullionWidth: 0.05,
      glassInset: 0.04,
      solidPanelChance: 0,
      parapetHeight: 0.9,
      cornerInset: 0.4,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.4 },
    roof: { type: "flat", flatThickness: 0.25, gableHeight: 0, hipInset: 0 },
    materials: {
      wall: OPAQUE_VISUAL,
      glass: GLASS_VISUAL,
      mullion: OPAQUE_VISUAL,
      slab: OPAQUE_VISUAL,
      column: OPAQUE_VISUAL,
      roof: OPAQUE_VISUAL,
      groundFloor: OPAQUE_VISUAL,
    },
    siteWidth: Math.max(bounds.width * 1.5, bounds.width + 10),
    siteDepth: Math.max(bounds.depth * 1.5, bounds.depth + 10),
    buildingName,
    address,
  };

  const title: BrTitleInfo = {
    mgmBldrgstPk: buildingPk,
    bldNm: buildingName,
    platPlcNm: address,
    newPlatPlc: address,
    sigunguCd: "",
    bjdongCd: "",
    platGbCd: "0",
    bun: "",
    ji: "",
    mainPurpsCd: "14000",
    mainPurpsCdNm: text(model.building.useType.value, "업무시설"),
    etcPurps: text(model.building.useType.value, "office"),
    strctCd: "11",
    strctCdNm: "설계 도면 기반 모델",
    etcStrct: "",
    grndFlrCnt: aboveStoreys.length,
    ugrndFlrCnt: belowStoreys.length,
    totArea: floorArea,
    archArea: finite(plate?.areaSqm.value, bounds.width * bounds.depth),
    platArea: Math.max(bounds.width * bounds.depth * 1.5, 1),
    bcRat: 0,
    vlRat: 0,
    useAprDay: "",
    pmsDay: "",
    stcnsDay: "",
    roofCd: "1",
    roofCdNm: "평지붕",
    heit: maxTop - minElevation,
    regstrGbCd: "",
    regstrGbCdNm: "설계 모델",
    regstrKindCd: "",
    regstrKindCdNm: "에너지 진단",
  };
  title.bcRat = (title.archArea / title.platArea) * 100;
  title.vlRat = (floorArea / title.platArea) * 100;

  const floorRows: BrFloorInfo[] = floors.map((floor, index) => {
    const storey = storeys[index];
    const area = model.geometry.floorPlates
      .filter((candidate) => candidate.storeyId === storey.id)
      .reduce((sum, candidate) => sum + finite(candidate.areaSqm.value, 0), 0);
    return {
      mgmBldrgstPk: buildingPk,
      flrNo: floor.floorNo,
      flrNoNm: floor.label,
      flrGbCd: floor.type === "below" ? "20" : "10",
      flrGbCdNm: floor.type === "below" ? "지하" : "지상",
      mainAtchGbCd: "0",
      mainAtchGbCdNm: "주건축물",
      mainPurpsCd: "14000",
      mainPurpsCdNm: text(model.building.useType.value, "업무시설"),
      etcPurps: text(model.building.useType.value, "office"),
      area,
      strctCd: "11",
      strctCdNm: "설계 도면 기반 모델",
    };
  });

  const storeyById = new Map(storeys.map((storey) => [storey.id, storey]));
  const zoneById = new Map(model.geometry.thermalZones.map((zone) => [zone.id, zone]));
  const zoneSpacePosition = new Map<string, number>();
  const elements = model.geometry.spaces.flatMap((space) => {
    const level = storeyById.get(space.storeyId);
    if (!level) {
      warnings.push(`${space.id}: unresolved storey mapping omits the space from the 3D overlay.`);
      return [];
    }
    const zone = space.thermalZoneId ? zoneById.get(space.thermalZoneId) : undefined;
    const zoneKey = zone?.id ?? `unassigned:${space.id}`;
    const position = zoneSpacePosition.get(zoneKey) ?? 0;
    zoneSpacePosition.set(zoneKey, position + 1);
    const element = canonicalRoomElement(
      model,
      space,
      zone,
      position,
      level,
      buildingPk,
      bounds.centerX,
      bounds.centerY,
      warnings,
    );
    return element == null ? [] : [element];
  });
  const snapshot: BimModelSnapshot = {
    buildingPk,
    levels: storeys.map((storey, index) => ({
      id: storey.id,
      name: storey.name,
      elevation: floors[index].y,
      height: floors[index].height,
      floorNo: floors[index].floorNo,
      associatedViewId: `energy-view:${storey.id}`,
    })),
    grids: [],
    types: { [ENERGY_ROOM_TYPE]: ROOM_TYPE },
    elements,
    documents: [],
    visibility: {},
  };

  return Object.freeze({
    buildingPk,
    title: Object.freeze(title),
    floors: Object.freeze(floorRows),
    recipe: Object.freeze(recipe),
    snapshot: Object.freeze(snapshot),
    displayOrigin: Object.freeze([bounds.centerX, bounds.centerY] as const),
    warnings: Object.freeze(warnings),
  });
}
