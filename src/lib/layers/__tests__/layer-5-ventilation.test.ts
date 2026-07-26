// src/lib/layers/__tests__/layer-5-ventilation.test.ts
// Unit tests for VentilationLayer — merged AHU geometry (body + duct stubs + fan ring).

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { VentilationLayer } from "../layer-5-ventilation";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "../mep-equipment-params";
import type { BuildingRecipe } from "@/lib/procedural/types";
import {
  axisAlignedRectangleFitsFootprint,
  getColumnPositions,
} from "@/lib/structural-codes";

// ---------------------------------------------------------------------------
// Mock recipe fixture — 3 above-ground floors
// ---------------------------------------------------------------------------

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 10,
    footprintDepth: 8,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 9.0,
    wallThickness: 0.2,
    era: "2000-2009",
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
      column: { color: "#999999", roughness: 0.8, metalness: 0.0 },
      roof: { color: "#888888", roughness: 0.7, metalness: 0.1 },
      groundFloor: { color: "#bbbbbb", roughness: 0.9, metalness: 0.0 },
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all objects from a group traversal keyed by userData.type */
function collectByType(group: THREE.Group): Map<string, THREE.Object3D[]> {
  const map = new Map<string, THREE.Object3D[]>();
  group.traverse((obj) => {
    const t = (obj as THREE.Object3D & { userData: { type?: string } }).userData?.type;
    if (t) {
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(obj);
    }
  });
  return map;
}

function instancePosition(mesh: THREE.InstancedMesh, index = 0): THREE.Vector3 {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  position.setFromMatrixPosition(matrix);
  return position;
}

