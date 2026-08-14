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
import {
  ASSET_NATIVE_DIMS,
  getEquipmentGeometryClone,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";

const CYAN = 0x06b6d4;
const WHITE = 0xffffff;

// Flowing supply-air tube shader — bright pulses stream along uv.x
// (0 = AHU outlet, 1 = diffuser), replacing the old dashed-line look.
const airflowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const airflowFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uHighlight;
  varying vec2 vUv;

  void main() {
    // Repeating pulses travelling from the AHU toward the diffusers
    float stripe = fract(vUv.x * 5.0 - uTime * 1.1);
    float pulse = smoothstep(0.35, 0.0, abs(stripe - 0.2));
    // Faint constant body keeps the duct path legible between pulses
    float alpha = 0.10 + pulse * 0.8;
    vec3 col = mix(uColor, uHighlight, pulse * 0.5);
    gl_FragColor = vec4(col, alpha);
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

    // Merge caller overrides onto defaults
    const ahuParams: AhuParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.ahu,
      ...equipParams,
    };

    // --- Merged AHU InstancedMesh — one draw call for all floors × units ---
    // Detailed single-mesh Blender asset (authored 1.2×0.8×0.8, centre origin)
    // scaled to the current params, or merged-primitive fallback.
    const ahuDetailedGeo = getEquipmentGeometryClone("ahu");
    if (ahuDetailedGeo) {
      const native = ASSET_NATIVE_DIMS.ahu;
      ahuDetailedGeo.scale(
        ahuParams.width / native.w,
        ahuParams.height / native.h,
        ahuParams.depth / native.d
      );
    }
    const ahuGeo = ahuDetailedGeo ?? buildAhuGeometry(ahuParams);
    // Always use the emissive cyan subsystem material — AHUs live INSIDE the
    // building, and the emissive x-ray colour language is what keeps interior
    // MEP readable. (The GLB's realistic gray made ceiling HVAC disappear.)
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

    // --- Ceiling duct network — rigid trunk + branch runs per floor ---
    // Replaces the old chaotic-spline-only look: HVAC now reads as real
    // ceiling ductwork. ONE InstancedMesh for every duct segment on every
    // floor (type "vent-duct-run" — the per-floor loose "vent-duct" Meshes
    // remain eliminated).
    const branchXs = [-0.6, -0.25, 0.25, 0.6].map((f) => hw * f);
    const trunkLen = footprintWidth * 0.72;
    const branchLen = footprintDepth * 0.62;
    const segsPerFloor = 1 + branchXs.length * 3; // trunk + (branch + 2 diffusers) each
    const ductIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0e7490,
        emissive: CYAN,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.5,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
      aboveFloors.length * segsPerFloor
    );
    ductIM.userData = { type: "vent-duct-run" };

    const dPos = new THREE.Vector3();
    const dQuat = new THREE.Quaternion();
    const dScl = new THREE.Vector3();
    const dMat4 = new THREE.Matrix4();
    let dIdx = 0;

    for (const floor of aboveFloors) {
      const ductY = floor.y + floor.height - 0.32;

      // Main trunk along X at the core
      dPos.set(0, ductY, 0);
      dScl.set(trunkLen, 0.3, 0.42);
      dMat4.compose(dPos, dQuat, dScl);
      ductIM.setMatrixAt(dIdx++, dMat4);

      for (const bx of branchXs) {
        const x = Math.max(-hw * 0.8, Math.min(hw * 0.8, bx));
        // Branch along Z
        dPos.set(x, ductY, 0);
        dScl.set(0.3, 0.24, branchLen);
        dMat4.compose(dPos, dQuat, dScl);
        ductIM.setMatrixAt(dIdx++, dMat4);
        // Diffuser plates near both branch ends, dropped slightly
        for (const sz of [-1, 1]) {
          dPos.set(x, ductY - 0.16, sz * branchLen * 0.42);
          dScl.set(0.5, 0.06, 0.5);
          dMat4.compose(dPos, dQuat, dScl);
          ductIM.setMatrixAt(dIdx++, dMat4);
        }
      }
    }
    ductIM.count = dIdx;
    ductIM.instanceMatrix.needsUpdate = true;
    group.add(ductIM);

    // --- Animated supply-air flow tubes along the duct paths ---
    // One merged tube Mesh per floor (uv.x runs along each tube's length);
    // the shader streams bright pulses outward from the AHU. Density scales
    // how many branches carry a visible flow tube.
    const flowBranches = Math.max(
      1,
      Math.min(branchXs.length, Math.round(branchXs.length * density))
    );

    for (const floor of aboveFloors) {
      const ductY = floor.y + floor.height - 0.32;
      const tubeGeos: THREE.BufferGeometry[] = [];

      for (let b = 0; b < flowBranches; b++) {
        const bx = Math.max(-hw * 0.8, Math.min(hw * 0.8, branchXs[b]));
        for (const sz of [-1, 1]) {
          const path = new THREE.CatmullRomCurve3(
            [
              new THREE.Vector3(0, ductY - 0.05, 0),
              new THREE.Vector3(bx * 0.6, ductY - 0.02, 0),
              new THREE.Vector3(bx, ductY, sz * branchLen * 0.12),
              new THREE.Vector3(bx, ductY - 0.04, sz * branchLen * 0.3),
              new THREE.Vector3(bx, ductY - 0.22, sz * branchLen * 0.44),
            ],
            false,
            "catmullrom",
            0.1
          );
          tubeGeos.push(new THREE.TubeGeometry(path, 24, 0.05, 6, false));
        }
      }

      const floorTubeGeo = mergeGeometries(tubeGeos);
      tubeGeos.forEach((g) => g.dispose());
      if (!floorTubeGeo) continue;

      const flowMat = new THREE.ShaderMaterial({
        vertexShader: airflowVertexShader,
        fragmentShader: airflowFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(CYAN) },
          uHighlight: { value: new THREE.Color(WHITE) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const flowMesh = new THREE.Mesh(floorTubeGeo, flowMat);
      flowMesh.userData = {
        type: "vent-airflow",
        floorNo: floor.floorNo,
        animated: true,
      };
      group.add(flowMesh);
    }

    // Rooftop exhaust fans — new asset, detailed-only (no coarse fallback).
    const roofY =
      recipe.totalHeight +
      (recipe.roof.type === "flat" ? recipe.roof.flatThickness : 0);
    const fanOffsets: [number, number][] = [
      [recipe.footprintWidth * 0.22, -recipe.footprintDepth * 0.32],
      [-recipe.footprintWidth * 0.18, -recipe.footprintDepth * 0.28],
    ];
    for (const [fx, fz] of fanOffsets) {
      const fan = getEquipmentObjectClone("exhaust-fan");
      if (!fan) break;
      fan.position.set(fx, roofY, fz);
      tagEquipmentObject(
        fan,
        { type: "vent-exhaust-fan" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(fan);
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
