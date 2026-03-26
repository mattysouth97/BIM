// src/lib/layers/layer-6-media.ts
// Layer 6: Specialized Media — vertical conduit runs and horizontal distribution.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Conduit color palette: purple, white, green (neon tube colors) */
const CONDUIT_COLORS = [0xa855f7, 0xe0e0e0, 0x22c55e] as const;

/**
 * MediaLayer generates media distribution infrastructure:
 * - Vertical conduit runs at 2 positions per face
 * - Horizontal distribution along ceiling perpendicular to MEP runs
 */
export class MediaLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-6-media";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;
    const conduitRadius = 0.03;

    // --- Vertical conduit runs: 2 positions per face (4 faces = 8 runs) ---
    const verticalPositions: { x: number; z: number }[] = [];
    // Front face (Z+)
    verticalPositions.push({ x: -halfW * 0.3, z: halfD - 0.15 });
    verticalPositions.push({ x: halfW * 0.3, z: halfD - 0.15 });
    // Back face (Z-)
    verticalPositions.push({ x: -halfW * 0.3, z: -(halfD - 0.15) });
    verticalPositions.push({ x: halfW * 0.3, z: -(halfD - 0.15) });
    // Right face (X+)
    verticalPositions.push({ x: halfW - 0.15, z: -halfD * 0.3 });
    verticalPositions.push({ x: halfW - 0.15, z: halfD * 0.3 });
    // Left face (X-)
    verticalPositions.push({ x: -(halfW - 0.15), z: -halfD * 0.3 });
    verticalPositions.push({ x: -(halfW - 0.15), z: halfD * 0.3 });

    const vertGeo = new THREE.CylinderGeometry(
      conduitRadius,
      conduitRadius,
      totalHeight,
      6
    );
    const vertMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0xa855f7,
      emissiveIntensity: 0.3,
    });
    const vertIM = new THREE.InstancedMesh(
      vertGeo,
      vertMat,
      verticalPositions.length
    );
    vertIM.userData = { type: "media-conduit-vertical" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < verticalPositions.length; i++) {
      const vp = verticalPositions[i];
      pos.set(vp.x, totalHeight / 2, vp.z);
      mat4.compose(pos, quat, scl);
      vertIM.setMatrixAt(i, mat4);
    }
    vertIM.count = verticalPositions.length;
    vertIM.instanceMatrix.needsUpdate = true;
    group.add(vertIM);

    // --- Horizontal distribution: ceiling runs per floor ---
    // Run along Z-axis (perpendicular to standard MEP E-W runs)
    // 3 parallel conduits with alternating colors
    const hzLength = footprintDepth * 0.8;

    for (let c = 0; c < CONDUIT_COLORS.length; c++) {
      const color = CONDUIT_COLORS[c];
      const hzGeo = new THREE.CylinderGeometry(
        conduitRadius,
        conduitRadius,
        hzLength,
        6
      );
      hzGeo.rotateX(Math.PI / 2); // Align to Z-axis

      const hzMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.15,
        roughness: 0.5,
        metalness: 0.3,
      });

      const hzIM = new THREE.InstancedMesh(
        hzGeo,
        hzMat,
        Math.max(1, aboveFloors.length)
      );
      hzIM.userData = { type: "media-conduit-horizontal", colorIndex: c };

      const lateralOffset = (c - 1) * 0.12; // Offset each conduit laterally

      for (let i = 0; i < aboveFloors.length; i++) {
        const floor = aboveFloors[i];
        const ceilingY = floor.y + floor.height * 0.9;
        pos.set(halfW - 1.5 + lateralOffset, ceilingY, 0);
        mat4.compose(pos, quat, scl);
        hzIM.setMatrixAt(i, mat4);
      }

      hzIM.count = aboveFloors.length;
      hzIM.instanceMatrix.needsUpdate = true;
      group.add(hzIM);
    }

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
        obj instanceof THREE.LineSegments
      ) {
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
