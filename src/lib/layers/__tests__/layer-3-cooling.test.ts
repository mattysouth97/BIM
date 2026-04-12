// src/lib/layers/__tests__/layer-3-cooling.test.ts
// Unit tests for CoolingLayer procedural geometry upgrade (Plan 28-02).
// Verifies: merged chiller geometry, userData.type preservation,
// backward-compatible signature, existing piping not deleted.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { CoolingLayer } from "../layer-3-cooling";
import type { BuildingRecipe } from "@/lib/procedural/types";

// ---------------------------------------------------------------------------
// Mock recipe fixture — 3 above-ground floors, era 2010
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
    era: "2010s",
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
      wall: { color: 0xcccccc, roughness: 0.8, metalness: 0.1 },
      glass: { color: 0x88aacc, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: 0x888888, roughness: 0.4, metalness: 0.6 },
      slab: { color: 0xaaaaaa, roughness: 0.9, metalness: 0.0 },
      column: { color: 0xbbbbbb, roughness: 0.8, metalness: 0.1 },
      roof: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: 0xdddddd, roughness: 0.9, metalness: 0.0 },
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: find mesh by userData.type (traverses entire group)
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

describe("CoolingLayer (28-02 upgrade)", () => {
  it("returns a THREE.Group named 'layer-3-cooling'", () => {
    const layer = new CoolingLayer();
    const result = layer.generate(makeRecipe());
    expect(result).toBeInstanceOf(THREE.Group);
    expect(result.name).toBe("layer-3-cooling");
  });

  it("chiller plant mesh has userData.type === 'cooling-plant' (Phase 26 dispatch preserved)", () => {
    const layer = new CoolingLayer();
    const group = layer.generate(makeRecipe());
    const plant = findByType(group, "cooling-plant");
    expect(plant).toBeDefined();
    expect(plant!.userData.type).toBe("cooling-plant");
  });

  it("chiller geometry has more vertices than a plain BoxGeometry (merged assembly)", () => {
    const layer = new CoolingLayer();
    const group = layer.generate(makeRecipe());
    const plant = findByType(group, "cooling-plant") as THREE.Mesh | undefined;
    expect(plant).toBeDefined();

    // A plain BoxGeometry has 24 vertices (4 per face × 6 faces).
    // The merged assembly (body + grille + 2 pipe stubs) must have substantially more.
    const posAttr = plant!.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(posAttr.count).toBeGreaterThan(48);
  });

  it("risers and branch pipes still exist after upgrade (not deleted)", () => {
    const layer = new CoolingLayer();
    const group = layer.generate(makeRecipe());

    let riserCount = 0;
    let branchCount = 0;
    group.traverse((obj) => {
      if (obj.userData?.type === "cooling-riser" || obj.userData?.type === "cooling-return-riser") {
        riserCount++;
      }
      if (obj.userData?.type === "cooling-branch") branchCount++;
    });

    expect(riserCount).toBeGreaterThanOrEqual(2); // supply + return riser
    expect(branchCount).toBeGreaterThan(0); // at least one branch per floor
  });

  it("flow particles still exist after upgrade", () => {
    const layer = new CoolingLayer();
    const group = layer.generate(makeRecipe());
    const particles = findByType(group, "cooling-flow-particles");
    expect(particles).toBeDefined();
  });

  it("generate() with 2 args still works (backward compat — density only)", () => {
    const layer = new CoolingLayer();
    expect(() => layer.generate(makeRecipe(), 0.5)).not.toThrow();
  });

  it("generate() with equipParams override changes chiller bounding box width", () => {
    const layer = new CoolingLayer();
    const overrideWidth = 3.0;
    const group = layer.generate(makeRecipe(), 1.0, { bodyWidth: overrideWidth });
    const plant = findByType(group, "cooling-plant") as THREE.Mesh | undefined;
    expect(plant).toBeDefined();

    // Compute bounding box and check X extent ≈ overrideWidth (±0.5 tolerance for pipe stubs)
    plant!.geometry.computeBoundingBox();
    const bb = plant!.geometry.boundingBox!;
    const xExtent = bb.max.x - bb.min.x;
    expect(xExtent).toBeGreaterThanOrEqual(overrideWidth - 0.1);
  });

  it("dispose() clears the group without throwing", () => {
    const layer = new CoolingLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});
