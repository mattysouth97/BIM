// src/lib/layers/__tests__/layer-12-transport-assets.test.ts
// Detailed Blender-asset paths added to the Transport layer (layer-12-transport.ts):
//   - transport-cab / transport-counterweight geometry-only swaps (existing
//     material, position, userData, and step-animation shader untouched)
//   - transport-landing-door: one combined IM across every shaft x above-floor
//     combination (detailed-asset-only)
//   - transport-hoist-machine: getEquipmentObjectClone per shaft, seated on
//     the roof top (detailed-asset-only)
// cab/counterweight/shaft/floor-indicator have a coarse fallback, so with an
// empty cache the pre-existing layer-12 output must be unchanged. Landing
// doors and hoist machines have NO coarse fallback — they simply don't
// appear when their asset isn't loaded.

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { TransportLayer } from "../layer-12-transport";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "@/lib/procedural/types";

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 12,
    footprintDepth: 10,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 9.0,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "02000",
    column: { spacing: 6, size: 0.4, inset: 1 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.4,
      windowHeight: 1.6,
      sillHeight: 0.9,
      windowSpacing: 0.5,
      windowRatio: 0.6,
      mullionDepth: 0.06,
      mullionWidth: 0.05,
      glassInset: 0.04,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.2,
    },
    roof: { type: "flat", flatThickness: 0.15, gableHeight: 0, hipInset: 0 },
    siteWidth: 20,
    siteDepth: 18,
    buildingName: "Test Building",
    address: "Seoul, Korea",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0.0 },
      column: { color: "#bbbbbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999999", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#dddddd", roughness: 0.9, metalness: 0.0 },
    },
  };
}

/** Simple single-box fake — same vertex count (24) as a plain BoxGeometry. */
function makeSimpleFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  group.add(mesh);
  return group;
}

/** Two-mesh fake — merges to 48 vertices, distinguishable from a 24-vert box. */
function makeMultiMeshFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  const mesh1 = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  const mesh2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  mesh2.position.set(0.6, 0, 0);
  group.add(mesh1, mesh2);
  return group;
}

/** Same fixture as makeRecipe() but with floors short enough (2.0 m) to
 * exercise the landing-door Y-scale clamp — native door height is 2.1 m. */
function makeShortFloorRecipe(): BuildingRecipe {
  const recipe = makeRecipe();
  return {
    ...recipe,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 2.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 2.0, height: 2.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 4.0, height: 2.0, isGroundFloor: false },
    ],
    totalHeight: 6.0,
  };
}

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

