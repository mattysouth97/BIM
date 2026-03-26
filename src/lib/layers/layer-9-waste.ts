// src/lib/layers/layer-9-waste.ts
// Layer 9: Waste & Recovery — downward-flowing chutes with reverse particle animation.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for downward-flowing waste particles along chute splines */
const wasteParticleVertexShader = /* glsl */ `
  attribute float aOffset;
  attribute float aSpeed;
  uniform float uTime;
  uniform float uChuteHeight;
  uniform vec3 uChuteStart; // top of chute (floor level endpoint)
  varying float vAlpha;
  varying float vProgress;

  void main() {
    // Particles spawn at top (floor endpoints) and flow DOWN to collector at y=0
    float progress = fract(aOffset + uTime * aSpeed * 0.3);
    vProgress = progress;
    vAlpha = 1.0 - progress * 0.6; // fade as they approach bottom

    // Interpolate Y from top to bottom
    float y = uChuteStart.y * (1.0 - progress);

    vec3 particlePos = vec3(
      uChuteStart.x + sin(progress * 6.2831) * 0.03, // slight spiral
      y,
      uChuteStart.z + cos(progress * 6.2831) * 0.03
    );

    vec4 mvPosition = modelViewMatrix * vec4(particlePos, 1.0);
    gl_PointSize = mix(4.0, 2.0, progress) * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/** Fragment shader for waste particles — dark green/brown gradient */
const wasteParticleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vProgress;

  void main() {
    // Circular point shape
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Color transitions from dark green at top to brown at bottom
    vec3 greenColor = vec3(0.396, 0.639, 0.051); // #65a30d
    vec3 brownColor = vec3(0.471, 0.208, 0.059); // #78350f
    vec3 color = mix(greenColor, brownColor, vProgress);

    float alpha = vAlpha * smoothstep(0.5, 0.2, dist);
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * WasteLayer generates waste management infrastructure:
 * - Segmented chute cylinders (CylinderGeometry segments per floor)
 * - Reverse-flow particle animation: spawn at floor endpoints, travel DOWN to collector
 * - Collection bins (boxes) at ground level
 * - Hopper funnels at each floor intake
 */
export class WasteLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-9-waste";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // Chute positions: rear face (Z-), trash and recycling
    const chutePositions = [
      {
        x: -halfW + footprintWidth * 0.33,
        z: -(halfD - 0.25),
        label: "trash",
      },
      {
        x: -halfW + footprintWidth * 0.67,
        z: -(halfD - 0.25),
        label: "recycle",
      },
    ];

    const chuteOuterRadius = 0.18;
    const chuteInnerRadius = 0.14;
    const segmentGap = 0.04; // gap between segments for visual segmentation

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const unitScl = new THREE.Vector3(1, 1, 1);

    // --- Segmented chute geometry: one cylinder segment per floor ---
    const totalSegments = chutePositions.length * aboveFloors.length;
    const segUnitGeo = new THREE.CylinderGeometry(
      chuteOuterRadius,
      chuteOuterRadius,
      1,
      8
    );
    const chuteMat = new THREE.MeshStandardMaterial({
      color: 0x65a30d,
      roughness: 0.85,
      metalness: 0.1,
    });
    const chuteIM = new THREE.InstancedMesh(
      segUnitGeo,
      chuteMat,
      Math.max(1, totalSegments)
    );
    chuteIM.userData = { type: "waste-chute-segment" };

    // Inner darker tube (visible through gaps)
    const innerGeo = new THREE.CylinderGeometry(
      chuteInnerRadius,
      chuteInnerRadius,
      totalHeight,
      6
    );
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x3d1f0a,
      roughness: 0.95,
    });

    let sIdx = 0;
    for (const cp of chutePositions) {
      // Inner continuous tube
      const innerTube = new THREE.Mesh(innerGeo.clone(), innerMat);
      innerTube.position.set(cp.x, totalHeight / 2, cp.z);
      innerTube.userData = { type: "waste-chute-inner" };
      group.add(innerTube);

      // Outer segmented pieces
      for (const floor of aboveFloors) {
        const segHeight = floor.height - segmentGap;
        const centerY = floor.y + floor.height / 2;
        pos.set(cp.x, centerY, cp.z);
        const segScl = new THREE.Vector3(1, segHeight, 1);
        mat4.compose(pos, quat, segScl);
        chuteIM.setMatrixAt(sIdx++, mat4);
      }
    }
    chuteIM.count = sIdx;
    chuteIM.instanceMatrix.needsUpdate = true;
    group.add(chuteIM);

    // --- Floor intake hoppers: small cones at each floor level ---
    const hopperGeo = new THREE.ConeGeometry(0.25, 0.15, 6);
    hopperGeo.rotateX(Math.PI); // Invert cone to funnel shape
    const hopperMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.7,
      metalness: 0.2,
    });
    const hopperCount = chutePositions.length * aboveFloors.length;
    const hopperIM = new THREE.InstancedMesh(
      hopperGeo,
      hopperMat,
      Math.max(1, hopperCount)
    );
    hopperIM.userData = { type: "waste-hopper" };

    let hIdx = 0;
    for (const cp of chutePositions) {
      for (const floor of aboveFloors) {
        pos.set(cp.x, floor.y + floor.height - 0.08, cp.z + 0.25);
        mat4.compose(pos, quat, unitScl);
        hopperIM.setMatrixAt(hIdx++, mat4);
      }
    }
    hopperIM.count = hIdx;
    hopperIM.instanceMatrix.needsUpdate = true;
    group.add(hopperIM);

    // --- Collection bins at ground level ---
    const binGeo = new THREE.BoxGeometry(1.0, 0.9, 0.7);
    const trashBinMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.8,
    });
    const recycleBinMat = new THREE.MeshStandardMaterial({
      color: 0x65a30d,
      roughness: 0.8,
    });

    for (let i = 0; i < chutePositions.length; i++) {
      const cp = chutePositions[i];
      const binMesh = new THREE.Mesh(
        binGeo.clone(),
        cp.label === "trash" ? trashBinMat : recycleBinMat
      );
      binMesh.position.set(cp.x, 0.45, cp.z - 0.5);
      binMesh.userData = { type: `waste-bin-${cp.label}` };
      group.add(binMesh);

      // Bin lid (thin box on top)
      const lidGeo = new THREE.BoxGeometry(1.05, 0.05, 0.75);
      const lidMat = new THREE.MeshStandardMaterial({
        color: 0x404040,
        metalness: 0.6,
        roughness: 0.3,
      });
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.set(cp.x, 0.925, cp.z - 0.5);
      group.add(lid);
    }

    // --- Animated downward-flowing particles per chute ---
    const particlesPerChute = Math.floor(60 * density);

    for (const cp of chutePositions) {
      const offsets = new Float32Array(particlesPerChute);
      const speeds = new Float32Array(particlesPerChute);
      for (let p = 0; p < particlesPerChute; p++) {
        offsets[p] = Math.random();
        speeds[p] = 0.5 + Math.random() * 1.0;
      }

      const particleGeo = new THREE.BufferGeometry();
      // Dummy positions — shader computes actual positions
      const dummyPositions = new Float32Array(particlesPerChute * 3);
      particleGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(dummyPositions, 3)
      );
      particleGeo.setAttribute(
        "aOffset",
        new THREE.BufferAttribute(offsets, 1)
      );
      particleGeo.setAttribute(
        "aSpeed",
        new THREE.BufferAttribute(speeds, 1)
      );

      const particleMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uChuteHeight: { value: totalHeight },
          uChuteStart: {
            value: new THREE.Vector3(cp.x, totalHeight, cp.z),
          },
        },
        vertexShader: wasteParticleVertexShader,
        fragmentShader: wasteParticleFragmentShader,
        transparent: true,
        depthWrite: false,
      });

      const particles = new THREE.Points(particleGeo, particleMat);
      particles.userData = { type: "waste-particles", animated: true };
      group.add(particles);
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
        obj instanceof THREE.LineSegments ||
        obj instanceof THREE.Points
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
