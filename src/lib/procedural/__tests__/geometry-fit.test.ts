import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { generateFacade } from "../facade-generator";
import { ProceduralBuilding } from "../procedural-building";
import { generateColumns, generateRoof } from "../structure-generator";
import type { BuildingRecipe } from "../types";
import { StructuralAnalysisLayer } from "@/lib/layers/layer-15-structural";
import {
  axisAlignedRectangleFitsFootprint,
  getColumnPositions,
} from "@/lib/structural-codes";

function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  return {
    footprintWidth: 10,
    footprintDepth: 8,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3, height: 3, isGroundFloor: false },
    ],
    totalHeight: 6,
    wallThickness: 0.2,
    era: "2000-2009",
    strctCd: "21",
    mainPurpsCd: "02000",
    column: { spacing: 3, size: 0.4, inset: 0.5 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.2,
      windowHeight: 1.6,
      sillHeight: 0.8,
      windowSpacing: 1.6,
      windowRatio: 0.6,
      mullionDepth: 0.06,
      mullionWidth: 0.05,
      glassInset: 0.03,
      solidPanelChance: 1,
      parapetHeight: 0.9,
      cornerInset: 0.2,
    },
    roof: { type: "flat", flatThickness: 0.2, gableHeight: 2, hipInset: 0.4 },
    siteWidth: 20,
    siteDepth: 18,
    buildingName: "Fit Test",
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

function matrixParts(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, quaternion, scale);
  return { position, scale };
}

describe("procedural geometry fit", () => {
  it("builds every facade edge for open and closed polygon rings", () => {
    const open: [number, number][] = [
      [-5, -4],
      [5, -4],
      [5, 4],
      [-5, 4],
    ];
    const openFacade = generateFacade(
      makeRecipe({ footprintPolygon: [open], floors: [makeRecipe().floors[0]], totalHeight: 3 }),
      { includeParapet: false },
    );
    const closedFacade = generateFacade(
      makeRecipe({
        footprintPolygon: [[...open, open[0]]],
        floors: [makeRecipe().floors[0]],
        totalHeight: 3,
      }),
      { includeParapet: false },
    );

    expect(instancedByType(openFacade, "hMullion").count).toBe(8);
    expect(instancedByType(closedFacade, "hMullion").count).toBe(8);
  });

  it("normalizes winding and seats wall panels inside the polygon boundary", () => {
    const ccw: [number, number][] = [
      [-5, -4],
      [5, -4],
      [5, 4],
      [-5, 4],
    ];
    const facade = generateFacade(
      makeRecipe({
        footprintPolygon: [[...ccw].reverse()],
        floors: [makeRecipe().floors[0]],
        totalHeight: 3,
      }),
      { includeParapet: false },
    );
    const panels = instancedByType(facade, "solidPanel");
    const centers = Array.from({ length: panels.count }, (_, index) => matrixParts(panels, index).position);

    expect(Math.max(...centers.map((point) => Math.abs(point.x)))).toBeCloseTo(4.9, 5);
    expect(Math.max(...centers.map((point) => Math.abs(point.z)))).toBeCloseTo(3.9, 5);
  });

  it("joins facade rails edge-to-edge without penetrating floor slabs", () => {
    const recipe = makeRecipe({ floors: [makeRecipe().floors[0]], totalHeight: 3 });
    const facade = generateFacade(recipe, { includeParapet: false });
    const horizontal = instancedByType(facade, "hMullion");
    const vertical = instancedByType(facade, "vMullion");
    const bottom = matrixParts(horizontal, 0);
    const top = matrixParts(horizontal, 1);
    const upright = matrixParts(vertical, 0);
    const slabTop = recipe.slab.thickness;
    const floorTop = recipe.floors[0].height;

    expect(bottom.position.y - bottom.scale.y / 2).toBeCloseTo(slabTop, 6);
    expect(top.position.y + top.scale.y / 2).toBeCloseTo(floorTop, 6);
    expect(upright.position.y - upright.scale.y / 2).toBeCloseTo(
      bottom.position.y + bottom.scale.y / 2,
      6,
    );
    expect(upright.position.y + upright.scale.y / 2).toBeCloseTo(
      top.position.y - top.scale.y / 2,
      6,
    );
  });

  it("renders a single parapet for a multi-section facade", () => {
    const base = makeRecipe();
    const recipe = makeRecipe({
      sections: [
        { startFloor: 1, endFloor: 1, mainPurpsCd: "07000", facade: base.facade },
        { startFloor: 2, endFloor: 2, mainPurpsCd: "02000", facade: base.facade },
      ],
    });
    const building = new ProceduralBuilding(recipe);
    const group = building.generate();
    let parapetBars = 0;

    group.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh) || object.userData.type !== "hMullion") return;
      for (let index = 0; index < object.count; index++) {
        if (matrixParts(object, index).position.y > recipe.totalHeight) parapetBars++;
      }
    });

    expect(parapetBars).toBe(4);
    building.dispose();
  });

  it("uses the polygon itself for irregular roofs instead of its bounding box", () => {
    const lShape: [number, number][] = [
      [-3, -3],
      [3, -3],
      [3, 0],
      [0, 0],
      [0, 3],
      [-3, 3],
    ];
    const recipe = makeRecipe({ footprintWidth: 6, footprintDepth: 6, footprintPolygon: [lShape] });
    const roof = generateRoof(recipe);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(2, recipe.totalHeight + 5, 2),
      new THREE.Vector3(0, -1, 0),
    );

    expect(roof.userData.effectiveRoofType).toBe("flat");
    expect(ray.intersectObject(roof, false)).toHaveLength(0);
    roof.geometry.dispose();
    (roof.material as THREE.Material).dispose();
  });

  it("rejects columns whose full section crosses a concave footprint notch", () => {
    const notchedFootprint: [number, number][] = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [0.1, 5],
      [0.1, 0.1],
      [-0.1, 0.1],
      [-0.1, 5],
      [-5, 5],
    ];
    const recipe = makeRecipe({
      footprintPolygon: [notchedFootprint],
      column: { spacing: 3, size: 0.4, inset: 2 },
    });

    expect(
      axisAlignedRectangleFitsFootprint(
        { x: 0, z: 0 },
        recipe.column.size / 2,
        recipe.column.size / 2,
        recipe.footprintPolygon,
      ),
    ).toBe(false);
    expect(getColumnPositions(recipe)).not.toContainEqual({ x: 0, z: 0 });
  });

  it("keeps physical columns in the model and analysis annotations out of their volume", () => {
    const recipe = makeRecipe();
    const columns = generateColumns(recipe);
    const analysis = new StructuralAnalysisLayer();
    const annotations = analysis.generate(recipe);
    let duplicateColumnMeshes = 0;
    annotations.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && object.userData.type === "structural-column") {
        duplicateColumnMeshes++;
      }
    });

    expect(columns.userData.type).toBe("column");
    expect(columns.userData.sizingLabels).toHaveLength(columns.count);
    expect(duplicateColumnMeshes).toBe(0);
    expect(annotations.getObjectByName("structural-arrows")).toBeDefined();
    analysis.dispose();
    columns.geometry.dispose();
    (columns.material as THREE.Material).dispose();
  });
});
