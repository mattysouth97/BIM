// src/lib/layers/__tests__/layer-11-8-assets.test.ts
// Detailed Blender-asset paths added to the Telecom layer (layer-11-telecom.ts)
// and the Media layer (layer-8-media.ts):
//   - telecom-server-rack / telecom-wap: geometry-only swaps (existing
//     material, matrices, and userData untouched)
//   - telecom-cctv: 4-per-floor ceiling InstancedMesh (detailed-asset-only)
//   - telecom-antenna: single rooftop getEquipmentObjectClone, gated on
//     min(footprintWidth, footprintDepth) >= 8 (detailed-asset-only)
//   - media-valve: geometry-only swap (existing material, matrices untouched)
// rack/wap/valve have a coarse fallback, so with an empty cache the
// pre-existing layer-11 / layer-8 output must be unchanged. cctv and antenna
// have NO coarse fallback — they simply don't appear when their asset isn't
// loaded (and antenna additionally requires the footprint gate).

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { TelecomLayer } from "../layer-11-telecom";
import { MediaLayer } from "../layer-8-media";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "@/lib/procedural/types";

function makeRecipe(overrides?: Partial<BuildingRecipe>): BuildingRecipe {
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
    ...overrides,
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

// ---------------------------------------------------------------------------
// TelecomLayer
// ---------------------------------------------------------------------------

describe("TelecomLayer — pre-existing output (no assets)", () => {
  it("renders the server-rack IM (24-vert box) and WAP IM (coarse cylinder) exactly as before", () => {
    const group = new TelecomLayer().generate(makeRecipe());

    const rack = findByType(group, "telecom-server-rack") as THREE.InstancedMesh;
    expect(rack).toBeDefined();
    // rackCount = clamp(floor(12/4), 2, 6) = 3
    expect(rack.count).toBe(3);
    expect(rack.geometry.attributes.position.count).toBe(24); // plain BoxGeometry
    const rackMat = rack.material as THREE.MeshStandardMaterial;
    expect(rackMat.color.getHex()).toBe(0x1e1e2e);
    expect(rackMat.metalness).toBeCloseTo(0.7, 5);
    expect(rackMat.roughness).toBeCloseTo(0.3, 5);

    const wap = findByType(group, "telecom-wap") as THREE.InstancedMesh;
    expect(wap).toBeDefined();
    const fallbackWapVerts = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12)
      .attributes.position.count;
    expect(wap.geometry.attributes.position.count).toBe(fallbackWapVerts);
    const wapMat = wap.material as THREE.MeshStandardMaterial;
    expect(wapMat.color.getHex()).toBe(0xf0f0f0);
    expect(wapMat.emissive.getHex()).toBe(0x06b6d4);
  });

  it("adds neither telecom-cctv nor telecom-antenna when the cache is empty", () => {
    const group = new TelecomLayer().generate(makeRecipe());
    expect(findByType(group, "telecom-cctv")).toBeUndefined();
    expect(findByType(group, "telecom-antenna")).toBeUndefined();
  });
});

