// src/lib/mep/context.ts
//
// Architectural semantics for MEP planning: floors with service bands, the
// corridor spine (the horizontal distribution highway — rule Z4), terminal
// zones with design demands (the requirement model), shafts with real
// extents, wet stacks, plant locations and structural obstacles.
//
// Two entry paths share this model:
//   procedural — zones from a deterministic plate-grid partition
//   CAD-driven — zones from classified room polygons (classify-plan.ts)
// Everything downstream (planners, router, validator) is identical, which is
// what makes CAD evidence and procedural completion comparable and labelable.

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { computeCoreLayout, type CoreLayout } from "@/lib/layers/core-layout";
import { clearOfColumns } from "./graph";
import {
  keepOnPlate,
  plateBounds,
  plateRings,
  pointInPlate,
  pointInPlateInset,
  type PlateRing,
} from "@/lib/layers/plate";
import { getColumnPositions } from "@/lib/structural-codes";
import {
  DESIGN_LOADS_W_PER_SQM,
  ELECTRICAL_VA_PER_SQM,
  SUPPLY_AIR_M3H_PER_SQM,
  ZONE_TARGET_AREA_SQM,
  chooseArchetype,
  serviceBands,
  buildingUseFamily,
  type ArchetypeChoice,
  type ServiceBands,
} from "./rules";
import type { MepZone } from "./types";

export interface MepFloorContext {
  floorNo: number;
  y: number;
  height: number;
  /** Underside of the slab above (service void hangs from here). */
  soffitY: number;
  bands: ServiceBands;
  zones: MepZone[];
}

export interface ShaftExtent {
  id: string;
  kind: "wet" | "mechanical" | "electrical";
  x: number;
  z: number;
  widthM: number;
  depthM: number;
}

export interface CorridorSpine {
  /** Spine axis z (constant), clipped x extent on the plate. */
  z: number;
  minX: number;
  maxX: number;
}

/** One classified CAD room (native footprint-local metres). */
export interface CadRoomInput {
  polygon: [number, number][];
}

export interface MepContextOptions {
  /** Room polygons from a classified CAD plan, applied to every above floor. */
  cadRooms?: CadRoomInput[];
  /** Retrofit scenario hints (plant swaps) — topology-stable. */
  heatingPlant?: "boiler" | "ashp" | "condensing";
}

export interface MepBuildingContext {
  recipe: BuildingRecipe;
  rings: PlateRing[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  core: CoreLayout;
  archetype: ArchetypeChoice;
  family: ReturnType<typeof buildingUseFamily>;
  eraStartYear: number;
  floors: MepFloorContext[];
  /** All above-grade floors' shared spine (plates stack identically today). */
  spine: CorridorSpine;
  shafts: ShaftExtent[];
  columns: { x: number; z: number; half: number }[];
  roofY: number;
  /** Plant room floor level (basement slab if present, else a defaulted pit). */
  plantY: number;
  plantYBasis: "imported" | "defaulted";
  /** True when zones came from CAD rooms rather than the procedural grid. */
  cadDriven: boolean;
}

const ERA_START: Record<string, number> = {
  "pre-1970": 1965,
  "1970-1989": 1980,
  "1990-1999": 1995,
  "2000-2009": 2005,
  "2010-2019": 2015,
  "2020+": 2022,
};

function ringAreaSqm(ring: [number, number][]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    twice += x0 * z1 - x1 * z0;
  }
  return Math.abs(twice) / 2;
}

function zoneFromRect(
  id: string,
  floorNo: number,
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
  areaSqm: number,
  source: MepZone["source"],
  family: ReturnType<typeof buildingUseFamily>,
): MepZone {
  const loads = DESIGN_LOADS_W_PER_SQM[family];
  return {
    id,
    floorNo,
    rect,
    areaSqm,
    source,
    supplyAirM3h: areaSqm * SUPPLY_AIR_M3H_PER_SQM,
    coolingKw: (areaSqm * loads.cooling) / 1000,
    heatingKw: (areaSqm * loads.heating) / 1000,
    lightingVa: areaSqm * ELECTRICAL_VA_PER_SQM.lighting,
    powerVa: areaSqm * ELECTRICAL_VA_PER_SQM.power,
  };
}

/** The hoistway is not occupiable — no terminal zone may sit in it (§27). */
function insideCore(x: number, z: number, core: CoreLayout): boolean {
  const bank = core.elevator;
  return (
    x > bank.minX - 0.9 &&
    x < bank.maxX + 0.9 &&
    z > bank.bankZ - bank.shaftDepth / 2 - 0.9 &&
    z < bank.bankZ + bank.shaftDepth / 2 + 0.9
  );
}

