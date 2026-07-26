// src/lib/layers/layer-6-dhw.ts
// Layer 6: MEP Water DHW 급탕
// Orange/magenta domestic hot water piping: strict vertical risers in core
// shaft with horizontal branching ONLY to restroom/kitchen zones.
// Pure Three.js, no React.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import type { DhwParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";

const DHW_ORANGE = 0xf97316;
const PIPE_RADIUS = 0.05;
const PIPE_SEGMENTS = 8;

/**
 * Build merged DHW tank geometry: main cylinder body + top/bottom pipe stubs + side outlet.
 * Merged geometry has significantly more vertices than a plain CylinderGeometry.
 */
function buildTankGeometry(p: DhwParams): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(p.tankRadius, p.tankRadius, p.tankHeight, 16);

  // Top pipe stub (vertical cylinder protruding up)
  const topPipe = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
  topPipe.translate(0, p.tankHeight / 2 + 0.15, 0);

  // Bottom pipe stub (vertical cylinder protruding down)
  const bottomPipe = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
  bottomPipe.translate(0, -(p.tankHeight / 2 + 0.15), 0);

  // Side outlet (horizontal pipe on +X face, mid-height)
  const sidePipe = new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8);
  sidePipe.rotateZ(Math.PI / 2);
  sidePipe.translate(p.tankRadius + 0.175, 0, 0);

  return mergeGeometries([body, topPipe, bottomPipe, sidePipe]);
}

/**
 * DHWLayer generates domestic hot water distribution:
 * - Hot water storage tank (merged cylinder + pipe stubs) at basement
 * - Optional pump housing (horizontal cylinder + motor box) next to tank
 * - Thick vertical risers in core shaft (CylinderGeometry)
 * - Horizontal branches restricted to restroom/kitchen zones
 *   (1/3 and 2/3 of depth, near perimeter walls)
 * - Fixture endpoints (small spheres) at branch terminations
 */
