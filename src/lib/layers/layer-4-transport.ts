// src/lib/layers/layer-4-transport.ts
// Layer 4: Transport & Logistics — elevator shafts and animated elevator cars.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for elevator car with vertical animation */
const elevatorVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTotalHeight;
  uniform float uShaftIndex;
  varying vec3 vNormal;
  void main() {
    vNormal = normalMatrix * normal;
    // Each shaft gets a different phase offset so cars don't move in sync
    float phase = uShaftIndex * 1.5;
    // Oscillate between ground and top
    float t = 0.5 + 0.5 * sin(uTime * 0.5 + phase);
    float carY = t * (uTotalHeight - 2.4);
    vec3 displaced = position;
    displaced.y += carY;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/** Fragment shader for elevator car */
const elevatorFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float lighting = 0.4 + 0.6 * abs(dot(vNormal, vec3(0.0, 1.0, 0.0)));
    gl_FragColor = vec4(uColor * lighting, 0.85);
  }
`;

/**
 * TransportLayer generates elevator shaft wireframes and animated elevator cars.
 * Shaft count: 1 for buildings under 10 floors, 2 for 10+ floors.
 */
export class TransportLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-4-transport";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const shaftCount = aboveFloors.length < 10 ? 1 : 2;
    const shaftWidth = 1.5;
    const shaftDepth = 1.8;
    const carHeight = 2.4;

    // Position shafts near building core (centered for 1, offset for 2)
    const shaftPositions: { x: number; z: number }[] = [];
    if (shaftCount === 1) {
      shaftPositions.push({ x: 0, z: 0 });
    } else {
      const spacing = shaftWidth + 0.5;
      shaftPositions.push({ x: -spacing / 2, z: 0 });
      shaftPositions.push({ x: spacing / 2, z: 0 });
    }

    for (let i = 0; i < shaftPositions.length; i++) {
      const sp = shaftPositions[i];

      // --- Shaft wireframe ---
      const shaftGeo = new THREE.BoxGeometry(shaftWidth, totalHeight, shaftDepth);
      const edgesGeo = new THREE.EdgesGeometry(shaftGeo);
      const shaftLine = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.5,
        })
      );
      shaftLine.position.set(sp.x, totalHeight / 2, sp.z);
      shaftLine.userData = { type: "elevator-shaft", shaftIndex: i };
      group.add(shaftLine);
      shaftGeo.dispose();

      // --- Guide rails (4 vertical lines at shaft corners) ---
      const railHalfW = shaftWidth / 2 - 0.05;
      const railHalfD = shaftDepth / 2 - 0.05;
      const railCorners = [
        [sp.x - railHalfW, sp.z - railHalfD],
        [sp.x + railHalfW, sp.z - railHalfD],
        [sp.x - railHalfW, sp.z + railHalfD],
        [sp.x + railHalfW, sp.z + railHalfD],
      ];

      const railMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.3,
      });

      for (const [rx, rz] of railCorners) {
        const railPoints = [
          new THREE.Vector3(rx, 0, rz),
          new THREE.Vector3(rx, totalHeight, rz),
        ];
        const railGeo = new THREE.BufferGeometry().setFromPoints(railPoints);
        const rail = new THREE.LineSegments(railGeo, railMat.clone());
        group.add(rail);
      }

      // --- Animated elevator car ---
      const carGeo = new THREE.BoxGeometry(shaftWidth * 0.8, carHeight, shaftDepth * 0.8);
      const carMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uTotalHeight: { value: totalHeight },
          uShaftIndex: { value: i },
          uColor: { value: new THREE.Color(0xf59e0b) },
        },
        vertexShader: elevatorVertexShader,
        fragmentShader: elevatorFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const carMesh = new THREE.Mesh(carGeo, carMat);
      carMesh.position.set(sp.x, carHeight / 2, sp.z);
      carMesh.userData = { type: "elevator-car", shaftIndex: i };
      group.add(carMesh);
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
