"use client";

// src/components/viewer/solar-panels.tsx
// P2-20 — rooftop PV array rendered when the user applies a solar-pv-*
// retrofit measure. Purely visual (a single InstancedMesh of tilted panels);
// the energy/finance math lives in solar-potential.ts and is unaffected.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import {
  finishedRoofTopY,
  tiltedBoxClearance,
} from "@/lib/procedural/roof-surface";

const PANEL_W = 1.7; // m, landscape module width
const PANEL_D = 1.1; // m, module depth
const PANEL_T = 0.06; // m, visual thickness
const TILT_RAD = THREE.MathUtils.degToRad(30); // typical Korean fixed-tilt
const ROOF_MARGIN = 1.2; // m, keep-out from parapet
const COL_PITCH = PANEL_W + 0.15;
const ROW_PITCH = 2.4; // row spacing to avoid self-shading
const MAX_PANELS = 600; // instancing cap for very large footprints

export function SolarPanels({ recipe }: { recipe: BuildingRecipe }) {
  const mesh = useMemo(() => {
    const above = recipe.floors.filter((f) => f.type === "above");
    if (above.length === 0) return null;

    // Sit on the finished roof top, then lift by the tilted-module sag so
    // the trailing edge does not cut through the slab / ridge.
    const y =
      finishedRoofTopY(recipe) +
      tiltedBoxClearance(PANEL_D / 2, PANEL_T / 2, TILT_RAD) +
      0.04;

    const usableW = recipe.footprintWidth - 2 * ROOF_MARGIN;
    const usableD = recipe.footprintDepth - 2 * ROOF_MARGIN;
    const cols = Math.floor(usableW / COL_PITCH);
    const rows = Math.floor(usableD / ROW_PITCH);
    if (cols <= 0 || rows <= 0) return null;

    const count = Math.min(cols * rows, MAX_PANELS);
    const geo = new THREE.BoxGeometry(PANEL_W, PANEL_T, PANEL_D);
    const mat = new THREE.MeshStandardMaterial({
      color: "#1e3a5f",
      metalness: 0.6,
      roughness: 0.25,
      // Shared "proposed" accent — differentiates the preview from built PV
      emissive: "#34d399",
      emissiveIntensity: 0.12,
    });
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.name = "solar-panels";
    im.castShadow = true;

    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-TILT_RAD, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    let i = 0;
    for (let r = 0; r < rows && i < count; r++) {
      for (let c = 0; c < cols && i < count; c++) {
        m4.compose(
          new THREE.Vector3(
            -usableW / 2 + COL_PITCH * (c + 0.5),
            y,
            -usableD / 2 + ROW_PITCH * (r + 0.5),
          ),
          quat,
          scale,
        );
        im.setMatrixAt(i, m4);
        i++;
      }
    }
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [recipe]);

  useEffect(() => {
    if (!mesh) return;
    return () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [mesh]);

  if (!mesh) return null;
  return <primitive object={mesh} />;
}
