// src/lib/layers/layer-13-safety.ts
// Layer 13: Safety — Immune System. Volumetric fire-zone forcefields with Fresnel + scanline.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for Fresnel forcefield volumes */
const fresnelVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/** Fragment shader for Fresnel + horizontal scanline animation */
const fresnelFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uFloorY;
  uniform float uFloorHeight;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    // Fresnel: glowing edges, transparent center
    float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    fresnel = pow(fresnel, 2.5);

    // Horizontal scanline panning slowly upward
    float scanlineY = mod(uTime * 0.8, uFloorHeight);
    float localY = vWorldPos.y - uFloorY;
    float scanline = smoothstep(0.0, 0.15, abs(localY - scanlineY));
    scanline = 1.0 - scanline; // Invert: bright at scanline position
    scanline *= 0.3;

    // Combine Fresnel edge glow + scanline
    float alpha = fresnel * 0.4 + scanline;
    alpha = clamp(alpha, 0.0, 0.6);

    vec3 color = uColor * (fresnel * 1.5 + scanline * 0.8);
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * SafetyLayer generates fire safety / immune system visualization:
 * - Large BoxGeometry fire-zone volumes per floor with Fresnel forcefield shader
 * - Slowly panning horizontal scanline animation within each zone
 * - Pressurized stairwell markers at building core
 * - Fire suppression sprinkler heads on ceilings (InstancedMesh)
 */
export class SafetyLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-13-safety";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    // --- Volumetric fire-zone forcefields: one per floor ---
    for (let fi = 0; fi < aboveFloors.length; fi++) {
      const floor = aboveFloors[fi];
      const zoneWidth = footprintWidth * 0.92;
      const zoneDepth = footprintDepth * 0.92;
      const zoneHeight = floor.height * 0.9;

      const zoneGeo = new THREE.BoxGeometry(zoneWidth, zoneHeight, zoneDepth);
      const zoneMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: fi * 0.5 }, // Phase offset per floor
          uColor: { value: new THREE.Color(0xef4444) },
          uFloorY: { value: floor.y },
          uFloorHeight: { value: floor.height },
        },
        vertexShader: fresnelVertexShader,
        fragmentShader: fresnelFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
      zoneMesh.position.set(0, floor.y + floor.height / 2, 0);
      zoneMesh.userData = {
        type: "safety-fire-zone",
        animated: true,
        floorIndex: fi,
      };
      group.add(zoneMesh);
    }

    // --- Pressurized stairwell markers at building core ---
    // 2 stairwells positioned at opposite corners of core
    const stairPositions = [
      { x: -halfW + 2.5, z: halfD - 2.5 },
      { x: halfW - 2.5, z: -halfD + 2.5 },
    ];

    const stairGeo = new THREE.BoxGeometry(2.0, 0, 2.0); // height set per-instance
    const stairEdgesGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(2.0, 1, 2.0)
    );

    for (const sp of stairPositions) {
      // Full-height stairwell column as wireframe
      const totalH = aboveFloors[aboveFloors.length - 1].y +
        aboveFloors[aboveFloors.length - 1].height;
      const stairBoxGeo = new THREE.BoxGeometry(2.0, totalH, 2.0);
      const stairEdges = new THREE.EdgesGeometry(stairBoxGeo);
      const stairLines = new THREE.LineSegments(
        stairEdges,
        new THREE.LineBasicMaterial({
          color: 0xff6b35,
          transparent: true,
          opacity: 0.5,
        })
      );
      stairLines.position.set(sp.x, totalH / 2, sp.z);
      stairLines.userData = { type: "safety-stairwell" };
      group.add(stairLines);
      stairBoxGeo.dispose();

      // Pressurization indicator: pulsing ring at each stairwell top
      const pressureRingGeo = new THREE.TorusGeometry(1.2, 0.04, 8, 24);
      pressureRingGeo.rotateX(Math.PI / 2);
      const pressureRingMat = new THREE.MeshStandardMaterial({
        color: 0xff6b35,
        emissive: 0xff6b35,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.7,
      });
      const pressureRing = new THREE.Mesh(pressureRingGeo, pressureRingMat);
      pressureRing.position.set(sp.x, totalH + 0.1, sp.z);
      pressureRing.userData = { type: "safety-pressure-indicator" };
      group.add(pressureRing);

      // "P" marker text placeholder: small bright box
      const markerGeo = new THREE.BoxGeometry(0.3, 0.4, 0.05);
      const markerMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(sp.x, totalH + 0.5, sp.z + 1.05);
      group.add(marker);
    }

    stairGeo.dispose();

    // --- Sprinkler heads on ceilings: InstancedMesh grid ---
    const sprinklerSpacing = density >= 0.7 ? 3.0 : 4.5;
    const colsX = Math.max(1, Math.floor(footprintWidth / sprinklerSpacing));
    const colsZ = Math.max(1, Math.floor(footprintDepth / sprinklerSpacing));
    const sprinklersPerFloor = colsX * colsZ;
    const totalSprinklers = sprinklersPerFloor * aboveFloors.length;

    // Sprinkler head: small downward-facing cone + sphere (combined as two IMs)
    const headGeo = new THREE.ConeGeometry(0.06, 0.1, 6);
    headGeo.rotateX(Math.PI); // Point downward
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xcc3333,
      metalness: 0.4,
      roughness: 0.5,
    });
    const headIM = new THREE.InstancedMesh(
      headGeo,
      headMat,
      Math.max(1, totalSprinklers)
    );
    headIM.userData = { type: "safety-sprinkler-head" };

    const bulbGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      emissive: 0xff3333,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.8,
    });
    const bulbIM = new THREE.InstancedMesh(
      bulbGeo,
      bulbMat,
      Math.max(1, totalSprinklers)
    );
    bulbIM.userData = { type: "safety-sprinkler-bulb" };

    let spIdx = 0;
    for (const floor of aboveFloors) {
      const ceilingY = floor.y + floor.height - 0.05;
      for (let cx = 0; cx < colsX; cx++) {
        for (let cz = 0; cz < colsZ; cz++) {
          const x =
            -halfW + sprinklerSpacing * 0.5 + cx * sprinklerSpacing;
          const z =
            -halfD + sprinklerSpacing * 0.5 + cz * sprinklerSpacing;

          // Cone (head)
          pos.set(x, ceilingY - 0.05, z);
          mat4.compose(pos, quat, scl);
          headIM.setMatrixAt(spIdx, mat4);

          // Bulb (below cone)
          pos.set(x, ceilingY - 0.14, z);
          mat4.compose(pos, quat, scl);
          bulbIM.setMatrixAt(spIdx, mat4);

          spIdx++;
        }
      }
    }
    headIM.count = spIdx;
    bulbIM.count = spIdx;
    headIM.instanceMatrix.needsUpdate = true;
    bulbIM.instanceMatrix.needsUpdate = true;
    group.add(headIM);
    group.add(bulbIM);

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
