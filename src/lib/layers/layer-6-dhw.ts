// src/lib/layers/layer-6-dhw.ts
// Layer 6: MEP Water DHW 급탕
// Orange/magenta domestic hot water piping: strict vertical risers in core
// shaft with horizontal branching ONLY to restroom/kitchen zones.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

const DHW_ORANGE = 0xf97316;
const PIPE_RADIUS = 0.05;
const PIPE_SEGMENTS = 8;

/**
 * DHWLayer generates domestic hot water distribution:
 * - Hot water storage tank as CylinderGeometry at basement
 * - Thick vertical risers in core shaft (CylinderGeometry)
 * - Horizontal branches restricted to restroom/kitchen zones
 *   (1/3 and 2/3 of depth, near perimeter walls)
 * - Fixture endpoints (small spheres) at branch terminations
 */
export class DHWLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density: number = 1.0): THREE.Group {
    this.dispose();

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

    // --- Hot water storage tank at basement ---
    const tankRadius = 0.6;
    const tankHeight = 1.8;
    const tankGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, tankHeight, 16);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      emissive: DHW_ORANGE,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.4,
    });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0.8, -tankHeight / 2, 0.5);
    tank.userData = { type: "dhw-storage-tank" };
    group.add(tank);

    // Secondary tank (recirculation)
    const tank2Geo = new THREE.CylinderGeometry(tankRadius * 0.7, tankRadius * 0.7, tankHeight * 0.8, 12);
    const tank2 = new THREE.Mesh(tank2Geo, tankMat);
    tank2.position.set(-0.8, -tankHeight * 0.4, 0.5);
    tank2.userData = { type: "dhw-recirc-tank" };
    group.add(tank2);

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
      new THREE.Vector3(0.8, -tankHeight * 0.3, 0.5),
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
