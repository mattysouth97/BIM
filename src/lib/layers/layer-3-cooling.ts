// src/lib/layers/layer-3-cooling.ts
// Layer 3: MEP Cooling 냉방
// Emissive blue chilled-water piping from central plant to ceiling grids,
// with animated flow particles along spline paths.
// Pure Three.js, no React.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import type { ChillerParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";
import { computeCoreLayout } from "./core-layout";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";

const COOL_BLUE = 0x3b82f6;
const PIPE_RADIUS = 0.04;
const PIPE_SEGMENTS = 8;
const SPLINE_DIVISIONS = 48;

/**
 * Builds a merged packaged-chiller geometry with a condenser grille,
 * service-panel seams, base rails, axial fans, and flanged pipe stubs.
 *
 * mergeGeometries called once — NOT in animation loop.
 * Pitfall 3: all primitives are standard Three.js geometries — merge compatible.
 * Pitfall 4: each sub-geometry is a new instance — never shared + translated.
 */
export function buildChillerGeometry(p: ChillerParams): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(p.bodyWidth, p.bodyHeight, p.bodyDepth);
  const parts: THREE.BufferGeometry[] = [body];

  // Condenser grille on front (+Z) face — thin box slightly protruding
  const grille = new THREE.BoxGeometry(p.bodyWidth * 0.9, p.bodyHeight * 0.9, 0.08);
  grille.translate(0, 0, p.bodyDepth / 2 + 0.04);
  parts.push(grille);

  const frontZ = p.bodyDepth / 2;
  const seamThickness = Math.max(0.018, p.bodyWidth * 0.008);
  for (const x of [-p.bodyWidth * 0.28, p.bodyWidth * 0.28]) {
    const seam = new THREE.BoxGeometry(
      seamThickness,
      p.bodyHeight * 0.78,
      Math.max(0.025, p.bodyDepth * 0.015)
    );
    seam.translate(x, 0, frontZ + 0.09);
    parts.push(seam);
  }

  const lowerSeam = new THREE.BoxGeometry(
    p.bodyWidth * 0.88,
    seamThickness,
    Math.max(0.025, p.bodyDepth * 0.015)
  );
  lowerSeam.translate(0, -p.bodyHeight * 0.28, frontZ + 0.09);
  parts.push(lowerSeam);

  const serviceHandle = new THREE.BoxGeometry(
    Math.max(0.05, p.bodyWidth * 0.025),
    p.bodyHeight * 0.16,
    Math.max(0.04, p.bodyDepth * 0.025)
  );
  serviceHandle.translate(p.bodyWidth * 0.39, -p.bodyHeight * 0.08, frontZ + 0.11);
  parts.push(serviceHandle);

  const railHeight = Math.max(0.08, p.bodyHeight * 0.07);
  const railDepth = Math.max(0.12, p.bodyDepth * 0.1);
  for (const z of [-p.bodyDepth * 0.34, p.bodyDepth * 0.34]) {
    const rail = new THREE.BoxGeometry(p.bodyWidth * 1.04, railHeight, railDepth);
    rail.translate(0, -p.bodyHeight / 2 - railHeight / 2, z);
    parts.push(rail);

    for (const x of [-p.bodyWidth * 0.38, p.bodyWidth * 0.38]) {
      const foot = new THREE.BoxGeometry(
        Math.max(0.14, p.bodyWidth * 0.1),
        railHeight * 0.7,
        railDepth * 1.35
      );
      foot.translate(x, -p.bodyHeight / 2 - railHeight * 1.35, z);
      parts.push(foot);
    }
  }

  const fanRadius = Math.min(p.bodyWidth * 0.17, p.bodyDepth * 0.22);
  const fanY = p.bodyHeight / 2 + Math.max(0.055, p.bodyHeight * 0.035);
  for (const x of [-p.bodyWidth * 0.24, p.bodyWidth * 0.24]) {
    const housing = new THREE.CylinderGeometry(
      fanRadius * 1.08,
      fanRadius * 1.08,
      Math.max(0.08, p.bodyHeight * 0.06),
      20
    );
    housing.translate(x, fanY, 0);
    parts.push(housing);

    const guard = new THREE.TorusGeometry(
      fanRadius * 0.82,
      Math.max(0.018, fanRadius * 0.06),
      6,
      24
    );
    guard.rotateX(Math.PI / 2);
    guard.translate(x, fanY + Math.max(0.05, p.bodyHeight * 0.035), 0);
    parts.push(guard);

    const hub = new THREE.CylinderGeometry(
      fanRadius * 0.18,
      fanRadius * 0.18,
      Math.max(0.07, p.bodyHeight * 0.05),
      12
    );
    hub.translate(x, fanY + Math.max(0.055, p.bodyHeight * 0.04), 0);
    parts.push(hub);

    for (const angle of [Math.PI / 4, (Math.PI * 3) / 4]) {
      const blades = new THREE.BoxGeometry(
        fanRadius * 1.25,
        Math.max(0.025, p.bodyHeight * 0.018),
        Math.max(0.045, fanRadius * 0.16)
      );
      blades.rotateY(angle);
      blades.translate(x, fanY + Math.max(0.06, p.bodyHeight * 0.043), 0);
      parts.push(blades);
    }
  }

  // Supply pipe stub — horizontal cylinder at -Y on +X face
  const pipeA = new THREE.CylinderGeometry(p.pipeStubRadius, p.pipeStubRadius, 0.4, 8);
  pipeA.rotateZ(Math.PI / 2);
  pipeA.translate(p.bodyWidth / 2 + 0.2, -p.bodyHeight * 0.3, 0);
  parts.push(pipeA);

  // Return pipe stub — horizontal cylinder at +Y on +X face
  const pipeB = new THREE.CylinderGeometry(p.pipeStubRadius * 0.8, p.pipeStubRadius * 0.8, 0.4, 8);
  pipeB.rotateZ(Math.PI / 2);
  pipeB.translate(p.bodyWidth / 2 + 0.2, p.bodyHeight * 0.3, 0);
  parts.push(pipeB);

  const supplyFlange = new THREE.CylinderGeometry(
    p.pipeStubRadius * 1.45,
    p.pipeStubRadius * 1.45,
    0.06,
    12
  );
  supplyFlange.rotateZ(Math.PI / 2);
  supplyFlange.translate(p.bodyWidth / 2 + 0.37, -p.bodyHeight * 0.3, 0);
  parts.push(supplyFlange);

  const returnFlange = new THREE.CylinderGeometry(
    p.pipeStubRadius * 1.18,
    p.pipeStubRadius * 1.18,
    0.06,
    12
  );
  returnFlange.rotateZ(Math.PI / 2);
  returnFlange.translate(p.bodyWidth / 2 + 0.37, p.bodyHeight * 0.3, 0);
  parts.push(returnFlange);

  return mergeGeometries(parts);
}

