// src/lib/layers/layer-4-heating.ts
// Layer 4: MEP Heating 난방
// Emissive red hot-water piping with radiant floor heating zones
// rendered as heat-gradient shader planes.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

const HEAT_RED = 0xef4444;
const PIPE_RADIUS = 0.04;
const PIPE_SEGMENTS = 8;

// Radiant floor heat map shader
const heatVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const heatFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  // Simplex-like noise for organic heat patterns
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Animated heat pattern
    float n = noise(vUv * 4.0 + uTime * 0.1);
    float n2 = noise(vUv * 8.0 - uTime * 0.15);
    float heatField = (n * 0.6 + n2 * 0.4);

    // Edges are cooler, center is warmer
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float edgeFactor = smoothstep(0.0, 0.3, edgeDist);
    heatField *= edgeFactor;

    // Color gradient: orange at edges -> red at center -> bright red/white at hotspots
    vec3 coolColor = vec3(0.95, 0.55, 0.1);  // orange
    vec3 warmColor = vec3(0.94, 0.27, 0.27);  // red
    vec3 hotColor = vec3(1.0, 0.85, 0.6);     // bright warm
    vec3 color = mix(coolColor, warmColor, heatField);
    color = mix(color, hotColor, smoothstep(0.7, 0.95, heatField));

    float alpha = heatField * uIntensity * 0.6;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * HeatingLayer generates hot-water distribution and radiant floor heating:
 * - Central boiler plant at basement
 * - Vertical riser splines through core shaft (red emissive)
 * - Horizontal piping across floors
 * - Radiant heating zone planes on each floor with animated heat-map shader
 */
export class HeatingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density: number = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-4-heating";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

    // --- Pipe material (emissive red) ---
    const pipeMat = new THREE.MeshStandardMaterial({
      color: HEAT_RED,
      emissive: HEAT_RED,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    // --- Central boiler plant at basement level ---
    const plantGeo = new THREE.BoxGeometry(
      footprintWidth * 0.18,
      1.2,
      footprintDepth * 0.12
    );
    const plantMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      emissive: HEAT_RED,
      emissiveIntensity: 0.4,
      roughness: 0.5,
      metalness: 0.4,
    });
    const plant = new THREE.Mesh(plantGeo, plantMat);
    plant.position.set(0, -0.6, 0); // Basement level
    plant.userData = { type: "heating-boiler" };
    group.add(plant);

    // --- Vertical riser from basement up through core ---
    const riserCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.2, 0),
      new THREE.Vector3(0.05, totalHeight * 0.25, 0.05),
      new THREE.Vector3(-0.05, totalHeight * 0.5, -0.05),
      new THREE.Vector3(0.03, totalHeight * 0.75, 0.02),
      new THREE.Vector3(0, totalHeight - 0.3, 0),
    ]);
    const riserGeo = new THREE.TubeGeometry(riserCurve, 48, PIPE_RADIUS * 1.5, PIPE_SEGMENTS, false);
    const riser = new THREE.Mesh(riserGeo, pipeMat);
    riser.userData = { type: "heating-riser" };
    group.add(riser);

    // Return riser
    const returnCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, -0.2, 0),
      new THREE.Vector3(-0.3, totalHeight * 0.5, 0),
      new THREE.Vector3(-0.3, totalHeight - 0.3, 0),
    ]);
    const returnGeo = new THREE.TubeGeometry(returnCurve, 36, PIPE_RADIUS * 1.2, PIPE_SEGMENTS, false);
    const returnPipe = new THREE.Mesh(returnGeo, pipeMat);
    returnPipe.userData = { type: "heating-return-riser" };
    group.add(returnPipe);

    // --- Per-floor: horizontal pipes + radiant heating planes ---
    const branchesPerFloor = Math.max(2, Math.round(2 * density));

    for (const floor of aboveFloors) {
      const floorY = floor.y + 0.05; // Slightly above slab

      // Horizontal pipe branches across the floor (embedded in slab)
      for (let b = 0; b < branchesPerFloor; b++) {
        const xOffset = -hw * 0.6 + (b / (branchesPerFloor - 1 || 1)) * (footprintWidth * 0.6);

        // Serpentine pattern for radiant floor heating piping
        const points: THREE.Vector3[] = [];
        const segments = 8;
        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          const z = -hd * 0.7 + t * footprintDepth * 0.7;
          const xWobble = (s % 2 === 0 ? 0.3 : -0.3) * (s > 0 && s < segments ? 1 : 0);
          points.push(new THREE.Vector3(xOffset + xWobble, floorY, z));
        }

        const serpentine = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(serpentine, 24, PIPE_RADIUS * 0.8, 6, false);
        const tube = new THREE.Mesh(tubeGeo, pipeMat);
        tube.userData = { type: "heating-floor-pipe", floorNo: floor.floorNo };
        group.add(tube);
      }

      // --- Radiant heating zone plane with heat-map shader ---
      const zoneW = footprintWidth * 0.85;
      const zoneD = footprintDepth * 0.85;
      const zoneGeo = new THREE.PlaneGeometry(zoneW, zoneD, 1, 1);
      const zoneMat = new THREE.ShaderMaterial({
        vertexShader: heatVertexShader,
        fragmentShader: heatFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: density },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const zone = new THREE.Mesh(zoneGeo, zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(0, floorY + 0.01, 0);
      zone.userData = { type: "heating-radiant-zone", floorNo: floor.floorNo };
      group.add(zone);
    }

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
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
