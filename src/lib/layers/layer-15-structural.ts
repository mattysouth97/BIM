// src/lib/layers/layer-15-structural.ts
// Structural Analysis Layer (Layer 15) — KBC 2016 structural overlay.
// Full implementation: stress-colored columns, animated load path arrows, foundation markers.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import {
  getColumnPositions,
  calcColumnLoad,
  calcColumnCapacity,
  getStressColor,
  getRecommendedColumnSize,
} from "@/lib/structural-codes";

// ---------------------------------------------------------------------------
// Shader for animated load path arrows (opacity pulse 0.3-1.0 on 2s cycle)
// ---------------------------------------------------------------------------

const arrowVertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const arrowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;

  void main() {
    float pulse = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 3.14159));
    gl_FragColor = vec4(uColor, pulse);
  }
`;

/**
 * StructuralAnalysisLayer renders:
 * A. Stress-colored column overlay (InstancedMesh, colored green/yellow/red)
 * B. Animated load path arrows (ShaderMaterial with uTime pulse, per floor per column)
 * C. Foundation markers at ground level (flat discs, gray)
 *
 * All based on KBC 2016 calculations from structural-codes.ts.
 */
export class StructuralAnalysisLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-15-structural";

    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const columnPositions = getColumnPositions(recipe);
    if (columnPositions.length === 0) {
      this.group = group;
      return group;
    }

    const capacity = calcColumnCapacity(recipe);
    // calcColumnLoad uses all floors, but we only iterate above-ground floors
    // We need per-above-floor loads — pass columnPositions.length as count
    const allFloorLoads = calcColumnLoad(recipe, columnPositions.length);
    // Build a map from floor index in recipe.floors to load value
    const floorIndexToLoad = new Map<number, number>();
    recipe.floors.forEach((_floor, i) => {
      floorIndexToLoad.set(i, allFloorLoads[i]);
    });

    // Collect above-floor loads for arrow height normalization
    const aboveFloorLoadsForArrows: number[] = aboveFloors.map((floor) => {
      const idx = recipe.floors.indexOf(floor);
      return floorIndexToLoad.get(idx) ?? 0;
    });
    const minLoad = Math.min(...aboveFloorLoadsForArrows);
    const maxLoad = Math.max(...aboveFloorLoadsForArrows);

    // ---------------------------------------------------------------------------
    // A. Stress-Colored Column Overlay (InstancedMesh)
    // ---------------------------------------------------------------------------

    const totalCount = aboveFloors.length * columnPositions.length;
    const colGeo = new THREE.BoxGeometry(1, 1, 1);
    const colMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.7 });
    const im = new THREE.InstancedMesh(colGeo, colMat, Math.max(1, totalCount));
    im.userData.type = "structural-column";
    im.userData.sizingLabels = [] as string[];

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const color = new THREE.Color();

    let idx = 0;
    for (const floor of aboveFloors) {
      const floorIdx = recipe.floors.indexOf(floor);
      const floorLoad = floorIndexToLoad.get(floorIdx) ?? 0;
      const ratio = capacity > 0 ? floorLoad / capacity : 0;

      const colHeight = floor.height - recipe.slab.thickness;
      if (colHeight <= 0) continue;
      const y = floor.y + recipe.slab.thickness + colHeight / 2;

      const hexColor = getStressColor(ratio);
      color.set(hexColor);

      for (const cp of columnPositions) {
        pos.set(cp.x, y, cp.z);
        scl.set(recipe.column.size, colHeight, recipe.column.size);
        mat4.compose(pos, quat, scl);
        im.setMatrixAt(idx, mat4);
        im.setColorAt(idx, color);

        const sizingLabel = `${getRecommendedColumnSize(floorLoad)} | ${Math.round(floorLoad)} kN | ${Math.round(ratio * 100)}% cap.`;
        im.userData.sizingLabels[idx] = sizingLabel;
        idx++;
      }
    }

    im.count = idx;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);

    // ---------------------------------------------------------------------------
    // B. Animated Load Path Arrows
    // ---------------------------------------------------------------------------

    const arrowsGroup = new THREE.Group();
    arrowsGroup.name = "structural-arrows";

    // One shared ShaderMaterial for all arrow meshes — uTime driven by LayerManager
    const arrowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: arrowVertexShader,
      fragmentShader: arrowFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let fi = 0; fi < aboveFloors.length; fi++) {
      const floor = aboveFloors[fi];
      const floorIdx = recipe.floors.indexOf(floor);
      const floorLoad = floorIndexToLoad.get(floorIdx) ?? 0;

      // Arrow height proportional to load magnitude
      const range = maxLoad - minLoad;
      const arrowHeight = 0.3 + 1.2 * (floorLoad - minLoad) / (range || 1);
      const shaftHeight = arrowHeight * 0.7;
      const headHeight = arrowHeight * 0.3;

      const arrowY = floor.y + recipe.slab.thickness + 0.1;

      // Rotation: 180 degrees around X axis so cone points downward
      const downQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI
      );

      for (const cp of columnPositions) {
        const arrowSubGroup = new THREE.Group();
        arrowSubGroup.userData = { type: "load-path-arrow" };

        // Shaft
        const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, shaftHeight, 6);
        const shaft = new THREE.Mesh(shaftGeo, arrowMat);
        // Position shaft so bottom of shaft is at arrowY
        shaft.position.set(cp.x, arrowY + shaftHeight / 2, cp.z);
        shaft.setRotationFromQuaternion(downQuat);
        arrowSubGroup.add(shaft);

        // Head (cone) below the shaft
        const headGeo = new THREE.ConeGeometry(0.12, headHeight, 8);
        const head = new THREE.Mesh(headGeo, arrowMat);
        // Position head below shaft
        head.position.set(cp.x, arrowY - headHeight / 2, cp.z);
        head.setRotationFromQuaternion(downQuat);
        arrowSubGroup.add(head);

        arrowsGroup.add(arrowSubGroup);
      }
    }

    group.add(arrowsGroup);

    // ---------------------------------------------------------------------------
    // C. Foundation Markers (flat discs at y=0)
    // ---------------------------------------------------------------------------

    const foundationsGroup = new THREE.Group();
    foundationsGroup.name = "structural-foundations";

    const discMat = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      transparent: true,
      opacity: 0.5,
    });

    for (const cp of columnPositions) {
      const discGeo = new THREE.CircleGeometry(recipe.column.size * 1.5, 16);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(cp.x, 0, cp.z);
      disc.rotation.x = -Math.PI / 2;
      disc.userData = { type: "structural-foundation" };
      foundationsGroup.add(disc);
    }

    group.add(foundationsGroup);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.InstancedMesh ||
        obj instanceof THREE.Line ||
        obj instanceof THREE.LineSegments ||
        obj instanceof THREE.Points
      ) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          (obj.material as THREE.Material).dispose();
        }
      }
    });
    this.group = null;
  }
}
