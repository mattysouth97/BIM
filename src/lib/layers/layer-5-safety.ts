// src/lib/layers/layer-5-safety.ts
// Layer 5: Life Safety & Security — sprinkler heads, fire detection zones, radar rings.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for expanding radar ring animation */
const radarVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Expand ring outward over time
    float scale = 1.0 + 0.5 * fract(uTime * 0.3);
    vec3 scaled = position * scale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scaled, 1.0);
  }
`;

/** Fragment shader for radar ring fade */
const radarFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float alpha = 1.0 - fract(uTime * 0.3);
    gl_FragColor = vec4(uColor, alpha * 0.6);
  }
`;

/**
 * SafetyLayer generates fire suppression and security visualization:
 * - Sprinkler heads on ceiling grid every 3m per floor
 * - Transparent red fire detection zones per floor
 * - Expanding radar rings at stairwell locations
 */
export class SafetyLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-5-safety";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // --- Sprinkler heads: grid every 3m on ceiling ---
    const spacingX = 3;
    const spacingZ = 3;
    const colsX = Math.max(1, Math.floor(footprintWidth / spacingX));
    const colsZ = Math.max(1, Math.floor(footprintDepth / spacingZ));
    const sprinklersPerFloor = colsX * colsZ;
    const totalSprinklers = sprinklersPerFloor * aboveFloors.length;

    const sprinklerGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const sprinklerMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xf97316,
      emissiveIntensity: 0.2,
    });
    const sprinklerIM = new THREE.InstancedMesh(
      sprinklerGeo,
      sprinklerMat,
      Math.max(1, totalSprinklers)
    );
    sprinklerIM.userData = { type: "safety-sprinkler" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    let sIdx = 0;
    for (const floor of aboveFloors) {
      const ceilingY = floor.y + floor.height - 0.1; // Just below ceiling
      for (let cx = 0; cx < colsX; cx++) {
        for (let cz = 0; cz < colsZ; cz++) {
          const x = -halfW + spacingX * 0.5 + cx * spacingX;
          const z = -halfD + spacingZ * 0.5 + cz * spacingZ;
          pos.set(x, ceilingY, z);
          mat4.compose(pos, quat, scl);
          sprinklerIM.setMatrixAt(sIdx++, mat4);
        }
      }
    }
    sprinklerIM.count = sIdx;
    sprinklerIM.instanceMatrix.needsUpdate = true;
    group.add(sprinklerIM);

    // --- Fire detection zones: transparent red plane per floor ---
    const zoneGeo = new THREE.BoxGeometry(
      footprintWidth * 0.95,
      0.05,
      footprintDepth * 0.95
    );
    const zoneMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    const zoneIM = new THREE.InstancedMesh(
      zoneGeo,
      zoneMat,
      Math.max(1, aboveFloors.length)
    );
    zoneIM.userData = { type: "safety-fire-zone" };

    for (let i = 0; i < aboveFloors.length; i++) {
      const floor = aboveFloors[i];
      const zoneY = floor.y + floor.height * 0.5;
      pos.set(0, zoneY, 0);
      mat4.compose(pos, quat, scl);
      zoneIM.setMatrixAt(i, mat4);
    }
    zoneIM.count = aboveFloors.length;
    zoneIM.instanceMatrix.needsUpdate = true;
    group.add(zoneIM);

    // --- Radar rings at stairwell locations ---
    // Place at ground floor and every 5th floor, at 2 stairwell positions
    const radarFloors = aboveFloors.filter(
      (_, i) => i === 0 || i % 5 === 0
    );
    const stairPositions = [
      { x: -halfW + 2, z: halfD - 2 },
      { x: halfW - 2, z: -halfD + 2 },
    ];

    const radarGeo = new THREE.TorusGeometry(1.5, 0.02, 8, 32);
    radarGeo.rotateX(Math.PI / 2); // Lay flat

    for (let f = 0; f < radarFloors.length; f++) {
      for (let s = 0; s < stairPositions.length; s++) {
        const floor = radarFloors[f];
        const sp = stairPositions[s];
        const radarMat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: f * 0.7 + s * 1.3 }, // Phase offset
            uColor: { value: new THREE.Color(0xf97316) },
          },
          vertexShader: radarVertexShader,
          fragmentShader: radarFragmentShader,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        const ring = new THREE.Mesh(radarGeo.clone(), radarMat);
        ring.position.set(sp.x, floor.y + 0.2, sp.z);
        ring.userData = { type: "safety-radar" };
        group.add(ring);
      }
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
