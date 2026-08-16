// src/lib/procedural/__tests__/slab-overhang.test.ts
// TDD tests for P2-12: slab overhang geometry and ground-floor material split.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { generateSlabs } from "../structure-generator";
import type { BuildingRecipe, FloorSpec } from "../types";
import { getRecipe } from "../recipe";

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  const defaults = getRecipe("11", "2000-2009", "02000");
  const floors: FloorSpec[] = [
    { floorNo: 1, label: "1F", type: "above", y: 0, height: 2.9, isGroundFloor: true },
    { floorNo: 2, label: "2F", type: "above", y: 2.9, height: 2.9, isGroundFloor: false },
    { floorNo: 3, label: "3F", type: "above", y: 5.8, height: 2.9, isGroundFloor: false },
  ];
  return {
    footprintWidth: 20,
    footprintDepth: 12,
    floors,
    totalHeight: 8.7,
    wallThickness: 0.33,
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
    ...overrides,
  };
}

describe("slab overhang geometry", () => {
  it("when overhang=0, slab scale equals footprint exactly", () => {
    const recipe = makeRecipe({ slab: { thickness: 0.2, overhang: 0 } });
    const slabs = generateSlabs(recipe);

    // Rectangular path: InstancedMesh
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
    const im = slabs as THREE.InstancedMesh;

    const mat = new THREE.Matrix4();
    im.getMatrixAt(0, mat);
    const scl = new THREE.Vector3();
    mat.decompose(new THREE.Vector3(), new THREE.Quaternion(), scl);

    expect(scl.x).toBeCloseTo(recipe.footprintWidth, 3);
    expect(scl.z).toBeCloseTo(recipe.footprintDepth, 3);
  });

  it("when overhang=0.5, slab scale exceeds footprint by 2×overhang on each axis", () => {
    const overhang = 0.5;
    const recipe = makeRecipe({ slab: { thickness: 0.2, overhang } });
    const slabs = generateSlabs(recipe);

    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);
    const im = slabs as THREE.InstancedMesh;

    const mat = new THREE.Matrix4();
    im.getMatrixAt(0, mat);
    const scl = new THREE.Vector3();
    mat.decompose(new THREE.Vector3(), new THREE.Quaternion(), scl);

    expect(scl.x).toBeCloseTo(recipe.footprintWidth + 2 * overhang, 3);
    expect(scl.z).toBeCloseTo(recipe.footprintDepth + 2 * overhang, 3);
  });

  it("overhang does not change slab Y position (thickness axis unchanged)", () => {
    const recipe = makeRecipe({ slab: { thickness: 0.2, overhang: 0.3 } });
    const slabs = generateSlabs(recipe);
    const im = slabs as THREE.InstancedMesh;

    // All 3 floors: check Y position for first slab
    const mat = new THREE.Matrix4();
    im.getMatrixAt(0, mat);
    const pos = new THREE.Vector3();
    mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());

    // Floor 1: y=0, slab at y + thickness/2
    expect(pos.y).toBeCloseTo(0 + 0.2 / 2, 3);
  });
});

describe("ground-floor material split", () => {
  it("ground floor slab uses groundFloor material color, upper floors use slab material color", () => {
    const recipe = makeRecipe();
    // groundFloor material differs from slab material
    const groundColor = recipe.materials.groundFloor.color;
    const slabColor = recipe.materials.slab.color;

    // They should be different colors in a well-constructed recipe
    // (getGroundFloorMaterial returns "#A0A098" vs slab which is structure-derived)
    const slabs = generateSlabs(recipe);
    expect(slabs).toBeInstanceOf(THREE.InstancedMesh);

    // The ground floor (index 0, floorNo=1, isGroundFloor=true) should use groundFloor material
    // This test checks the userData on the mesh carries floor info that can be used to look up material
    const im = slabs as THREE.InstancedMesh;
    const instanceToFloor = im.userData.instanceToFloor as Map<number, FloorSpec>;

    const floor0 = instanceToFloor.get(0);
    const floor1 = instanceToFloor.get(1);
    expect(floor0?.isGroundFloor).toBe(true);
    expect(floor1?.isGroundFloor).toBe(false);

    // The InstancedMesh for ground floor should use different material color
    // Since InstancedMesh shares one material, we verify the per-instance color
    // is set via instanceColor for the ground floor
    expect(im.instanceColor).not.toBeNull();

    // Ground floor instance (idx 0) color should match groundFloor material
    const groundInstanceColor = new THREE.Color();
    im.getColorAt!(0, groundInstanceColor);
    const expectedGround = new THREE.Color(groundColor);
    expect(groundInstanceColor.r).toBeCloseTo(expectedGround.r, 2);
    expect(groundInstanceColor.g).toBeCloseTo(expectedGround.g, 2);
    expect(groundInstanceColor.b).toBeCloseTo(expectedGround.b, 2);

    // Upper floor instance (idx 1) color should match slab material
    const upperInstanceColor = new THREE.Color();
    im.getColorAt!(1, upperInstanceColor);
    const expectedSlab = new THREE.Color(slabColor);
    expect(upperInstanceColor.r).toBeCloseTo(expectedSlab.r, 2);
    expect(upperInstanceColor.g).toBeCloseTo(expectedSlab.g, 2);
    expect(upperInstanceColor.b).toBeCloseTo(expectedSlab.b, 2);
  });
});
