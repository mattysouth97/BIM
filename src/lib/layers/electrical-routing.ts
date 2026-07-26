// src/lib/layers/electrical-routing.ts
// Electrical routing (wires) — the dedicated mep-electrical generator that
// types.ts noted as "planned for v5.x".
//
// Renders galvanized ladder cable trays carrying cable bundles:
//   - A vertical riser beside the core, from ground to roof.
//   - A horizontal distribution run at each above-ground floor ceiling.
//
// Detailed path: the Blender "cable-tray" asset is a fixed 1 m module that is
// TILED per metre (rungs/cables cannot be stretched) in one InstancedMesh.
// Fallback path (SSR/tests/asset failure): simple emissive amber conduit
// cylinders along the same routes.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import {
  getEquipmentGeometryClone,
  getEquipmentMaterialClone,
} from "@/lib/equipment-assets";

const ELEC_AMBER = 0xf59e0b;
const MAX_TRAY_MODULES = 600;

export class ElectricalRoutingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density: number = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "electrical-routing";

    const { floors, footprintWidth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // Routes shared by both paths
    const riserX = footprintWidth * 0.075 + 0.4; // beside the core walls
    const runLength = Math.max(2, Math.floor(footprintWidth * 0.7));
    const trayZ = 0.8;

    const trayGeo = getEquipmentGeometryClone("cable-tray");
    if (trayGeo) {
      const trayMat =
        getEquipmentMaterialClone("cable-tray") ??
        new THREE.MeshStandardMaterial({
          color: 0x9aa1a8,
          roughness: 0.4,
          metalness: 0.8,
        });

      const riserModules = Math.max(1, Math.ceil(totalHeight));
      const totalModules = Math.min(
        MAX_TRAY_MODULES,
        riserModules + aboveFloors.length * runLength
      );

      const trayIM = new THREE.InstancedMesh(trayGeo, trayMat, totalModules);
      trayIM.userData = { type: "electrical-cable-tray" };

      const mat4 = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3(1, 1, 1);
      // Module length axis is Y (vertical). Horizontal runs: first rotate
      // -90° about Z (length → X), then roll +90° about X (the length axis)
      // so the tray lies flat with the cable bed facing up — without the
      // roll the ladder would stand on its edge.
      const idQuat = new THREE.Quaternion();
      const horizQuat = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
        .premultiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
        );

      let ti = 0;
      for (let i = 0; i < riserModules && ti < totalModules; i++) {
        pos.set(riserX, i + 0.5, 0);
        mat4.compose(pos, idQuat, scl);
        trayIM.setMatrixAt(ti++, mat4);
      }
      for (const floor of aboveFloors) {
        if (ti >= totalModules) break;
        const trayY = floor.y + floor.height - 0.35;
        for (let j = 0; j < runLength && ti < totalModules; j++) {
          pos.set(-runLength / 2 + j + 0.5, trayY, trayZ);
          mat4.compose(pos, horizQuat, scl);
          trayIM.setMatrixAt(ti++, mat4);
        }
      }
      trayIM.count = ti;
      // Pitfall 1: CRITICAL — must set needsUpdate after all setMatrixAt calls
      trayIM.instanceMatrix.needsUpdate = true;
      group.add(trayIM);
    } else {
      // Coarse fallback: emissive amber conduits along the same routes.
      const conduitMat = new THREE.MeshStandardMaterial({
        color: ELEC_AMBER,
        emissive: ELEC_AMBER,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.5,
      });

      const riserGeo = new THREE.CylinderGeometry(0.05, 0.05, totalHeight, 8);
      const riser = new THREE.Mesh(riserGeo, conduitMat);
      riser.position.set(riserX, totalHeight / 2, 0);
      riser.userData = { type: "electrical-riser" };
      group.add(riser);

      for (const floor of aboveFloors) {
        const runGeo = new THREE.CylinderGeometry(0.035, 0.035, runLength, 6);
        runGeo.rotateZ(Math.PI / 2);
        const run = new THREE.Mesh(runGeo, conduitMat);
        run.position.set(0, floor.y + floor.height - 0.35, trayZ);
        run.userData = { type: "electrical-run", floorNo: floor.floorNo };
        group.add(run);
      }
    }

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      }
    });
    this.group = null;
  }
}
