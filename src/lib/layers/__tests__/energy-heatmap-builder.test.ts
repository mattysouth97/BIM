// src/lib/layers/__tests__/energy-heatmap-builder.test.ts
// Unit tests for energy-heatmap-builder.ts
// Pure Three.js — no React, no canvas, no renderer needed.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  kwhmToColor,
  buildEnergyHeatmap,
  HEATMAP_GROUP_NAME,
  HEATMAP_Y_OFFSET,
} from "../energy-heatmap-builder";
import { getEnergyGrade, getGradeColor } from "@/lib/energy/energy-grade";
import type { FloorSpec, BuildingRecipe } from "@/lib/procedural/types";

// Helper: parse a CSS hex string via THREE.Color so the color space conversion
// matches exactly what kwhmToColor produces (Three.js r152+ converts hex to
// linear sRGB internally). By constructing BOTH sides the same way we avoid
// the sRGB gamma mismatch that would occur if we manually divided by 255.
function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Minimal BuildingRecipe for tests */
function makeRecipe(
  overrides: Partial<BuildingRecipe> = {}
): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 15,
    totalHeight: 12,
    floors: [],
    era: "modern",
    structureType: "rc",
    useType: "residential",
    facadeStyle: "standard",
    wallThickness: 0.2,
    facade: {
      windowRatio: 0.3,
      spandrelHeight: 0.8,
      mullionSpacing: 1.5,
      hasCornerGlazing: false,
    },
    slab: { thickness: 0.25, material: "concrete" },
    column: { width: 0.4, depth: 0.4, material: "concrete" },
    roof: { type: "flat", material: "concrete" },
    ...overrides,
  } as BuildingRecipe;
}

/** Build a minimal FloorSpec */
function makeFloor(
  floorNo: number,
  type: "above" | "below",
  y: number
): FloorSpec {
  return {
    floorNo,
    label: `${type === "above" ? "F" : "B"}${floorNo}`,
    type,
    y,
    height: 3,
    isGroundFloor: floorNo === 1 && type === "above",
  };
}

// ─── Test 1: kwhmToColor ────────────────────────────────────────────────────

describe("kwhmToColor", () => {
  const cases: [number, string][] = [
    [50, getGradeColor(getEnergyGrade(50))],   // Grade 1+++ → #006400
    [100, getGradeColor(getEnergyGrade(100))], // Grade 1+  → #32CD32
    [200, getGradeColor(getEnergyGrade(200))], // Grade 3   → #FFD700
    [400, getGradeColor(getEnergyGrade(400))], // Grade 7   → #DC143C
  ];

  it.each(cases)(
    "kwhmToColor(%d) returns THREE.Color matching getGradeColor(getEnergyGrade(%d))",
    (kwh, expectedHex) => {
      const color = kwhmToColor(kwh);
      expect(color).toBeInstanceOf(THREE.Color);
      // Construct expected via THREE.Color so both sides go through identical
      // color-space conversion (Three.js r152+ converts CSS hex to linear sRGB)
      const expected = hexToThreeColor(expectedHex);
      expect(color.r).toBeCloseTo(expected.r, 5);
      expect(color.g).toBeCloseTo(expected.g, 5);
      expect(color.b).toBeCloseTo(expected.b, 5);
    }
  );
});

// ─── Test 2: Group name and child count ─────────────────────────────────────

