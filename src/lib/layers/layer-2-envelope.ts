// src/lib/layers/layer-2-envelope.ts
// Layer 2: Envelope — Dynamic Skin
// Smart glass facades with sun-driven opacity, automated louver arrays.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

// Vertex shader — passes UV + normal to fragment
const envelopeVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Fragment shader — opacity and tint shift based on simulated sun direction
const envelopeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform float uMinOpacity;
  uniform float uMaxOpacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    // Simulate sun position rotating around the building (1 cycle per 20s)
    float sunAngle = uTime * 0.3141592;
    vec3 sunDir = normalize(vec3(cos(sunAngle), 0.6, sin(sunAngle)));

    // Facade-sun incidence determines opacity (more direct sun = more opaque tint)
    float incidence = max(dot(vNormal, sunDir), 0.0);

    // Animated opacity between min and max based on incidence
    float opacity = mix(uMinOpacity, uMaxOpacity, incidence);

    // Color shifts warmer when sun hits directly
    vec3 warmTint = vec3(0.95, 0.85, 0.7);
    vec3 color = mix(uBaseColor, warmTint, incidence * 0.4);

    // Subtle vertical gradient for visual interest
    float gradientFactor = smoothstep(0.0, 1.0, vUv.y);
    color = mix(color * 0.9, color, gradientFactor);

    gl_FragColor = vec4(color, opacity);
  }
`;

/**
 * EnvelopeLayer generates the building's dynamic skin:
 * - 4 facade planes locked to perimeter normals with sun-reactive ShaderMaterial
 * - Instanced louver/blind elements along each facade
 * - Animated opacity shifts as simulated sun rotates
 */
export class EnvelopeLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-2-envelope";

    const { footprintWidth, footprintDepth, totalHeight } = recipe;
    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

    // --- Facade definitions: 4 sides ---
    const facades: {
      width: number;
      height: number;
      pos: THREE.Vector3;
      rotY: number;
      normal: THREE.Vector3;
    }[] = [
      // Front (south, -Z)
      {
        width: footprintWidth,
        height: totalHeight,
        pos: new THREE.Vector3(0, totalHeight / 2, -hd),
        rotY: 0,
        normal: new THREE.Vector3(0, 0, -1),
      },
      // Back (north, +Z)
      {
        width: footprintWidth,
        height: totalHeight,
        pos: new THREE.Vector3(0, totalHeight / 2, hd),
        rotY: Math.PI,
        normal: new THREE.Vector3(0, 0, 1),
      },
      // Left (west, -X)
      {
        width: footprintDepth,
        height: totalHeight,
        pos: new THREE.Vector3(-hw, totalHeight / 2, 0),
        rotY: Math.PI / 2,
        normal: new THREE.Vector3(-1, 0, 0),
      },
      // Right (east, +X)
      {
        width: footprintDepth,
        height: totalHeight,
        pos: new THREE.Vector3(hw, totalHeight / 2, 0),
        rotY: -Math.PI / 2,
        normal: new THREE.Vector3(1, 0, 0),
      },
    ];

    for (const facade of facades) {
      // --- Glass panel plane ---
      const planeGeo = new THREE.PlaneGeometry(facade.width, facade.height, 1, 1);
      const shaderMat = new THREE.ShaderMaterial({
        vertexShader: envelopeVertexShader,
        fragmentShader: envelopeFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uBaseColor: { value: new THREE.Color(0x88bbdd) },
          uMinOpacity: { value: 0.15 },
          uMaxOpacity: { value: 0.55 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const plane = new THREE.Mesh(planeGeo, shaderMat);
      plane.position.copy(facade.pos);
      plane.rotation.y = facade.rotY;
      plane.userData = { type: "envelope-glass" };
      group.add(plane);

      // --- Louver / blind elements along this facade ---
      const louverCount = Math.floor(facade.height / 0.8); // ~one louver per 0.8m
      const louverCols = Math.max(2, Math.floor(facade.width / 2.5)); // ~one column per 2.5m
      const totalLouvers = louverCount * louverCols;

      if (totalLouvers > 0) {
        const louverGeo = new THREE.BoxGeometry(
          facade.width / louverCols * 0.85,  // slightly narrower than spacing
          0.04,                                // thin blade
          0.25                                 // depth of louver
        );
        const louverMat = new THREE.MeshStandardMaterial({
          color: 0xd0d0d0,
          roughness: 0.5,
          metalness: 0.6,
          transparent: true,
          opacity: 0.5,
        });

        const louverIM = new THREE.InstancedMesh(louverGeo, louverMat, totalLouvers);
        louverIM.userData = { type: "envelope-louver" };

        const mat4 = new THREE.Matrix4();
        const rotationMatrix = new THREE.Matrix4().makeRotationY(facade.rotY);
        let idx = 0;

        for (let row = 0; row < louverCount; row++) {
          const y = row * 0.8 + 0.4;
          for (let col = 0; col < louverCols; col++) {
            const localX = -facade.width / 2 + (col + 0.5) * (facade.width / louverCols);
            const localZ = 0.15; // slight offset from facade surface

            // Position in local facade space, then transform to world
            const louverPos = new THREE.Vector3(localX, y, localZ);
            louverPos.applyMatrix4(rotationMatrix);
            louverPos.add(facade.pos);
            louverPos.y = y; // Override Y to absolute floor-relative

            mat4.makeTranslation(louverPos.x, louverPos.y, louverPos.z);
            // Apply facade rotation to louver
            const rotMat = new THREE.Matrix4().makeRotationY(facade.rotY);
            mat4.multiply(rotMat);

            louverIM.setMatrixAt(idx++, mat4);
          }
        }

        louverIM.count = idx;
        louverIM.instanceMatrix.needsUpdate = true;
        group.add(louverIM);
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
        obj instanceof THREE.InstancedMesh
      ) {
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
