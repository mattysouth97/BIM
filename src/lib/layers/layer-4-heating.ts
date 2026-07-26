// src/lib/layers/layer-4-heating.ts
// Layer 4: MEP Heating 난방
// Emissive red hot-water piping with radiant floor heating zones
// rendered as heat-gradient shader planes.
// Pure Three.js, no React.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import type { BoilerParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentGeometryClone,
  getEquipmentMaterialClone,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";
import {
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "./equipment-scenario";

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
 * Builds a merged boiler geometry:
 * - Body: CylinderGeometry (main boiler tank)
 * - Flue: CylinderGeometry translated to top (flue stack)
 * - PipeA: CylinderGeometry rotated Z (supply stub)
 * - PipeB: CylinderGeometry rotated Z (return stub)
 *
 * mergeGeometries called once — NOT in animation loop.
 * Pitfall 3: all primitives are standard Cylinders — merge compatible.
 * Pitfall 4: each sub-geometry is a new instance — never shared + translated.
 */
export function buildBoilerGeometry(p: BoilerParams): THREE.BufferGeometry {
  // Main cylindrical boiler body
  const body = new THREE.CylinderGeometry(p.radius, p.radius, p.height, 16);

  // Flue stack on top of body
  const flue = new THREE.CylinderGeometry(p.flueRadius, p.flueRadius, p.flueHeight, 12);
  flue.translate(0, p.height / 2 + p.flueHeight / 2, 0);

  // Supply pipe stub — horizontal at -Y
  const pipeA = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
  pipeA.rotateZ(Math.PI / 2);
  pipeA.translate(p.radius + 0.25, -p.height * 0.3, 0);

  // Return pipe stub — horizontal at +Y
  const pipeB = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
  pipeB.rotateZ(Math.PI / 2);
  pipeB.translate(p.radius + 0.25, p.height * 0.3, 0);

  return mergeGeometries([body, flue, pipeA, pipeB]);
}

/**
 * HeatingLayer generates hot-water distribution and radiant floor heating:
 * - Central boiler plant at basement (merged geometry: cylinder body + flue + 2 pipe stubs)
 * - VRF outdoor unit InstancedMesh (roof cluster or perimeter) when vrfHeads === true
 * - Fan coil unit InstancedMesh at ceiling of each above floor
 * - Vertical riser splines through core shaft (red emissive)
 * - Horizontal piping across floors
 * - Radiant heating zone planes on each floor with animated heat-map shader
 */
export class HeatingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density: number = 1.0,
    equipParams: Partial<BoilerParams> = {},
    scenario: EquipmentScenario = SHOWCASE_EQUIPMENT_SCENARIO
  ): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-4-heating";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // Merge equipParams overrides with defaults
    const boilerParams: BoilerParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.boiler,
      ...equipParams,
    };

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

    // Plant floor plane: boiler body must stay fully below the ground slab
    // (the previous fixed y=-0.6 centre placement pushed the body 0.3 m up
    // into the first-floor slab — geometry-clipping fix).
    const plantFloorY = -(boilerParams.height + 0.3);

    // --- Central heating plant at basement level — SCENARIO-DEPENDENT ---
    // Green remodeling physically swaps the plant: selecting the heat-pump
    // measure replaces the boiler with an ASHP bank; the boiler-upgrade
    // measure replaces it with a condensing cascade; otherwise the legacy
    // fire-tube boiler renders.
    if (scenario.heating === "heat-pump") {
      for (let i = 0; i < 3; i++) {
        const px = -1.4 + i * 1.4;
        const ashpUnit = getEquipmentObjectClone("heat-pump");
        if (ashpUnit) {
          ashpUnit.position.set(px, plantFloorY, 0);
          tagEquipmentObject(
            ashpUnit,
            { type: "heating-heat-pump-plant" },
            { castShadow: true, receiveShadow: true }
          );
          group.add(ashpUnit);
        } else {
          const hpMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            emissive: HEAT_RED,
            emissiveIntensity: 0.15,
            roughness: 0.5,
            metalness: 0.4,
          });
          const hpBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 0.45), hpMat);
          hpBox.position.set(px, plantFloorY + 0.675, 0);
          hpBox.userData = { type: "heating-heat-pump-plant" };
          group.add(hpBox);
        }
      }
    } else if (scenario.heating === "condensing") {
      const cascade = getEquipmentObjectClone("boiler-condensing");
      if (cascade) {
        cascade.position.set(0, plantFloorY, 0);
        tagEquipmentObject(
          cascade,
          { type: "heating-condensing-boiler" },
          { castShadow: true, receiveShadow: true }
        );
        group.add(cascade);
      } else {
        const cascMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          emissive: HEAT_RED,
          emissiveIntensity: 0.12,
          roughness: 0.4,
          metalness: 0.2,
        });
        const casc = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 0.6), cascMat);
        casc.position.set(0, plantFloorY + 0.75, 0);
        casc.userData = { type: "heating-condensing-boiler" };
        group.add(casc);
      }
    } else {
      this.addBaselineBoiler(group, boilerParams, plantFloorY);
    }

    // --- Air-source heat pumps (EHP pair on the roof, beside the core) ---
    // Detailed-asset-only addition: rendered when the Blender asset is loaded.
    const ashpRoofY =
      totalHeight + (recipe.roof?.type === "flat" ? recipe.roof.flatThickness : 0);
    for (let i = 0; i < 2; i++) {
      const ashp = getEquipmentObjectClone("heat-pump");
      if (!ashp) break;
      const ashpX = Math.max(-hw + 1.2, -hw * 0.35) + i * 1.5;
      ashp.position.set(ashpX, ashpRoofY, -Math.min(hd - 1.0, hd * 0.35));
      tagEquipmentObject(
        ashp,
        { type: "heating-ashp" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(ashp);
    }

    // --- Geothermal installation (GSHP + borehole manifold) ---
    // Detailed-asset-only addition: rendered when the Blender asset is loaded.
    const gshpAsset = getEquipmentObjectClone("gshp");
    if (gshpAsset) {
      const gshpX = Math.min(hw - 1.2, 2.6);
      gshpAsset.position.set(gshpX, plantFloorY, 0.6);
      tagEquipmentObject(
        gshpAsset,
        { type: "heating-gshp" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(gshpAsset);
    }

    // --- VRF outdoor unit InstancedMesh ---
    if (boilerParams.vrfHeads) {
      // Detailed single-mesh Blender asset (authored 0.8×0.6×0.35, centre
      // origin — matches the coarse box) or merged-primitive fallback.
      const vrfDetailedGeo = getEquipmentGeometryClone("vrf-outdoor");
      let vrfGeo: THREE.BufferGeometry;
      if (vrfDetailedGeo) {
        vrfGeo = vrfDetailedGeo;
      } else {
        // VRF body: small box cassette with louvre stripes on front face
        const vrfBody = new THREE.BoxGeometry(0.8, 0.6, 0.35);
        // Louvre stripes — 3 thin boxes merged for IM-compatible single geometry
        const louvreA = new THREE.BoxGeometry(0.7, 0.08, 0.02);
        louvreA.translate(0, 0.1, 0.175 + 0.01);
        const louvreB = new THREE.BoxGeometry(0.7, 0.08, 0.02);
        louvreB.translate(0, 0.0, 0.175 + 0.01);
        const louvreC = new THREE.BoxGeometry(0.7, 0.08, 0.02);
        louvreC.translate(0, -0.1, 0.175 + 0.01);
        vrfGeo = mergeGeometries([vrfBody, louvreA, louvreB, louvreC]);
      }

      // Roof cluster: 2 × vrfHeadsPerFloor total; perimeter: one per floor × per-floor count
      const vrfCount =
        boilerParams.vrfLocation === "roof"
          ? boilerParams.vrfHeadsPerFloor * 2
          : aboveFloors.length * boilerParams.vrfHeadsPerFloor;

      // Detailed asset ships its own PBR material; fallback keeps the cyan
      // tint (visually distinct from heating pipes).
      const vrfMat =
        (vrfDetailedGeo ? getEquipmentMaterialClone("vrf-outdoor") : null) ??
        new THREE.MeshStandardMaterial({
          color: 0x0891b2,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.15,
          roughness: 0.5,
          metalness: 0.4,
        });

      const vrfIM = new THREE.InstancedMesh(vrfGeo, vrfMat, vrfCount);
      // Pitfall 2: userData on the InstancedMesh, NOT on the geometry
      vrfIM.userData = { type: "heating-vrf-head" };

      const mat4 = new THREE.Matrix4();
      // Roof cluster sits on the roof TOP surface (same roofTopY convention
      // as the layer-3 chiller fix — flat roofs extend flatThickness above
      // totalHeight). +0.31 lifts the centre-origin 0.62 m unit so its base
      // rests on the surface instead of being half-buried in the roof box.
      const roofTopY =
        totalHeight + (recipe.roof?.type === "flat" ? recipe.roof.flatThickness : 0);
      const roofY = roofTopY + 0.31;

      for (let i = 0; i < vrfCount; i++) {
        if (boilerParams.vrfLocation === "roof") {
          // Cluster spread on roof — deterministic grid pattern (Pitfall 6: no Math.random)
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = (col - 1) * 1.2;
          const z = row * 1.2 + footprintDepth * 0.2;
          mat4.makeTranslation(x, roofY, z);
        } else {
          // Perimeter: one cluster per floor on +X face
          const floorIdx = Math.floor(i / boilerParams.vrfHeadsPerFloor);
          const perFloorIdx = i % boilerParams.vrfHeadsPerFloor;
          const floor = aboveFloors[floorIdx];
          const y = floor.y + floor.height / 2;
          const x = footprintWidth / 2 + 0.2;
          const z = (perFloorIdx - boilerParams.vrfHeadsPerFloor / 2) * 1.0;
          mat4.makeTranslation(x, y, z);
        }
        vrfIM.setMatrixAt(i, mat4);
      }
      // Pitfall 1: CRITICAL — must set needsUpdate after all setMatrixAt calls
      vrfIM.instanceMatrix.needsUpdate = true;
      group.add(vrfIM);
    }

    // --- Fan coil InstancedMesh — thin ceiling cassettes per above floor ---
    // Detailed 4-way cassette asset (authored 0.9×0.1×0.5, centre origin) or
    // flat-box fallback: wider and flatter than AHU (0.9×0.1×0.5)
    const fcDetailedGeo = getEquipmentGeometryClone("fan-coil");
    const fcGeo = fcDetailedGeo ?? new THREE.BoxGeometry(0.9, 0.1, 0.5);
    // Blue emissive tint always — fan coils are interior ceiling units and
    // the x-ray colour language keeps them readable through the envelope.
    const fcMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.2,
      roughness: 0.4,
      metalness: 0.5,
    });
    const fcIM = new THREE.InstancedMesh(fcGeo, fcMat, aboveFloors.length);
    // Pitfall 2: userData on the InstancedMesh
    fcIM.userData = { type: "heating-fan-coil" };

    const fcMat4 = new THREE.Matrix4();
    for (let i = 0; i < aboveFloors.length; i++) {
      const floor = aboveFloors[i];
      const ceilingY = floor.y + floor.height - 0.1;
      // Offset from AHU position (AHU at core, fan coil at perimeter quarter)
      fcMat4.makeTranslation(footprintWidth * 0.25, ceilingY, 0);
      fcIM.setMatrixAt(i, fcMat4);
    }
    // Pitfall 1: CRITICAL
    fcIM.instanceMatrix.needsUpdate = true;
    group.add(fcIM);

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

  /** Legacy fire-tube boiler (baseline scenario) — detailed asset or merged fallback. */
  private addBaselineBoiler(
    group: THREE.Group,
    boilerParams: BoilerParams,
    plantFloorY: number
  ): void {
    const boilerAsset = getEquipmentObjectClone("boiler");
    if (boilerAsset) {
      const native = ASSET_NATIVE_DIMS.boiler;
      const radialScale = (boilerParams.radius * 2) / native.w;
      boilerAsset.scale.set(
        radialScale,
        boilerParams.height / native.h,
        radialScale
      );
      // Base-origin asset: body occupies [plantFloorY, plantFloorY + height],
      // fully below the ground slab; only the flue penetrates upward.
      boilerAsset.position.set(0, plantFloorY, 0);
      tagEquipmentObject(
        boilerAsset,
        { type: "heating-boiler" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(boilerAsset);
    } else {
      const boilerGeo = buildBoilerGeometry(boilerParams);
      const plantMat = new THREE.MeshStandardMaterial({
        color: 0xb91c1c,
        emissive: HEAT_RED,
        emissiveIntensity: 0.4,
        roughness: 0.5,
        metalness: 0.4,
      });
      const plant = new THREE.Mesh(boilerGeo, plantMat);
      // Centre-origin merged geometry: centre so the body top sits at -0.3
      // (below the ground slab) instead of protruding into floor 1.
      plant.position.set(0, plantFloorY + boilerParams.height / 2, 0);
      // Pitfall 2: userData on the Mesh, NOT on the BufferGeometry
      plant.userData = { type: "heating-boiler" };
      group.add(plant);
    }
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
