// src/lib/procedural/__tests__/floor-picking.test.ts
// P0-04 — floor pick resolution on both slab rendering paths:
// polygon Group (plain meshes + userData.floorNo fallback) and rectangular
// InstancedMesh (instanceId → getFloorFromInstanceId). No WebGL required.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { getRecipe } from "../recipe";
import { ProceduralBuilding } from "../procedural-building";
import { resolvePickedFloor } from "../floor-picking";
import type { BuildingRecipe, FloorSpec } from "../types";

function makeFloors(count: number): FloorSpec[] {
  const floors: FloorSpec[] = [];
  for (let i = 0; i < count; i++) {
    floors.push({
      floorNo: i + 1,
      label: `${i + 1}F`,
      type: "above",
      y: i * 3,
      height: 3,
      isGroundFloor: i === 0,
    });
  }
  return floors;
}

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  const base = getRecipe("11", "2010-2019", "02000");
  return {
    ...base,
    footprintWidth: 10,
    footprintDepth: 8,
    floors: makeFloors(3),
    totalHeight: 9,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    siteWidth: 20,
    siteDepth: 20,
    buildingName: "Test Building",
    address: "Seoul",
    ...overrides,
  };
}

/** Simple triangle footprint in local [x, z] meters — outer ring only. */
const TRIANGLE: [number, number][][] = [
  [
    [0, 0],
    [10, 0],
    [5, 8],
  ],
];

describe("ProceduralBuilding.getFloorByFloorNo", () => {
  it("resolves a FloorSpec by floorNo on the polygon path", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    const spec = builder.getFloorByFloorNo(3);
    expect(spec).not.toBeNull();
    expect(spec!.floorNo).toBe(3);
    expect(spec!.y).toBe(6);
  });

  it("returns null for an unknown floorNo", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    expect(builder.getFloorByFloorNo(99)).toBeNull();
    expect(builder.getFloorByFloorNo(-1)).toBeNull();
  });
});

// P2-13: polygon path now returns InstancedMesh (unified slab pipeline).
// Selection on polygon buildings now goes through the InstancedMesh path
// (instanceId → instanceToFloor map), same as the rectangular path.
describe("resolvePickedFloor — polygon InstancedMesh path (P2-13)", () => {
  it("polygon slabs are now InstancedMesh (not Group)", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    const slabs = builder.getSlabMesh();
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("resolves a polygon slab via instanceId (same flow as rectangular)", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    const slabs = builder.getSlabMesh()!;
    // instanceId 2 = third floor (floorNo 3)
    const spec = resolvePickedFloor({ object: slabs, instanceId: 2 }, builder);
    expect(spec).not.toBeNull();
    expect(spec!.floorNo).toBe(3);
  });

  it("resolves a synthetic slab object with userData floorNo (fallback path)", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    const fakeObject = { userData: { type: "slab", floorNo: 2 } };
    const spec = resolvePickedFloor({ object: fakeObject }, builder);
    expect(spec).not.toBeNull();
    expect(spec!.floorNo).toBe(2);
  });

  it("returns null for non-slab objects", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    expect(resolvePickedFloor({ object: { userData: { type: "roof" } } }, builder)).toBeNull();
    expect(resolvePickedFloor({ object: { userData: {} } }, builder)).toBeNull();
    expect(resolvePickedFloor({ object: undefined }, builder)).toBeNull();
    expect(resolvePickedFloor({}, builder)).toBeNull();
  });

  it("returns null for a slab object with missing or invalid floorNo (fallback path)", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    expect(resolvePickedFloor({ object: { userData: { type: "slab" } } }, builder)).toBeNull();
    expect(
      resolvePickedFloor({ object: { userData: { type: "slab", floorNo: "3" } } }, builder)
    ).toBeNull();
    expect(
      resolvePickedFloor({ object: { userData: { type: "slab", floorNo: NaN } } }, builder)
    ).toBeNull();
    expect(
      resolvePickedFloor({ object: { userData: { type: "slab", floorNo: 99 } } }, builder)
    ).toBeNull();
  });
});

describe("resolvePickedFloor — rectangular InstancedMesh path (instanceId)", () => {
  it("resolves through getFloorFromInstanceId exactly as before", () => {
    const builder = new ProceduralBuilding(makeRecipe());
    builder.generate();

    const slabs = builder.getSlabMesh();
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);

    const spec = resolvePickedFloor({ object: slabs!, instanceId: 1 }, builder);
    expect(spec).not.toBeNull();
    expect(spec!.floorNo).toBe(2);
    // Byte-identical to the legacy lookup (regression).
    expect(spec).toEqual(builder.getFloorFromInstanceId(1));
  });

  it("returns null for an out-of-range instanceId", () => {
    const builder = new ProceduralBuilding(makeRecipe());
    builder.generate();

    const slabs = builder.getSlabMesh();
    expect(resolvePickedFloor({ object: slabs!, instanceId: 42 }, builder)).toBeNull();
  });

  it("ignores instanceId on non-slab objects", () => {
    const builder = new ProceduralBuilding(makeRecipe());
    builder.generate();

    expect(
      resolvePickedFloor({ object: { userData: { type: "column" } }, instanceId: 0 }, builder)
    ).toBeNull();
  });
});

describe("getFloorFromInstanceId regression (existing callers unchanged)", () => {
  it("still resolves rectangular instances", () => {
    const builder = new ProceduralBuilding(makeRecipe());
    builder.generate();

    expect(builder.getFloorFromInstanceId(0)!.floorNo).toBe(1);
    expect(builder.getFloorFromInstanceId(2)!.floorNo).toBe(3);
    expect(builder.getFloorFromInstanceId(99)).toBeNull();
  });

  it("resolves polygon InstancedMesh instances via instanceToFloor (P2-13 unified path)", () => {
    const builder = new ProceduralBuilding(makeRecipe({ footprintPolygon: TRIANGLE }));
    builder.generate();

    expect(builder.getFloorFromInstanceId(0)!.floorNo).toBe(1);
    expect(builder.getFloorFromInstanceId(99)).toBeNull();
  });
});