/**
 * CoolingLayer generates chilled-water distribution piping:
 * - Central chiller plant at roof level (merged geometry: body + grille + 2 pipe stubs)
 * - Optional cooling tower if showCoolingTower === true
 * - Vertical riser splines from plant down/up through core shaft
 * - Horizontal ceiling grid branches per floor via CatmullRomCurve3
 * - Animated point particles flowing along spline paths
 */
export class CoolingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density: number = 1.0,
    equipParams: Partial<ChillerParams> = {}
  ): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-3-cooling";

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    // Merge equipParams overrides with defaults
    const chillerParams: ChillerParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.chiller,
      ...equipParams,
    };

    // Wet riser slot from the shared parametric core layout — beside the
    // elevator bank at the rear wall instead of the footprint centre (the
    // old 0,0 riser ran straight through the elevator shaft, and the chiller
    // landed on the same roof spot as the hoist machine).
    const layout = computeCoreLayout(recipe);
    const coreX = layout.serviceRiser.x;
    const coreZ = layout.serviceRiser.z;
    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

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

    // Equipment sits ON TOP of the roof slab — for flat roofs the roof box
    // extends flatThickness above totalHeight (fixes the previous half-embedded
    // placement where equipment bases clipped into the roof geometry).
    const roofTopY =
      totalHeight + (recipe.roof?.type === "flat" ? recipe.roof.flatThickness : 0);
    const chillerSupportLift =
      Math.max(0.08, chillerParams.bodyHeight * 0.07) * 1.7;

    // --- Central chiller plant (roof level) ---
    // Detailed Blender asset when preloaded; merged-primitive fallback otherwise.
    const chillerAsset = getEquipmentObjectClone("chiller");
    if (chillerAsset) {
      const native = ASSET_NATIVE_DIMS.chiller;
      chillerAsset.scale.set(
        chillerParams.bodyWidth / native.w,
        chillerParams.bodyHeight / native.h,
        chillerParams.bodyDepth / native.d
      );
      // Asset origin is at base centre — base rests exactly on the roof top.
      chillerAsset.position.set(coreX, roofTopY, coreZ);
      tagEquipmentObject(
        chillerAsset,
        { type: "cooling-plant" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(chillerAsset);
    } else {
      const chillerGeo = buildChillerGeometry(chillerParams);
      const plantMat = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        emissive: COOL_BLUE,
        emissiveIntensity: 0.3,
        roughness: 0.6,
        metalness: 0.4,
      });
      const plant = new THREE.Mesh(chillerGeo, plantMat);
      plant.position.set(
        coreX,
        roofTopY + chillerParams.bodyHeight / 2 + chillerSupportLift,
        coreZ
      );
      // Pitfall 2: userData on the Mesh, NOT on the BufferGeometry
      plant.userData = { type: "cooling-plant" };
      plant.castShadow = true;
      plant.receiveShadow = true;
      group.add(plant);
    }

    // --- Optional cooling tower (showCoolingTower === true) ---
    if (chillerParams.showCoolingTower) {
      // Beside the chiller toward +X; mirrored to -X when the footprint edge
      // is too close (keeps the tower on the roof for narrow buildings).
      const towerOffset = chillerParams.bodyWidth * 0.5 + 2.0;
      const towerX =
        coreX + towerOffset + chillerParams.bodyWidth * 0.35 > hw - 0.5
          ? coreX - towerOffset
          : coreX + towerOffset;
      const towerAsset = getEquipmentObjectClone("cooling-tower");
      if (towerAsset) {
        const s = chillerParams.bodyWidth / ASSET_NATIVE_DIMS.chiller.w;
        towerAsset.scale.set(s, s, s);
        // Base-origin asset: base sits on the roof top surface (roofTopY
        // accounts for the flat-roof slab thickness — previously equipment
        // bases were embedded 0.15 m inside the roof box).
        towerAsset.position.set(towerX, roofTopY, coreZ);
        tagEquipmentObject(
          towerAsset,
          { type: "cooling-tower" },
          { castShadow: true, receiveShadow: true }
        );
        group.add(towerAsset);
      } else {
        const towerHeight = chillerParams.bodyHeight * 0.8;
        const towerRadius = chillerParams.bodyWidth * 0.35;
        const towerBodyGeo = new THREE.CylinderGeometry(
          chillerParams.bodyWidth * 0.3,
          towerRadius,
          towerHeight,
          20
        );
        const towerParts: THREE.BufferGeometry[] = [towerBodyGeo];

        const basinHeight = Math.max(0.09, towerHeight * 0.09);
        const basin = new THREE.CylinderGeometry(
          towerRadius * 1.08,
          towerRadius * 1.08,
          basinHeight,
          20
        );
        basin.translate(0, -towerHeight / 2 - basinHeight / 2, 0);
        towerParts.push(basin);

        for (const y of [-towerHeight * 0.24, towerHeight * 0.18]) {
          const casingBand = new THREE.TorusGeometry(
            towerRadius * 0.96,
            Math.max(0.025, towerRadius * 0.045),
            6,
            24
          );
          casingBand.rotateX(Math.PI / 2);
          casingBand.translate(0, y, 0);
          towerParts.push(casingBand);
        }

        const fanRingGeo = new THREE.TorusGeometry(
          chillerParams.bodyWidth * 0.28,
          Math.max(0.04, towerRadius * 0.08),
          6,
          24
        );
        fanRingGeo.rotateX(Math.PI / 2);
        fanRingGeo.translate(0, towerHeight / 2 + 0.08, 0);
        towerParts.push(fanRingGeo);

        const fanHub = new THREE.CylinderGeometry(
          towerRadius * 0.14,
          towerRadius * 0.14,
          0.12,
          12
        );
        fanHub.translate(0, towerHeight / 2 + 0.09, 0);
        towerParts.push(fanHub);

        for (const angle of [0, Math.PI / 2]) {
          const bladePair = new THREE.BoxGeometry(
            towerRadius * 1.25,
            0.035,
            towerRadius * 0.14
          );
          bladePair.rotateY(angle);
          bladePair.translate(0, towerHeight / 2 + 0.09, 0);
          towerParts.push(bladePair);
        }

        const supportSize = Math.max(0.09, towerRadius * 0.12);
        for (const x of [-towerRadius * 0.58, towerRadius * 0.58]) {
          for (const z of [-towerRadius * 0.58, towerRadius * 0.58]) {
            const support = new THREE.BoxGeometry(supportSize, towerHeight * 0.13, supportSize);
            support.translate(x, -towerHeight / 2 - towerHeight * 0.13, z);
            towerParts.push(support);
          }
        }

        const towerGeo = mergeGeometries(towerParts);
        const towerMat = new THREE.MeshStandardMaterial({
          color: 0x1d4ed8,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.2,
          roughness: 0.5,
          metalness: 0.3,
        });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.set(
          towerX,
          roofTopY + chillerParams.bodyHeight * 0.4 + towerHeight * 0.195,
          coreZ
        );
        tower.userData = { type: "cooling-tower" };
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
      }
    }

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
