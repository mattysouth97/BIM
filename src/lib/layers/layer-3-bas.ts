// src/lib/layers/layer-3-bas.ts
// Layer 3: BAS, IoT & Controls — sensor nodes with pulsing glow and dashed connections.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for pulsing sensor glow */
const sensorVertexShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for pulsing sensor glow */
const sensorFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float pulse = 0.5 + 0.5 * sin(uTime * 2.0);
    float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    float glow = mix(0.4, 1.0, pulse) + rim * 0.3;
    gl_FragColor = vec4(uColor * glow, 0.9);
  }
`;

/**
 * BASLayer generates sensor nodes with animated pulsing glow
 * and dashed connection lines between adjacent sensors.
 */
export class BASLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-3-bas";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;
    const wallInset = 0.3; // Sensors mounted slightly inside walls

    // Sensor positions on each sensor floor: center of each wall face
    const sensorOffsets = [
      { x: 0, z: halfD - wallInset },        // front wall center
      { x: 0, z: -(halfD - wallInset) },     // back wall center
      { x: halfW - wallInset, z: 0 },         // right wall center
      { x: -(halfW - wallInset), z: 0 },      // left wall center
    ];

    // Place sensors every 2 floors
    const sensorFloors = aboveFloors.filter((_, i) => i % 2 === 0);
    const sensorCount = sensorFloors.length * sensorOffsets.length;

    if (sensorCount === 0) {
      this.group = group;
      return group;
    }

    // --- Sensor nodes (InstancedMesh with ShaderMaterial) ---
    const sensorGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const sensorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x22c55e) },
      },
      vertexShader: sensorVertexShader,
      fragmentShader: sensorFragmentShader,
      transparent: true,
    });

    const sensorIM = new THREE.InstancedMesh(sensorGeo, sensorMat, sensorCount);
    sensorIM.userData = { type: "bas-sensor" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    // Track sensor world positions for connection lines
    const sensorPositions: THREE.Vector3[] = [];
    let sIdx = 0;

    for (const floor of sensorFloors) {
      const sensorY = floor.y + floor.height * 0.6; // Mid-height on wall

      for (const offset of sensorOffsets) {
        pos.set(offset.x, sensorY, offset.z);
        mat4.compose(pos, quat, scl);
        sensorIM.setMatrixAt(sIdx++, mat4);
        sensorPositions.push(pos.clone());
      }
    }

    sensorIM.count = sIdx;
    sensorIM.instanceMatrix.needsUpdate = true;
    group.add(sensorIM);

    // --- Dashed connection lines between adjacent sensors ---
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x22c55e,
      dashSize: 0.15,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.6,
    });

    // Connect sensors on the same floor (loop around the 4 wall sensors)
    for (let f = 0; f < sensorFloors.length; f++) {
      const baseIdx = f * sensorOffsets.length;
      const points: THREE.Vector3[] = [];

      for (let s = 0; s < sensorOffsets.length; s++) {
        points.push(sensorPositions[baseIdx + s]);
      }
      // Close the loop
      points.push(sensorPositions[baseIdx]);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, lineMat.clone());
      line.computeLineDistances(); // Required for dashed material
      group.add(line);
    }

    // Connect sensors vertically between floors (same wall position)
    for (let s = 0; s < sensorOffsets.length; s++) {
      const verticalPoints: THREE.Vector3[] = [];
      for (let f = 0; f < sensorFloors.length; f++) {
        verticalPoints.push(sensorPositions[f * sensorOffsets.length + s]);
      }
      if (verticalPoints.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(verticalPoints);
        const line = new THREE.Line(lineGeo, lineMat.clone());
        line.computeLineDistances();
        group.add(line);
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
