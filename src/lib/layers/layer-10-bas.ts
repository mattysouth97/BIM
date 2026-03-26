// src/lib/layers/layer-10-bas.ts
// Layer 10: BAS/IoT — Nervous System. Pulsing sensor nodes with Poisson Disk scatter and data webs.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/** Vertex shader for pulsing/breathing sensor nodes (instanced) */
const sensorVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying float vPulse;

  void main() {
    vNormal = normalMatrix * normal;
    // Per-instance breathing: use instanceMatrix translation.y as phase seed
    vec4 row3 = instanceMatrix[3];
    float phase = row3.x * 3.7 + row3.z * 2.3;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.5 + phase);
    vPulse = pulse;

    // Scale geometry by pulse
    vec3 scaledPos = position * pulse;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(scaledPos, 1.0);
  }
`;

/** Fragment shader for pulsing sensor glow */
const sensorFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying float vPulse;

  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 1.5);
    float glow = mix(0.5, 1.0, vPulse) + rim * 0.4;
    gl_FragColor = vec4(uColor * glow, 0.92);
  }
`;

/**
 * Simple Poisson Disk Sampling on a 2D rectangle.
 * Returns evenly-scattered (x, z) positions with minimum distance between points.
 */
function poissonDiskSample(
  width: number,
  depth: number,
  minDist: number,
  maxAttempts = 30
): { x: number; z: number }[] {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(depth / cellSize);
  const grid: (number | null)[] = new Array(gridW * gridH).fill(null);
  const points: { x: number; z: number }[] = [];
  const active: number[] = [];

  const halfW = width / 2;
  const halfD = depth / 2;

  // Seed point at center
  const seed = { x: 0, z: 0 };
  points.push(seed);
  active.push(0);
  const gi = Math.floor((seed.x + halfW) / cellSize);
  const gj = Math.floor((seed.z + halfD) / cellSize);
  if (gi >= 0 && gi < gridW && gj >= 0 && gj < gridH) {
    grid[gj * gridW + gi] = 0;
  }

  while (active.length > 0) {
    const randIdx = Math.floor(Math.random() * active.length);
    const pt = points[active[randIdx]];
    let found = false;

    for (let a = 0; a < maxAttempts; a++) {
      const angle = Math.random() * Math.PI * 2;
      const r = minDist + Math.random() * minDist;
      const nx = pt.x + Math.cos(angle) * r;
      const nz = pt.z + Math.sin(angle) * r;

      // Bounds check
      if (nx < -halfW || nx > halfW || nz < -halfD || nz > halfD) continue;

      const ngi = Math.floor((nx + halfW) / cellSize);
      const ngj = Math.floor((nz + halfD) / cellSize);

      // Check neighbors in grid
      let ok = true;
      for (let di = -2; di <= 2 && ok; di++) {
        for (let dj = -2; dj <= 2 && ok; dj++) {
          const ci = ngi + di;
          const cj = ngj + dj;
          if (ci < 0 || ci >= gridW || cj < 0 || cj >= gridH) continue;
          const idx = grid[cj * gridW + ci];
          if (idx !== null) {
            const existing = points[idx];
            const dx = existing.x - nx;
            const dz = existing.z - nz;
            if (dx * dx + dz * dz < minDist * minDist) ok = false;
          }
        }
      }

      if (ok) {
        const newIdx = points.length;
        points.push({ x: nx, z: nz });
        active.push(newIdx);
        if (ngi >= 0 && ngi < gridW && ngj >= 0 && ngj < gridH) {
          grid[ngj * gridW + ngi] = newIdx;
        }
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(randIdx, 1);
    }
  }

  return points;
}

/**
 * BASLayer generates BAS/IoT nervous system visualization:
 * - IcosahedronGeometry (detail=1) sensor nodes scattered via Poisson Disk Sampling
 * - InstancedMesh for efficient rendering of many sensor nodes
 * - Thin LineSegments data webs connecting nearby nodes
 * - ShaderMaterial with breathing/pulsing sin(time * freq) animation
 */
export class BASLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-10-bas";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // Sensor spacing based on density
    const minSensorDist = Math.max(1.5, 3.0 / density);
    // Scatter sensors on ceiling of each floor (or every other for low density)
    const floorStep = density >= 0.6 ? 1 : 2;
    const sensorFloors = aboveFloors.filter((_, i) => i % floorStep === 0);

    // Generate Poisson disk pattern once, reuse for all floors
    const sensorPattern = poissonDiskSample(
      footprintWidth * 0.85,
      footprintDepth * 0.85,
      minSensorDist
    );

    const totalSensors = sensorPattern.length * sensorFloors.length;
    if (totalSensors === 0) {
      this.group = group;
      return group;
    }

    // --- Sensor nodes: IcosahedronGeometry (low-poly sphere, detail=1) ---
    const sensorGeo = new THREE.IcosahedronGeometry(0.1, 1);
    const sensorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x22c55e) },
      },
      vertexShader: sensorVertexShader,
      fragmentShader: sensorFragmentShader,
      transparent: true,
    });

    const sensorIM = new THREE.InstancedMesh(
      sensorGeo,
      sensorMat,
      totalSensors
    );
    sensorIM.userData = { type: "bas-sensor", animated: true };

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    // Track all sensor 3D positions for web connections
    const allSensorPositions: THREE.Vector3[] = [];
    const sensorsByFloor: THREE.Vector3[][] = [];
    let sIdx = 0;

    for (const floor of sensorFloors) {
      const ceilingY = floor.y + floor.height - 0.12;
      const floorSensors: THREE.Vector3[] = [];

      for (const sp of sensorPattern) {
        pos.set(sp.x, ceilingY, sp.z);
        mat4.compose(pos, quat, scl);
        sensorIM.setMatrixAt(sIdx++, mat4);
        const p3 = pos.clone();
        allSensorPositions.push(p3);
        floorSensors.push(p3);
      }
      sensorsByFloor.push(floorSensors);
    }
    sensorIM.count = sIdx;
    sensorIM.instanceMatrix.needsUpdate = true;
    group.add(sensorIM);

    // --- Data web connections: thin LineSegments between nearby nodes ---
    const webMat = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.35,
    });

    const connectionDist = minSensorDist * 1.8;
    const connectionDistSq = connectionDist * connectionDist;

    for (const floorSensors of sensorsByFloor) {
      const linePoints: THREE.Vector3[] = [];

      // Connect pairs within range (Delaunay would be better but distance is fine)
      for (let i = 0; i < floorSensors.length; i++) {
        for (let j = i + 1; j < floorSensors.length; j++) {
          const dx = floorSensors[i].x - floorSensors[j].x;
          const dz = floorSensors[i].z - floorSensors[j].z;
          if (dx * dx + dz * dz < connectionDistSq) {
            linePoints.push(floorSensors[i], floorSensors[j]);
          }
        }
      }

      if (linePoints.length > 0) {
        const webGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        const web = new THREE.LineSegments(webGeo, webMat);
        web.userData = { type: "bas-data-web" };
        group.add(web);
      }
    }

    // --- Vertical data backbone: connect same-pattern nodes between floors ---
    if (sensorsByFloor.length > 1) {
      const vertLinePoints: THREE.Vector3[] = [];
      for (let si = 0; si < sensorPattern.length; si++) {
        for (let fi = 0; fi < sensorsByFloor.length - 1; fi++) {
          if (si < sensorsByFloor[fi].length && si < sensorsByFloor[fi + 1].length) {
            vertLinePoints.push(sensorsByFloor[fi][si], sensorsByFloor[fi + 1][si]);
          }
        }
      }
      if (vertLinePoints.length > 0) {
        const vertWebGeo =
          new THREE.BufferGeometry().setFromPoints(vertLinePoints);
        const vertWeb = new THREE.LineSegments(
          vertWebGeo,
          new THREE.LineBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.2,
          })
        );
        vertWeb.userData = { type: "bas-vertical-web" };
        group.add(vertWeb);
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
