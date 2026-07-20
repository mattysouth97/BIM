// src/lib/layers/layer-8-media.ts
// Layer 8: Specialized Media — med-gas, compressed air lines with strict 90-degree Manhattan routing.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Colors for different media types: purple (med-gas), green (compressed air) */
const MEDIA_PURPLE = 0xa855f7;
const MEDIA_GREEN = 0x22c55e;

/**
 * Build a Manhattan-routed (90-degree elbows only) tube path between two 3D points.
 * Routes: X first, then Y, then Z — producing 2 elbow joints.
 */
function manhattanRoute(
  start: THREE.Vector3,
  end: THREE.Vector3
): THREE.Vector3[] {
  return [
    start.clone(),
    new THREE.Vector3(end.x, start.y, start.z), // move along X
    new THREE.Vector3(end.x, end.y, start.z), // move along Y
    end.clone(), // move along Z
  ];
}

/**
 * Create a tube mesh following Manhattan-distance waypoints.
 * Each segment is a CylinderGeometry oriented to the segment direction.
 */
function createManhattanTube(
  waypoints: THREE.Vector3[],
  radius: number,
  material: THREE.Material
): THREE.Group {
  const tubeGroup = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.001) continue;

    const segGeo = new THREE.CylinderGeometry(radius, radius, len, 6);
    const seg = new THREE.Mesh(segGeo, material);

    // Position at midpoint
    seg.position.copy(a).add(b).multiplyScalar(0.5);

    // Orient cylinder along segment direction
    dir.normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    seg.quaternion.copy(quat);

    tubeGroup.add(seg);

    // Add elbow joint sphere at bend points (not at start/end)
    if (i > 0) {
      const elbowGeo = new THREE.SphereGeometry(radius * 1.3, 6, 6);
      const elbow = new THREE.Mesh(elbowGeo, material);
      elbow.position.copy(a);
      tubeGroup.add(elbow);
    }
  }

  return tubeGroup;
}

/**
 * MediaLayer generates specialized media distribution infrastructure:
 * - Vertical risers at 4 shaft positions with strict 90-degree elbows
 * - Horizontal corridor runs per floor with Manhattan routing
 * - Med-gas (purple) and compressed air (green) as distinct tube colors
 * - High metalness MeshStandardMaterial with neon emissive glow
 */
export class MediaLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-8-media";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const tubeRadius = 0.04;

    // Material definitions — high metalness neon tubes
    const purpleMat = new THREE.MeshStandardMaterial({
      color: MEDIA_PURPLE,
      emissive: MEDIA_PURPLE,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });
    const greenMat = new THREE.MeshStandardMaterial({
      color: MEDIA_GREEN,
      emissive: MEDIA_GREEN,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });

    // --- Vertical risers: 4 shaft positions (one per quadrant near core) ---
    const riserOffsetX = footprintWidth * 0.15;
    const riserOffsetZ = footprintDepth * 0.15;
    const riserPositions = [
      { x: -riserOffsetX, z: -riserOffsetZ }, // NW
      { x: riserOffsetX, z: -riserOffsetZ }, // NE
      { x: -riserOffsetX, z: riserOffsetZ }, // SW
      { x: riserOffsetX, z: riserOffsetZ }, // SE
    ];

    // Vertical risers as instanced cylinders
    const riserGeo = new THREE.CylinderGeometry(
      tubeRadius * 1.2,
      tubeRadius * 1.2,
      totalHeight,
      6
    );
    const riserIM = new THREE.InstancedMesh(
      riserGeo,
      purpleMat,
      riserPositions.length
    );
    riserIM.userData = { type: "media-riser" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < riserPositions.length; i++) {
      const rp = riserPositions[i];
      pos.set(rp.x, totalHeight / 2, rp.z);
      mat4.compose(pos, quat, scl);
      riserIM.setMatrixAt(i, mat4);
    }
    riserIM.instanceMatrix.needsUpdate = true;
    group.add(riserIM);

    // --- Horizontal corridor runs per floor: Manhattan routed ---
    // Density controls how many floors get distribution (skip floors at low density)
    const floorStep = density >= 0.7 ? 1 : density >= 0.4 ? 2 : 3;

    for (let fi = 0; fi < aboveFloors.length; fi += floorStep) {
      const floor = aboveFloors[fi];
      const ceilingY = floor.y + floor.height * 0.88;

      // Med-gas run (purple): from NW riser along front corridor to NE riser
      const medGasRoute = manhattanRoute(
        new THREE.Vector3(-riserOffsetX, ceilingY, -riserOffsetZ),
        new THREE.Vector3(riserOffsetX, ceilingY, -riserOffsetZ)
      );
      const medGasTube = createManhattanTube(
        medGasRoute,
        tubeRadius,
        purpleMat
      );
      medGasTube.userData = { type: "media-medgas-corridor" };
      group.add(medGasTube);

      // Compressed air run (green): from SW riser along back corridor to SE riser
      const airRoute = manhattanRoute(
        new THREE.Vector3(-riserOffsetX, ceilingY - 0.1, riserOffsetZ),
        new THREE.Vector3(riserOffsetX, ceilingY - 0.1, riserOffsetZ)
      );
      const airTube = createManhattanTube(airRoute, tubeRadius, greenMat);
      airTube.userData = { type: "media-air-corridor" };
      group.add(airTube);

      // Cross-corridor connection (purple): front to back on left side
      const crossRoute = manhattanRoute(
        new THREE.Vector3(-riserOffsetX, ceilingY - 0.05, -riserOffsetZ),
        new THREE.Vector3(-riserOffsetX, ceilingY - 0.05, riserOffsetZ)
      );
      const crossTube = createManhattanTube(
        crossRoute,
        tubeRadius * 0.8,
        purpleMat
      );
      crossTube.userData = { type: "media-cross-corridor" };
      group.add(crossTube);

      // Branch tees into rooms: short stubs every ~4m along corridors
      const stubSpacing = 4;
      const stubCount = Math.max(
        1,
        Math.floor(footprintWidth * 0.6 / stubSpacing)
      );
      for (let s = 0; s < stubCount; s++) {
        const stubX =
          -riserOffsetX + ((s + 0.5) / stubCount) * (riserOffsetX * 2);
        // Stub goes perpendicular (Z direction) into the floor plate
        const stubStart = new THREE.Vector3(
          stubX,
          ceilingY,
          -riserOffsetZ
        );
        const stubEnd = new THREE.Vector3(
          stubX,
          ceilingY,
          -riserOffsetZ - footprintDepth * 0.15
        );
        const stubRoute = manhattanRoute(stubStart, stubEnd);
        const stubTube = createManhattanTube(
          stubRoute,
          tubeRadius * 0.6,
          fi % 2 === 0 ? greenMat : purpleMat
        );
        group.add(stubTube);
      }
    }

    // --- Valve boxes at riser tops (boxes at each riser, top floor) ---
    const valveGeo = new THREE.BoxGeometry(0.2, 0.15, 0.2);
    const valveMat = new THREE.MeshStandardMaterial({
      color: 0xe0e0e0,
      metalness: 0.9,
      roughness: 0.1,
    });
    const valveIM = new THREE.InstancedMesh(
      valveGeo,
      valveMat,
      riserPositions.length
    );
    valveIM.userData = { type: "media-valve" };

    for (let i = 0; i < riserPositions.length; i++) {
      const rp = riserPositions[i];
      pos.set(rp.x, totalHeight + 0.1, rp.z);
      mat4.compose(pos, quat, scl);
      valveIM.setMatrixAt(i, mat4);
    }
    valveIM.instanceMatrix.needsUpdate = true;
    group.add(valveIM);

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
