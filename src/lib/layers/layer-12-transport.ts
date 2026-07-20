// src/lib/layers/layer-12-transport.ts
// Layer 12: Kinetic Transport — elevator shafts with step-animated cabs and floor indicators.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/**
 * Vertex shader for elevator cab with discrete floor-step animation.
 * Instead of smooth oscillation, the cab dwells at floor heights and
 * lerps quickly between them (simulating real elevator behavior).
 */
const cabVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uFloorCount;
  uniform float uFloorHeight;
  uniform float uShaftIndex;
  varying vec3 vNormal;
  varying float vBrightness;

  void main() {
    vNormal = normalMatrix * normal;

    // Phase offset per shaft
    float phase = uShaftIndex * 2.7;
    float cycle = mod(uTime * 0.25 + phase, uFloorCount * 2.0);

    // Ping-pong between floors: go up then down
    float floorF;
    if (cycle < uFloorCount) {
      floorF = cycle;
    } else {
      floorF = uFloorCount * 2.0 - cycle;
    }

    // Discrete step: snap to nearest floor with quick transition
    float currentFloor = floor(floorF);
    float frac = fract(floorF);
    // Quick lerp: spend 80% of time dwelling, 20% moving
    float lerpT = smoothstep(0.0, 0.2, frac);
    float y = mix(currentFloor, currentFloor + 1.0, lerpT) * uFloorHeight;

    // Brightness pulses when doors would be open (dwelling)
    vBrightness = frac < 0.8 ? 1.2 : 0.8;

    vec3 displaced = position;
    displaced.y += y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/** Fragment shader for elevator cab — bright amber glow */
const cabFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying float vBrightness;

  void main() {
    float lighting = 0.3 + 0.7 * abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)));
    gl_FragColor = vec4(uColor * lighting * vBrightness, 0.9);
  }
`;

/**
 * TransportLayer generates kinetic transport infrastructure:
 * - Vertical elevator shafts as wireframe LineSegments
 * - BoxGeometry elevator cabs with step-animated Y positions
 * - Floor indicator markers at each landing
 * - Guide rail vertical lines at shaft corners
 * - Shaft count scales with building height (1-3 shafts)
 */
export class TransportLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-12-transport";

    const { floors, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const floorCount = aboveFloors.length;
    const avgFloorHeight =
      floorCount > 0 ? totalHeight / floorCount : 3.5;

    // Shaft count based on building size
    const shaftCount = floorCount < 6 ? 1 : floorCount < 15 ? 2 : 3;
    const shaftWidth = 1.6;
    const shaftDepth = 2.0;
    const cabWidth = shaftWidth * 0.75;
    const cabDepth = shaftDepth * 0.75;
    const cabHeight = Math.min(2.6, avgFloorHeight * 0.75);

    // Position shafts near building core
    const shaftPositions: { x: number; z: number }[] = [];
    if (shaftCount === 1) {
      shaftPositions.push({ x: 0, z: 0 });
    } else {
      const totalSpan = (shaftCount - 1) * (shaftWidth + 0.6);
      for (let i = 0; i < shaftCount; i++) {
        shaftPositions.push({
          x: -totalSpan / 2 + i * (shaftWidth + 0.6),
          z: 0,
        });
      }
    }

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);

    for (let si = 0; si < shaftPositions.length; si++) {
      const sp = shaftPositions[si];

      // --- Shaft wireframe: full-height bounding box ---
      const shaftGeo = new THREE.BoxGeometry(
        shaftWidth,
        totalHeight,
        shaftDepth
      );
      const edgesGeo = new THREE.EdgesGeometry(shaftGeo);
      const shaftLines = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.4,
        })
      );
      shaftLines.position.set(sp.x, totalHeight / 2, sp.z);
      shaftLines.userData = { type: "transport-shaft" };
      group.add(shaftLines);
      shaftGeo.dispose();

      // --- Guide rails: 4 vertical lines at shaft corners ---
      const railHW = shaftWidth / 2 - 0.06;
      const railHD = shaftDepth / 2 - 0.06;
      const railCorners = [
        [sp.x - railHW, sp.z - railHD],
        [sp.x + railHW, sp.z - railHD],
        [sp.x - railHW, sp.z + railHD],
        [sp.x + railHW, sp.z + railHD],
      ];

      const railMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.25,
      });

      for (const [rx, rz] of railCorners) {
        const railGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(rx, 0, rz),
          new THREE.Vector3(rx, totalHeight, rz),
        ]);
        const rail = new THREE.LineSegments(railGeo, railMat.clone());
        group.add(rail);
      }

      // --- Floor indicator markers at each landing ---
      const indicatorGeo = new THREE.PlaneGeometry(0.15, 0.1);
      const indicatorMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.6,
        side: THREE.DoubleSide,
      });
      const indicatorIM = new THREE.InstancedMesh(
        indicatorGeo,
        indicatorMat,
        floorCount
      );
      indicatorIM.userData = { type: "transport-floor-indicator" };

      // Rotate to face outward (parallel to shaft front face)
      const indQuat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        0
      );
      for (let fi = 0; fi < floorCount; fi++) {
        const floorY = aboveFloors[fi].y + aboveFloors[fi].height * 0.5;
        pos.set(sp.x + shaftWidth / 2 + 0.02, floorY, sp.z);
        mat4.compose(pos, indQuat, scl);
        indicatorIM.setMatrixAt(fi, mat4);
      }
      indicatorIM.count = floorCount;
      indicatorIM.instanceMatrix.needsUpdate = true;
      group.add(indicatorIM);

      // --- Horizontal landing marks (thin lines at each floor) ---
      const landingMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.15,
      });
      for (const floor of aboveFloors) {
        const landingY = floor.y;
        const landingGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(
            sp.x - shaftWidth / 2,
            landingY,
            sp.z - shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x + shaftWidth / 2,
            landingY,
            sp.z - shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x + shaftWidth / 2,
            landingY,
            sp.z + shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x - shaftWidth / 2,
            landingY,
            sp.z + shaftDepth / 2
          ),
          new THREE.Vector3(
            sp.x - shaftWidth / 2,
            landingY,
            sp.z - shaftDepth / 2
          ),
        ]);
        const landing = new THREE.Line(landingGeo, landingMat.clone());
        group.add(landing);
      }

      // --- Animated elevator cab ---
      const cabGeo = new THREE.BoxGeometry(cabWidth, cabHeight, cabDepth);
      const cabMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFloorCount: { value: floorCount },
          uFloorHeight: { value: avgFloorHeight },
          uShaftIndex: { value: si },
          uColor: { value: new THREE.Color(0xf59e0b) },
        },
        vertexShader: cabVertexShader,
        fragmentShader: cabFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const cabMesh = new THREE.Mesh(cabGeo, cabMat);
      cabMesh.position.set(sp.x, cabHeight / 2, sp.z);
      cabMesh.userData = { type: "transport-cab", animated: true, shaftIndex: si };
      group.add(cabMesh);

      // --- Counterweight on opposite side (thin box) ---
      const cwGeo = new THREE.BoxGeometry(0.3, cabHeight * 0.6, cabDepth * 0.3);
      const cwMat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.6,
        roughness: 0.4,
      });
      const cw = new THREE.Mesh(cwGeo, cwMat);
      cw.position.set(
        sp.x - shaftWidth / 2 + 0.2,
        totalHeight * 0.6,
        sp.z
      );
      cw.userData = { type: "transport-counterweight" };
      group.add(cw);
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
