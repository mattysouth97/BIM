// src/lib/layers/layer-14-microgrid.ts
// Layer 14: Power — Microgrid. Solar PV panels, BESS batteries, bi-directional energy flow.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import { computeCoreLayout } from "./core-layout";
import {
  getEquipmentGeometryClone,
  getEquipmentMaterialClone,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";
import {
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "./equipment-scenario";

/** Vertex shader for battery glow pulse (instanced) */
const batteryGlowVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying float vPulse;
  uniform float uTime;

  void main() {
    vNormal = normalMatrix * normal;

    // Per-instance pulse phase from position
    vec4 row3 = instanceMatrix[3];
    float phase = row3.x * 2.1 + row3.z * 1.3;
    vPulse = 0.6 + 0.4 * sin(uTime * 1.5 + phase);

    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

/** Fragment shader for battery glow */
const batteryGlowFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying float vPulse;

  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
    float glow = vPulse + rim * 0.4;
    gl_FragColor = vec4(uColor * glow, 0.92);
  }
`;

/** Vertex shader for bi-directional energy flow particles */
const flowParticleVertexShader = /* glsl */ `
  attribute float aOffset;
  attribute float aDirection; // 1.0 = roof->basement, -1.0 = basement->roof
  uniform float uTime;
  uniform float uMinY;
  uniform float uMaxY;
  varying float vAlpha;
  varying float vDir;

  void main() {
    vDir = aDirection;
    float range = uMaxY - uMinY;
    float speed = 0.4;
    float progress = fract(aOffset + uTime * speed * aDirection);

    // Map progress to Y position
    float y = mix(uMinY, uMaxY, aDirection > 0.0 ? (1.0 - progress) : progress);
    vAlpha = 0.4 + 0.6 * (1.0 - abs(progress - 0.5) * 2.0); // brightest at center of travel

    vec3 particlePos = vec3(position.x, y, position.z);
    vec4 mvPosition = modelViewMatrix * vec4(particlePos, 1.0);
    gl_PointSize = 5.0 * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/** Fragment shader for energy flow particles — yellow/green based on direction */
const flowParticleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vDir;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Yellow for generating (roof->basement), green-yellow for consuming (basement->floors)
    vec3 genColor = vec3(0.918, 0.702, 0.031); // #eab308
    vec3 conColor = vec3(0.541, 0.871, 0.125); // #8ade20
    vec3 color = mix(conColor, genColor, step(0.0, vDir));

    float alpha = vAlpha * smoothstep(0.5, 0.15, dist);
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * MicrogridLayer generates on-site power infrastructure:
 * - Solar PV panel grid on roof (flat InstancedMesh tilted ~30deg)
 * - BESS battery boxes in basement array
 * - Bi-directional spline flow particles: Roof -> Basement (generating) or Basement -> Floors
 * - Vertical power backbone conduit
 * - Battery status LED indicators
 */
export class MicrogridLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density = 1.0,
    scenario: EquipmentScenario = SHOWCASE_EQUIPMENT_SCENARIO
  ): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-14-microgrid";
    // Green-retrofit gating: the PV array, BESS, and inverters exist only
    // when the solar measure is in the selected scenario (or in showcase
    // mode before any scenario is evaluated). The distribution backbone and
    // floor conduits render regardless.
    const renderPv = scenario.solarPv;

    const { floors, footprintWidth, footprintDepth, totalHeight } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const halfW = footprintWidth / 2;
    const halfD = footprintDepth / 2;

    // Shared parametric core layout: the vertical backbone runs beside the
    // elevator bank (previously at x=0, straight through the centre shaft),
    // and the PV grid skips the rear roof band reserved for plant equipment.
    const layout = computeCoreLayout(recipe);
    const riserX = layout.electricalRiser.x;
    const riserZ = layout.electricalRiser.z;

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    const basementY = -1.0; // below grade (shared by BESS + flow splines)

    if (renderPv) {
    // --- Solar PV panels on roof: flat InstancedMesh grid tilted south ---
    const pvPanelWidth = 1.6;
    const pvPanelDepth = 1.0;
    const pvSpacing = 0.3;
    const roofInset = 1.5;
    const availableW = footprintWidth - roofInset * 2;
    const availableD = footprintDepth - roofInset * 2;
    const pvColsX = Math.max(
      1,
      Math.floor(availableW / (pvPanelWidth + pvSpacing))
    );
    const pvColsZ = Math.max(
      1,
      Math.floor(availableD / (pvPanelDepth + pvSpacing))
    );
    const pvCount = pvColsX * pvColsZ;

    // Detailed PV module Blender asset (authored 1.6×1.0, centre origin — the
    // same footprint as the coarse box) or plain-box fallback.
    const pvDetailedGeo = getEquipmentGeometryClone("solar-panel");
    const pvGeo = pvDetailedGeo ?? new THREE.BoxGeometry(pvPanelWidth, 0.04, pvPanelDepth);
    const pvMat =
      (pvDetailedGeo ? getEquipmentMaterialClone("solar-panel") : null) ??
      new THREE.MeshStandardMaterial({
        color: 0x1a237e, // dark blue solar cells
        metalness: 0.7,
        roughness: 0.2,
      });
    const pvIM = new THREE.InstancedMesh(pvGeo, pvMat, Math.max(1, pvCount));
    pvIM.userData = { type: "microgrid-pv-panel" };

    // Tilt quaternion: ~15 degrees toward south (Z+)
    const pvTiltQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -0.26 // ~15 degrees
    );

    let pvIdx = 0;
    for (let cx = 0; cx < pvColsX; cx++) {
      for (let cz = 0; cz < pvColsZ; cz++) {
        const x =
          -halfW +
          roofInset +
          (pvPanelWidth + pvSpacing) * 0.5 +
          cx * (pvPanelWidth + pvSpacing);
        const z =
          -halfD +
          roofInset +
          (pvPanelDepth + pvSpacing) * 0.5 +
          cz * (pvPanelDepth + pvSpacing);
        // Rear roof band is reserved for plant (hoists, chiller, ASHP row)
        if (z < layout.roofPlantBandMaxZ) continue;
        pos.set(x, totalHeight + 0.15, z);
        mat4.compose(pos, pvTiltQuat, scl);
        pvIM.setMatrixAt(pvIdx++, mat4);
      }
    }
    pvIM.count = pvIdx;
    pvIM.instanceMatrix.needsUpdate = true;
    group.add(pvIM);

    // PV mounting frame/rack (detailed asset: frame + rails + legs + junction
    // box) or thin bright-edge fallback box.
    const rackDetailedGeo = getEquipmentGeometryClone("solar-rack");
    const pvFrameGeo =
      rackDetailedGeo ??
      new THREE.BoxGeometry(pvPanelWidth + 0.04, 0.02, pvPanelDepth + 0.04);
    const pvFrameMat =
      (rackDetailedGeo ? getEquipmentMaterialClone("solar-rack") : null) ??
      new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        metalness: 0.8,
        roughness: 0.2,
      });
    const pvFrameIM = new THREE.InstancedMesh(
      pvFrameGeo,
      pvFrameMat,
      Math.max(1, pvCount)
    );
    pvFrameIM.userData = { type: "microgrid-pv-frame" };

    pvIdx = 0;
    for (let cx = 0; cx < pvColsX; cx++) {
      for (let cz = 0; cz < pvColsZ; cz++) {
        const x =
          -halfW +
          roofInset +
          (pvPanelWidth + pvSpacing) * 0.5 +
          cx * (pvPanelWidth + pvSpacing);
        const z =
          -halfD +
          roofInset +
          (pvPanelDepth + pvSpacing) * 0.5 +
          cz * (pvPanelDepth + pvSpacing);
        // Same rear plant-band skip as the panel loop above
        if (z < layout.roofPlantBandMaxZ) continue;
        pos.set(x, totalHeight + 0.14, z);
        mat4.compose(pos, pvTiltQuat, scl);
        pvFrameIM.setMatrixAt(pvIdx++, mat4);
      }
    }
    pvFrameIM.count = pvIdx;
    pvFrameIM.instanceMatrix.needsUpdate = true;
    group.add(pvFrameIM);

    // --- BESS battery boxes in basement ---
    const batteryCount = Math.max(2, Math.min(8, Math.floor(footprintWidth / 3)));
    // Detailed BESS cabinet asset (authored 0.9×0.7×0.6, centre origin) keeps
    // the pulsing glow ShaderMaterial — only the geometry is swapped.
    const batteryGeo =
      getEquipmentGeometryClone("battery-rack") ?? new THREE.BoxGeometry(0.9, 0.7, 0.6);
    const batteryMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xeab308) },
      },
      vertexShader: batteryGlowVertexShader,
      fragmentShader: batteryGlowFragmentShader,
      transparent: true,
    });

    const batteryIM = new THREE.InstancedMesh(
      batteryGeo,
      batteryMat,
      batteryCount
    );
    batteryIM.userData = { type: "microgrid-bess", animated: true };

    const batterySpacing = Math.min(
      1.2,
      (footprintWidth * 0.6) / batteryCount
    );
    const batteryRowStart = -(batteryCount * batterySpacing) / 2;

    for (let i = 0; i < batteryCount; i++) {
      pos.set(
        batteryRowStart + i * batterySpacing + batterySpacing / 2,
        basementY + 0.35,
        -halfD + 1.5
      );
      mat4.compose(pos, quat, scl);
      batteryIM.setMatrixAt(i, mat4);
    }
    batteryIM.instanceMatrix.needsUpdate = true;
    group.add(batteryIM);

    // Battery LED status indicators (small green bars on each battery)
    const ledGeo = new THREE.BoxGeometry(0.6, 0.03, 0.03);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 1.0,
    });
    const ledIM = new THREE.InstancedMesh(ledGeo, ledMat, batteryCount);
    ledIM.userData = { type: "microgrid-bess-led" };

    for (let i = 0; i < batteryCount; i++) {
      pos.set(
        batteryRowStart + i * batterySpacing + batterySpacing / 2,
        basementY + 0.72,
        -halfD + 1.5 + 0.31
      );
      mat4.compose(pos, quat, scl);
      ledIM.setMatrixAt(i, mat4);
    }
    ledIM.instanceMatrix.needsUpdate = true;
    group.add(ledIM);

    // --- PCS inverters (DC→AC) beside the battery row ---
    // Detailed-asset-only addition: rendered when the Blender asset is loaded.
    for (let i = 0; i < 2; i++) {
      const inverterAsset = getEquipmentObjectClone("inverter");
      if (!inverterAsset) break;
      // Base-origin asset stands on the same basement floor as the batteries
      // (battery boxes are centre-origin at basementY + 0.35).
      inverterAsset.position.set(
        batteryRowStart - 0.9 - i * 1.0,
        basementY,
        -halfD + 1.5
      );
      tagEquipmentObject(
        inverterAsset,
        { type: "microgrid-inverter" },
        { castShadow: true, receiveShadow: true }
      );
      group.add(inverterAsset);
    }
    } // end if (renderPv) — PV array, BESS, LEDs, inverters

    // --- Vertical power backbone conduit ---
    const backboneGeo = new THREE.CylinderGeometry(
      0.06,
      0.06,
      totalHeight + 2,
      8
    );
    const backboneMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      emissive: 0xeab308,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.3,
    });
    const backbone = new THREE.Mesh(backboneGeo, backboneMat);
    backbone.position.set(riserX, (totalHeight + 2) / 2 - 1, riserZ);
    backbone.userData = { type: "microgrid-backbone" };
    group.add(backbone);

    // --- Bi-directional energy flow particles (only with PV generating) ---
    if (renderPv) {
    const particlesPerSpline = Math.floor(40 * density);
    // 2 splines: roof-to-basement (generating) and basement-to-midfloor (consuming)
    const splines = [
      {
        x: riserX - 0.2,
        z: riserZ,
        dir: 1.0,
        minY: basementY,
        maxY: totalHeight + 0.5,
      }, // generating: roof->basement
      {
        x: riserX + 0.2,
        z: riserZ,
        dir: -1.0,
        minY: basementY,
        maxY: totalHeight * 0.6,
      }, // consuming: basement->floors
    ];

    for (const sp of splines) {
      const offsets = new Float32Array(particlesPerSpline);
      const dirs = new Float32Array(particlesPerSpline);
      const positions = new Float32Array(particlesPerSpline * 3);

      for (let p = 0; p < particlesPerSpline; p++) {
        offsets[p] = Math.random();
        dirs[p] = sp.dir;
        positions[p * 3] = sp.x;
        positions[p * 3 + 1] = 0;
        positions[p * 3 + 2] = sp.z;
      }

      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      particleGeo.setAttribute(
        "aOffset",
        new THREE.BufferAttribute(offsets, 1)
      );
      particleGeo.setAttribute(
        "aDirection",
        new THREE.BufferAttribute(dirs, 1)
      );

      const particleMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMinY: { value: sp.minY },
          uMaxY: { value: sp.maxY },
        },
        vertexShader: flowParticleVertexShader,
        fragmentShader: flowParticleFragmentShader,
        transparent: true,
        depthWrite: false,
      });

      const particles = new THREE.Points(particleGeo, particleMat);
      particles.userData = {
        type: "microgrid-flow",
        animated: true,
        direction: sp.dir > 0 ? "generating" : "consuming",
      };
      group.add(particles);
    }
    } // end if (renderPv) — flow particles

    // --- Horizontal distribution conduits per floor (from backbone to floor plates) ---
    const conduitMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      emissive: 0xeab308,
      emissiveIntensity: 0.15,
      metalness: 0.4,
      roughness: 0.4,
    });

    for (const floor of aboveFloors) {
      const conduitY = floor.y + 0.1;
      const conduitGeo = new THREE.CylinderGeometry(0.03, 0.03, footprintDepth * 0.5, 6);
      conduitGeo.rotateX(Math.PI / 2);
      const conduit = new THREE.Mesh(conduitGeo, conduitMat);
      conduit.position.set(riserX, conduitY, riserZ + footprintDepth * 0.25);
      conduit.userData = { type: "microgrid-floor-conduit" };
      group.add(conduit);
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
        obj instanceof THREE.LineSegments ||
        obj instanceof THREE.Points
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
