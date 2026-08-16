// src/lib/layers/layer-5-ventilation.ts
// Layer 5: MEP Ventilation 환기
// Cyan/gray airflow visualization with deterministic bundled streamlines, merged AHU geometry
// (body + duct stubs + TorusGeometry fan ring in one InstancedMesh), and
// animated streamline flow — distinct from orthogonal plumbing.
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
import {
  axisAlignedRectangleFitsFootprint,
  getColumnPositions,
} from "@/lib/structural-codes";

const CYAN = 0x06b6d4;
const SUPPLY_AIR = new THREE.Color(0x67e8f9);
const RETURN_AIR = new THREE.Color(0x94a3b8);
const AIRFLOW_SAMPLES = 18;
const MAX_AIRFLOW_LANE_BUNDLES = 40;
const AHU_SUPPLY_STUB_LENGTH = 0.4;
const AHU_RETURN_STUB_LENGTH = 0.35;
const AHU_UNIT_CLEARANCE = 0.08;

const WHITE = 0xffffff;

// Flowing supply-air tube shader — bright pulses stream along uv.x
// (0 = AHU outlet, 1 = diffuser), replacing the old dashed-line look.
const ductFlowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ductFlowFragmentShader = /* glsl */ `
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

// Streamline shader: a faint continuous line plus asymmetric moving pulses.
// The sharp leading edge and long fade provide a clear direction cue without
// allocating or updating geometry on the CPU each frame.
const airflowVertexShader = /* glsl */ `
  attribute float lineProgress;
  attribute float phase;
  attribute vec3 color;
  varying float vLineProgress;
  varying float vPhase;
  varying vec3 vColor;
  void main() {
    vLineProgress = lineProgress;
    vPhase = phase;
    vColor = color;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const airflowFragmentShader = /* glsl */ `
  uniform float uTime;
  varying float vLineProgress;
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    // Three tapered pulses travel from progress 0 -> 1. Return-air geometry
    // is authored perimeter -> AHU, so both sides animate physically.
    float travel = fract(vLineProgress * 3.0 - uTime * 0.7 + vPhase);
    float pulse = pow(1.0 - travel, 5.0);
    vec3 color = mix(vColor, vec3(1.0), pulse * 0.35);
    gl_FragColor = vec4(color, 0.38 + pulse * 0.62);
  }
`;

interface AirflowBuffers {
  positions: number[];
  progress: number[];
  phases: number[];
  colors: number[];
  streamCount: number;
}

interface AhuPlacement {
  center: THREE.Vector2;
  flowReach: number;
  flowSpread: number;
}

interface AhuArrayLayout {
  unitSpacing: number;
  halfWidth: number;
}

function getAhuArrayLayout(params: AhuParams): AhuArrayLayout {
  const supplyExtension = params.showDuctStubs ? AHU_SUPPLY_STUB_LENGTH : 0;
  const returnExtension = params.showDuctStubs ? AHU_RETURN_STUB_LENGTH : 0;
  const unitSpacing =
    params.width +
    supplyExtension +
    returnExtension +
    AHU_UNIT_CLEARANCE;
  const centerSpan = Math.max(0, params.unitsPerFloor - 1) * unitSpacing;
  const halfWidth =
    centerSpan / 2 +
    params.width / 2 +
    Math.max(supplyExtension, returnExtension);
  return { unitSpacing, halfWidth };
}

function getFootprintBounds(recipe: BuildingRecipe): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const ring = recipe.footprintPolygon?.[0];
  if (!ring?.length) {
    return {
      minX: -recipe.footprintWidth / 2,
      maxX: recipe.footprintWidth / 2,
      minZ: -recipe.footprintDepth / 2,
      maxZ: recipe.footprintDepth / 2,
    };
  }
  return {
    minX: Math.min(...ring.map(([x]) => x)),
    maxX: Math.max(...ring.map(([x]) => x)),
    minZ: Math.min(...ring.map(([, z]) => z)),
    maxZ: Math.max(...ring.map(([, z]) => z)),
  };
}