describe("TransportLayer — pre-existing output (no assets)", () => {
  it("renders shaft, cab (24-vert box), counterweight, and floor indicators exactly as before", () => {
    const group = new TransportLayer().generate(makeRecipe());

    const shaft = findByType(group, "transport-shaft");
    expect(shaft).toBeDefined();

    const cab = findByType(group, "transport-cab") as THREE.Mesh;
    expect(cab).toBeDefined();
    expect(cab.geometry.attributes.position.count).toBe(24); // plain BoxGeometry
    expect(cab.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(cab.userData).toEqual({ type: "transport-cab", animated: true, shaftIndex: 0 });

    const cw = findByType(group, "transport-counterweight") as THREE.Mesh;
    expect(cw).toBeDefined();
    expect(cw.geometry.attributes.position.count).toBe(24); // plain BoxGeometry
    expect(cw.material).toBeInstanceOf(THREE.MeshStandardMaterial);

    const indicator = findByType(group, "transport-floor-indicator") as THREE.InstancedMesh;
    expect(indicator).toBeDefined();
    expect(indicator.count).toBe(3); // one per above floor
  });

  it("adds neither transport-landing-door nor transport-hoist-machine when the cache is empty", () => {
    const group = new TransportLayer().generate(makeRecipe());
    expect(findByType(group, "transport-landing-door")).toBeUndefined();
    expect(findByType(group, "transport-hoist-machine")).toBeUndefined();
  });
});

describe("TransportLayer — cab / counterweight geometry-only swap", () => {
  it("swaps the cab geometry when elevator-cab is loaded, keeping material/userData/animation", () => {
    __injectEquipmentAssetForTest("elevator-cab", makeMultiMeshFakeAsset());
    const group = new TransportLayer().generate(makeRecipe());

    const cab = findByType(group, "transport-cab") as THREE.Mesh;
    expect(cab).toBeDefined();
    expect(cab.geometry.attributes.position.count).toBe(48); // merged 2-box fake, not the 24-vert box
    expect(cab.material).toBeInstanceOf(THREE.ShaderMaterial);
    const mat = cab.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uColor.value.getHex()).toBe(0xf59e0b);
    expect(mat.uniforms.uFloorCount.value).toBe(3);
    expect(cab.userData).toEqual({ type: "transport-cab", animated: true, shaftIndex: 0 });
    // Core-layout shaft position: single shaft centred on X at the rear
    // service band — bankZ = -(hd - 0.5 - shaftDepth/2) = -(5 - 0.5 - 1.0) = -3.5.
    // cabHeight/2 = min(2.6, 3.0*0.75)/2 = 2.25/2.
    expect(cab.position.x).toBeCloseTo(0, 5);
    expect(cab.position.y).toBeCloseTo(1.125, 5);
    expect(cab.position.z).toBeCloseTo(-3.5, 5);
  });

  it("swaps the counterweight geometry when elevator-counterweight is loaded, keeping material/position", () => {
    __injectEquipmentAssetForTest("elevator-counterweight", makeMultiMeshFakeAsset());
    const group = new TransportLayer().generate(makeRecipe());

    const cw = findByType(group, "transport-counterweight") as THREE.Mesh;
    expect(cw).toBeDefined();
    expect(cw.geometry.attributes.position.count).toBe(48);
    expect(cw.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const mat = cw.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x666666);
    // sp.x - shaftWidth/2 + 0.2 = 0 - 0.8 + 0.2 = -0.6;
    // totalHeight*0.6 = 5.4; sp.z = bankZ = -3.5 (rear service band)
    expect(cw.position.x).toBeCloseTo(-0.6, 5);
    expect(cw.position.y).toBeCloseTo(5.4, 5);
    expect(cw.position.z).toBeCloseTo(-3.5, 5);
  });

  it("swaps cab and counterweight independently (only cab asset loaded)", () => {
    __injectEquipmentAssetForTest("elevator-cab", makeMultiMeshFakeAsset());
    const group = new TransportLayer().generate(makeRecipe());

    const cab = findByType(group, "transport-cab") as THREE.Mesh;
    expect(cab.geometry.attributes.position.count).toBe(48);

    const cw = findByType(group, "transport-counterweight") as THREE.Mesh;
    expect(cw.geometry.attributes.position.count).toBe(24); // unswapped fallback
  });
});

describe("TransportLayer — landing doors (detailed-asset-only)", () => {
  it("adds one combined IM sized shafts x aboveFloors, with correct y placement per floor", () => {
    __injectEquipmentAssetForTest("landing-door", makeSimpleFakeAsset());
    const group = new TransportLayer().generate(makeRecipe());

    const im = findByType(group, "transport-landing-door") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    expect(im.count).toBe(3); // 1 shaft * 3 above floors

    const mat = im.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x9ca3af);
    expect(mat.emissive.getHex()).toBe(0x64748b);
    expect(mat.emissiveIntensity).toBeCloseTo(0.15, 5);

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const expectedY = [1.05, 4.05, 7.05]; // floor.y (0,3,6) + 1.05
    for (let i = 0; i < 3; i++) {
      im.getMatrixAt(i, mat4);
      mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      // Doors mount on the interior-facing +Z face of the rear-band shaft:
      // x = sp.x = 0, z = bankZ + shaftDepth/2 = -3.5 + 1.0 = -2.5
      expect(pos.x).toBeCloseTo(0, 5);
      expect(pos.y).toBeCloseTo(expectedY[i], 5);
      expect(pos.z).toBeCloseTo(-2.5, 5);
    }
  });

  it("does not add transport-landing-door when the asset is absent (no coarse fallback)", () => {
    const group = new TransportLayer().generate(makeRecipe());
    expect(findByType(group, "transport-landing-door")).toBeUndefined();
  });

  it("clamps the door's Y scale on short floors so it doesn't punch into the slab above", () => {
    __injectEquipmentAssetForTest("landing-door", makeSimpleFakeAsset());
    const shortRecipe = makeShortFloorRecipe();
    const group = new TransportLayer().generate(shortRecipe);

    const im = findByType(group, "transport-landing-door") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    expect(im.count).toBe(3); // 1 shaft * 3 above floors

    const doorNativeHeight = 2.1;
    const expectedScale = Math.min(1, (2.0 - 0.15) / doorNativeHeight);
    expect(expectedScale).toBeLessThan(1); // sanity: the clamp is actually engaged

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (let i = 0; i < 3; i++) {
      im.getMatrixAt(i, mat4);
      mat4.decompose(pos, new THREE.Quaternion(), scl);
      expect(scl.y).toBeCloseTo(expectedScale, 5);

      const floor = shortRecipe.floors[i];
      const doorTop = pos.y + (doorNativeHeight * scl.y) / 2;
      expect(doorTop).toBeLessThan(floor.y + floor.height);
    }
  });
});

