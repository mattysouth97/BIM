// src/lib/layers/layer-7-microgrid.ts
// Layer 7: Microgrid & Energy — battery storage cubes and bi-directional energy arrows.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for battery glow pulse */
const batteryVertexShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for battery glow pulse */
const batteryFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float pulse = 0.6 + 0.4 * sin(uTime * 1.5);
    float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    float glow = pulse + rim * 0.4;
    gl_FragColor = vec4(uColor * glow, 0.9);
  }
`;

/** Vertex shader for animated energy arrows (translate along Y) */
const arrowVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTotalHeight;
  varying vec3 vNormal;
  void main() {
    vNormal = normalMatrix * normal;
    vec3 displaced = position;
    // Animate Y position: oscillate up and down
    float travel = mod(uTime * 2.0, uTotalHeight);
    displaced.y += travel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/** Fragment shader for energy arrows */
const arrowFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float lighting = 0.5 + 0.5 * abs(dot(vNormal, vec3(0.0, 1.0, 0.0)));
    gl_FragColor = vec4(uColor * lighting, 0.8);
  }
`;

/**
 * MicrogridLayer generates on-site energy infrastructure:
 * - Battery cubes in basement/ground floor area
 * - Bi-directional energy arrows animated along Y axis
 */
export class MicrogridLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-7-microgrid";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // --- Battery cubes: 2-4 units at ground level ---
    const batteryCount = Math.min(4, Math.max(2, Math.floor(footprintWidth / 5)));
    const batteryGeo = new THREE.BoxGeometry(0.8, 0.6, 0.5);
    const batteryMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xeab308) },
      },
      vertexShader: batteryVertexShader,
      fragmentShader: batteryFragmentShader,
      transparent: true,
    });

    const batteryIM = new THREE.InstancedMesh(batteryGeo, batteryMat, batteryCount);
    batteryIM.userData = { type: "microgrid-battery" };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    // Place batteries along the back wall at ground level
    const batterySpacing = (footprintWidth * 0.6) / (batteryCount - 1 || 1);
    const batteryStartX = -halfW * 0.3;

    for (let i = 0; i < batteryCount; i++) {
      const x = batteryCount > 1
        ? batteryStartX + i * batterySpacing
        : 0;
      pos.set(x, 0.3, -(halfD - 0.5));
      mat4.compose(pos, quat, scl);
      batteryIM.setMatrixAt(i, mat4);
    }
    batteryIM.count = batteryCount;
    batteryIM.instanceMatrix.needsUpdate = true;
    group.add(batteryIM);

    // --- Bi-directional energy arrows ---
    // Vertical from batteries upward, one per battery position
    for (let i = 0; i < batteryCount; i++) {
      const x = batteryCount > 1
        ? batteryStartX + i * batterySpacing
        : 0;
      const z = -(halfD - 0.5);

      // Up arrow (cone pointing up + cylinder shaft)
      const upConeGeo = new THREE.ConeGeometry(0.1, 0.3, 6);
      const upShaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);

      const upMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: i * 0.5 }, // Phase offset per arrow
          uTotalHeight: { value: totalHeight },
          uColor: { value: new THREE.Color(0xeab308) },
        },
        vertexShader: arrowVertexShader,
        fragmentShader: arrowFragmentShader,
        transparent: true,
      });

      const upCone = new THREE.Mesh(upConeGeo, upMat);
      upCone.position.set(x - 0.15, 0.85, z);
      upCone.userData = { type: "microgrid-arrow-up" };
      group.add(upCone);

      const upShaft = new THREE.Mesh(upShaftGeo, upMat.clone());
      upShaft.position.set(x - 0.15, 0.5, z);
      group.add(upShaft);

      // Down arrow (cone pointing down)
      const downConeGeo = new THREE.ConeGeometry(0.1, 0.3, 6);
      const downMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: i * 0.5 + 1.5 }, // Offset from up arrows
          uTotalHeight: { value: totalHeight },
          uColor: { value: new THREE.Color(0xeab308) },
        },
        vertexShader: arrowVertexShader,
        fragmentShader: arrowFragmentShader,
        transparent: true,
      });

      const downCone = new THREE.Mesh(downConeGeo, downMat);
      downCone.position.set(x + 0.15, 0.85, z);
      downCone.rotation.z = Math.PI; // Flip to point down
      downCone.userData = { type: "microgrid-arrow-down" };
      group.add(downCone);

      const downShaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);
      const downShaft = new THREE.Mesh(downShaftGeo, downMat.clone());
      downShaft.position.set(x + 0.15, 0.5, z);
      group.add(downShaft);
    }

    // --- Vertical energy backbone (line from batteries to roof) ---
    const backboneMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      emissive: 0xeab308,
      emissiveIntensity: 0.4,
    });
    const backboneGeo = new THREE.CylinderGeometry(0.04, 0.04, totalHeight, 6);
    const backbone = new THREE.Mesh(backboneGeo, backboneMat);
    backbone.position.set(0, totalHeight / 2, -(halfD - 0.5));
    backbone.userData = { type: "microgrid-backbone" };
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
