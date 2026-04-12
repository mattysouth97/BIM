// src/lib/layers/energy-heatmap-builder.ts
// Pure Three.js factory for per-floor energy consumption heatmap planes.
// No React, no Zustand, no "use client". Safe to import in server context.
//
// EA-03: Each above-ground floor renders a horizontal PlaneGeometry mesh
// color-coded by kWh/m²·yr using Korean 10-grade thresholds from energy-grade.ts.
// Planes live in the "energy-zones" layer group — independent of structural geometry.

import * as THREE from "three";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { getEnergyGrade, getGradeColor } from "@/lib/energy/energy-grade";

/** Name of the heatmap child group inside the energy-zones layer group. */
export const HEATMAP_GROUP_NAME = "energy-heatmap";

/**
 * Y-axis lift (meters) applied to each heatmap plane above the floor slab.
 * 2 cm prevents z-fighting with the structural slab InstancedMesh.
 * Must be in [0.01, 0.05] per plan spec.
 */
export const HEATMAP_Y_OFFSET = 0.02;

/**
 * Map a kWh/m²·yr scalar to a THREE.Color using the existing 10-grade
 * Korean energy threshold scale (MOTIE/KEMCO standard).
 *
 * Delegates entirely to getEnergyGrade + getGradeColor — no duplicate
 * threshold table here (D-03: single source of truth).
 */
export function kwhmToColor(kwh: number): THREE.Color {
  return new THREE.Color(getGradeColor(getEnergyGrade(kwh)));
}

/**
 * Build a named THREE.Group of horizontal floor planes color-coded by
 * kWh/m²·yr energy intensity.
 *
 * @param floors       All FloorSpec entries from the BuildingRecipe (above + below).
 *                     Only floors with type === "above" produce meshes.
 * @param perFloorKwh  kWh/m²·yr per above-grade floor. Index 0 = lowest above-grade
 *                     floor (matches Phase 23 SystemBreakdown.perFloor convention).
 *                     Missing indices default to 0 (Grade 1+++ color, graceful degradation).
 * @param recipe       BuildingRecipe providing footprintWidth / footprintDepth for plane sizing.
 * @returns            THREE.Group named "energy-heatmap" containing one mesh per above-grade floor.
 */
export function buildEnergyHeatmap(
  floors: FloorSpec[],
  perFloorKwh: number[],
  recipe: BuildingRecipe
): THREE.Group {
  const group = new THREE.Group();
  group.name = HEATMAP_GROUP_NAME;

  // Filter to above-grade only — MUST match Phase 23's perFloor indexing convention
  // (Pitfall 4: index mismatch causes wrong colors on floors)
  const aboveFloors = floors.filter((f) => f.type === "above");

  aboveFloors.forEach((floor, i) => {
    // Graceful degradation: missing perFloorKwh entries default to 0 (Grade 1+++ — best)
    const kwh = perFloorKwh[i] ?? 0;
    const color = kwhmToColor(kwh);

    // PlaneGeometry in XY plane, rotated to horizontal (normal = +Y) per Pitfall 3
    const geo = new THREE.PlaneGeometry(
      recipe.footprintWidth,
      recipe.footprintDepth,
      2, // widthSegments — 9 vertices total is sufficient for a uniform color plane
      2  // heightSegments
    );
    geo.rotateX(-Math.PI / 2); // XY → XZ plane (horizontal, normal +Y)

    // Fill vertex color buffer — all vertices receive the same floor color
    const vertexCount = geo.attributes.position.count;
    const colors = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
      colors[v * 3]     = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false, // Pitfall 2: prevents visual holes in structural geometry
    });

    const mesh = new THREE.Mesh(geo, mat);
    // Lift 2 cm above slab to prevent z-fighting (HEATMAP_Y_OFFSET)
    mesh.position.y = floor.y + HEATMAP_Y_OFFSET;
    // Pitfall 2: explicit render order ensures transparent planes draw after opaque geometry
    mesh.renderOrder = 1;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = { type: "energy-heatmap-floor", floorNo: floor.floorNo };

    group.add(mesh);
  });

  return group;
}

/**
 * Targeted disposal of the named "energy-heatmap" child group from
 * the energy-zones layer group.
 *
 * Do NOT call LayerManager.disposeLayer("energy-zones") here — that would
 * destroy all energy-zones content including non-heatmap geometry (D-06).
 * Instead, find the named child group, traverse-dispose its meshes, and remove it.
 *
 * @param energyZonesGroup  The THREE.Group returned by manager.getGroup("energy-zones")
 */
export function disposeHeatmapGroup(energyZonesGroup: THREE.Group): void {
  const old = energyZonesGroup.getObjectByName(HEATMAP_GROUP_NAME);
  if (!old) return;

  old.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        (mat as THREE.Material).dispose();
      }
    }
  });

  energyZonesGroup.remove(old);
}
