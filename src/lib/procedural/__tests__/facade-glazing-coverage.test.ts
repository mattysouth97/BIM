// src/lib/procedural/__tests__/facade-glazing-coverage.test.ts
// Glazing coverage invariant. `seededRandom` decides, per column, whether a
// facade bay is glass or a solid spandrel. Its output must be spread over
// [0,1) — if it instead ramps with floorNo, the solid/glass choice stops being
// a scatter and becomes a horizontal split: every bay solid at the bottom,
// every bay glass at the top. That is invisible in a unit test of the seed
// function and very visible on the building, so it is pinned here on the
// generated geometry.

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { generateFacade } from "../facade-generator";
import type { BuildingRecipe, FloorSpec } from "../types";

const FLOOR_HEIGHT = 4.15;

function makeFloors(count: number): FloorSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * FLOOR_HEIGHT,
    height: FLOOR_HEIGHT,
    isGroundFloor: i === 0,
  }));
}

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  const floors = overrides.floors ?? makeFloors(10);
  return {
    footprintWidth: 34,
    footprintDepth: 24,
    floors,
    totalHeight: floors.length * FLOOR_HEIGHT,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "14000",
    column: { spacing: 6, size: 0.5, inset: 0.5 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.6,
      windowHeight: 1.8,
      sillHeight: 0.7,
      windowSpacing: 2.4,
      windowRatio: 0.7,
      mullionDepth: 0.06,
      mullionWidth: 0.03,
      glassInset: 0.03,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.05,
    },
    roof: { type: "flat", flatThickness: 0.2, gableHeight: 2, hipInset: 0.4 },
    siteWidth: 60,
    siteDepth: 50,
    buildingName: "Glazing Coverage",
    address: "Seoul",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0 },
      column: { color: "#999999", roughness: 0.8, metalness: 0 },
      roof: { color: "#888888", roughness: 0.7, metalness: 0.1 },
      groundFloor: { color: "#bbbbbb", roughness: 0.9, metalness: 0 },
    },
    ...overrides,
  };
}

const CURTAIN_WALL = {
  enabled: true,
  mullionWidth: 0.03,
  glassTint: "#88BBCC",
  glassOpacity: 0.45,
} as const;

function instancedByType(group: THREE.Object3D, type: string): THREE.InstancedMesh {
  let match: THREE.InstancedMesh | undefined;
  group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh && object.userData.type === type) {
      match = object;
    }
  });
  if (!match) throw new Error(`Missing InstancedMesh type ${type}`);
  return match;
}

/** Which of the four rectangular faces an instance sits on. */
function faceOf(position: THREE.Vector3, recipe: BuildingRecipe): string {
  const towardX = Math.abs(position.x) / (recipe.footprintWidth / 2);
  const towardZ = Math.abs(position.z) / (recipe.footprintDepth / 2);
  if (towardZ >= towardX) return position.z > 0 ? "front" : "back";
  return position.x > 0 ? "right" : "left";
}

interface Bay {
  floorNo: number;
  face: string;
}

/** Read back the glass and solid-panel bays the generator actually emitted. */
function readBays(recipe: BuildingRecipe): { glass: Bay[]; solid: Bay[] } {
  const group = generateFacade(recipe);
  group.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const floorOf = (y: number): number => {
    let best = recipe.floors[0];
    for (const floor of recipe.floors) {
      if (floor.type !== "above") continue;
      if (y >= floor.y - 1e-6 && y < floor.y + floor.height) return floor.floorNo;
      if (Math.abs(y - floor.y) < Math.abs(y - best.y)) best = floor;
    }
    return best.floorNo;
  };

  const read = (type: string): Bay[] => {
    const mesh = instancedByType(group, type);
    const bays: Bay[] = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);
      bays.push({ floorNo: floorOf(position.y), face: faceOf(position, recipe) });
    }
    return bays;
  };

  return { glass: read("glass"), solid: read("solidPanel") };
}

describe("facade glazing coverage", () => {
  it("glazes every face of every storey on a curtain-wall tower", () => {
    const recipe = makeRecipe({
      facade: { ...makeRecipe().facade, solidPanelChance: 0.03 },
      curtainWall: { ...CURTAIN_WALL },
    });
    const { glass } = readBays(recipe);

    const bare: string[] = [];
    for (const floor of recipe.floors) {
      for (const face of ["front", "back", "left", "right"]) {
        const hit = glass.some((b) => b.floorNo === floor.floorNo && b.face === face);
        if (!hit) bare.push(`${floor.label}/${face}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("glazes a punched-window building at all", () => {
    const { glass } = readBays(makeRecipe({ floors: makeFloors(12) }));
    expect(glass.length).toBeGreaterThan(0);
  });

  it("does not concentrate glazing at the top of the building", () => {
    const recipe = makeRecipe({ floors: makeFloors(12) });
    const { glass } = readBays(recipe);

    // Every storey offers the same bays, so the glazed count per storey should
    // vary only by the scatter — never trend with height.
    const perFloor = recipe.floors.map(
      (floor) => glass.filter((b) => b.floorNo === floor.floorNo).length,
    );
    expect(Math.min(...perFloor)).toBeGreaterThan(0);
    expect(Math.min(...perFloor) / Math.max(...perFloor)).toBeGreaterThan(0.6);
  });
});
