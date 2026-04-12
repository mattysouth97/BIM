// src/lib/layers/__tests__/layer-6-dhw.test.ts
// Unit tests for DHWLayer generator — verifies merged tank geometry + pump housing.

import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { DHWLayer } from "../layer-6-dhw";
import type { BuildingRecipe } from "@/lib/procedural/types";

// ---------------------------------------------------------------------------
// Mock recipe — 1 basement + 2 above-ground floors
// ---------------------------------------------------------------------------

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 12,
    footprintDepth: 10,
    floors: [
      { floorNo: -1, label: "B1", type: "basement", y: -3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 6.0,
    wallThickness: 0.2,
    era: "2000s",
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
      column: { color: 0x999999, roughness: 0.8, metalness: 0.0 },
      roof: { color: 0x888888, roughness: 0.7, metalness: 0.1 },
      groundFloor: { color: 0xbbbbbb, roughness: 0.9, metalness: 0.0 },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMeshesByType(group: THREE.Group, type: string): THREE.Mesh[] {
  const results: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData.type === type) {
      results.push(obj);
    }
  });
  return results;
}

function plainCylinderVertexCount(radiusTop: number, radiusBottom: number, height: number, radialSegments: number): number {
  // THREE.CylinderGeometry position attribute count (non-indexed geometry after conversion)
  // Indexed: (radialSegments + 1) * 2 (ring verts) + radialSegments * 2 (cap centers) + radialSegments * 2 (outer cap verts)
  // The .count of position attribute on a fresh CylinderGeometry
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
  const count = geo.attributes.position.count;
  geo.dispose();
  return count;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DHWLayer", () => {
  let layer: DHWLayer;
  let recipe: BuildingRecipe;

  beforeEach(() => {
    layer = new DHWLayer();
    recipe = makeRecipe();
  });

  it("1. generate() returns a Group named 'layer-6-dhw'", () => {
    const group = layer.generate(recipe);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("layer-6-dhw");
  });

  it("2. Group contains a Mesh with userData.type === 'dhw-storage-tank'", () => {
    const group = layer.generate(recipe);
    const tanks = findMeshesByType(group, "dhw-storage-tank");
    expect(tanks.length).toBeGreaterThanOrEqual(1);
  });

  it("3. Storage tank geometry has MORE vertices than a plain CylinderGeometry(0.6, 0.6, 1.8, 16) — proves pipe stubs are merged", () => {
    const group = layer.generate(recipe);
    const tanks = findMeshesByType(group, "dhw-storage-tank");
    expect(tanks.length).toBeGreaterThanOrEqual(1);

    const tankMesh = tanks[0];
    const mergedCount = tankMesh.geometry.attributes.position.count;
    const plainCount = plainCylinderVertexCount(0.6, 0.6, 1.8, 16);

    expect(mergedCount).toBeGreaterThan(plainCount);
  });

  it("4. Group contains a Mesh with userData.type === 'dhw-pump' (NEW — pump housing)", () => {
    const group = layer.generate(recipe);
    const pumps = findMeshesByType(group, "dhw-pump");
    expect(pumps.length).toBeGreaterThanOrEqual(1);
  });

  it("5. Group contains a Mesh with userData.type === 'dhw-recirc-tank' (secondary tank preserved)", () => {
    const group = layer.generate(recipe);
    const recirc = findMeshesByType(group, "dhw-recirc-tank");
    expect(recirc.length).toBeGreaterThanOrEqual(1);
  });

  it("6. Branches and returns are preserved (userData.type starting with dhw-branch / dhw-return)", () => {
    const group = layer.generate(recipe);
    const branches: THREE.Mesh[] = [];
    const returns: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.userData.type === "dhw-branch") branches.push(obj);
        if (obj.userData.type === "dhw-return") returns.push(obj);
      }
    });
    expect(branches.length).toBeGreaterThan(0);
    expect(returns.length).toBeGreaterThan(0);
  });

  it("7. generate(recipe, 1.0, { showPump: false }) produces NO dhw-pump mesh", () => {
    const group = layer.generate(recipe, 1.0, { showPump: false });
    const pumps = findMeshesByType(group, "dhw-pump");
    expect(pumps.length).toBe(0);
  });

  it("8. generate(recipe, 1.0, { tankRadius: 0.9 }) uses 0.9 radius — bounding sphere larger than default", () => {
    const groupDefault = layer.generate(recipe);
    const tanksDefault = findMeshesByType(groupDefault, "dhw-storage-tank");
    tanksDefault[0].geometry.computeBoundingSphere();
    const defaultRadius = tanksDefault[0].geometry.boundingSphere!.radius;

    layer.dispose();
    const groupCustom = layer.generate(recipe, 1.0, { tankRadius: 0.9 });
    const tanksCustom = findMeshesByType(groupCustom, "dhw-storage-tank");
    tanksCustom[0].geometry.computeBoundingSphere();
    const customRadius = tanksCustom[0].geometry.boundingSphere!.radius;

    // Larger radius → larger bounding sphere
    expect(customRadius).toBeGreaterThan(defaultRadius);
  });

  it("9. dispose() does not throw; double-dispose is safe", () => {
    layer.generate(recipe);
    expect(() => layer.dispose()).not.toThrow();
    expect(() => layer.dispose()).not.toThrow();
  });
});
