// src/lib/layers/__tests__/layer-4-heating.test.ts
// Unit tests for HeatingLayer procedural geometry upgrade (Plan 28-02).
// Verifies: merged boiler geometry, VRF head InstancedMesh, fan coil InstancedMesh,
// instanceMatrix.needsUpdate, backward-compatible signature, existing piping not deleted.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { HeatingLayer } from "../layer-4-heating";
import type { BuildingRecipe } from "@/lib/procedural/types";

// ---------------------------------------------------------------------------
// Mock recipe fixture — 3 above-ground floors
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: find object by userData.type
// ---------------------------------------------------------------------------

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (obj.userData?.type === type) found = obj;
  });
  return found;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HeatingLayer (28-02 upgrade)", () => {
  it("returns a THREE.Group named 'layer-4-heating'", () => {
    const layer = new HeatingLayer();
    const result = layer.generate(makeRecipe());
    expect(result).toBeInstanceOf(THREE.Group);
    expect(result.name).toBe("layer-4-heating");
  });

  it("boiler mesh has userData.type === 'heating-boiler' (Phase 26 dispatch preserved)", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const boiler = findByType(group, "heating-boiler");
    expect(boiler).toBeDefined();
    expect(boiler!.userData.type).toBe("heating-boiler");
  });

  it("boiler geometry has more vertices than a plain BoxGeometry (cylinder body + flue = merged assembly)", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const boiler = findByType(group, "heating-boiler") as THREE.Mesh | undefined;
    expect(boiler).toBeDefined();

    // A plain BoxGeometry has 24 vertices. A merged cylinder assembly has significantly more.
    const posAttr = boiler!.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(posAttr.count).toBeGreaterThan(48);
  });

  it("VRF head InstancedMesh exists with correct userData.type", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const vrfIM = findByType(group, "heating-vrf-head");
    expect(vrfIM).toBeDefined();
    expect(vrfIM).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("VRF InstancedMesh instanceMatrix has been marked for update (version >= 1)", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const vrfIM = findByType(group, "heating-vrf-head") as THREE.InstancedMesh | undefined;
    expect(vrfIM).toBeDefined();
    // needsUpdate is a write-only setter on BufferAttribute — it increments .version.
    // version >= 1 proves instanceMatrix.needsUpdate = true was called after setMatrixAt.
    expect(vrfIM!.instanceMatrix.version).toBeGreaterThanOrEqual(1);
  });

  it("VRF IM instance count matches roof cluster size (default vrfLocation=roof)", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const vrfIM = findByType(group, "heating-vrf-head") as THREE.InstancedMesh | undefined;
    expect(vrfIM).toBeDefined();
    // Default: vrfLocation="roof", vrfHeadsPerFloor=2 → count = 2 × 2 = 4
    expect(vrfIM!.count).toBe(4);
  });

  it("fan coil InstancedMesh exists with correct userData.type", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const fcIM = findByType(group, "heating-fan-coil");
    expect(fcIM).toBeDefined();
    expect(fcIM).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("fan coil InstancedMesh instanceMatrix has been marked for update (version >= 1)", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const fcIM = findByType(group, "heating-fan-coil") as THREE.InstancedMesh | undefined;
    expect(fcIM).toBeDefined();
    // needsUpdate is a write-only setter on BufferAttribute — it increments .version.
    // version >= 1 proves instanceMatrix.needsUpdate = true was called after setMatrixAt.
    expect(fcIM!.instanceMatrix.version).toBeGreaterThanOrEqual(1);
  });

  it("fan coil IM instance count equals number of above floors", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());
    const fcIM = findByType(group, "heating-fan-coil") as THREE.InstancedMesh | undefined;
    expect(fcIM).toBeDefined();
    // 3 above floors → 3 fan coil instances
    expect(fcIM!.count).toBe(3);
  });

  it("generate() with vrfHeads=false skips VRF InstancedMesh entirely", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe(), 1.0, { vrfHeads: false });
    const vrfIM = findByType(group, "heating-vrf-head");
    expect(vrfIM).toBeUndefined();
  });

  it("risers and floor pipes still exist after upgrade (not deleted)", () => {
    const layer = new HeatingLayer();
    const group = layer.generate(makeRecipe());

    let riserCount = 0;
    let floorPipeCount = 0;
    group.traverse((obj) => {
      if (obj.userData?.type === "heating-riser" || obj.userData?.type === "heating-return-riser") {
        riserCount++;
      }
      if (obj.userData?.type === "heating-floor-pipe") floorPipeCount++;
    });

    expect(riserCount).toBeGreaterThanOrEqual(2);
    expect(floorPipeCount).toBeGreaterThan(0);
  });

  it("generate() with 2 args still works (backward compat — density only)", () => {
    const layer = new HeatingLayer();
    expect(() => layer.generate(makeRecipe(), 0.5)).not.toThrow();
  });

  it("dispose() clears the group without throwing", () => {
    const layer = new HeatingLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});