/**
 * Procedural terminal zones: partition the plate bbox into roughly
 * ZONE_TARGET_AREA_SQM cells and keep cells whose centre sits on the plate.
 * Deterministic; no RNG.
 */
function gridZones(
  rings: PlateRing[],
  bounds: MepBuildingContext["bounds"],
  core: CoreLayout,
  floorNo: number,
  family: ReturnType<typeof buildingUseFamily>,
): MepZone[] {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width < 4 || depth < 4) return [];
  const target = Math.sqrt(ZONE_TARGET_AREA_SQM);
  const nx = Math.max(1, Math.round(width / target));
  const nz = Math.max(1, Math.round(depth / target));
  const cw = width / nx;
  const cd = depth / nz;
  const zones: MepZone[] = [];
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iz = 0; iz < nz; iz += 1) {
      const minX = bounds.minX + ix * cw;
      const minZ = bounds.minZ + iz * cd;
      const cx = minX + cw / 2;
      const cz = minZ + cd / 2;
      if (!pointInPlateInset(cx, cz, rings, 0.8)) continue;
      if (insideCore(cx, cz, core)) continue;
      zones.push(
        zoneFromRect(
          `zone-f${floorNo}-${ix}-${iz}`,
          floorNo,
          { minX, maxX: minX + cw, minZ, maxZ: minZ + cd },
          cw * cd,
          "grid",
          family,
        ),
      );
    }
  }
  return zones;
}

/** CAD-driven terminal zones: one per classified room polygon (bbox extent). */
function cadZones(
  rooms: CadRoomInput[],
  rings: PlateRing[],
  core: CoreLayout,
  floorNo: number,
  family: ReturnType<typeof buildingUseFamily>,
): MepZone[] {
  const zones: MepZone[] = [];
  rooms.forEach((room, i) => {
    const ring = room.polygon;
    if (ring.length < 3) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const area = ringAreaSqm(ring);
    if (area < 3) return;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    if (!pointInPlate(cx, cz, rings)) return;
    if (insideCore(cx, cz, core)) return;
    zones.push(
      zoneFromRect(`zone-f${floorNo}-cad-${i}`, floorNo, { minX, maxX, minZ, maxZ }, area, "cad-room", family),
    );
  });
  return zones;
}

/**
 * The corridor spine: the horizontal highway mains run along (rule Z4).
 * Sits interior of the service core with enough setback that the rearmost
 * distribution channel (sprinkler main, −2.5 m) still clears the elevator
 * hoistway — mains must never cross the shafts (§27).
 */