function findAhuPlacement(
  recipe: BuildingRecipe,
  arrayHalfWidth: number,
  ahuDepth: number,
): AhuPlacement | null {
  const bounds = getFootprintBounds(recipe);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const equipmentHalfWidth = arrayHalfWidth + 0.02;
  const equipmentHalfDepth = ahuDepth / 2 + 0.08;
  const baseReach = Math.min(3, recipe.footprintWidth * 0.25);
  const baseSpread = Math.min(2.4, recipe.footprintDepth * 0.35);
  const columns = getColumnPositions(recipe);
  const columnHalf = recipe.column.size / 2;
  const wallClearance = Math.max(0.05, recipe.wallThickness * 0.25);

  for (const scale of [1, 0.75, 0.5, 0.35, 0.25]) {
    const flowReach = Math.max(0.35, baseReach * scale);
    const flowSpread = Math.max(0.4, baseSpread * scale);
    const envelopeHalfWidth = Math.max(
      equipmentHalfWidth,
      arrayHalfWidth + 0.08 + flowReach,
    );
    const envelopeHalfDepth = Math.max(equipmentHalfDepth, flowSpread / 2);
    const minX = bounds.minX + envelopeHalfWidth + wallClearance;
    const maxX = bounds.maxX - envelopeHalfWidth - wallClearance;
    const minZ = bounds.minZ + envelopeHalfDepth + wallClearance;
    const maxZ = bounds.maxZ - envelopeHalfDepth - wallClearance;
    if (minX > maxX || minZ > maxZ) continue;

    const candidates: THREE.Vector2[] = [];
    for (let ix = 0; ix <= 8; ix++) {
      for (let iz = 0; iz <= 8; iz++) {
        candidates.push(
          new THREE.Vector2(
            THREE.MathUtils.lerp(minX, maxX, ix / 8),
            THREE.MathUtils.lerp(minZ, maxZ, iz / 8),
          ),
        );
      }
    }
    candidates.sort(
      (a, b) =>
        a.distanceToSquared(new THREE.Vector2(centerX, centerZ)) -
        b.distanceToSquared(new THREE.Vector2(centerX, centerZ)),
    );

    for (const candidate of candidates) {
      if (
        !axisAlignedRectangleFitsFootprint(
          { x: candidate.x, z: candidate.y },
          envelopeHalfWidth,
          envelopeHalfDepth,
          recipe.footprintPolygon,
        )
      ) {
        continue;
      }
      const overlapsColumn = columns.some((column) => {
        const separatedX =
          Math.abs(candidate.x - column.x) >
          equipmentHalfWidth + columnHalf + 0.12;
        const separatedZ =
          Math.abs(candidate.y - column.z) >
          equipmentHalfDepth + columnHalf + 0.12;
        return !separatedX && !separatedZ;
      });
      if (!overlapsColumn) {
        return { center: candidate, flowReach, flowSpread };
      }
    }
  }

  return null;
}

function appendStreamline(
  buffers: AirflowBuffers,
  controlPoints: [
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
  ],
  color: THREE.Color,
  phase: number
): void {
  // Cubic Bézier curves remain inside the convex hull of their control points.
  // Since the entire control-point envelope is footprint-validated, the
  // sampled airflow cannot overshoot through a façade or courtyard edge.
  const spline = new THREE.CubicBezierCurve3(...controlPoints);
  const points = spline.getPoints(AIRFLOW_SAMPLES - 1);

  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const startProgress = (i - 1) / (points.length - 1);
    const endProgress = i / (points.length - 1);

    buffers.positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    buffers.progress.push(startProgress, endProgress);
    buffers.phases.push(phase, phase);
    buffers.colors.push(
      color.r,
      color.g,
      color.b,
      color.r,
      color.g,
      color.b
    );
  }

  buffers.streamCount += 1;
}

/**
 * Select floors evenly so very tall towers stay within a fixed geometry budget
 * while still showing airflow from bottom to top.
 */
function selectAirflowFloors<T>(floors: T[], count: number): T[] {
  if (floors.length <= count) return floors;
  if (count <= 1) return [floors[0]];

  const selected: T[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * (floors.length - 1)) / (count - 1));
    selected.push(floors[index]);
  }
  return selected;
}

