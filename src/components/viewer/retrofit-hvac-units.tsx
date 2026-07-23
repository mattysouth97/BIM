"use client";

// src/components/viewer/retrofit-hvac-units.tsx
// P2-23 — proposed rooftop heat-pump outdoor units, rendered when an hvac-*
// retrofit measure is applied. Like SolarPanels this is a physical preview
// of the change (new plant on the roof), carrying the shared emerald
// "proposed" emissive so it reads as not-yet-built.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import {
  RENEWED_EQUIPMENT_COLOR,
  PROPOSAL_EMISSIVE,
} from "@/lib/retrofit/measure-visuals";

const UNIT_W = 1.4; // m — typical commercial ODU module
const UNIT_H = 1.1;
const UNIT_D = 0.6;
const EDGE_MARGIN = 1.6; // m from the roof edge
const UNIT_GAP = 1.0;
const MAX_UNITS = 6;

export function RetrofitHvacUnits({ recipe }: { recipe: BuildingRecipe }) {
  const group = useMemo(() => {
    const above = recipe.floors.filter((f) => f.type === "above");
    if (above.length === 0) return null;

    const topY = Math.max(...above.map((f) => f.y + f.height));
    const roofType = recipe.roof?.type ?? "flat";
    const clearance =
      roofType === "flat"
        ? (recipe.roof?.flatThickness ?? 0.3) + 0.05
        : (recipe.roof?.gableHeight ?? 2) + 0.15;
    const y = topY + clearance + UNIT_H / 2;

    // One unit per ~8 m of frontage, 1..MAX_UNITS, along the front edge.
    const count = Math.min(
      MAX_UNITS,
      Math.max(1, Math.round(recipe.footprintWidth / 8)),
    );
    const rowWidth = count * UNIT_W + (count - 1) * UNIT_GAP;
    if (rowWidth > recipe.footprintWidth - 2 * EDGE_MARGIN) {
      // Very narrow building — single unit centered
      return buildUnits(1, 0, y, recipe.footprintDepth / 2 - EDGE_MARGIN);
    }
    return buildUnits(count, rowWidth, y, recipe.footprintDepth / 2 - EDGE_MARGIN);
  }, [recipe]);

  useEffect(() => {
    if (!group) return;
    return () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    };
  }, [group]);

  if (!group) return null;
  return <primitive object={group} />;
}

function buildUnits(count: number, rowWidth: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "retrofit-hvac-units";

  const bodyGeo = new THREE.BoxGeometry(UNIT_W, UNIT_H, UNIT_D);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: RENEWED_EQUIPMENT_COLOR,
    metalness: 0.5,
    roughness: 0.35,
    emissive: PROPOSAL_EMISSIVE,
    emissiveIntensity: 0.12,
  });
  const body = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
  body.castShadow = true;

  // Dark fan-grille face on the front of each unit
  const grillGeo = new THREE.BoxGeometry(UNIT_W * 0.82, UNIT_H * 0.7, 0.03);
  const grillMat = new THREE.MeshStandardMaterial({
    color: "#3f4650",
    metalness: 0.3,
    roughness: 0.6,
  });
  const grill = new THREE.InstancedMesh(grillGeo, grillMat, count);

  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : -rowWidth / 2 + UNIT_W / 2 + i * (UNIT_W + UNIT_GAP);
    m4.makeTranslation(x, y, z);
    body.setMatrixAt(i, m4);
    m4.makeTranslation(x, y, z + UNIT_D / 2 + 0.02);
    grill.setMatrixAt(i, m4);
  }
  body.instanceMatrix.needsUpdate = true;
  grill.instanceMatrix.needsUpdate = true;

  group.add(body, grill);
  return group;
}
