// src/lib/layers/layer-7-lighting.ts
// Layer 7: Electrical Lighting 조명
// Glowing yellow/white ceiling fixture grids with simulated dimming,
// daylight sensor nodes near windows.
// Pure Three.js, no React.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import type { LightingFixtureParams, ElectricalPanelParams } from "./mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "./mep-equipment-params";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentGeometryClone,
  getEquipmentMaterialClone,
} from "@/lib/equipment-assets";
import {
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "./equipment-scenario";

const LIGHT_YELLOW = 0xfbbf24;
// Cool-white glow for the LED retrofit variant
const LED_WHITE = 0xdbeafe;

// Fixture shader — emissiveIntensity animated by uTime for dimming simulation
const fixtureVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vInstancePos;
  void main() {
    vUv = uv;
    // Extract instance translation for per-fixture variation
    vInstancePos = vec3(
      instanceMatrix[3][0],
      instanceMatrix[3][1],
      instanceMatrix[3][2]
    );
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fixtureFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vInstancePos;

  void main() {
    // Per-fixture dimming phase based on spatial position
    float phase = sin(vInstancePos.x * 0.5 + vInstancePos.z * 0.7) * 0.5 + 0.5;

    // Simulate daylight-linked dimming: oscillates between 30% and 100%
    float dimCycle = sin(uTime * 0.5 + phase * 3.14159) * 0.5 + 0.5;
    float dimLevel = 0.3 + 0.7 * dimCycle;

    // Soft glow from center
    float centerDist = length(vUv - vec2(0.5));
    float glow = 1.0 - smoothstep(0.0, 0.5, centerDist);

    vec3 color = uColor * dimLevel;
    float emissive = glow * dimLevel * 1.5;
    vec3 finalColor = color + vec3(emissive);

    float alpha = (0.4 + 0.6 * dimLevel) * (0.5 + 0.5 * glow);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Build merged lighting fixture geometry: main housing body + optional diffuser face on bottom.
 * The diffuser panel is slightly wider than the body and sits flush on the emitting face.
 */
function buildFixtureGeometry(p: LightingFixtureParams): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(p.width, p.height, p.depth);

  if (!p.showDiffuserFace) return body;

  // Diffuser panel — slightly wider, thin, on the BOTTOM face (light-emitting side)
  const diffuser = new THREE.BoxGeometry(p.width * 1.1, 0.015, p.depth * 1.1);
  diffuser.translate(0, -(p.height / 2 + 0.0075), 0);

  return mergeGeometries([body, diffuser]);
}

/**
 * Build merged electrical panel geometry: cabinet box + optional door outline on front face
 * + optional breaker strip.
 */
function buildPanelGeometry(p: ElectricalPanelParams): THREE.BufferGeometry {
  const cabinet = new THREE.BoxGeometry(p.width, p.height, p.depth);
  const pieces: THREE.BufferGeometry[] = [cabinet];

  if (p.showDoorOutline) {
    // Door panel — slightly inset rectangle on +Z face, thin extrusion
    const door = new THREE.BoxGeometry(p.width * 0.88, p.height * 0.9, 0.015);
    door.translate(0, 0, p.depth / 2 + 0.0075);
    pieces.push(door);
  }

  if (p.showBreakerGrid) {
    // Simple horizontal breaker strip — single thin bar on door face
    // (Full breaker grid is not worth the geometry cost — keep silhouette subtle)
    const strip = new THREE.BoxGeometry(p.width * 0.7, 0.03, 0.02);
    strip.translate(0, 0, p.depth / 2 + 0.016);
    pieces.push(strip);
  }

  return mergeGeometries(pieces);
}

/**
 * LightingLayer generates ceiling lighting infrastructure:
 * - InstancedMesh of fixture boxes (height 0.10m default, with diffuser face) on 2D ceiling grid per floor
 * - ShaderMaterial with animated dimming (emissiveIntensity via uTime)
 * - Daylight sensor nodes (small spheres) near window perimeter
 * - Electrical panel InstancedMesh with door outline geometry (one per floor)
 */
export class LightingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density: number = 1.0,
    equipParams: {
      fixture?: Partial<LightingFixtureParams>;
      panel?: Partial<ElectricalPanelParams>;
    } = {},
    scenario: EquipmentScenario = SHOWCASE_EQUIPMENT_SCENARIO
  ): THREE.Group {
    this.dispose();

    const fixtureParams: LightingFixtureParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.lightingFixture,
      ...equipParams.fixture,
    };
    const panelParams: ElectricalPanelParams = {
      ...DEFAULT_MEP_EQUIPMENT_PARAMS.electricalPanel,
      ...equipParams.panel,
    };

    const group = new THREE.Group();
    group.name = "layer-7-lighting";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hw = footprintWidth / 2;
    const hd = footprintDepth / 2;

    // --- Fixture grid parameters ---
    const gridSpacingX = Math.max(1.5, 3.0 / density);
    const gridSpacingZ = Math.max(1.5, 3.0 / density);

    // Calculate grid positions (same for each floor)
    const gridPositions: { x: number; z: number }[] = [];
    const startX = -hw + 1.0;
    const endX = hw - 1.0;
    const startZ = -hd + 1.0;
    const endZ = hd - 1.0;

    for (let x = startX; x <= endX; x += gridSpacingX) {
      for (let z = startZ; z <= endZ; z += gridSpacingZ) {
        gridPositions.push({ x, z });
      }
    }

    const fixturesPerFloor = gridPositions.length;
    const totalFixtures = fixturesPerFloor * aboveFloors.length;

    if (totalFixtures > 0) {
      // --- InstancedMesh for all fixtures — merged geometry with diffuser face ---
      // SCENARIO-DEPENDENT hardware: the LED retrofit measure swaps the legacy
      // louvred fluorescent troffer for a slim LED flat panel (and shifts the
      // glow from warm yellow to cool white). Animated dimming shader kept.
      const fixtureAssetId = scenario.lightingLed ? "light-fixture-led" : "light-fixture";
      const fixtureDetailedGeo = getEquipmentGeometryClone(fixtureAssetId);
      if (fixtureDetailedGeo) {
        const native = ASSET_NATIVE_DIMS[fixtureAssetId];
        fixtureDetailedGeo.scale(
          fixtureParams.width / native.w,
          // LED panels keep their slim authored height — only the legacy
          // troffer follows the height param.
          scenario.lightingLed ? 1 : fixtureParams.height / native.h,
          fixtureParams.depth / native.d
        );
      }
      const fixtureGeo =
        fixtureDetailedGeo ??
        (scenario.lightingLed
          ? new THREE.BoxGeometry(fixtureParams.width, 0.035, fixtureParams.depth)
          : buildFixtureGeometry(fixtureParams));
      const fixtureMat = new THREE.ShaderMaterial({
        vertexShader: fixtureVertexShader,
        fragmentShader: fixtureFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uColor: {
            value: new THREE.Color(scenario.lightingLed ? LED_WHITE : LIGHT_YELLOW),
          },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const fixtureIM = new THREE.InstancedMesh(fixtureGeo, fixtureMat, totalFixtures);
      fixtureIM.userData = {
        type: "lighting-fixture",
        instancesPerFloor: fixturesPerFloor,
      };

      const mat4 = new THREE.Matrix4();
      let idx = 0;

      for (const floor of aboveFloors) {
        const ceilingY = floor.y + floor.height - 0.2;

        for (const gp of gridPositions) {
          mat4.makeTranslation(gp.x, ceilingY, gp.z);
          fixtureIM.setMatrixAt(idx++, mat4);
        }
      }

      fixtureIM.count = idx;
      fixtureIM.instanceMatrix.needsUpdate = true;
      group.add(fixtureIM);
    }

    // --- Daylight sensor nodes near windows (perimeter) ---
    const sensorGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const sensorMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: LIGHT_YELLOW,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.2,
    });

    // Place sensors along perimeter at window midpoints, 4 per floor side
    const sensorsPerSide = 4;
    const totalSensors = aboveFloors.length * sensorsPerSide * 4; // 4 sides
    const sensorIM = new THREE.InstancedMesh(sensorGeo, sensorMat, totalSensors);
    sensorIM.userData = {
      type: "lighting-sensor",
      instancesPerFloor: sensorsPerSide * 4,
    };

    let sIdx = 0;
    const sensorMat4 = new THREE.Matrix4();

    for (const floor of aboveFloors) {
      const sensorY = floor.y + floor.height - 0.4;

      // Front and back walls (-Z and +Z)
      for (let i = 0; i < sensorsPerSide; i++) {
        const x = -hw + (i + 1) * (footprintWidth / (sensorsPerSide + 1));
        // Front
        sensorMat4.makeTranslation(x, sensorY, -hd + 0.3);
        sensorIM.setMatrixAt(sIdx++, sensorMat4);
        // Back
        sensorMat4.makeTranslation(x, sensorY, hd - 0.3);
        sensorIM.setMatrixAt(sIdx++, sensorMat4);
      }

      // Left and right walls (-X and +X)
      for (let i = 0; i < sensorsPerSide; i++) {
        const z = -hd + (i + 1) * (footprintDepth / (sensorsPerSide + 1));
        // Left
        sensorMat4.makeTranslation(-hw + 0.3, sensorY, z);
        sensorIM.setMatrixAt(sIdx++, sensorMat4);
        // Right
        sensorMat4.makeTranslation(hw - 0.3, sensorY, z);
        sensorIM.setMatrixAt(sIdx++, sensorMat4);
      }
    }

    sensorIM.count = sIdx;
    sensorIM.instanceMatrix.needsUpdate = true;
    group.add(sensorIM);

    // --- Electrical panel boxes (배전반, one per floor, near core) ---
    // Detailed distribution-board Blender asset (0.5×0.8×0.18, centre origin)
    // scaled to params, or merged door-outline fallback.
    const panelDetailedGeo = getEquipmentGeometryClone("electrical-panel");
    if (panelDetailedGeo) {
      const native = ASSET_NATIVE_DIMS["electrical-panel"];
      panelDetailedGeo.scale(
        panelParams.width / native.w,
        panelParams.height / native.h,
        panelParams.depth / native.d
      );
    }
    const panelGeo = panelDetailedGeo ?? buildPanelGeometry(panelParams);
    const panelMat =
      (panelDetailedGeo ? getEquipmentMaterialClone("electrical-panel") : null) ??
      new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        roughness: 0.4,
        metalness: 0.6,
      });
    const panelIM = new THREE.InstancedMesh(panelGeo, panelMat, aboveFloors.length);
    panelIM.userData = { type: "lighting-panel", instancesPerFloor: 1 };

    for (let i = 0; i < aboveFloors.length; i++) {
      const floor = aboveFloors[i];
      const panelY = floor.y + floor.height * 0.5;
      sensorMat4.makeTranslation(0.5, panelY, 0.5);
      panelIM.setMatrixAt(i, sensorMat4);
    }
    panelIM.instanceMatrix.needsUpdate = true;
    group.add(panelIM);

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
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