describe("TransportLayer — hoist machine (detailed-asset-only)", () => {
  it("adds the hoist machine per shaft, seated at totalHeight + flatThickness = 9.15", () => {
    __injectEquipmentAssetForTest("hoist-machine", makeSimpleFakeAsset());
    const group = new TransportLayer().generate(makeRecipe());

    const hoist = findByType(group, "transport-hoist-machine");
    expect(hoist).toBeDefined();
    expect(hoist!.position.x).toBeCloseTo(0, 5);
    expect(hoist!.position.y).toBeCloseTo(9.15, 5);
    expect(hoist!.position.z).toBeCloseTo(-3.5, 5); // above the rear-band shaft

    let taggedMesh: THREE.Mesh | undefined;
    hoist!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) taggedMesh = o as THREE.Mesh;
    });
    expect(taggedMesh).toBeDefined();
    expect(taggedMesh!.castShadow).toBe(true);
    expect(taggedMesh!.receiveShadow).toBe(true);
    expect(taggedMesh!.userData.type).toBe("transport-hoist-machine");
  });

  it("does not add transport-hoist-machine when the asset is absent (no coarse fallback)", () => {
    const group = new TransportLayer().generate(makeRecipe());
    expect(findByType(group, "transport-hoist-machine")).toBeUndefined();
  });
});

describe("TransportLayer — full detailed kit together", () => {
  it("renders cab/counterweight swaps, landing doors, and hoist machine together, keeping pre-existing content", () => {
    __injectEquipmentAssetForTest("elevator-cab", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("elevator-counterweight", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("landing-door", makeSimpleFakeAsset());
    __injectEquipmentAssetForTest("hoist-machine", makeSimpleFakeAsset());

    const group = new TransportLayer().generate(makeRecipe());

    expect((findByType(group, "transport-cab") as THREE.Mesh).geometry.attributes.position.count).toBe(48);
    expect((findByType(group, "transport-counterweight") as THREE.Mesh).geometry.attributes.position.count).toBe(48);
    expect((findByType(group, "transport-landing-door") as THREE.InstancedMesh).count).toBe(3);
    expect(findByType(group, "transport-hoist-machine")).toBeDefined();

    // Pre-existing shaft / floor indicators still present
    expect(findByType(group, "transport-shaft")).toBeDefined();
    const indicator = findByType(group, "transport-floor-indicator") as THREE.InstancedMesh;
    expect(indicator.count).toBe(3);
  });
});

describe("TransportLayer dispose()", () => {
  it("does not throw with the full detailed kit present", () => {
    __injectEquipmentAssetForTest("elevator-cab", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("elevator-counterweight", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("landing-door", makeSimpleFakeAsset());
    __injectEquipmentAssetForTest("hoist-machine", makeSimpleFakeAsset());

    const layer = new TransportLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });

  it("does not throw with an empty cache", () => {
    const layer = new TransportLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});
