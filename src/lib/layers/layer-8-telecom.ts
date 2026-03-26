// src/lib/layers/layer-8-telecom.ts
// Layer 8: Telecom & IT — network nodes, fiber runs with pulse animation, vertical backbone.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for fiber pulse animation (LineSegments) */
const fiberVertexShader = /* glsl */ `
  attribute float lineDistance;
  uniform float uTime;
  varying float vLineDistance;
  void main() {
    vLineDistance = lineDistance;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for fiber pulse — traveling opacity wave */
const fiberFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vLineDistance;
  void main() {
    float wave = sin(vLineDistance * 10.0 - uTime * 3.0) * 0.5 + 0.5;
    float alpha = mix(0.2, 0.9, wave);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * TelecomLayer generates IT/data infrastructure:
 * - Network nodes (small cubes) at ceiling grid every 5m per floor
 * - Fiber runs (LineSegments) connecting nodes with pulse animation
 * - Vertical backbone cylinder at building center
 */
export class TelecomLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-8-telecom";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // --- Network nodes: grid every 5m on ceiling per floor ---
    const spacingX = 5;
    const spacingZ = 5;
    const colsX = Math.max(1, Math.floor(footprintWidth / spacingX));
    const colsZ = Math.max(1, Math.floor(footprintDepth / spacingZ));
    const nodesPerFloor = colsX * colsZ;
    const totalNodes = nodesPerFloor * aboveFloors.length;

    const nodeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.3,
    });
    const nodeIM = new THREE.InstancedMesh(
      nodeGeo,
      nodeMat,
      Math.max(1, totalNodes)
    );
    nodeIM.userData = { type: "telecom-node" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    // Track node positions per floor for fiber connections
    const nodePositionsByFloor: THREE.Vector3[][] = [];
    let nIdx = 0;

    for (const floor of aboveFloors) {
      const ceilingY = floor.y + floor.height - 0.15;
      const floorNodes: THREE.Vector3[] = [];

      for (let cx = 0; cx < colsX; cx++) {
        for (let cz = 0; cz < colsZ; cz++) {
          const x = -halfW + spacingX * 0.5 + cx * spacingX;
          const z = -halfD + spacingZ * 0.5 + cz * spacingZ;
          pos.set(x, ceilingY, z);
          mat4.compose(pos, quat, scl);
          nodeIM.setMatrixAt(nIdx++, mat4);
          floorNodes.push(pos.clone());
        }
      }
      nodePositionsByFloor.push(floorNodes);
    }
    nodeIM.count = nIdx;
    nodeIM.instanceMatrix.needsUpdate = true;
    group.add(nodeIM);

    // --- Fiber runs: connect nodes on each floor ---
    const fiberMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xd946ef) },
      },
      vertexShader: fiberVertexShader,
      fragmentShader: fiberFragmentShader,
      transparent: true,
      depthWrite: false,
    });

    for (const floorNodes of nodePositionsByFloor) {
      if (floorNodes.length < 2) continue;

      // Connect nodes in a grid pattern (row by row, then column by column)
      const points: THREE.Vector3[] = [];

      // Connect sequentially (approximates grid wiring)
      for (let i = 0; i < floorNodes.length - 1; i++) {
        points.push(floorNodes[i]);
        points.push(floorNodes[i + 1]);
      }

      if (points.length > 0) {
        const fiberGeo = new THREE.BufferGeometry().setFromPoints(points);

        // Compute line distances for the shader
        const distances = new Float32Array(points.length);
        let accum = 0;
        for (let i = 0; i < points.length; i++) {
          if (i > 0 && i % 2 === 0) {
            // Reset distance at start of each segment pair
            accum = 0;
          }
          if (i > 0 && i % 2 === 1) {
            accum = points[i - 1].distanceTo(points[i]);
          }
          distances[i] = accum;
        }
        fiberGeo.setAttribute(
          "lineDistance",
          new THREE.BufferAttribute(distances, 1)
        );

        const fiber = new THREE.LineSegments(fiberGeo, fiberMat.clone());
        fiber.userData = { type: "telecom-fiber" };
        group.add(fiber);
      }
    }

    // --- Vertical backbone: central cylinder full height ---
    const backboneGeo = new THREE.CylinderGeometry(0.08, 0.08, totalHeight, 8);
    const backboneMat = new THREE.MeshStandardMaterial({
      color: 0xd946ef,
      emissive: 0xd946ef,
      emissiveIntensity: 0.2,
    });
    const backbone = new THREE.Mesh(backboneGeo, backboneMat);
    backbone.position.set(0, totalHeight / 2, 0);
    backbone.userData = { type: "telecom-backbone" };
    group.add(backbone);

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
