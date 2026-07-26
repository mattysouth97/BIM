// src/lib/layers/__tests__/layer-9-waste-assets.test.ts
// Detailed Blender-asset paths added to the Waste layer (layer-9-waste.ts):
//   - waste-chute-segment: IM geometry swap ← "waste-chute-module"
//     (unit-normalized shell baked down to the coarse cylinder's outer
//     diameter, so the per-instance (1, segHeight, 1) scaling is unchanged)
//   - waste-bin-*: per-bin Mesh geometry swap ← "wheelie-bin". The asset is
//     BASE-origin while the box it replaces is CENTRE-origin, so the clone is
//     scaled then translated down half a bin height. The asset models its own
//     lid, so the coarse slab lid is drawn for the fallback path only.
// Both have coarse fallbacks, so with an empty cache the pre-existing
// layer-9 output must be bit-for-bit unchanged.

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { WasteLayer } from "../layer-9-waste";
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

/** Two merged boxes → 48 verts, distinguishable from a 24-vert box. */
function makeMultiMeshFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  const a = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  const b = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  b.position.set(0.3, 0, 0);
  group.add(a, b);
  return group;
}

/**
 * BASE-origin fake at the wheelie-bin's registered native dims
 * (0.58 × 1.07 × 0.74), so the scale + recentre maths are observable through
 * the resulting bounding box. 48 merged verts.
 */
function makeWheelieBinFake(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 1.07, 0.74),
    new THREE.MeshStandardMaterial({ color: 0x999999 })
  );
  body.position.y = 1.07 / 2; // base origin: y ∈ [0, 1.07]
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x999999 })
  );
  lid.position.y = 1.0; // stays inside the body envelope
  group.add(body, lid);
  return group;
}

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

function coarseChuteVerts(): number {
  return new THREE.CylinderGeometry(0.18, 0.18, 1, 8).attributes.position.count;
}

/** Meshes that are neither bins nor any other tagged object = the lid slabs. */
function lidMeshes(group: THREE.Group): THREE.Mesh[] {
  const lids: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      !(obj instanceof THREE.InstancedMesh) &&
      obj.userData?.type === undefined
    ) {
      lids.push(obj);
    }
  });
  return lids;
}

// Chute 0: x = -6 + 12*0.33 = -2.04, z = -(5 - 0.25) = -4.75
const CHUTE0_X = -2.04;
const CHUTE0_Z = -4.75;
// Chute 1: x = -6 + 12*0.67 = 2.04
const CHUTE1_X = 2.04;

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

// ---------------------------------------------------------------------------
// Empty cache — pre-existing output must be untouched
// ---------------------------------------------------------------------------

