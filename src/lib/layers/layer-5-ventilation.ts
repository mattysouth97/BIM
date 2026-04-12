// src/lib/layers/layer-5-ventilation.ts
// Layer 5: MEP Ventilation 환기
// Cyan airflow visualization with chaotic B-spline trails, merged AHU geometry
// (body + duct stubs + TorusGeometry fan ring in one InstancedMesh), and
// animated dashed-line ductwork — distinct from orthogonal plumbing.
// Pure Three.js, no React.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import type { AhuParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";

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
 * Build a merged BufferGeometry for an AHU assembly:
 *   - Main body box
 *   - Supply duct stub protruding from +X face  (if showDuctStubs)
 *   - Return duct stub protruding from -X face  (if showDuctStubs)
 *   - TorusGeometry fan ring on +Z face          (if showFanFace)
 *
 * All pieces are merged into one geometry so the InstancedMesh needs
 * exactly 1 draw call for all floors.
 */
function buildAhuGeometry(p: AhuParams): THREE.BufferGeometry {
  // Main body
  const body = new THREE.BoxGeometry(p.width, p.height, p.depth);

  const pieces: THREE.BufferGeometry[] = [body];

  if (p.showDuctStubs) {
    // Supply duct stub — protrudes from +X face
    const supply = new THREE.BoxGeometry(0.4, p.height * 0.5, p.depth * 0.5);
    supply.translate(p.width / 2 + 0.2, 0, 0);
    pieces.push(supply);

    // Return duct stub — protrudes from -X face, slightly smaller
    const returnD = new THREE.BoxGeometry(0.35, p.height * 0.4, p.depth * 0.4);
    returnD.translate(-(p.width / 2 + 0.175), 0, 0);
    pieces.push(returnD);
  }

  if (p.showFanFace) {
    // Fan housing ring on front face (+Z)
    const fanRadius = Math.min(p.height, p.depth) * 0.35;
    const fanRing = new THREE.TorusGeometry(fanRadius, 0.04, 8, 16);
    fanRing.rotateX(Math.PI / 2); // orient perpendicular to Z axis
    fanRing.translate(0, 0, p.depth / 2 + 0.02);
    pieces.push(fanRing);
  }

  // mergeGeometries returns null only if given an empty array — pieces always
  // has at least the body, so the non-null assertion is safe here.
  return mergeGeometries(pieces)!;
}

/**
 * VentilationLayer generates air handling and ductwork visualization:
 * - AHU (Air Handling Unit) merged geometry InstancedMesh at core positions per floor
 *   (body + duct stubs + TorusGeometry fan ring — no floating per-floor duct Meshes)
 * - Chaotic B-spline airflow trails (not straight pipes) using Line objects
 * - Animated dashed lines with UV offset for flowing air effect
 * - Distinct visual language from MEP piping layers
 */
export class VentilationLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density: number = 1.0,
    equipParams: Partial<AhuParams> = {}
  ): THREE.Group {
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

    // Merge caller overrides onto defaults
    const ahuParams: AhuParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.ahu,
      ...equipParams,
    };

    // --- Merged AHU InstancedMesh — one draw call for all floors × units ---
    const ahuGeo = buildAhuGeometry(ahuParams);
    const ahuMat = new THREE.MeshStandardMaterial({
      color: 0x0891b2,
      emissive: CYAN,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.5,
    });

    const instanceCount = aboveFloors.length * ahuParams.unitsPerFloor;
    const ahuIM = new THREE.InstancedMesh(ahuGeo, ahuMat, instanceCount);
    ahuIM.userData = { type: "vent-ahu" };

    const mat4 = new THREE.Matrix4();
    for (let f = 0; f < aboveFloors.length; f++) {
      for (let u = 0; u < ahuParams.unitsPerFloor; u++) {
        const floor = aboveFloors[f];
        const ceilingY = floor.y + floor.height - ahuParams.height / 2 - 0.1;
        const xOffset =
          ahuParams.unitsPerFloor === 1
            ? 0
            : (u - (ahuParams.unitsPerFloor - 1) / 2) * (ahuParams.width + 0.4);
        mat4.makeTranslation(xOffset, ceilingY, 0);
        ahuIM.setMatrixAt(f * ahuParams.unitsPerFloor + u, mat4);
      }
    }
    ahuIM.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
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
        controlPoints.push(
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            ceilingY - Math.random() * 0.3,
            (Math.random() - 0.5) * 1.5
          )
        );

        // Meander through the floor space with chaotic displacement
        for (let p = 1; p < numPoints; p++) {
          const progress = p / numPoints;
          const angle =
            (t / trailsPerFloor) * Math.PI * 2 + progress * Math.PI;
          const radius = progress * Math.min(hw, hd) * 0.8;

          controlPoints.push(
            new THREE.Vector3(
              Math.cos(angle) * radius + (Math.random() - 0.5) * 2.0,
              ceilingY - Math.random() * roomH * 0.6,
              Math.sin(angle) * radius + (Math.random() - 0.5) * 2.0
            )
          );
        }

        const spline = new THREE.CatmullRomCurve3(
          controlPoints,
          false,
          "catmullrom",
          0.5
        );
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
        lineGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3)
        );
        lineGeo.setAttribute(
          "lineDistance",
          new THREE.Float32BufferAttribute(lineDistances, 1)
        );

        const lineMat = new THREE.ShaderMaterial({
          vertexShader: airflowVertexShader,
          fragmentShader: airflowFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uColor: {
              value: new THREE.Color(t % 2 === 0 ? CYAN : WHITE),
            },
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
      // NOTE: Per-floor individual duct segment Meshes (4 × BoxGeometry per floor)
      // have been intentionally removed. Duct stubs are now baked into the merged
      // AHU geometry via buildAhuGeometry() — no O(floors × 4) loose Meshes.
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
