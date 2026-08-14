// src/lib/layers/electrical-routing.ts
// Electrical routing (wires) — the dedicated mep-electrical generator that
// types.ts noted as "planned for v5.x".
//
// Realistic distribution topology, aligned with the per-floor 배전반
// (layer-7 places one panel per floor at x=0.5, z=0.5, mid-height):
//   - Vertical main-feeder ladder tray beside the panel stack (full width).
//   - Per floor: a primary ceiling run along X (0.8× width) and a narrower
//     secondary run along Z (0.55× width) at a slightly lower elevation.
//   - A bank of three conduits of varying diameter alongside the primary run.
//   - Vertical conduit drops from the ceiling run down to each panel, with
//     junction boxes where drops leave the run.
//
// Detailed path: the Blender "cable-tray" asset is a fixed 1 m module that is
// TILED per metre (rungs/cables cannot be stretched); width variation comes
// from per-instance scale on the module's width axis only.
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

/** 배전반 anchor from layer-7-lighting (panel per floor at this x/z). */
const PANEL_X = 0.5;
const PANEL_Z = 0.5;

export class ElectricalRoutingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density: number = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "electrical-routing";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // Shared routes
    const riserX = PANEL_X + 0.65; // main feeder tray beside the panel stack
    const mainRunLen = Math.max(2, Math.floor(footprintWidth * 0.7));
    const mainRunZ = 0.8;
    const zRunLen = Math.max(2, Math.floor(footprintDepth * 0.5));
    const zRunX = -footprintWidth * 0.22;

    const trayGeo = getEquipmentGeometryClone("cable-tray");
    if (trayGeo) {
      const trayMat = (getEquipmentMaterialClone("cable-tray") ??
        new THREE.MeshStandardMaterial({
          color: 0x9aa1a8,
          roughness: 0.4,
          metalness: 0.8,
        })) as THREE.MeshStandardMaterial;
      // Subtle amber emissive keeps interior wiring readable in x-ray views
      if (trayMat.emissive) {
        trayMat.emissive = new THREE.Color(ELEC_AMBER);
        trayMat.emissiveIntensity = 0.18;
      }

      const riserModules = Math.max(1, Math.ceil(totalHeight));
      const totalModules = Math.min(
        MAX_TRAY_MODULES,
        riserModules + aboveFloors.length * (mainRunLen + zRunLen)
      );

      const trayIM = new THREE.InstancedMesh(trayGeo, trayMat, totalModules);
      trayIM.userData = { type: "electrical-cable-tray" };

      const mat4 = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3(1, 1, 1);
      // Module length axis is Y (vertical riser as authored). Horizontal
      // runs: rotate -90° about Z (length → X), then roll +90° about X so
      // the tray lies flat, cable bed up. Z-direction runs additionally yaw
      // 90° about world Y.
      const idQuat = new THREE.Quaternion();
      const xRunQuat = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
        .premultiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
        );
      const zRunQuat = xRunQuat
        .clone()
        .premultiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
        );

      let ti = 0;
      // Vertical main feeder (full-width modules)
      for (let i = 0; i < riserModules && ti < totalModules; i++) {
        pos.set(riserX, i + 0.5, PANEL_Z);
        scl.set(1, 1, 1);
        mat4.compose(pos, idQuat, scl);
        trayIM.setMatrixAt(ti++, mat4);
      }
      for (const floor of aboveFloors) {
        if (ti >= totalModules) break;
        const trayY = floor.y + floor.height - 0.35;
        // Primary run along X — 0.8× width
        for (let j = 0; j < mainRunLen && ti < totalModules; j++) {
          pos.set(-mainRunLen / 2 + j + 0.5, trayY, mainRunZ);
          scl.set(0.8, 1, 1);
          mat4.compose(pos, xRunQuat, scl);
          trayIM.setMatrixAt(ti++, mat4);
        }
        // Secondary run along Z — narrower (0.55×) and slightly lower
        for (let j = 0; j < zRunLen && ti < totalModules; j++) {
          pos.set(zRunX, trayY - 0.12, -zRunLen / 2 + j + 0.5);
          scl.set(0.55, 1, 1);
          mat4.compose(pos, zRunQuat, scl);
          trayIM.setMatrixAt(ti++, mat4);
        }
      }
      trayIM.count = ti;
      // Pitfall 1: CRITICAL — must set needsUpdate after all setMatrixAt calls
      trayIM.instanceMatrix.needsUpdate = true;
      group.add(trayIM);

      // --- Conduit banks + vertical drops (unit cylinder, axis baked to X) ---
      const conduitGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
      conduitGeo.rotateZ(Math.PI / 2); // length axis → X, unit radius in YZ
      const conduitMat = new THREE.MeshStandardMaterial({
        color: ELEC_AMBER,
        emissive: ELEC_AMBER,
        emissiveIntensity: 0.3,
        roughness: 0.4,
        metalness: 0.5,
      });
      // Per floor: 3 bank conduits (varying Ø) + 2 drops (panel + spare)
      const conduitIM = new THREE.InstancedMesh(
        conduitGeo,
        conduitMat,
        aboveFloors.length * 5
      );
      conduitIM.userData = { type: "electrical-conduit" };

      const dropQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        Math.PI / 2
      );
      const bankRadii = [0.016, 0.024, 0.032];
      let ci = 0;
      for (const floor of aboveFloors) {
        const trayY = floor.y + floor.height - 0.35;
        // Bank alongside the primary run
        for (let b = 0; b < bankRadii.length; b++) {
          const r = bankRadii[b];
          pos.set(0, trayY - 0.05, mainRunZ + 0.32 + b * 0.08);
          scl.set(mainRunLen, r, r);
          mat4.compose(pos, idQuat, scl);
          conduitIM.setMatrixAt(ci++, mat4);
        }
        // Drop to the 배전반 (panel top ≈ mid-height + 0.4)
        const panelTopY = floor.y + floor.height * 0.5 + 0.42;
        const dropLen = Math.max(0.2, trayY - panelTopY);
        pos.set(PANEL_X, panelTopY + dropLen / 2, PANEL_Z + 0.1);
        scl.set(dropLen, 0.026, 0.026);
        mat4.compose(pos, dropQuat, scl);
        conduitIM.setMatrixAt(ci++, mat4);
        // Spare drop feeding the secondary run zone
        const spareLen = 0.6;
        pos.set(zRunX, floor.y + floor.height - 0.35 - 0.12 - spareLen / 2, 0);
        scl.set(spareLen, 0.02, 0.02);
        mat4.compose(pos, dropQuat, scl);
        conduitIM.setMatrixAt(ci++, mat4);
      }
      conduitIM.count = ci;
      conduitIM.instanceMatrix.needsUpdate = true;
      group.add(conduitIM);

      // --- Junction boxes where drops leave the runs ---
      const jboxAssetGeo = getEquipmentGeometryClone("junction-box");
      const jboxGeo = jboxAssetGeo ?? new THREE.BoxGeometry(0.2, 0.14, 0.14);
      const jboxMat = new THREE.MeshStandardMaterial({
        color: 0x8a6d1d,
        emissive: ELEC_AMBER,
        emissiveIntensity: 0.15,
        roughness: 0.5,
        metalness: 0.5,
      });
      const jboxIM = new THREE.InstancedMesh(
        jboxGeo,
        jboxMat,
        aboveFloors.length * 3
      );
      jboxIM.userData = { type: "electrical-junction-box" };
      let ji = 0;
      for (const floor of aboveFloors) {
        const trayY = floor.y + floor.height - 0.35;
        for (const [jx, jz] of [
          [PANEL_X, PANEL_Z + 0.1],
          [zRunX, 0],
          [riserX, mainRunZ],
        ] as const) {
          pos.set(jx, trayY - 0.02, jz);
          scl.set(1, 1, 1);
          mat4.compose(pos, idQuat, scl);
          jboxIM.setMatrixAt(ji++, mat4);
        }
      }
      jboxIM.count = ji;
      jboxIM.instanceMatrix.needsUpdate = true;
      group.add(jboxIM);
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
      riser.position.set(riserX, totalHeight / 2, PANEL_Z);
      riser.userData = { type: "electrical-riser" };
      group.add(riser);

      for (const floor of aboveFloors) {
        const runGeo = new THREE.CylinderGeometry(0.035, 0.035, mainRunLen, 6);
        runGeo.rotateZ(Math.PI / 2);
        const run = new THREE.Mesh(runGeo, conduitMat);
        run.position.set(0, floor.y + floor.height - 0.35, mainRunZ);
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
