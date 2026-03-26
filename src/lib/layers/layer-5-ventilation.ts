// src/lib/layers/layer-5-ventilation.ts
// Layer 5: MEP Ventilation 환기
// Cyan airflow visualization with chaotic B-spline trails, AHU boxes,
// and animated dashed-line ductwork — distinct from orthogonal plumbing.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

const CYAN = 0x06b6d4;
const WHITE = 0xffffff;

// Dashed airflow line shader with animated UV offset
const airflowVertexShader = /* glsl */ `
  attribute float lineDistance;
  varying float vLineDistance;
  varying float vAlpha;
  void main() {
    vLineDistance = lineDistance;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vAlpha = 1.0;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const airflowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uDashSize;
  uniform float uGapSize;
  varying float vLineDistance;

  void main() {
    float totalSize = uDashSize + uGapSize;
    // Animate the dash pattern by shifting with time
    float offset = uTime * 2.0;
    float pattern = mod(vLineDistance + offset, totalSize);
    if (pattern > uDashSize) discard;

    // Fade based on dash position for softer look
    float fade = 1.0 - smoothstep(uDashSize * 0.6, uDashSize, pattern);
    gl_FragColor = vec4(uColor, fade * 0.7);
  }
`;

/**
 * VentilationLayer generates air handling and ductwork visualization:
 * - AHU (Air Handling Unit) boxes at core positions per floor
 * - Chaotic B-spline airflow trails (not straight pipes) using LineSegments
 * - Animated dashed lines with UV offset for flowing air effect
 * - Distinct visual language from MEP piping layers
 */
export class VentilationLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density: number = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-5-ventilation";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

    // --- AHU boxes at core on each floor ---
    const ahuW = 1.2;
    const ahuH = 0.8;
    const ahuD = 0.8;
    const ahuGeo = new THREE.BoxGeometry(ahuW, ahuH, ahuD);
    const ahuMat = new THREE.MeshStandardMaterial({
      color: 0x0891b2,
      emissive: CYAN,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.5,
    });
    const ahuIM = new THREE.InstancedMesh(ahuGeo, ahuMat, aboveFloors.length);
    ahuIM.userData = { type: "vent-ahu" };

    const mat4 = new THREE.Matrix4();
    for (let i = 0; i < aboveFloors.length; i++) {
      const floor = aboveFloors[i];
      const ceilingY = floor.y + floor.height - 0.5;
      mat4.makeTranslation(0, ceilingY, 0);
      ahuIM.setMatrixAt(i, mat4);
    }
    ahuIM.instanceMatrix.needsUpdate = true;
    group.add(ahuIM);

    // --- Airflow trails per floor (chaotic B-splines, NOT straight pipes) ---
    const trailsPerFloor = Math.max(3, Math.round(5 * density));

    for (const floor of aboveFloors) {
      const ceilingY = floor.y + floor.height - 0.2;
      const roomH = floor.height * 0.7;

      for (let t = 0; t < trailsPerFloor; t++) {
        // Generate chaotic control points for fluid-looking airflow
        const numPoints = 8 + Math.floor(Math.random() * 5);
        const controlPoints: THREE.Vector3[] = [];

        // Start near AHU (center)
        controlPoints.push(new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          ceilingY - Math.random() * 0.3,
          (Math.random() - 0.5) * 1.5
        ));

        // Meander through the floor space with chaotic displacement
        for (let p = 1; p < numPoints; p++) {
          const progress = p / numPoints;
          const angle = (t / trailsPerFloor) * Math.PI * 2 + progress * Math.PI;
          const radius = progress * Math.min(hw, hd) * 0.8;

          controlPoints.push(new THREE.Vector3(
            Math.cos(angle) * radius + (Math.random() - 0.5) * 2.0,
            ceilingY - Math.random() * roomH * 0.6,
            Math.sin(angle) * radius + (Math.random() - 0.5) * 2.0
          ));
        }

        const spline = new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.5);
        const splinePoints = spline.getPoints(40);

        // Calculate cumulative line distances for dash animation
        const positions: number[] = [];
        const lineDistances: number[] = [];
        let cumDist = 0;

        for (let i = 0; i < splinePoints.length; i++) {
          const pt = splinePoints[i];
          positions.push(pt.x, pt.y, pt.z);
          if (i > 0) {
            cumDist += splinePoints[i].distanceTo(splinePoints[i - 1]);
          }
          lineDistances.push(cumDist);
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        lineGeo.setAttribute("lineDistance", new THREE.Float32BufferAttribute(lineDistances, 1));

        const lineMat = new THREE.ShaderMaterial({
          vertexShader: airflowVertexShader,
          fragmentShader: airflowFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(t % 2 === 0 ? CYAN : WHITE) },
            uDashSize: { value: 0.3 },
            uGapSize: { value: 0.2 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });

        const line = new THREE.Line(lineGeo, lineMat);
        line.userData = { type: "vent-airflow", floorNo: floor.floorNo };
        group.add(line);
      }

      // --- Small duct connector segments from AHU outward (4 directions) ---
      const ductMat = new THREE.MeshStandardMaterial({
        color: CYAN,
        emissive: CYAN,
        emissiveIntensity: 0.3,
        roughness: 0.5,
        metalness: 0.4,
        transparent: true,
        opacity: 0.6,
      });

      const ductDirections = [
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
      ];

      for (const dir of ductDirections) {
        const ductLen = Math.min(hw, hd) * 0.4;
        const ductGeo = new THREE.BoxGeometry(
          dir.dx !== 0 ? ductLen : 0.3,
          0.25,
          dir.dz !== 0 ? ductLen : 0.3
        );
        const duct = new THREE.Mesh(ductGeo, ductMat);
        const ductCeilingY = floor.y + floor.height - 0.35;
        duct.position.set(
          dir.dx * ductLen * 0.5,
          ductCeilingY,
          dir.dz * ductLen * 0.5
        );
        duct.userData = { type: "vent-duct", floorNo: floor.floorNo };
        group.add(duct);
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
        obj instanceof THREE.Line ||
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