describe("WasteLayer — pre-existing output (no assets)", () => {
  it("renders the chute IM from the coarse 8-segment cylinder", () => {
    const group = new WasteLayer().generate(makeRecipe());
    const chute = findByType(group, "waste-chute-segment") as THREE.InstancedMesh;
    expect(chute).toBeDefined();
    expect(chute.count).toBe(6); // 2 chutes × 3 floors
    expect(chute.geometry.attributes.position.count).toBe(coarseChuteVerts());
    const mat = chute.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x65a30d);
  });

  it("renders both bins as centre-origin boxes with their own colors", () => {
    const group = new WasteLayer().generate(makeRecipe());

    const trash = findByType(group, "waste-bin-trash") as THREE.Mesh;
    const recycle = findByType(group, "waste-bin-recycle") as THREE.Mesh;
    expect(trash).toBeDefined();
    expect(recycle).toBeDefined();

    expect(trash.geometry.attributes.position.count).toBe(24); // BoxGeometry
    expect(recycle.geometry.attributes.position.count).toBe(24);
    expect((trash.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x78350f);
    expect((recycle.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x65a30d);

    expect(trash.position.x).toBeCloseTo(CHUTE0_X, 5);
    expect(trash.position.y).toBeCloseTo(0.45, 5);
    expect(trash.position.z).toBeCloseTo(CHUTE0_Z - 0.5, 5);
    expect(recycle.position.x).toBeCloseTo(CHUTE1_X, 5);

    trash.geometry.computeBoundingBox();
    const bb = trash.geometry.boundingBox!;
    expect(bb.min.y).toBeCloseTo(-0.45, 5);
    expect(bb.max.y).toBeCloseTo(0.45, 5);
  });

  it("draws the coarse slab lid above each bin", () => {
    const group = new WasteLayer().generate(makeRecipe());
    const lids = lidMeshes(group);
    expect(lids).toHaveLength(2);
    expect(lids[0].position.y).toBeCloseTo(0.925, 5);
    expect((lids[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x404040);
  });

  it("keeps the inner tubes, hoppers and particle systems", () => {
    const group = new WasteLayer().generate(makeRecipe());
    expect(findByType(group, "waste-chute-inner")).toBeDefined();
    const hoppers = findByType(group, "waste-hopper") as THREE.InstancedMesh;
    expect(hoppers.count).toBe(6);
    expect(findByType(group, "waste-particles")).toBeDefined();
    expect(group.name).toBe("layer-9-waste");
  });
});

// ---------------------------------------------------------------------------
// Chute module swap
// ---------------------------------------------------------------------------

describe("WasteLayer — waste-chute-module geometry swap", () => {
  it("swaps the chute IM geometry, keeping material, count and matrices", () => {
    __injectEquipmentAssetForTest("waste-chute-module", makeMultiMeshFakeAsset());
    const group = new WasteLayer().generate(makeRecipe());

    const chute = findByType(group, "waste-chute-segment") as THREE.InstancedMesh;
    expect(chute.geometry.attributes.position.count).toBe(48);
    expect(chute.count).toBe(6);
    expect((chute.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x65a30d);

    // Per-instance transform unchanged: floor 1 → centre y 1.5,
    // segHeight = 3.0 − 0.04 = 2.96, scale (1, segHeight, 1)
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    chute.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), scl);
    expect(pos.x).toBeCloseTo(CHUTE0_X, 5);
    expect(pos.y).toBeCloseTo(1.5, 5);
    expect(pos.z).toBeCloseTo(CHUTE0_Z, 5);
    expect(scl.x).toBeCloseTo(1, 5);
    expect(scl.y).toBeCloseTo(2.96, 5);
    expect(scl.z).toBeCloseTo(1, 5);
  });

  it("bakes the unit module down to the coarse cylinder's outer diameter", () => {
    __injectEquipmentAssetForTest("waste-chute-module", makeMultiMeshFakeAsset());
    const group = new WasteLayer().generate(makeRecipe());

    const chute = findByType(group, "waste-chute-segment") as THREE.InstancedMesh;
    chute.geometry.computeBoundingBox();
    const bb = chute.geometry.boundingBox!;
    // Unit-wide shell → Ø 0.36 (chuteOuterRadius 0.18 × 2); unit height kept
    // so the per-instance segHeight scaling still yields the same world size.
    expect(bb.min.x).toBeCloseTo(-0.18, 5);
    expect(bb.max.z).toBeCloseTo(0.18, 5);
    expect(bb.min.y).toBeCloseTo(-0.5, 5);
    expect(bb.max.y).toBeCloseTo(0.5, 5);
  });

  it("leaves the bins on the coarse box when only the chute asset is cached", () => {
    __injectEquipmentAssetForTest("waste-chute-module", makeMultiMeshFakeAsset());
    const group = new WasteLayer().generate(makeRecipe());
    const trash = findByType(group, "waste-bin-trash") as THREE.Mesh;
    expect(trash.geometry.attributes.position.count).toBe(24);
    expect(lidMeshes(group)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Wheelie-bin swap
// ---------------------------------------------------------------------------

describe("WasteLayer — wheelie-bin geometry swap", () => {
  it("swaps both bins while preserving each bin's own color and userData", () => {
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(makeRecipe());

    const trash = findByType(group, "waste-bin-trash") as THREE.Mesh;
    const recycle = findByType(group, "waste-bin-recycle") as THREE.Mesh;
    expect(trash.geometry.attributes.position.count).toBe(48);
    expect(recycle.geometry.attributes.position.count).toBe(48);
    expect((trash.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x78350f);
    expect((recycle.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x65a30d);
    expect((trash.material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(0.8, 5);
  });

  it("gives each bin its own geometry (no shared reference)", () => {
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(makeRecipe());
    const trash = findByType(group, "waste-bin-trash") as THREE.Mesh;
    const recycle = findByType(group, "waste-bin-recycle") as THREE.Mesh;
    expect(trash.geometry).not.toBe(recycle.geometry);
  });

  it("scales and recentres the base-origin asset onto the box volume it replaces", () => {
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(makeRecipe());

    const trash = findByType(group, "waste-bin-trash") as THREE.Mesh;
    trash.geometry.computeBoundingBox();
    const bb = trash.geometry.boundingBox!;
    // Native 0.58 × 1.07 × 0.74 → 1.0 × 0.9 × 0.7, then translated down 0.45
    expect(bb.min.x).toBeCloseTo(-0.5, 5);
    expect(bb.max.x).toBeCloseTo(0.5, 5);
    expect(bb.min.y).toBeCloseTo(-0.45, 5);
    expect(bb.max.y).toBeCloseTo(0.45, 5);
    expect(bb.min.z).toBeCloseTo(-0.35, 5);
    expect(bb.max.z).toBeCloseTo(0.35, 5);

    // Mesh position unchanged → the bin's wheels still land on the ground.
    expect(trash.position.y).toBeCloseTo(0.45, 5);
    expect(trash.position.x).toBeCloseTo(CHUTE0_X, 5);
    expect(trash.position.z).toBeCloseTo(CHUTE0_Z - 0.5, 5);
  });

  it("drops the coarse slab lid — the detailed bin models its own", () => {
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(makeRecipe());
    expect(lidMeshes(group)).toHaveLength(0);
  });

  it("leaves the chute on the coarse cylinder when only the bin asset is cached", () => {
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(makeRecipe());
    const chute = findByType(group, "waste-chute-segment") as THREE.InstancedMesh;
    expect(chute.geometry.attributes.position.count).toBe(coarseChuteVerts());
  });
});

// ---------------------------------------------------------------------------
// Full kit + lifecycle
// ---------------------------------------------------------------------------

describe("WasteLayer — full detailed kit", () => {
  it("renders both swaps together and keeps the rest of the layer", () => {
    __injectEquipmentAssetForTest("waste-chute-module", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(makeRecipe());

    expect(
      (findByType(group, "waste-chute-segment") as THREE.InstancedMesh).geometry.attributes
        .position.count
    ).toBe(48);
    expect(
      (findByType(group, "waste-bin-trash") as THREE.Mesh).geometry.attributes.position.count
    ).toBe(48);
    expect(findByType(group, "waste-chute-inner")).toBeDefined();
    expect(findByType(group, "waste-hopper")).toBeDefined();
    expect(findByType(group, "waste-particles")).toBeDefined();
  });

  it("returns an empty named group when the building has no above floors", () => {
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const group = new WasteLayer().generate(
      makeRecipe({
        floors: [
          { floorNo: -1, label: "B1", type: "below", y: -3, height: 3, isGroundFloor: false },
        ],
      })
    );
    expect(group.name).toBe("layer-9-waste");
    expect(group.children).toHaveLength(0);
  });
});

describe("WasteLayer dispose()", () => {
  it("does not throw with the full detailed kit present", () => {
    __injectEquipmentAssetForTest("waste-chute-module", makeMultiMeshFakeAsset());
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    const layer = new WasteLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });

  it("does not throw with an empty cache", () => {
    const layer = new WasteLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });

  it("regenerating disposes the previous group without throwing", () => {
    const layer = new WasteLayer();
    layer.generate(makeRecipe());
    __injectEquipmentAssetForTest("wheelie-bin", makeWheelieBinFake());
    expect(() => layer.generate(makeRecipe())).not.toThrow();
    layer.dispose();
  });
});
