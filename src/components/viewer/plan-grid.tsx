"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { usePlanStore } from "@/store/plan-store";

const GRID_EXTENT = 50; // 50m x 50m

/**
 * Grid overlay visible only in plan view mode.
 * Uses two GridHelper instances: fine grid (gridSize) and major grid (5m).
 */
export function PlanGrid() {
  const viewMode = usePlanStore((s) => s.viewMode);
  const gridSize = usePlanStore((s) => s.gridSize);

  const fineDivisions = useMemo(
    () => Math.round(GRID_EXTENT / gridSize),
    [gridSize]
  );

  if (viewMode !== "plan") return null;

  return (
    <group position={[0, 0.01, 0]}>
      {/* Fine grid */}
      <gridHelper
        args={[GRID_EXTENT, fineDivisions, new THREE.Color(0x999999), new THREE.Color(0xe0e0e0)]}
      />
      {/* Major grid every 5m */}
      <gridHelper
        args={[GRID_EXTENT, GRID_EXTENT / 5, new THREE.Color(0x999999), new THREE.Color(0x999999)]}
      />
    </group>
  );
}
