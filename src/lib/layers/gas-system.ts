// src/lib/layers/gas-system.ts
// Gas supply system (가스설비) — era-aware per building-code-rules:
//
// City gas (도시가스, 1990+ permits): underground service line from the
// street, exterior wall meter, and an EXPOSED yellow riser climbing the +Z
// facade — 도시가스사업법 시행규칙 requires gas piping to run exposed on the
// exterior wall, never buried inside it, which is why Korean facades carry
// visible yellow pipe runs. Per-floor branches punch through the wall to the
// stacked kitchen zone; a basement feed serves the boiler plant.
//
// LPG (pre-1990 permits): a cylinder cage at the rear exterior corner with a
// regulator, riser climbing the rear facade, and the same per-floor kitchen
// branches (longer interior runs — exactly how retrofitted low-rise stock
// is piped).
//
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";
import { computeCoreLayout } from "./core-layout";
import { getBuildingCodeRules } from "./building-code-rules";
import {
  ASSET_NATIVE_DIMS,
  getEquipmentObjectClone,
  tagEquipmentObject,
} from "@/lib/equipment-assets";

/** Korean gas-pipe yellow (황색 도장) */
const GAS_YELLOW = 0xfacc15;
const PIPE_RADIUS = 0.035;
const PIPE_SEGMENTS = 8;

/** Straight tube between two points. */
function pipeSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material
): THREE.Mesh {
  const curve = new THREE.LineCurve3(a, b);
  const geo = new THREE.TubeGeometry(curve, 1, radius, PIPE_SEGMENTS, false);
  return new THREE.Mesh(geo, mat);
}

/** Poly-line pipe run (axis-aligned L/Z runs) with a mesh per segment. */
function pipeRun(
  group: THREE.Group,
  points: THREE.Vector3[],
  radius: number,
  mat: THREE.Material,
  userData: Record<string, unknown>
): void {
  for (let i = 0; i < points.length - 1; i++) {
    const seg = pipeSegment(points[i], points[i + 1], radius, mat);
    seg.userData = { ...userData };
    group.add(seg);
  }
}

/**
 * GasLayer generates the era-appropriate gas supply system:
 * service entry (city gas or LPG cage), meter/regulator, exterior riser,
 * per-floor kitchen branches with shut-off valves, and the boiler feed.
 */