export class DHWLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    _density: number = 1.0,
    equipParams: Partial<DhwParams> = {}
  ): THREE.Group {
    this.dispose();

    const dhwParams: DhwParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.dhw,
      ...equipParams,
    };

    const group = new THREE.Group();
    group.name = "layer-6-dhw";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

    // --- Pipe material ---
    const pipeMat = new THREE.MeshStandardMaterial({
      color: DHW_ORANGE,
      emissive: DHW_ORANGE,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    // --- Tank material ---
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      emissive: DHW_ORANGE,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.4,
    });

    // Basement Y position for tank centre (coarse path)
    const basementY = -(dhwParams.tankHeight / 2);
    // Shared plant-floor plane: every DHW plant item stands on the same
    // basement floor (fixes the recirc tank and pump previously floating
    // 0.36 m / 0.9 m above the main tank's base plane).
    const plantFloorY = -dhwParams.tankHeight;

    // --- Hot water storage tank at basement ---
    // Detailed Blender asset when preloaded; merged-primitive fallback otherwise.
    const tankAsset = getEquipmentObjectClone("dhw-tank");
    if (tankAsset) {
      const native = ASSET_NATIVE_DIMS["dhw-tank"];
      const radialScale = (dhwParams.tankRadius * 2) / native.w;
      tankAsset.scale.set(
        radialScale,
        dhwParams.tankHeight / native.h,
        radialScale
      );
      tankAsset.position.set(0.8, plantFloorY, 0.5);
      tagEquipmentObject(
        tankAsset,
        { type: "dhw-storage-tank" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(tankAsset);
    } else {
      const tankGeo = buildTankGeometry(dhwParams);
      const tank = new THREE.Mesh(tankGeo, tankMat);
      tank.position.set(0.8, basementY, 0.5);
      tank.userData = { type: "dhw-storage-tank" };
      group.add(tank);
    }

    // Secondary tank (recirculation) — scaled clone of the detailed tank, or
    // the original plain cylinder fallback.
    const tank2Asset = getEquipmentObjectClone("dhw-tank");
    if (tank2Asset) {
      const native = ASSET_NATIVE_DIMS["dhw-tank"];
      const radialScale = (dhwParams.tankRadius * 2 * 0.7) / native.w;
      tank2Asset.scale.set(
        radialScale,
        (dhwParams.tankHeight * 0.8) / native.h,
        radialScale
      );
      // Base on the shared plant floor (fixes the previous 0.36 m float).
      tank2Asset.position.set(-0.8, plantFloorY, 0.5);
      tagEquipmentObject(
        tank2Asset,
        { type: "dhw-recirc-tank" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(tank2Asset);
    } else {
      const tank2Geo = new THREE.CylinderGeometry(
        dhwParams.tankRadius * 0.7,
        dhwParams.tankRadius * 0.7,
        dhwParams.tankHeight * 0.8,
        12
      );
      const tank2 = new THREE.Mesh(tank2Geo, tankMat);
      // Centre-origin cylinder: base on the shared plant floor.
      tank2.position.set(-0.8, plantFloorY + dhwParams.tankHeight * 0.4, 0.5);
      tank2.userData = { type: "dhw-recirc-tank" };
      group.add(tank2);
    }

    // --- Circulation pump — detailed end-suction pump set or merged fallback ---
    if (dhwParams.showPump) {
      const pumpX = 0.8 + dhwParams.tankRadius + 0.6;
      const pumpAsset = getEquipmentObjectClone("dhw-pump");
      if (pumpAsset) {
        // Base-origin asset: baseplate rests on the plant floor (fixes the
        // previous placement where the pump floated at mid-basement height).
        pumpAsset.position.set(pumpX, plantFloorY, 0.5);
        tagEquipmentObject(
          pumpAsset,
          { type: "dhw-pump" },
          { castShadow: true, receiveShadow: true }
        );
        group.add(pumpAsset);
      } else {
        const pumpBody = new THREE.CylinderGeometry(0.18, 0.18, 0.5, 12);
        pumpBody.rotateZ(Math.PI / 2);
        const motor = new THREE.BoxGeometry(0.3, 0.25, 0.25);
        motor.translate(0.4, 0, 0);
        const pumpGeo = mergeGeometries([pumpBody, motor]);
        const pumpMesh = new THREE.Mesh(pumpGeo, tankMat);
        pumpMesh.userData = { type: "dhw-pump" };
        // Pump axis sits one body-radius above the shared plant floor.
        pumpMesh.position.set(pumpX, plantFloorY + 0.18, 0.5);
        group.add(pumpMesh);
      }
    }

    // --- Vertical risers in core shaft (strict CylinderGeometry) ---
    // Two risers: supply and return, slightly offset in core
    const riserPositions = [
      { x: 0.15, z: 0.15 },  // Supply
      { x: -0.15, z: -0.15 }, // Return (slightly thinner)
    ];
    const riserRadii = [PIPE_RADIUS * 1.5, PIPE_RADIUS * 1.2];

    for (let r = 0; r < riserPositions.length; r++) {
      const rp = riserPositions[r];
      const riserGeo = new THREE.CylinderGeometry(
        riserRadii[r], riserRadii[r], totalHeight + 1.0, PIPE_SEGMENTS
      );
      const riser = new THREE.Mesh(riserGeo, pipeMat);
      riser.position.set(rp.x, totalHeight / 2 - 0.5, rp.z);
      riser.userData = { type: "dhw-riser", riserType: r === 0 ? "supply" : "return" };
      group.add(riser);
    }

    // --- Per-floor horizontal branches to restroom/kitchen zones ONLY ---
    // Restroom zone: 1/3 of depth, near back wall (+Z side)
    // Kitchen zone: 2/3 of depth, near back wall (+Z side)
    const wetZones = [
      { name: "restroom", x: hw * 0.6, z: hd * 0.33 },
      { name: "kitchen", x: -hw * 0.5, z: hd * 0.67 },
    ];

    for (const floor of aboveFloors) {
      const pipeY = floor.y + 0.3; // Embedded in or just above slab

      for (const zone of wetZones) {
        // Horizontal branch from core to wet zone
        const branchCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(riserPositions[0].x, pipeY, riserPositions[0].z),
          new THREE.Vector3(zone.x * 0.3, pipeY, zone.z * 0.5),
          new THREE.Vector3(zone.x * 0.7, pipeY - 0.02, zone.z * 0.8),
          new THREE.Vector3(zone.x, pipeY, zone.z),
        ]);

        const branchGeo = new THREE.TubeGeometry(branchCurve, 16, PIPE_RADIUS, PIPE_SEGMENTS, false);
        const branch = new THREE.Mesh(branchGeo, pipeMat);
        branch.userData = { type: "dhw-branch", zone: zone.name, floorNo: floor.floorNo };
        group.add(branch);

        // Return branch (thinner, slightly offset)
        const returnCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(riserPositions[1].x, pipeY - 0.1, riserPositions[1].z),
          new THREE.Vector3(zone.x * 0.4, pipeY - 0.1, zone.z * 0.5 - 0.15),
          new THREE.Vector3(zone.x, pipeY - 0.1, zone.z - 0.15),
        ]);
        const returnGeo = new THREE.TubeGeometry(returnCurve, 12, PIPE_RADIUS * 0.8, PIPE_SEGMENTS, false);
        const returnBranch = new THREE.Mesh(returnGeo, pipeMat);
        returnBranch.userData = { type: "dhw-return", zone: zone.name, floorNo: floor.floorNo };
        group.add(returnBranch);

        // --- Fixture endpoint (small sphere at zone terminus) ---
        const fixtureSphereGeo = new THREE.SphereGeometry(0.08, 8, 6);
        const fixtureMat = new THREE.MeshStandardMaterial({
          color: DHW_ORANGE,
          emissive: DHW_ORANGE,
          emissiveIntensity: 0.6,
          roughness: 0.3,
          metalness: 0.5,
        });
        const fixture = new THREE.Mesh(fixtureSphereGeo, fixtureMat);
        fixture.position.set(zone.x, pipeY, zone.z);
        fixture.userData = { type: "dhw-fixture", zone: zone.name, floorNo: floor.floorNo };
        group.add(fixture);
      }
    }

    // --- Connection pipe from tanks to risers ---
    const connectCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.8, -dhwParams.tankHeight * 0.3, 0.5),
      new THREE.Vector3(0.5, -0.2, 0.3),
      new THREE.Vector3(riserPositions[0].x, 0.1, riserPositions[0].z),
    ]);
    const connectGeo = new THREE.TubeGeometry(connectCurve, 12, PIPE_RADIUS * 1.3, PIPE_SEGMENTS, false);
    const connectPipe = new THREE.Mesh(connectGeo, pipeMat);
    connectPipe.userData = { type: "dhw-tank-connect" };
    group.add(connectPipe);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
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