function pointInRing(x: number, z: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Plain BoxGeometry(1.2, 0.8, 0.8) has 24 position entries (4 vertices × 6 faces).
// A merged body+ducts+fan should be substantially more.
const PLAIN_BOX_VERTEX_COUNT = 24;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VentilationLayer", () => {
  it("returns a Group named 'layer-5-ventilation'", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("layer-5-ventilation");
    layer.dispose();
  });

  it("has an InstancedMesh with userData.type === 'vent-ahu'", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    const byType = collectByType(group);
    const ahuObjects = byType.get("vent-ahu");
    expect(ahuObjects).toBeDefined();
    expect(ahuObjects!.length).toBe(1);
    expect(ahuObjects![0]).toBeInstanceOf(THREE.InstancedMesh);
    layer.dispose();
  });

  it("merged AHU geometry has more vertices than a plain BoxGeometry", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    const byType = collectByType(group);
    const ahuIM = byType.get("vent-ahu")![0] as THREE.InstancedMesh;
    const posAttr = ahuIM.geometry.getAttribute("position");
    expect(posAttr.count).toBeGreaterThan(PLAIN_BOX_VERTEX_COUNT);
    layer.dispose();
  });

  it("keeps the fan ring on the AHU front face without cutting through its depth", () => {
    const params = DEFAULT_MEP_EQUIPMENT_PARAMS.ahu;
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    const ahu = collectByType(group).get("vent-ahu")![0] as THREE.InstancedMesh;
    ahu.geometry.computeBoundingBox();

    expect(ahu.geometry.boundingBox!.max.z).toBeLessThanOrEqual(
      params.depth / 2 + 0.061,
    );
    layer.dispose();
  });

  it("instanceMatrix was marked needsUpdate after generate() (version > 0)", () => {
    // THREE.js BufferAttribute.needsUpdate is a write-only setter that increments
    // the internal `version` counter rather than storing a readable boolean.
    // Asserting version > 0 proves the setter was called.
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    const byType = collectByType(group);
    const ahuIM = byType.get("vent-ahu")![0] as THREE.InstancedMesh;
    expect(ahuIM.instanceMatrix.version).toBeGreaterThan(0);
    layer.dispose();
  });

  it("InstancedMesh.count === aboveFloors.length × default unitsPerFloor (1)", () => {
    const recipe = makeRecipe();
    const aboveFloors = recipe.floors.filter((f) => f.type === "above").length;
    const layer = new VentilationLayer();
    const group = layer.generate(recipe);
    const byType = collectByType(group);
    const ahuIM = byType.get("vent-ahu")![0] as THREE.InstancedMesh;
    expect(ahuIM.count).toBe(aboveFloors * DEFAULT_MEP_EQUIPMENT_PARAMS.ahu.unitsPerFloor);
    layer.dispose();
  });

  it("unitsPerFloor: 2 doubles the InstancedMesh count", () => {
    const recipe = makeRecipe();
    const aboveFloors = recipe.floors.filter((f) => f.type === "above").length;
    const layer = new VentilationLayer();
    const group = layer.generate(recipe, 1.0, { unitsPerFloor: 2 });
    const byType = collectByType(group);
    const ahuIM = byType.get("vent-ahu")![0] as THREE.InstancedMesh;
    expect(ahuIM.count).toBe(aboveFloors * 2);
    layer.dispose();
  });

  it("spaces multi-unit AHU assemblies so their duct stubs do not overlap", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe(), 1, { unitsPerFloor: 2 });
    const ahu = collectByType(group).get("vent-ahu")![0] as THREE.InstancedMesh;
    const first = instancePosition(ahu, 0);
    const second = instancePosition(ahu, 1);
    ahu.geometry.computeBoundingBox();
    const assemblyWidth =
      ahu.geometry.boundingBox!.max.x - ahu.geometry.boundingBox!.min.x;

    expect(Math.abs(second.x - first.x)).toBeGreaterThan(assemblyWidth);
    layer.dispose();
  });

  it("showFanFace: false + showDuctStubs: false yields near plain-box vertex count", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe(), 1.0, {
      showFanFace: false,
      showDuctStubs: false,
    });
    const byType = collectByType(group);
    const ahuIM = byType.get("vent-ahu")![0] as THREE.InstancedMesh;
    const posAttr = ahuIM.geometry.getAttribute("position");
    // Body-only should match or be within range of a plain BoxGeometry (24 verts).
    // mergeGeometries([body]) returns exactly the body geometry.
    expect(posAttr.count).toBe(PLAIN_BOX_VERTEX_COUNT);
    layer.dispose();
  });

  it("no per-floor vent-duct Meshes exist in the group (floating ducts eliminated)", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    const byType = collectByType(group);
    const ductObjects = byType.get("vent-duct");
    expect(ductObjects).toBeUndefined();
    layer.dispose();
  });

  it("airflow trail Lines with userData.type === 'vent-airflow' are still present", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe());
    const byType = collectByType(group);
    const airflowObjects = byType.get("vent-airflow");
    expect(airflowObjects).toBeDefined();
    expect(airflowObjects).toHaveLength(1);
    expect(airflowObjects![0]).toBeInstanceOf(THREE.LineSegments);
    layer.dispose();
  });

  it("uses at most two draw calls: one AHU batch and one airflow batch", () => {
    const layer = new VentilationLayer();
    const group = layer.generate(makeRecipe(), 1);
    const renderables = group.children.filter(
      (obj) => obj instanceof THREE.Mesh || obj instanceof THREE.Line
    );
    expect(renderables).toHaveLength(2);
    layer.dispose();
  });

  it("generates deterministic airflow positions with cyan supply and gray return colors", () => {
    const firstLayer = new VentilationLayer();
    const first = collectByType(firstLayer.generate(makeRecipe(), 0.8)).get(
      "vent-airflow"
    )![0] as THREE.LineSegments;
    const firstPositions = Array.from(first.geometry.getAttribute("position").array);
    const firstColors = first.geometry.getAttribute("color");

    const uniqueColors = new Set<string>();
    for (let i = 0; i < firstColors.count; i++) {
      uniqueColors.add(
        `${firstColors.getX(i).toFixed(3)},${firstColors.getY(i).toFixed(3)},${firstColors.getZ(i).toFixed(3)}`
      );
    }

    const secondLayer = new VentilationLayer();
    const second = collectByType(secondLayer.generate(makeRecipe(), 0.8)).get(
      "vent-airflow"
    )![0] as THREE.LineSegments;
    const secondPositions = Array.from(second.geometry.getAttribute("position").array);

    expect(secondPositions).toEqual(firstPositions);
    expect(uniqueColors.size).toBe(2);
    expect(first.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect((first.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(0);

    firstLayer.dispose();
    secondLayer.dispose();
  });

  it("caps airflow geometry for tall buildings at 1,360 line segments", () => {
    const recipe = makeRecipe();
    recipe.floors = Array.from({ length: 80 }, (_, index) => ({
      floorNo: index + 1,
      label: `${index + 1}F`,
      type: "above" as const,
      y: index * 3,
      height: 3,
      isGroundFloor: index === 0,
    }));
    recipe.totalHeight = 240;

    const layer = new VentilationLayer();
    const airflow = collectByType(layer.generate(recipe, 1)).get(
      "vent-airflow"
    )![0] as THREE.LineSegments;
    const segmentCount = airflow.geometry.getAttribute("position").count / 2;

    expect(segmentCount).toBeLessThanOrEqual(1360);
    expect(airflow.userData.streamCount).toBeLessThanOrEqual(80);
    layer.dispose();
  });

  it("emits no airflow segments when MEP density is zero", () => {
    const layer = new VentilationLayer();
    const airflow = collectByType(layer.generate(makeRecipe(), 0)).get(
      "vent-airflow",
    )![0] as THREE.LineSegments;

    expect(airflow.geometry.getAttribute("position").count).toBe(0);
    expect(airflow.userData.streamCount).toBe(0);
    layer.dispose();
  });

  it("moves AHUs away from a central structural column", () => {
    const recipe = makeRecipe();
    recipe.footprintWidth = 12;
    recipe.footprintDepth = 12;
    recipe.column = { spacing: 6, size: 0.4, inset: 0 };
    const layer = new VentilationLayer();
    const ahu = collectByType(layer.generate(recipe)).get(
      "vent-ahu",
    )![0] as THREE.InstancedMesh;
    const position = instancePosition(ahu);
    const equipmentHalfWidth = DEFAULT_MEP_EQUIPMENT_PARAMS.ahu.width / 2 + 0.42;
    const equipmentHalfDepth = DEFAULT_MEP_EQUIPMENT_PARAMS.ahu.depth / 2 + 0.08;
    const columnHalf = recipe.column.size / 2;

    for (const column of getColumnPositions(recipe)) {
      const separatedX =
        Math.abs(position.x - column.x) >
        equipmentHalfWidth + columnHalf + 0.12;
      const separatedZ =
        Math.abs(position.z - column.z) >
        equipmentHalfDepth + columnHalf + 0.12;
      expect(separatedX || separatedZ).toBe(true);
    }
    layer.dispose();
  });

  it("keeps AHUs and their streamline bundle inside an L-shaped CAD footprint", () => {
    const recipe = makeRecipe();
    const lShape: [number, number][] = [
      [-3, -3],
      [3, -3],
      [3, 0],
      [0, 0],
      [0, 3],
      [-3, 3],
    ];
    recipe.footprintWidth = 6;
    recipe.footprintDepth = 6;
    recipe.footprintPolygon = [lShape];
    recipe.column = { spacing: 6, size: 0.4, inset: 1 };
    const layer = new VentilationLayer();
    const generated = collectByType(layer.generate(recipe, 1));
    const ahu = generated.get("vent-ahu")![0] as THREE.InstancedMesh;
    const airflow = generated.get("vent-airflow")![0] as THREE.LineSegments;
    const ahuPosition = instancePosition(ahu);
    const positions = airflow.geometry.getAttribute("position");

    expect(ahu.count).toBeGreaterThan(0);
    expect(pointInRing(ahuPosition.x, ahuPosition.z, lShape)).toBe(true);
    for (let index = 0; index < positions.count; index++) {
      expect(
        pointInRing(positions.getX(index), positions.getZ(index), lShape),
      ).toBe(true);
    }
    layer.dispose();
  });

  it("keeps the complete AHU envelope and airflow inside a concave notch", () => {
    const recipe = makeRecipe();
    const notched: [number, number][] = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [0.1, 5],
      [0.1, 0.1],
      [-0.1, 0.1],
      [-0.1, 5],
      [-5, 5],
    ];
    recipe.footprintWidth = 10;
    recipe.footprintDepth = 10;
    recipe.footprintPolygon = [notched];
    const layer = new VentilationLayer();
    const generated = collectByType(layer.generate(recipe, 1));
    const ahu = generated.get("vent-ahu")![0] as THREE.InstancedMesh;
    const airflow = generated.get("vent-airflow")![0] as THREE.LineSegments;
    const ahuPosition = instancePosition(ahu);
    const positions = airflow.geometry.getAttribute("position");

    expect(ahu.count).toBeGreaterThan(0);
    expect(
      axisAlignedRectangleFitsFootprint(
        { x: ahuPosition.x, z: ahuPosition.z },
        DEFAULT_MEP_EQUIPMENT_PARAMS.ahu.width / 2 + 0.4,
        DEFAULT_MEP_EQUIPMENT_PARAMS.ahu.depth / 2 + 0.08,
        recipe.footprintPolygon,
      ),
    ).toBe(true);
    for (let index = 0; index < positions.count; index++) {
      expect(
        pointInRing(positions.getX(index), positions.getZ(index), notched),
      ).toBe(true);
    }
    layer.dispose();
  });
});
