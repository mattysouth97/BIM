// src/lib/layers/layer-3-cooling.ts
// Layer 3: MEP Cooling 냉방
// Emissive blue chilled-water piping from central plant to ceiling grids,
// with animated flow particles along spline paths.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

const COOL_BLUE = 0x3b82f6;
const PIPE_RADIUS = 0.04;
const PIPE_SEGMENTS = 8;
const SPLINE_DIVISIONS = 48;

/**
 * CoolingLayer generates chilled-water distribution piping:
 * - Central chiller plant box at roof or basement
 * - Vertical riser splines from plant down/up through core shaft
 * - Horizontal ceiling grid branches per floor via CatmullRomCurve3
 * - Animated point particles flowing along spline paths
 */
export class CoolingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density: number = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-3-cooling";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;
    const coreX = 0; // Core shaft at center
    const coreZ = 0;

    // --- Pipe material (emissive blue) ---
    const pipeMat = new THREE.MeshStandardMaterial({
      color: COOL_BLUE,
      emissive: COOL_BLUE,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    // --- Central chiller plant box (roof level) ---
    const plantW = footprintWidth * 0.2;
    const plantD = footprintDepth * 0.15;
    const plantH = 1.5;
    const plantGeo = new THREE.BoxGeometry(plantW, plantH, plantD);
    const plantMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      emissive: COOL_BLUE,
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0.4,
    });
    const plant = new THREE.Mesh(plantGeo, plantMat);
    plant.position.set(coreX, totalHeight + plantH / 2, coreZ);
    plant.userData = { type: "cooling-plant" };
    group.add(plant);

    // --- Vertical riser from plant down through core shaft ---
    const riserCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(coreX, totalHeight + 0.2, coreZ),
      new THREE.Vector3(coreX, totalHeight * 0.75, coreZ + 0.1),
      new THREE.Vector3(coreX, totalHeight * 0.5, coreZ - 0.1),
      new THREE.Vector3(coreX, totalHeight * 0.25, coreZ + 0.05),
      new THREE.Vector3(coreX, 0.3, coreZ),
    ]);
    const riserGeo = new THREE.TubeGeometry(riserCurve, SPLINE_DIVISIONS, PIPE_RADIUS * 1.5, PIPE_SEGMENTS, false);
    const riser = new THREE.Mesh(riserGeo, pipeMat);
    riser.userData = { type: "cooling-riser" };
    group.add(riser);

    // Second riser offset slightly for return line
    const returnCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(coreX + 0.3, totalHeight + 0.2, coreZ),
      new THREE.Vector3(coreX + 0.3, totalHeight * 0.5, coreZ),
      new THREE.Vector3(coreX + 0.3, 0.3, coreZ),
    ]);
    const returnGeo = new THREE.TubeGeometry(returnCurve, SPLINE_DIVISIONS, PIPE_RADIUS * 1.2, PIPE_SEGMENTS, false);
    const returnPipe = new THREE.Mesh(returnGeo, pipeMat);
    returnPipe.userData = { type: "cooling-return-riser" };
    group.add(returnPipe);

    // --- Per-floor ceiling distribution branches ---
    const branchesPerFloor = Math.max(2, Math.round(3 * density));

    for (const floor of aboveFloors) {
      const ceilingY = floor.y + floor.height - 0.15;

      // Main horizontal header from core to each side
      for (let b = 0; b < branchesPerFloor; b++) {
        const zOffset = -hd * 0.6 + (b / (branchesPerFloor - 1 || 1)) * (footprintDepth * 0.6);

        // Spline from core shaft to left edge
        const leftBranch = new THREE.CatmullRomCurve3([
          new THREE.Vector3(coreX, ceilingY, coreZ),
          new THREE.Vector3(coreX - hw * 0.3, ceilingY - 0.05, zOffset * 0.5),
          new THREE.Vector3(coreX - hw * 0.6, ceilingY, zOffset * 0.8),
          new THREE.Vector3(-hw + 0.5, ceilingY - 0.02, zOffset),
        ]);
        const leftGeo = new THREE.TubeGeometry(leftBranch, 24, PIPE_RADIUS, PIPE_SEGMENTS, false);
        const leftPipe = new THREE.Mesh(leftGeo, pipeMat);
        leftPipe.userData = { type: "cooling-branch", floorNo: floor.floorNo };
        group.add(leftPipe);

        // Spline from core shaft to right edge
        const rightBranch = new THREE.CatmullRomCurve3([
          new THREE.Vector3(coreX, ceilingY, coreZ),
          new THREE.Vector3(coreX + hw * 0.3, ceilingY + 0.03, zOffset * 0.5),
          new THREE.Vector3(coreX + hw * 0.6, ceilingY - 0.04, zOffset * 0.8),
          new THREE.Vector3(hw - 0.5, ceilingY, zOffset),
        ]);
        const rightGeo = new THREE.TubeGeometry(rightBranch, 24, PIPE_RADIUS, PIPE_SEGMENTS, false);
        const rightPipe = new THREE.Mesh(rightGeo, pipeMat);
        rightPipe.userData = { type: "cooling-branch", floorNo: floor.floorNo };
        group.add(rightPipe);
      }
    }

    // --- Flow particles along riser spline ---
    const particleCount = Math.round(200 * density);
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const offsets = new Float32Array(particleCount); // phase offsets for animation

    for (let i = 0; i < particleCount; i++) {
      const t = i / particleCount;
      const pt = riserCurve.getPoint(t);
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
      offsets[i] = t;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));

    const particleMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aOffset;
        uniform float uTime;
        uniform float uSpeed;
        varying float vAlpha;
        void main() {
          // Animate particles along the spline by shifting offset
          float t = fract(aOffset + uTime * uSpeed);
          vAlpha = 0.3 + 0.7 * (1.0 - abs(t - 0.5) * 2.0);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = max(2.0, 6.0 / -mvPosition.z);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          gl_FragColor = vec4(0.23, 0.51, 0.96, vAlpha * smoothstep(0.5, 0.2, dist));
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.15 * density },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    particles.userData = { type: "cooling-flow-particles" };
    group.add(particles);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.Points ||
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
