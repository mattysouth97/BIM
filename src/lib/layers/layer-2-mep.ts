// src/lib/layers/layer-2-mep.ts
// Layer 2: Standard MEP — horizontal pipe runs, vertical risers, junction boxes.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Pipe system color palette */
const PIPE_COLORS = {
  hot: 0xef4444,
  cold: 0x3b82f6,
  power: 0xf59e0b,
} as const;

type PipeType = keyof typeof PIPE_COLORS;
const PIPE_TYPES: PipeType[] = ["hot", "cold", "power"];

/**
 * MEPLayer generates instanced pipe runs for MEP systems:
 * - Horizontal pipes per floor (3 color-coded systems)
 * - Vertical risers at 4 building corners (full height)
 * - Junction boxes every 3rd floor
 */
export class MEPLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-2-mep";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;
    const pipeRadius = 0.05;
    const pipeInset = 0.8; // How far inside the building perimeter

    // --- Horizontal pipe runs ---
    // Each floor gets 3 pipe types running in 2 directions (N-S and E-W)
    // Total horizontal pipe instances: aboveFloors * 3 types * 2 directions = aboveFloors * 6
    const hPipeCount = aboveFloors.length * PIPE_TYPES.length * 2;

    for (let t = 0; t < PIPE_TYPES.length; t++) {
      const pipeType = PIPE_TYPES[t];
      const color = PIPE_COLORS[pipeType];

      // E-W runs (along width)
      const ewLength = footprintWidth * 0.85;
      const ewGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, ewLength, 6);
      ewGeo.rotateZ(Math.PI / 2); // Cylinder default is Y-axis, rotate to X-axis
      const ewMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0.4,
      });
      const ewIM = new THREE.InstancedMesh(ewGeo, ewMat, Math.max(1, aboveFloors.length));
      ewIM.castShadow = true;
      ewIM.userData = { type: "mep-pipe", pipeType, direction: "ew" };

      // N-S runs (along depth)
      const nsLength = footprintDepth * 0.85;
      const nsGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, nsLength, 6);
      nsGeo.rotateX(Math.PI / 2); // Rotate to Z-axis
      const nsMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0.4,
      });
      const nsIM = new THREE.InstancedMesh(nsGeo, nsMat, Math.max(1, aboveFloors.length));
      nsIM.castShadow = true;
      nsIM.userData = { type: "mep-pipe", pipeType, direction: "ns" };

      const mat4 = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3(1, 1, 1);

      // Offset each pipe type laterally so they don't overlap
      const lateralOffset = (t - 1) * 0.2; // -0.2, 0, +0.2

      for (let i = 0; i < aboveFloors.length; i++) {
        const floor = aboveFloors[i];
        const ceilingY = floor.y + floor.height * 0.85; // Pipes near ceiling

        // E-W run — offset along depth
        pos.set(0, ceilingY, -halfD + pipeInset + lateralOffset);
        mat4.compose(pos, quat, scl);
        ewIM.setMatrixAt(i, mat4);

        // N-S run — offset along width
        pos.set(-halfW + pipeInset + lateralOffset, ceilingY, 0);
        mat4.compose(pos, quat, scl);
        nsIM.setMatrixAt(i, mat4);
      }

      ewIM.count = aboveFloors.length;
      nsIM.count = aboveFloors.length;
      ewIM.instanceMatrix.needsUpdate = true;
      nsIM.instanceMatrix.needsUpdate = true;

      group.add(ewIM, nsIM);
    }

    // --- Vertical risers at 4 corners ---
    const riserGeo = new THREE.CylinderGeometry(pipeRadius * 1.5, pipeRadius * 1.5, totalHeight, 6);
    const riserMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.5,
      metalness: 0.5,
    });
    const riserIM = new THREE.InstancedMesh(riserGeo, riserMat, 4);
    riserIM.castShadow = true;
    riserIM.userData = { type: "mep-riser" };

    const riserPositions = [
      { x: -halfW + pipeInset, z: -halfD + pipeInset },
      { x: halfW - pipeInset, z: -halfD + pipeInset },
      { x: -halfW + pipeInset, z: halfD - pipeInset },
      { x: halfW - pipeInset, z: halfD - pipeInset },
    ];

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < riserPositions.length; i++) {
      pos.set(riserPositions[i].x, totalHeight / 2, riserPositions[i].z);
      mat4.compose(pos, quat, scl);
      riserIM.setMatrixAt(i, mat4);
    }
    riserIM.count = 4;
    riserIM.instanceMatrix.needsUpdate = true;
    group.add(riserIM);

    // --- Junction boxes every 3rd floor ---
    const junctionFloors = aboveFloors.filter((_, i) => i % 3 === 0);
    const junctionCount = junctionFloors.length * 4; // 4 corners per junction floor
    const jBoxGeo = new THREE.BoxGeometry(0.3, 0.2, 0.2);
    const jBoxMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.4,
      metalness: 0.6,
    });
    const jBoxIM = new THREE.InstancedMesh(jBoxGeo, jBoxMat, Math.max(1, junctionCount));
    jBoxIM.castShadow = true;
    jBoxIM.userData = { type: "mep-junction" };

    let jIdx = 0;
    for (const floor of junctionFloors) {
      const jY = floor.y + floor.height * 0.85;
      for (const rp of riserPositions) {
        pos.set(rp.x, jY, rp.z);
        mat4.compose(pos, quat, scl);
        jBoxIM.setMatrixAt(jIdx++, mat4);
      }
    }
    jBoxIM.count = jIdx;
    jBoxIM.instanceMatrix.needsUpdate = true;
    group.add(jBoxIM);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.group = null;
  }
}