describe("TelecomLayer — server-rack / WAP geometry-only swap", () => {
  it("swaps the rack geometry when comm-rack is loaded, keeping material/count/matrices", () => {
    __injectEquipmentAssetForTest("comm-rack", makeMultiMeshFakeAsset());
    const group = new TelecomLayer().generate(makeRecipe());

    const rack = findByType(group, "telecom-server-rack") as THREE.InstancedMesh;
    expect(rack).toBeDefined();
    expect(rack.geometry.attributes.position.count).toBe(48); // merged 2-box fake
    expect(rack.count).toBe(3);
    const rackMat = rack.material as THREE.MeshStandardMaterial;
    expect(rackMat.color.getHex()).toBe(0x1e1e2e);

    // Matrices unchanged: rackSpacing=0.9, rackRowStart=-(3*0.9)/2=-1.35
    // instance 0: x = 0 + -1.35 + 0*0.9 = -1.35, y = -0.5+1.0 = 0.5, z = 0
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    rack.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.x).toBeCloseTo(-1.35, 5);
    expect(pos.y).toBeCloseTo(0.5, 5);
    expect(pos.z).toBeCloseTo(0, 5);
  });

  it("swaps the WAP geometry when wifi-ap is loaded, keeping material/matrices", () => {
    __injectEquipmentAssetForTest("wifi-ap", makeMultiMeshFakeAsset());
    const group = new TelecomLayer().generate(makeRecipe());

    const wap = findByType(group, "telecom-wap") as THREE.InstancedMesh;
    expect(wap).toBeDefined();
    expect(wap.geometry.attributes.position.count).toBe(48);
    const wapMat = wap.material as THREE.MeshStandardMaterial;
    expect(wapMat.color.getHex()).toBe(0xf0f0f0);
    expect(wapMat.emissiveIntensity).toBeCloseTo(0.2, 5);

    // Matrices unchanged: wapSpacingX = max(4, sqrt(80)) ~= 8.944271910
    // wapColsX = floor(12/8.944...) = 1, wapColsZ = floor(10/8.944...) = 1
    // instance 0 (floor 1): x = -6 + 4.472135955 = -1.527864045
    //   z = -5 + 4.472135955 = -0.527864045, y = 3.0 - 0.05 = 2.95
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    wap.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.x).toBeCloseTo(-1.527864045, 5);
    expect(pos.y).toBeCloseTo(2.95, 5);
    expect(pos.z).toBeCloseTo(-0.527864045, 5);
  });

  it("swaps rack and WAP independently (only rack asset loaded)", () => {
    __injectEquipmentAssetForTest("comm-rack", makeMultiMeshFakeAsset());
    const group = new TelecomLayer().generate(makeRecipe());

    const rack = findByType(group, "telecom-server-rack") as THREE.InstancedMesh;
    expect(rack.geometry.attributes.position.count).toBe(48);

    const wap = findByType(group, "telecom-wap") as THREE.InstancedMesh;
    const fallbackWapVerts = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12)
      .attributes.position.count;
    expect(wap.geometry.attributes.position.count).toBe(fallbackWapVerts); // unswapped
  });
});

describe("TelecomLayer — CCTV (detailed-asset-only)", () => {
  it("adds 4 cameras per above floor at the core-corner ceiling positions", () => {
    __injectEquipmentAssetForTest("cctv-camera", makeSimpleFakeAsset());
    const group = new TelecomLayer().generate(makeRecipe());

    const im = findByType(group, "telecom-cctv") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    expect(im.count).toBe(12); // 4 per floor * 3 floors

    const mat = im.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x475569);
    expect(mat.emissive.getHex()).toBe(0x22d3ee);
    expect(mat.emissiveIntensity).toBeCloseTo(0.2, 5);

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    im.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    // instance 0: (1.5, floor1.y + floor1.height - 0.25, 1.2) = (1.5, 2.75, 1.2)
    expect(pos.x).toBeCloseTo(1.5, 5);
    expect(pos.y).toBeCloseTo(2.75, 5);
    expect(pos.z).toBeCloseTo(1.2, 5);
  });

  it("does not add telecom-cctv when the asset is absent (no coarse fallback)", () => {
    const group = new TelecomLayer().generate(makeRecipe());
    expect(findByType(group, "telecom-cctv")).toBeUndefined();
  });
});

describe("TelecomLayer — rooftop antenna (detailed-asset-only, footprint-gated)", () => {
  it("adds the antenna at totalHeight + flatThickness when footprint >= 8 and the asset is loaded", () => {
    __injectEquipmentAssetForTest("antenna-mast", makeSimpleFakeAsset());
    const group = new TelecomLayer().generate(makeRecipe()); // min(12,10) = 10 >= 8

    const antenna = findByType(group, "telecom-antenna");
    expect(antenna).toBeDefined();
    // x = footprintWidth*0.25 = 3.0, y = totalHeight + flatThickness = 9.0+0.15 = 9.15
    // z = footprintDepth*0.25 = 2.5
    expect(antenna!.position.x).toBeCloseTo(3.0, 5);
    expect(antenna!.position.y).toBeCloseTo(9.15, 5);
    expect(antenna!.position.z).toBeCloseTo(2.5, 5);

    let taggedMesh: THREE.Mesh | undefined;
    antenna!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) taggedMesh = o as THREE.Mesh;
    });
    expect(taggedMesh).toBeDefined();
    expect(taggedMesh!.castShadow).toBe(true);
    expect(taggedMesh!.receiveShadow).toBe(true);
    expect(taggedMesh!.userData.type).toBe("telecom-antenna");
  });

  it("does not add the antenna when the asset is loaded but the footprint gate fails (7x7 < 8)", () => {
    __injectEquipmentAssetForTest("antenna-mast", makeSimpleFakeAsset());
    const smallRecipe = makeRecipe({ footprintWidth: 7, footprintDepth: 7 });
    const group = new TelecomLayer().generate(smallRecipe);
    expect(findByType(group, "telecom-antenna")).toBeUndefined();
  });

  it("does not add the antenna when the footprint gate passes but the asset is absent", () => {
    const group = new TelecomLayer().generate(makeRecipe()); // min=10 >= 8, no asset
    expect(findByType(group, "telecom-antenna")).toBeUndefined();
  });
});