function computeSpine(
  rings: PlateRing[],
  bounds: MepBuildingContext["bounds"],
  core: CoreLayout,
): CorridorSpine {
  const depth = bounds.maxZ - bounds.minZ;
  const bankFront = core.elevator.bankZ + core.elevator.shaftDepth / 2;
  // 4.2 m setback: the rearmost channel (−2.5) must clear not just the
  // hoistway but the wet/mechanical riser cluster hugging the core front.
  const rawZ = bankFront + 4.2;
  let clamped = Math.min(bounds.maxZ - depth * 0.25, Math.max(bounds.minZ + depth * 0.2, rawZ));
  clamped = Math.min(Math.max(clamped, bankFront + 4.1), bounds.maxZ - 1.2);
  const z = keepOnPlate((bounds.minX + bounds.maxX) / 2, clamped, rings, 0.8).z;
  // Scan the plate at spine z for the clipped x extent.
  let minX = Infinity;
  let maxX = -Infinity;
  const steps = 96;
  for (let i = 0; i <= steps; i += 1) {
    const x = bounds.minX + ((bounds.maxX - bounds.minX) * i) / steps;
    if (pointInPlate(x, z, rings)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = bounds.minX + 1;
    maxX = bounds.maxX - 1;
  }
  return { z, minX: minX + 0.8, maxX: maxX - 0.8 };
}

export function buildMepContext(recipe: BuildingRecipe, options: MepContextOptions = {}): MepBuildingContext {
  const rings = plateRings(recipe);
  const bounds = plateBounds(rings);
  const core = computeCoreLayout(recipe);
  {
    // MEP verticals must never share a line with structure (rule Z3): shift
    // the riser/wet-zone slots off column lines before anything derives from
    // them. Pure adjustment of a pure layout — still deterministic.
    const cols = getColumnPositions(recipe);
    const colsX = cols.map((c) => c.x);
    const colsZ = cols.map((c) => c.z);
    const shift = (s: { x: number; z: number }) => {
      s.x = clearOfColumns(s.x, colsX, 0.9);
      s.z = clearOfColumns(s.z, colsZ, 0.9);
    };
    shift(core.serviceRiser);
    shift(core.coldRiser);
    shift(core.electricalRiser);
    shift(core.wetZones.restroom);
    shift(core.wetZones.kitchen);
  }
  const family = buildingUseFamily(recipe.mainPurpsCd);
  const eraStartYear = ERA_START[recipe.era] ?? 1995;
  const archetype = chooseArchetype(recipe.mainPurpsCd, eraStartYear);
  const spine = computeSpine(rings, bounds, core);

  const aboveFloors = recipe.floors.filter((f: FloorSpec) => f.type === "above");
  const belowFloors = recipe.floors.filter((f: FloorSpec) => f.type === "below");
  const cadDriven = Boolean(options.cadRooms && options.cadRooms.length > 0);

  const floors: MepFloorContext[] = aboveFloors.map((f) => ({
    floorNo: f.floorNo,
    y: f.y,
    height: f.height,
    soffitY: f.y + f.height,
    bands: serviceBands(f.height),
    zones: cadDriven
      ? cadZones(options.cadRooms as CadRoomInput[], rings, core, f.floorNo, family)
      : gridZones(rings, bounds, core, f.floorNo, family),
  }));

  const half = Math.max(0.15, (recipe.column?.size ?? 0.5) / 2);
  const columns = getColumnPositions(recipe).map((c) => ({ x: c.x, z: c.z, half }));
  const columnsX = columns.map((c) => c.x);
  const columnsZ = columns.map((c) => c.z);

  // Shafts with real extents, grown from the (column-cleared) core layout.
  // The mechanical riser cluster spans [x−0.6, x+3.0] (SA/OA, refrigerant,
  // RA at +2.05), so it sits wholly BEYOND the wet-core vertical band
  // (cold/hot risers, stacks, restroom exhaust at ≤ restroom.x + 1.1) —
  // interleaving the two clusters is what caused takeoff-through-riser
  // clashes. Falls back to the −x side of the wet core on narrow plates.
  const mechSlot = keepOnPlate(core.serviceRiser.x + 1.6, core.elevator.bankZ, rings, 0.8);
  mechSlot.z = clearOfColumns(mechSlot.z, columnsZ, 1.3);
  mechSlot.x = Math.max(mechSlot.x, core.wetZones.restroom.x + 1.9);
  for (let round = 0; round < 2; round += 1) {
    // 1.3 m clearance: shaft duct risers are up to ~0.8 m half-width.
    mechSlot.x = clearOfColumns(mechSlot.x, columnsX, 1.3);
    mechSlot.x = Math.max(mechSlot.x, core.wetZones.restroom.x + 1.9);
  }
  if (mechSlot.x + 3.2 > bounds.maxX - 0.4) {
    mechSlot.x = clearOfColumns(core.coldRiser.x - 4.2, columnsX, 0.9);
  }
  const shafts: ShaftExtent[] = [
    {
      id: "shaft-wet",
      kind: "wet",
      x: (core.serviceRiser.x + core.coldRiser.x) / 2,
      z: core.serviceRiser.z,
      widthM: 1.6,
      depthM: 1.1,
    },
    { id: "shaft-mech", kind: "mechanical", x: mechSlot.x, z: mechSlot.z, widthM: 1.2, depthM: 1.0 },
    {
      id: "shaft-elec",
      kind: "electrical",
      x: core.electricalRiser.x,
      z: core.electricalRiser.z,
      widthM: 0.9,
      depthM: 0.7,
    },
  ];

  const roofY = recipe.totalHeight + (recipe.roof.type === "flat" ? recipe.roof.flatThickness : 0);
  const lowestBelow = belowFloors.reduce<number | null>((min, f) => (min === null || f.y < min ? f.y : min), null);
  const plantY = lowestBelow ?? -3.0;

  return {
    recipe,
    rings,
    bounds,
    core,
    archetype,
    family,
    eraStartYear,
    floors,
    spine,
    shafts,
    columns,
    roofY,
    plantY,
    plantYBasis: lowestBelow === null ? "defaulted" : "imported",
    cadDriven,
  };
}
