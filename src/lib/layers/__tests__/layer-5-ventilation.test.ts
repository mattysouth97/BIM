// src/lib/layers/__tests__/layer-5-ventilation.test.ts
// Unit tests for VentilationLayer — merged AHU geometry (body + duct stubs + fan ring).

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { VentilationLayer } from "../layer-5-ventilation";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "../mep-equipment-params";
import type { BuildingRecipe } from "@/lib/procedural/types";

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
    expect(airflowObjects!.length).toBeGreaterThan(0);
    // Each should be a Line (not a Mesh)
    for (const obj of airflowObjects!) {
      expect(obj).toBeInstanceOf(THREE.Line);
    }
    layer.dispose();
  });
});
