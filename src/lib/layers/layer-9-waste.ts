// src/lib/layers/layer-9-waste.ts
// Layer 9: Waste & Recovery — vertical waste chutes, collection points, dashed pipe overlay.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/**
 * WasteLayer generates waste management infrastructure:
 * - Vertical waste chutes at 2 positions on rear face per floor
 * - Collection points (boxes) at ground level under each chute
 * - Dashed line overlay for chute visualization
 */
export class WasteLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-9-waste";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // Chute positions: rear face (Z-), 1/3 and 2/3 width
    const chutePositions = [
      { x: -halfW + footprintWidth / 3, z: -(halfD - 0.2) },
      { x: -halfW + (footprintWidth * 2) / 3, z: -(halfD - 0.2) },
    ];

    const chuteRadius = 0.15;

    // --- Vertical waste chutes: instanced cylinders per floor ---
    const totalChuteSegments = chutePositions.length * aboveFloors.length;
    const chuteGeo = new THREE.CylinderGeometry(
      chuteRadius,
      chuteRadius,
      0, // Height set per-instance via scale
      8
    );

    // Use a unit-height cylinder and scale per floor
    const chuteUnitGeo = new THREE.CylinderGeometry(chuteRadius, chuteRadius, 1, 8);
    const chuteMat = new THREE.MeshStandardMaterial({
      color: 0x65a30d,
      roughness: 0.9,
    });
    const chuteIM = new THREE.InstancedMesh(
      chuteUnitGeo,
      chuteMat,
      Math.max(1, totalChuteSegments)
    );
    chuteIM.userData = { type: "waste-chute" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const chuteScl = new THREE.Vector3();

    let cIdx = 0;
    for (const cp of chutePositions) {
      for (const floor of aboveFloors) {
        const centerY = floor.y + floor.height / 2;
        pos.set(cp.x, centerY, cp.z);
        chuteScl.set(1, floor.height, 1);
        mat4.compose(pos, quat, chuteScl);
        chuteIM.setMatrixAt(cIdx++, mat4);
      }
    }
    chuteIM.count = cIdx;
    chuteIM.instanceMatrix.needsUpdate = true;
    group.add(chuteIM);

    // Dispose the unused geometry
    chuteGeo.dispose();

    // --- Collection points: boxes at ground level ---
    const collectionGeo = new THREE.BoxGeometry(1.0, 0.8, 0.6);
    const collectionMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.8,
    });
    const collectionIM = new THREE.InstancedMesh(
      collectionGeo,
      collectionMat,
      chutePositions.length
    );
    collectionIM.userData = { type: "waste-collection" };

    const unitScl = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < chutePositions.length; i++) {
      const cp = chutePositions[i];
      pos.set(cp.x, 0.4, cp.z - 0.4); // Slightly in front of chute at ground
      mat4.compose(pos, quat, unitScl);
      collectionIM.setMatrixAt(i, mat4);
    }
    collectionIM.count = chutePositions.length;
    collectionIM.instanceMatrix.needsUpdate = true;
    group.add(collectionIM);

    // --- Dashed line overlay for chute visualization ---
    const dashMat = new THREE.LineDashedMaterial({
      color: 0x65a30d,
      dashSize: 0.3,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.7,
    });

    for (const cp of chutePositions) {
      const linePoints = [
        new THREE.Vector3(cp.x, 0, cp.z),
        new THREE.Vector3(cp.x, totalHeight, cp.z),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const line = new THREE.Line(lineGeo, dashMat.clone());
      line.computeLineDistances(); // Required for dashed material
      line.userData = { type: "waste-chute-dash" };
      group.add(line);
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