function buildAirflowStreamlines(
  floors: BuildingRecipe["floors"],
  density: number,
  ahuArrayHalfWidth: number,
  ahuHeight: number,
  placement: AhuPlacement | null,
): THREE.LineSegments {
  const clampedDensity = THREE.MathUtils.clamp(density, 0, 1);
  const requestedLanesPerFloor =
    clampedDensity === 0 ? 0 : Math.max(2, Math.round(5 * clampedDensity));
  const selectedFloors = selectAirflowFloors(
    floors,
    Math.min(floors.length, MAX_AIRFLOW_LANE_BUNDLES)
  );
  const lanesPerFloor =
    requestedLanesPerFloor === 0 || selectedFloors.length === 0 || !placement
      ? 0
      : Math.min(
          requestedLanesPerFloor,
          Math.floor(MAX_AIRFLOW_LANE_BUNDLES / selectedFloors.length),
        );

  const ahuEdge = ahuArrayHalfWidth + 0.08;
  const buffers: AirflowBuffers = {
    positions: [],
    progress: [],
    phases: [],
    colors: [],
    streamCount: 0,
  };

  for (let floorIndex = 0; floorIndex < selectedFloors.length; floorIndex++) {
    const floor = selectedFloors[floorIndex];
    const y = floor.y + floor.height - ahuHeight / 2 - 0.1;

    for (let lane = 0; lane < lanesPerFloor; lane++) {
      const lanePosition =
        lanesPerFloor === 1 ? 0 : lane / (lanesPerFloor - 1) - 0.5;
      const outerZ = placement!.center.y + lanePosition * placement!.flowSpread;
      const throatZ =
        placement!.center.y +
        lanePosition * Math.min(0.8, placement!.flowSpread * 0.3);
      const lift =
        Math.sin(lanePosition * Math.PI) * Math.min(0.18, floor.height * 0.05);
      const basePhase = (lane / lanesPerFloor + floorIndex * 0.17) % 1;
      const intakeX = placement!.center.x - ahuEdge;
      const outletX = placement!.center.x + ahuEdge;
      const returnEndX = intakeX - placement!.flowReach;
      const supplyEndX = outletX + placement!.flowReach;

      // Cool-gray return air: perimeter -> AHU intake.
      appendStreamline(
        buffers,
        [
          new THREE.Vector3(returnEndX, y, outerZ),
          new THREE.Vector3(intakeX - placement!.flowReach * 0.68, y + lift, outerZ),
          new THREE.Vector3(intakeX - placement!.flowReach * 0.30, y + lift * 0.6, throatZ),
          new THREE.Vector3(intakeX, y, throatZ),
        ],
        RETURN_AIR,
        basePhase
      );

      // Cyan supply air: AHU outlet -> opposite perimeter, fanning back out.
      appendStreamline(
        buffers,
        [
          new THREE.Vector3(outletX, y, throatZ),
          new THREE.Vector3(outletX + placement!.flowReach * 0.30, y - lift * 0.4, throatZ),
          new THREE.Vector3(outletX + placement!.flowReach * 0.68, y - lift * 0.25, outerZ),
          new THREE.Vector3(supplyEndX, y, outerZ),
        ],
        SUPPLY_AIR,
        (basePhase + 0.35) % 1
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(buffers.positions, 3)
  );
  geometry.setAttribute(
    "lineProgress",
    new THREE.Float32BufferAttribute(buffers.progress, 1)
  );
  geometry.setAttribute(
    "phase",
    new THREE.Float32BufferAttribute(buffers.phases, 1)
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(buffers.colors, 3)
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: airflowVertexShader,
    fragmentShader: airflowFragmentShader,
    uniforms: {
      uTime: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Normal alpha blending keeps cyan/gray visible against both the bright
    // floor plates and the dark structural-isolation background.
    blending: THREE.NormalBlending,
    toneMapped: false,
  });

  const streamlines = new THREE.LineSegments(geometry, material);
  streamlines.name = "airflow-streamlines";
  streamlines.renderOrder = 20;
  streamlines.frustumCulled = false;
  streamlines.userData = {
    type: "vent-airflow",
    animated: true,
    streamCount: buffers.streamCount,
  };
  return streamlines;
}

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
    const supply = new THREE.BoxGeometry(
      AHU_SUPPLY_STUB_LENGTH,
      p.height * 0.5,
      p.depth * 0.5,
    );
    supply.translate(p.width / 2 + AHU_SUPPLY_STUB_LENGTH / 2, 0, 0);
    pieces.push(supply);

    // Return duct stub — protrudes from -X face, slightly smaller
    const returnD = new THREE.BoxGeometry(
      AHU_RETURN_STUB_LENGTH,
      p.height * 0.4,
      p.depth * 0.4,
    );
    returnD.translate(
      -(p.width / 2 + AHU_RETURN_STUB_LENGTH / 2),
      0,
      0,
    );
    pieces.push(returnD);
  }

  if (p.showFanFace) {
    // Fan housing ring on front face (+Z)
    const fanRadius = Math.min(p.height, p.depth) * 0.35;
    const fanRing = new THREE.TorusGeometry(fanRadius, 0.04, 8, 16);
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
 * - Deterministic supply/return B-spline streamlines in one LineSegments object
 * - Animated tapered pulses for a clear flowing-air direction cue
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

    const { floors } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const { footprintWidth, footprintDepth } = recipe;
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

    const ahuLayout = getAhuArrayLayout(ahuParams);
    const placement = findAhuPlacement(
      recipe,
      ahuLayout.halfWidth,
      ahuParams.depth,
    );
    const instanceCount = placement
      ? aboveFloors.length * ahuParams.unitsPerFloor
      : 0;
    const ahuIM = new THREE.InstancedMesh(
      ahuGeo,
      ahuMat,
      Math.max(1, instanceCount),
    );
    ahuIM.userData = {
      type: "vent-ahu",
      instancesPerFloor: ahuParams.unitsPerFloor,
    };

    const mat4 = new THREE.Matrix4();
    if (placement) {
      for (let f = 0; f < aboveFloors.length; f++) {
        for (let u = 0; u < ahuParams.unitsPerFloor; u++) {
          const floor = aboveFloors[f];
          const ceilingY = floor.y + floor.height - ahuParams.height / 2 - 0.1;
          const xOffset =
            ahuParams.unitsPerFloor === 1
              ? 0
              : (u - (ahuParams.unitsPerFloor - 1) / 2) *
                ahuLayout.unitSpacing;
          mat4.makeTranslation(
            placement.center.x + xOffset,
            ceilingY,
            placement.center.y,
          );
          ahuIM.setMatrixAt(f * ahuParams.unitsPerFloor + u, mat4);
        }
      }
    }
    ahuIM.count = instanceCount;
    ahuIM.instanceMatrix.needsUpdate = true; // Pitfall 1 — CRITICAL
    group.add(ahuIM);

    // --- Ceiling duct network — rigid trunk + branch runs per floor ---
    // Replaces the old chaotic-spline-only look: HVAC now reads as real
    // ceiling ductwork. ONE InstancedMesh for every duct segment on every
    // floor (type "vent-duct-run" — the per-floor loose "vent-duct" Meshes
    // remain eliminated).
    const ductOriginX = placement?.center.x ?? 0;
    const ductOriginZ = placement?.center.y ?? 0;
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

      // Main trunk along X at the AHU / core
      dPos.set(ductOriginX, ductY, ductOriginZ);
      dScl.set(trunkLen, 0.3, 0.42);
      dMat4.compose(dPos, dQuat, dScl);
      ductIM.setMatrixAt(dIdx++, dMat4);

      for (const bx of branchXs) {
        const x = ductOriginX + Math.max(-hw * 0.8, Math.min(hw * 0.8, bx));
        // Branch along Z
        dPos.set(x, ductY, ductOriginZ);
        dScl.set(0.3, 0.24, branchLen);
        dMat4.compose(dPos, dQuat, dScl);
        ductIM.setMatrixAt(dIdx++, dMat4);
        // Diffuser plates near both branch ends, dropped slightly
        for (const sz of [-1, 1]) {
          dPos.set(x, ductY - 0.16, ductOriginZ + sz * branchLen * 0.42);
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
              new THREE.Vector3(ductOriginX, ductY - 0.05, ductOriginZ),
              new THREE.Vector3(ductOriginX + bx * 0.6, ductY - 0.02, ductOriginZ),
              new THREE.Vector3(ductOriginX + bx, ductY, ductOriginZ + sz * branchLen * 0.12),
              new THREE.Vector3(ductOriginX + bx, ductY - 0.04, ductOriginZ + sz * branchLen * 0.3),
              new THREE.Vector3(ductOriginX + bx, ductY - 0.22, ductOriginZ + sz * branchLen * 0.44),
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
        vertexShader: ductFlowVertexShader,
        fragmentShader: ductFlowFragmentShader,
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

    // --- Batched airflow field: one draw call for all supply + return streams ---
    group.add(
      buildAirflowStreamlines(
        aboveFloors,
        density,
        ahuLayout.halfWidth,
        ahuParams.height,
        placement,
      )
    );
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