export class GasLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density = 1.0): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "gas-system";

    const { floors, footprintDepth } = recipe;
    const aboveFloors = floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0) {
      this.group = group;
      return group;
    }

    const hd = footprintDepth / 2;
    const layout = computeCoreLayout(recipe);
    const rules = getBuildingCodeRules(recipe);

    const pipeMat = new THREE.MeshStandardMaterial({
      color: GAS_YELLOW,
      emissive: GAS_YELLOW,
      emissiveIntensity: 0.25,
      roughness: 0.45,
      metalness: 0.5,
    });

    // Riser location depends on the supply era: city gas climbs the front
    // (+Z) facade above the meter; LPG climbs the rear facade above the cage.
    const riserX = rules.gasSupply === "city-gas" ? layout.gasRiser.x : layout.lpgCage.x;
    const riserZ = rules.gasSupply === "city-gas" ? layout.gasRiser.z : -hd - 0.2;

    if (rules.gasSupply === "city-gas") {
      // --- Underground service line from the street to the meter ---
      pipeRun(
        group,
        [
          new THREE.Vector3(layout.gasMeter.x, -0.8, hd + 4.0),
          new THREE.Vector3(layout.gasMeter.x, -0.8, layout.gasMeter.z),
          new THREE.Vector3(layout.gasMeter.x, 0.45, layout.gasMeter.z),
        ],
        PIPE_RADIUS * 1.2,
        pipeMat,
        { type: "gas-service-line" }
      );

      // --- Wall meter at the base of the riser (base-origin asset) ---
      const meterAsset = getEquipmentObjectClone("gas-meter");
      if (meterAsset) {
        meterAsset.position.set(layout.gasMeter.x, 0.45, layout.gasMeter.z);
        tagEquipmentObject(
          meterAsset,
          { type: "gas-meter" },
          { castShadow: true, receiveShadow: true }
        );
        group.add(meterAsset);
      } else {
        const native = ASSET_NATIVE_DIMS["gas-meter"];
        const meterBox = new THREE.Mesh(
          new THREE.BoxGeometry(native.w, native.h * 0.6, native.d),
          new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.4, roughness: 0.5 })
        );
        meterBox.position.set(layout.gasMeter.x, 0.45 + native.h * 0.3, layout.gasMeter.z);
        meterBox.userData = { type: "gas-meter" };
        group.add(meterBox);
      }
    } else {
      // --- LPG cylinder cage at the rear exterior corner (base-origin) ---
      const cageAsset = getEquipmentObjectClone("lpg-tank");
      if (cageAsset) {
        cageAsset.position.set(layout.lpgCage.x, 0, layout.lpgCage.z);
        tagEquipmentObject(
          cageAsset,
          { type: "gas-lpg-cage" },
          { castShadow: true, receiveShadow: true }
        );
        group.add(cageAsset);
      } else {
        const native = ASSET_NATIVE_DIMS["lpg-tank"];
        const cageBox = new THREE.Mesh(
          new THREE.BoxGeometry(native.w, native.h, native.d),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.5 })
        );
        cageBox.position.set(layout.lpgCage.x, native.h / 2, layout.lpgCage.z);
        cageBox.userData = { type: "gas-lpg-cage" };
        group.add(cageBox);
      }

      // Regulator run from the cage to the rear riser base
      pipeRun(
        group,
        [
          new THREE.Vector3(layout.lpgCage.x, 1.3, layout.lpgCage.z),
          new THREE.Vector3(riserX, 1.3, riserZ),
        ],
        PIPE_RADIUS * 0.8,
        pipeMat,
        { type: "gas-service-line" }
      );
    }

    // --- Exposed exterior riser (노출 배관 — 도시가스사업법) ---
    const riserTop = aboveFloors[aboveFloors.length - 1].y + 1.2;
    pipeRun(
      group,
      [
        new THREE.Vector3(riserX, rules.gasSupply === "city-gas" ? 0.9 : 1.3, riserZ),
        new THREE.Vector3(riserX, riserTop, riserZ),
      ],
      PIPE_RADIUS,
      pipeMat,
      { type: "gas-riser" }
    );

    // --- Per-floor kitchen branches + shut-off valves ---
    const kitchen = layout.wetZones.kitchen;
    for (const floor of aboveFloors) {
      const pipeY = floor.y + 1.0; // counter height

      // From the exterior riser, through the wall, to the stacked kitchen zone
      pipeRun(
        group,
        [
          new THREE.Vector3(riserX, pipeY, riserZ),
          new THREE.Vector3(riserX, pipeY, kitchen.z),
          new THREE.Vector3(kitchen.x, pipeY, kitchen.z),
        ],
        PIPE_RADIUS * 0.7,
        pipeMat,
        { type: "gas-branch", floorNo: floor.floorNo }
      );

      // Shut-off valve at the kitchen end (detailed asset or small box)
      const valveAsset = getEquipmentObjectClone("gas-valve-station");
      if (valveAsset) {
        valveAsset.position.set(kitchen.x, pipeY - 0.07, kitchen.z);
        tagEquipmentObject(valveAsset, { type: "gas-valve", floorNo: floor.floorNo });
        group.add(valveAsset);
      } else {
        const valveBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.1, 0.1),
          pipeMat.clone()
        );
        valveBox.position.set(kitchen.x, pipeY, kitchen.z);
        valveBox.userData = { type: "gas-valve", floorNo: floor.floorNo };
        group.add(valveBox);
      }
    }

    // --- Basement boiler feed (heating plant sits at the plant-room centre) ---
    pipeRun(
      group,
      [
        new THREE.Vector3(riserX, 0.5, riserZ),
        new THREE.Vector3(riserX, -1.5, riserZ),
        new THREE.Vector3(riserX, -1.5, 0),
        new THREE.Vector3(0, -1.5, 0),
      ],
      PIPE_RADIUS * 0.9,
      pipeMat,
      { type: "gas-boiler-feed" }
    );

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
          mat.forEach((m: THREE.Material) => m.dispose());
        } else if (mat) {
          (mat as THREE.Material).dispose();
        }
      }
    });
    this.group = null;
  }
}
