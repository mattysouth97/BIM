// src/lib/layers/layer-15-structural.ts
// Structural Analysis Layer (Layer 15) — KBC 2016 structural overlay.
// Full implementation: stress-colored columns, animated load path arrows, foundation markers.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import {
  getColumnPositions,
  calcColumnLoad,
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
 * A. Animated load path arrows (ShaderMaterial with uTime pulse, per floor per column)
 * B. Foundation markers at ground level (flat discs, gray)
 *
 * The physical column mesh owns the stress colors and sizing metadata. Keeping
 * the analysis layer annotation-only avoids a second coincident column volume.
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
    // A. Animated Load Path Arrows
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

      const arrowTipY = floor.y + recipe.slab.thickness + 0.05;
      const horizontalClearance = recipe.column.size / 2 + 0.16;

      // Rotation: 180 degrees around X axis so cone points downward
      const downQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI
      );

      for (const cp of columnPositions) {
        const arrowSubGroup = new THREE.Group();
        const directionX = cp.x >= 0 ? 1 : -1;
        const directionZ = cp.z >= 0 ? 1 : -1;
        const arrowX = cp.x + directionX * horizontalClearance;
        const arrowZ = cp.z + directionZ * horizontalClearance;
        arrowSubGroup.userData = {
          type: "load-path-arrow",
          columnAnchor: { x: cp.x, z: cp.z },
        };

        // Shaft
        const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, shaftHeight, 6);
        const shaft = new THREE.Mesh(shaftGeo, arrowMat);
        // Seat the arrow beside the column, with its downward tip just above
        // the slab and the shaft touching the cone rather than intersecting it.
        shaft.position.set(
          arrowX,
          arrowTipY + headHeight + shaftHeight / 2,
          arrowZ,
        );
        shaft.setRotationFromQuaternion(downQuat);
        arrowSubGroup.add(shaft);

        // Head (cone) below the shaft
        const headGeo = new THREE.ConeGeometry(0.12, headHeight, 8);
        const head = new THREE.Mesh(headGeo, arrowMat);
        head.position.set(arrowX, arrowTipY + headHeight / 2, arrowZ);
        head.setRotationFromQuaternion(downQuat);
        arrowSubGroup.add(head);

        arrowsGroup.add(arrowSubGroup);
      }
    }

    group.add(arrowsGroup);

    // ---------------------------------------------------------------------------
    // B. Foundation Markers (flat discs at y=0)
    // ---------------------------------------------------------------------------

    const foundationsGroup = new THREE.Group();
    foundationsGroup.name = "structural-foundations";

    const discMat = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
    });

    for (const cp of columnPositions) {
      const discGeo = new THREE.CircleGeometry(recipe.column.size * 1.5, 16);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.set(cp.x, recipe.slab.thickness + 0.01, cp.z);
      disc.rotation.x = -Math.PI / 2;
      disc.renderOrder = 19;
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
