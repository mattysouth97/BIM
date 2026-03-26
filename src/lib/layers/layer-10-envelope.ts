// src/lib/layers/layer-10-envelope.ts
// Layer 10: Dynamic Envelope — facade surface panels with color-shifting shader effect.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for envelope panels — passes UV to fragment */
const envelopeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for color-shifting envelope effect */
const envelopeFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float shift = sin(uTime * 0.5 + vUv.x * 6.28 + vUv.y * 3.14) * 0.5 + 0.5;
    vec3 color = mix(vec3(0.23, 0.51, 0.96), vec3(0.13, 0.77, 0.33), shift);
    gl_FragColor = vec4(color, 0.3);
  }
`;

/**
 * EnvelopeLayer generates adaptive facade visualization:
 * - Surface panels per facade face, subdivided into tile grid (3m x floor.height)
 * - InstancedMesh with ShaderMaterial for color-shifting overlay effect
 * - Transparent with no depth write (overlay on top of building)
 */
export class EnvelopeLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-10-envelope";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // Tile dimensions
    const tileWidth = 3; // meters
    const offset = 0.05; // Slight offset from building surface

    // 4 facade faces: front (Z+), back (Z-), right (X+), left (X-)
    const facades: {
      faceWidth: number;
      tilesX: number;
      position: (tx: number, floorY: number, floorH: number) => THREE.Vector3;
      rotation: THREE.Euler;
    }[] = [
      {
        // Front face (Z+)
        faceWidth: footprintWidth,
        tilesX: Math.max(1, Math.floor(footprintWidth / tileWidth)),
        position: (tx, floorY, floorH) =>
          new THREE.Vector3(
            -halfW + tileWidth * 0.5 + tx * tileWidth,
            floorY + floorH / 2,
            halfD + offset
          ),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        // Back face (Z-)
        faceWidth: footprintWidth,
        tilesX: Math.max(1, Math.floor(footprintWidth / tileWidth)),
        position: (tx, floorY, floorH) =>
          new THREE.Vector3(
            -halfW + tileWidth * 0.5 + tx * tileWidth,
            floorY + floorH / 2,
            -(halfD + offset)
          ),
        rotation: new THREE.Euler(0, Math.PI, 0),
      },
      {
        // Right face (X+)
        faceWidth: footprintDepth,
        tilesX: Math.max(1, Math.floor(footprintDepth / tileWidth)),
        position: (tx, floorY, floorH) =>
          new THREE.Vector3(
            halfW + offset,
            floorY + floorH / 2,
            -halfD + tileWidth * 0.5 + tx * tileWidth
          ),
        rotation: new THREE.Euler(0, Math.PI / 2, 0),
      },
      {
        // Left face (X-)
        faceWidth: footprintDepth,
        tilesX: Math.max(1, Math.floor(footprintDepth / tileWidth)),
        position: (tx, floorY, floorH) =>
          new THREE.Vector3(
            -(halfW + offset),
            floorY + floorH / 2,
            -halfD + tileWidth * 0.5 + tx * tileWidth
          ),
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
      },
    ];

    // Count total tiles across all facades and floors
    let totalTiles = 0;
    for (const facade of facades) {
      totalTiles += facade.tilesX * aboveFloors.length;
    }

    if (totalTiles === 0) {
      this.group = group;
      return group;
    }

    // Use the first floor's height as representative tile height
    const tileHeight = aboveFloors[0]?.height ?? 3;
    const tileGeo = new THREE.PlaneGeometry(tileWidth * 0.95, tileHeight * 0.95);

    const tileMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: envelopeVertexShader,
      fragmentShader: envelopeFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const tileIM = new THREE.InstancedMesh(tileGeo, tileMat, totalTiles);
    tileIM.userData = { type: "envelope-panel" };

    const mat4 = new THREE.Matrix4();
    const quatHelper = new THREE.Quaternion();

    let tIdx = 0;
    for (const facade of facades) {
      quatHelper.setFromEuler(facade.rotation);

      for (const floor of aboveFloors) {
        for (let tx = 0; tx < facade.tilesX; tx++) {
          const tilePos = facade.position(tx, floor.y, floor.height);
          const tileSclVec = new THREE.Vector3(1, 1, 1);
          mat4.compose(tilePos, quatHelper, tileSclVec);
          tileIM.setMatrixAt(tIdx++, mat4);
        }
      }
    }

    tileIM.count = tIdx;
    tileIM.instanceMatrix.needsUpdate = true;
    group.add(tileIM);

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
