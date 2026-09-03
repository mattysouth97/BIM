// src/lib/procedural/__tests__/polygon-slab-instancing.test.ts
// P2-13 WP3 — Polygon slab unification: identical-fingerprint floors → one InstancedMesh
// per unique polygon, with per-floor selection data preserved.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { generateSlabs } from "../structure-generator";
import type { BuildingRecipe, FloorSpec } from "../types";
import { getRecipe } from "../recipe";

/** Simple L-shaped polygon (unique fingerprint) */
const L_SHAPE: [number, number][][] = [
  [
    [0, 0],
    [10, 0],
    [10, 5],
    [5, 5],
    [5, 10],
    [0, 10],
  ],
];

/** Rectangle polygon — used to verify rect path is still InstancedMesh (not unified) */
// (rect path: no footprintPolygon, uses width×depth box)

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

function makePolygonRecipe(floors: FloorSpec[], polygon = L_SHAPE): BuildingRecipe {
  const defaults = getRecipe("11", "2000-2009", "02000");
  return {
    footprintWidth: 10,
    footprintDepth: 10,
    footprintPolygon: polygon,
    floors,
    totalHeight: floors.length * 3,
    wallThickness: 0.2,
    era: "2000-2009",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: defaults.facade,
    slab: defaults.slab,
    column: defaults.column,
    roof: defaults.roof,
    materials: defaults.materials,
    siteWidth: 20,
    siteDepth: 20,
    buildingName: "Test",
    address: "Seoul",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WP3-A: identical-fingerprint polygon floors collapse to ONE InstancedMesh
// ─────────────────────────────────────────────────────────────────────────────

describe("polygon slab unification — identical polygon collapses to InstancedMesh", () => {
  it("30-floor polygon tower returns ONE InstancedMesh (not a Group of 30 meshes)", () => {
    const recipe = makePolygonRecipe(makeFloors(30));
    const slabs = generateSlabs(recipe);

    // Must be an InstancedMesh, not a Group
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
    const im = slabs as THREE.InstancedMesh;
    expect(im.count).toBe(30);
  });

  it("3-floor polygon tower returns InstancedMesh with count=3", () => {
    const recipe = makePolygonRecipe(makeFloors(3));
    const slabs = generateSlabs(recipe);

    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
    const im = slabs as THREE.InstancedMesh;
    expect(im.count).toBe(3);
  });

  it("InstancedMesh userData.type is 'slab'", () => {
    const recipe = makePolygonRecipe(makeFloors(3));
    const slabs = generateSlabs(recipe);
    expect(slabs.userData.type).toBe("slab");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP3-B: per-floor selection data preserved (P0-04 compatibility)
// ─────────────────────────────────────────────────────────────────────────────

describe("polygon slab unification — per-floor selection data preserved", () => {
  it("instanceToFloor map covers every floor index with correct floorNo", () => {
    const floors = makeFloors(5);
    const recipe = makePolygonRecipe(floors);
    const slabs = generateSlabs(recipe);

    const im = slabs as THREE.InstancedMesh;
    const map = im.userData.instanceToFloor as Map<number, FloorSpec>;
    expect(map).toBeDefined();

    for (let i = 0; i < floors.length; i++) {
      const spec = map.get(i);
      expect(spec).not.toBeUndefined();
      expect(spec!.floorNo).toBe(floors[i].floorNo);
    }
  });

  it("each instance matrix encodes the correct Y base position for that floor", () => {
    const floors = makeFloors(4);
    const recipe = makePolygonRecipe(floors);
    const slabs = generateSlabs(recipe);

    const im = slabs as THREE.InstancedMesh;
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();

    for (let i = 0; i < floors.length; i++) {
      im.getMatrixAt(i, mat4);
      mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      // Matrix translates to floor.y (geometry base at 0, so slab sits at floor.y)
      expect(pos.y).toBeCloseTo(floors[i].y, 3);
    }
  });

  it("userData.floorNo set on each instance via instanceToFloor (P0-04 fallback path)", () => {
    const floors = makeFloors(3);
    const recipe = makePolygonRecipe(floors);
    const slabs = generateSlabs(recipe);

    const im = slabs as THREE.InstancedMesh;
    const map = im.userData.instanceToFloor as Map<number, FloorSpec>;

    // Every index maps to correct floor
    expect(map.get(0)!.floorNo).toBe(1);
    expect(map.get(1)!.floorNo).toBe(2);
    expect(map.get(2)!.floorNo).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP3-C: rectangular path not regressed (still single InstancedMesh)
// ─────────────────────────────────────────────────────────────────────────────

describe("rectangular slab path not regressed", () => {
  it("no footprintPolygon → still returns InstancedMesh (rect path unchanged)", () => {
    const defaults = getRecipe("11", "2000-2009", "02000");
    const recipe: BuildingRecipe = {
      footprintWidth: 20,
      footprintDepth: 12,
      floors: makeFloors(5),
      totalHeight: 15,
      wallThickness: 0.2,
      era: "2000-2009",
      strctCd: "11",
      mainPurpsCd: "02000",
      facade: defaults.facade,
      slab: defaults.slab,
      column: defaults.column,
      roof: defaults.roof,
      materials: defaults.materials,
      siteWidth: 30,
      siteDepth: 20,
      buildingName: "Test",
      address: "Seoul",
    };
    const slabs = generateSlabs(recipe);
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("rect path: overhang still extends slab scale beyond footprint", () => {
    const defaults = getRecipe("11", "2000-2009", "02000");
    const recipe: BuildingRecipe = {
      footprintWidth: 20,
      footprintDepth: 12,
      floors: makeFloors(3),
      totalHeight: 9,
      wallThickness: 0.2,
      era: "2000-2009",
      strctCd: "11",
      mainPurpsCd: "02000",
      facade: defaults.facade,
      slab: { thickness: 0.2, overhang: 0.5 },
      column: defaults.column,
      roof: defaults.roof,
      materials: defaults.materials,
      siteWidth: 30,
      siteDepth: 20,
      buildingName: "Test",
      address: "Seoul",
    };
    const slabs = generateSlabs(recipe) as THREE.InstancedMesh;
    const mat4 = new THREE.Matrix4();
    slabs.getMatrixAt(0, mat4);
    const scl = new THREE.Vector3();
    mat4.decompose(new THREE.Vector3(), new THREE.Quaternion(), scl);
    expect(scl.x).toBeCloseTo(20 + 2 * 0.5, 3);
    expect(scl.z).toBeCloseTo(12 + 2 * 0.5, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-30 — per-floor plates: one instanced batch per DISTINCT plate
// ─────────────────────────────────────────────────────────────────────────────

/** A smaller L, the upper levels of a stepped stack. */
const SMALL_L: [number, number][][] = [
  [
    [0, 0],
    [6, 0],
    [6, 3],
    [3, 3],
    [3, 6],
    [0, 6],
  ],
];

describe("P2-30 - per-floor plates", () => {
  it("a stepped stack returns a Group named slabs with one InstancedMesh per distinct plate", () => {
    const floors = makeFloors(5);
    floors[3] = { ...floors[3], plate: SMALL_L };
    floors[4] = { ...floors[4], plate: SMALL_L };
    const slabs = generateSlabs(makePolygonRecipe(floors));

    expect(slabs).toBeInstanceOf(THREE.Group);
    const batches = (slabs as THREE.Group).children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(batches).toHaveLength(2);
    expect(batches.map((b) => b.count).sort()).toEqual([2, 3]);
    for (const batch of batches) {
      expect(batch.userData.type).toBe("slab");
      expect(batch.userData.instanceToFloor).toBeInstanceOf(Map);
    }
  });

  it("every floor of a stepped stack is reachable through its own batch instanceToFloor", () => {
    const floors = makeFloors(5);
    floors[3] = { ...floors[3], plate: SMALL_L };
    floors[4] = { ...floors[4], plate: SMALL_L };
    const slabs = generateSlabs(makePolygonRecipe(floors)) as THREE.Group;
    const seen = new Set<number>();
    for (const child of slabs.children) {
      const map = child.userData.instanceToFloor as Map<number, FloorSpec>;
      for (const floor of map.values()) seen.add(floor.floorNo);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("levels whose plate equals the footprint still collapse to ONE InstancedMesh", () => {
    const floors = makeFloors(5).map((f) => ({ ...f, plate: L_SHAPE }));
    const slabs = generateSlabs(makePolygonRecipe(floors));
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
    expect((slabs as THREE.InstancedMesh).count).toBe(5);
  });

  it("the upper batch of a stepped stack sits at the upper floors Y", () => {
    const floors = makeFloors(3);
    floors[2] = { ...floors[2], plate: SMALL_L };
    const slabs = generateSlabs(makePolygonRecipe(floors)) as THREE.Group;
    const upper = slabs.children.find(
      (c) => (c.userData.instanceToFloor as Map<number, FloorSpec>).size === 1,
    ) as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    upper.getMatrixAt(0, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    expect(pos.y).toBeCloseTo(6, 6);
  });
});