describe("TelecomLayer — full detailed kit together", () => {
  it("renders rack/wap swaps, cctv, and antenna together, keeping pre-existing content", () => {
    __injectEquipmentAssetForTest("comm-rack", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("wifi-ap", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("cctv-camera", makeSimpleFakeAsset());
    __injectEquipmentAssetForTest("antenna-mast", makeSimpleFakeAsset());

    const group = new TelecomLayer().generate(makeRecipe());

    expect((findByType(group, "telecom-server-rack") as THREE.InstancedMesh).geometry.attributes.position.count).toBe(48);
    expect((findByType(group, "telecom-wap") as THREE.InstancedMesh).geometry.attributes.position.count).toBe(48);
    expect((findByType(group, "telecom-cctv") as THREE.InstancedMesh).count).toBe(12);
    expect(findByType(group, "telecom-antenna")).toBeDefined();

    // Pre-existing backbone / fiber content still present
    expect(findByType(group, "telecom-backbone")).toBeDefined();
    expect(findByType(group, "telecom-rack-led")).toBeDefined();
  });
});

describe("TelecomLayer dispose()", () => {
  it("does not throw with the full detailed kit present", () => {
    __injectEquipmentAssetForTest("comm-rack", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("wifi-ap", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("cctv-camera", makeSimpleFakeAsset());
    __injectEquipmentAssetForTest("antenna-mast", makeSimpleFakeAsset());

    const layer = new TelecomLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });

  it("does not throw with an empty cache", () => {
    const layer = new TelecomLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// MediaLayer
// ---------------------------------------------------------------------------

describe("MediaLayer — pre-existing output (no assets)", () => {
  it("renders the valve IM (24-vert box) exactly as before", () => {
    const group = new MediaLayer().generate(makeRecipe());

    const valve = findByType(group, "media-valve") as THREE.InstancedMesh;
    expect(valve).toBeDefined();
    expect(valve.count).toBe(4); // 4 riser positions
    expect(valve.geometry.attributes.position.count).toBe(24); // plain BoxGeometry
    const mat = valve.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xe0e0e0);
    expect(mat.metalness).toBeCloseTo(0.9, 5);
    expect(mat.roughness).toBeCloseTo(0.1, 5);
  });
});

describe("MediaLayer — media-valve geometry-only swap", () => {
  it("swaps the valve geometry when gas-valve-station is loaded, keeping material/matrices", () => {
    __injectEquipmentAssetForTest("gas-valve-station", makeMultiMeshFakeAsset());
    const group = new MediaLayer().generate(makeRecipe());

    const valve = findByType(group, "media-valve") as THREE.InstancedMesh;
    expect(valve).toBeDefined();
    expect(valve.geometry.attributes.position.count).toBe(48); // merged 2-box fake
    expect(valve.count).toBe(4);
    const mat = valve.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xe0e0e0);

    // Matrices unchanged: riserOffsetX = 12*0.15 = 1.8, riserOffsetZ = 10*0.15 = 1.5
    // riserPositions[0] = NW = (-1.8, -1.5); y = totalHeight + 0.1 = 9.1
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    valve.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.x).toBeCloseTo(-1.8, 5);
    expect(pos.y).toBeCloseTo(9.1, 5);
    expect(pos.z).toBeCloseTo(-1.5, 5);
  });
});

describe("MediaLayer dispose()", () => {
  it("does not throw with the valve asset present", () => {
    __injectEquipmentAssetForTest("gas-valve-station", makeMultiMeshFakeAsset());
    const layer = new MediaLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });

  it("does not throw with an empty cache", () => {
    const layer = new MediaLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});
