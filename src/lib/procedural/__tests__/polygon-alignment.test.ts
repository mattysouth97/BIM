// src/lib/procedural/__tests__/polygon-alignment.test.ts
// Footprint-alignment fix: when a building has a real footprint polygon, the
// roof and columns must follow it like the slabs and facade already do —
// otherwise the bbox-rect roof cantilevers over the notch and column rows
// stand outside the glazing ("walls not aligned / protruding").

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import {
  generateColumns,
  generateRoof,
  generateRoofFurniture,
} from "../structure-generator";
import { generateFacade } from "../facade-generator";
import { pointInRing } from "@/lib/gis/ring-utils";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "../types";

// Origin-centered L-ring, bbox 20 × 16 — the SE region x ∈ [2,10], z ∈ [-8,-2]
// is notched out. footprintWidth/Depth carry the bbox dims, matching how
// BuildingScene overrides them from the projected polygon.
const L_RING: [number, number][] = [
  [-10, -8],
  [2, -8],
  [2, -2],
  [10, -2],
  [10, 8],
  [-10, 8],
  [-10, -8],
];

function makeRecipe(withPolygon: boolean): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 16,
    ...(withPolygon ? { footprintPolygon: [L_RING] } : {}),
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 9.0,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "14000",
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
    siteWidth: 30,
    siteDepth: 26,
    buildingName: "Polygon Test Building",
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

function makeFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    ),
  );
  return group;
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

describe("generateRoof with a footprint polygon", () => {
  it("extrudes the polygon for flat roofs — no bbox cantilever over the notch", () => {
    const mesh = generateRoof(makeRecipe(true));
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;

    // Roof spans the ring bounds in plan…
    expect(bb.min.x).toBeCloseTo(-10, 3);
    expect(bb.max.x).toBeCloseTo(10, 3);
    expect(bb.min.z).toBeCloseTo(-8, 3);
    expect(bb.max.z).toBeCloseTo(8, 3);
    // …sits on top of the building (baseY encodes the height)…
    expect(bb.min.y).toBeCloseTo(9.0, 3);
    expect(bb.max.y).toBeCloseTo(9.15, 3);
    expect(mesh.position.y).toBeCloseTo(0, 5);

    // …and actually follows the L: no roof triangle covers the notch center.
    const pos = mesh.geometry.getAttribute("position");
    const idx = mesh.geometry.getIndex();
    const triCount = (idx ? idx.count : pos.count) / 3;
    const read = (i: number) => {
      const vi = idx ? idx.getX(i) : i;
      return [pos.getX(vi), pos.getZ(vi)] as [number, number];
    };
    let coversNotchCenter = false;
    for (let t = 0; t < triCount; t++) {
      const [a, b, c] = [read(t * 3), read(t * 3 + 1), read(t * 3 + 2)];
      // Barycentric containment of the notch center (6, -5)
      const [px, pz] = [6, -5];
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) continue;
      const w1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[1])) / d;
      const w2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[1])) / d;
      const w3 = 1 - w1 - w2;
      if (w1 > 1e-6 && w2 > 1e-6 && w3 > 1e-6) coversNotchCenter = true;
    }
    expect(coversNotchCenter).toBe(false);
  });

  it("keeps the centered box for rect-fallback buildings (no polygon)", () => {
    const mesh = generateRoof(makeRecipe(false));
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeCloseTo(20, 3);
    expect(bb.max.z - bb.min.z).toBeCloseTo(16, 3);
    expect(mesh.position.y).toBeCloseTo(9.0 + 0.15 / 2, 5);
  });
});

describe("generateColumns with a footprint polygon", () => {
  it("keeps every column inside the ring and drops notch positions", () => {
    const withPolygon = generateColumns(makeRecipe(true));
    const without = generateColumns(makeRecipe(false));

    expect(withPolygon.count).toBeGreaterThan(0);
    // The notch must have cost us at least one grid position per floor.
    expect(withPolygon.count).toBeLessThan(without.count);

    const mat4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < withPolygon.count; i++) {
      withPolygon.getMatrixAt(i, mat4);
      mat4.decompose(p, q, s);
      expect(
        pointInRing(p.x, p.z, L_RING),
        `column ${i} at (${p.x}, ${p.z}) is outside the ring`,
      ).toBe(true);
    }
  });
});

describe("generateFacade with a footprint polygon", () => {
  it("keeps every glass/panel/mullion instance on the ring — nothing floats off the walls", () => {
    const group = generateFacade(makeRecipe(true));
    group.updateMatrixWorld(true);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let checked = 0;
    group.traverse((o) => {
      if (!(o as THREE.InstancedMesh).isInstancedMesh) return;
      const im = o as THREE.InstancedMesh;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m4);
        p.setFromMatrixPosition(m4).applyMatrix4(im.matrixWorld);
        checked++;
        // Instances sit on wall centre lines just inside the ring; the old
        // perpendicular-yaw bug threw them 10-15 m past the bbox.
        expect(
          Math.abs(p.x),
          `${im.userData.type} instance ${i} at x=${p.x.toFixed(1)}`,
        ).toBeLessThanOrEqual(10 + 1);
        expect(
          Math.abs(p.z),
          `${im.userData.type} instance ${i} at z=${p.z.toFixed(1)}`,
        ).toBeLessThanOrEqual(8 + 1);
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it("faces the glass outward along each edge (normal leaves the ring)", () => {
    const group = generateFacade(makeRecipe(true));
    group.updateMatrixWorld(true);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const normal = new THREE.Vector3();
    group.traverse((o) => {
      if (!(o as THREE.InstancedMesh).isInstancedMesh) return;
      const im = o as THREE.InstancedMesh;
      if (im.userData.type !== "glass") return;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m4);
        m4.decompose(p, q, s);
        normal.set(0, 0, 1).applyQuaternion(q);
        const probe = [p.x + normal.x * 1.5, p.z + normal.z * 1.5] as const;
        expect(
          pointInRing(probe[0], probe[1], L_RING),
          `glass ${i} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) faces inward`,
        ).toBe(false);
      }
    });
  });
});

describe("generateRoofFurniture with a footprint polygon", () => {
  it("skips the furniture when its corner spot falls in the notch", () => {
    __injectEquipmentAssetForTest("roof-furniture", makeFakeAsset());
    // Default spot for bbox 20×16: x = min(10-3.2, 3.6) = 3.6,
    // z = max(-(8-2.6), -3.52) = -3.52 → inside the notch → must skip.
    expect(generateRoofFurniture(makeRecipe(true))).toBeNull();
  });

  it("still places furniture for polygons that cover the spot", () => {
    __injectEquipmentAssetForTest("roof-furniture", makeFakeAsset());
    const recipe = makeRecipe(true);
    // Full origin-centered rectangle — spot (3.6, -3.52) is inside.
    recipe.footprintPolygon = [
      [
        [-10, -8],
        [10, -8],
        [10, 8],
        [-10, 8],
        [-10, -8],
      ],
    ];
    expect(generateRoofFurniture(recipe)).not.toBeNull();
  });
});