describe("buildEnergyHeatmap", () => {
  it("returns a THREE.Group named 'energy-heatmap' with only above-floor children", () => {
    const floors: FloorSpec[] = [
      makeFloor(1, "below", -3),
      makeFloor(2, "below", -6),
      makeFloor(1, "above", 0),
      makeFloor(2, "above", 3),
      makeFloor(3, "above", 6),
    ];
    const recipe = makeRecipe({ floors });
    const group = buildEnergyHeatmap(floors, [100, 200, 300], recipe);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe(HEATMAP_GROUP_NAME);
    expect(group.children.length).toBe(3); // only above-grade floors
  });

  // ─── Test 3: Mesh geometry + material properties ──────────────────────────

  it("each child is a THREE.Mesh with PlaneGeometry + MeshBasicMaterial(vertexColors:true)", () => {
    const floors: FloorSpec[] = [
      makeFloor(1, "above", 0),
      makeFloor(2, "above", 3),
    ];
    const recipe = makeRecipe({ floors });
    const group = buildEnergyHeatmap(floors, [100, 300], recipe);

    for (const child of group.children) {
      expect(child).toBeInstanceOf(THREE.Mesh);
      const mesh = child as THREE.Mesh;
      expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
      expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      expect(mat.vertexColors).toBe(true);
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.userData.type).toBe("energy-heatmap-floor");
      // Color buffer attribute must exist
      expect(mesh.geometry.attributes.color).toBeDefined();
      const colorAttr = mesh.geometry.attributes.color;
      expect(colorAttr.array).toBeInstanceOf(Float32Array);
      expect(colorAttr.itemSize).toBe(3);
    }
  });

  // ─── Test 4: Y placement offset ──────────────────────────────────────────

  it("positions each mesh at floor.y + HEATMAP_Y_OFFSET", () => {
    const floors: FloorSpec[] = [
      makeFloor(1, "above", 0),
      makeFloor(2, "above", 3),
      makeFloor(3, "above", 6),
    ];
    const recipe = makeRecipe({ floors });
    const group = buildEnergyHeatmap(floors, [100, 200, 300], recipe);

    const expectedY = [0 + HEATMAP_Y_OFFSET, 3 + HEATMAP_Y_OFFSET, 6 + HEATMAP_Y_OFFSET];
    group.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      expect(mesh.position.y).toBeCloseTo(expectedY[i], 5);
    });
  });

  // ─── Test 5: perFloor indexing matches floors.filter(f => f.type === "above") ─

  it("perFloor indexing matches above-floor order when mixed with below-floors", () => {
    const floors: FloorSpec[] = [
      makeFloor(1, "below", -3),
      makeFloor(1, "above", 0),
      makeFloor(2, "above", 3),
      makeFloor(2, "below", -6),
      makeFloor(3, "above", 6),
    ];
    const perFloorKwh = [10, 200, 400];
    const recipe = makeRecipe({ floors });
    const group = buildEnergyHeatmap(floors, perFloorKwh, recipe);

    expect(group.children.length).toBe(3);

    const expectedColors = perFloorKwh.map((kwh) => kwhmToColor(kwh));

    group.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const colorAttr = mesh.geometry.attributes.color;
      // Read first vertex color triplet
      const r = colorAttr.getX(0);
      const g = colorAttr.getY(0);
      const b = colorAttr.getZ(0);
      expect(r).toBeCloseTo(expectedColors[i].r, 5);
      expect(g).toBeCloseTo(expectedColors[i].g, 5);
      expect(b).toBeCloseTo(expectedColors[i].b, 5);
    });
  });

  // ─── Test 6: Graceful degradation ─────────────────────────────────────────

  it("handles perFloorKwh shorter than aboveFloors without throwing (defaults to 0)", () => {
    const floors: FloorSpec[] = [
      makeFloor(1, "above", 0),
      makeFloor(2, "above", 3),
      makeFloor(3, "above", 6),
    ];
    const recipe = makeRecipe({ floors });

    // perFloorKwh has only 1 entry for 3 above floors
    expect(() => {
      const group = buildEnergyHeatmap(floors, [150], recipe);
      expect(group.children.length).toBe(3);
      // Missing entries default to kwhmToColor(0) → Grade 1+++ color
      const zeroColor = kwhmToColor(0);
      for (let i = 1; i < 3; i++) {
        const mesh = group.children[i] as THREE.Mesh;
        const colorAttr = mesh.geometry.attributes.color;
        expect(colorAttr.getX(0)).toBeCloseTo(zeroColor.r, 5);
      }
    }).not.toThrow();
  });

  it("handles empty aboveFloors without throwing (returns group with 0 children)", () => {
    const floors: FloorSpec[] = [
      makeFloor(1, "below", -3),
      makeFloor(2, "below", -6),
    ];
    const recipe = makeRecipe({ floors });

    expect(() => {
      const group = buildEnergyHeatmap(floors, [], recipe);
      expect(group.children.length).toBe(0);
    }).not.toThrow();
  });
});
