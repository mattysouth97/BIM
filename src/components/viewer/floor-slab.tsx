"use client";

import { useMemo } from "react";
import { usePlanStore } from "@/store/plan-store";

/**
 * FloorSlabs — renders horizontal slab planes for each floor level in 3D mode.
 *
 * In 3D mode: one slab per floor 0..floorCount-1 at y = sum of floor heights below.
 * In plan mode: skip rendering (the grid handles the 2D ground plane).
 */
export function FloorSlabs() {
  const walls = usePlanStore((s) => s.walls);
  const floorCount = usePlanStore((s) => s.floorCount);
  const floorHeights = usePlanStore((s) => s.floorHeights);
  const viewMode = usePlanStore((s) => s.viewMode);

  // Compute bounding box from all walls, add 1m padding
  const { width, depth, cx, cz } = useMemo(() => {
    if (walls.length === 0) {
      return { width: 10, depth: 10, cx: 0, cz: 0 };
    }
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.start[0], w.end[0]);
      maxX = Math.max(maxX, w.start[0], w.end[0]);
      minZ = Math.min(minZ, w.start[1], w.end[1]);
      maxZ = Math.max(maxZ, w.start[1], w.end[1]);
    }
    const pad = 1.0;
    return {
      width: (maxX - minX) + pad * 2,
      depth: (maxZ - minZ) + pad * 2,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
    };
  }, [walls]);

  // Only render in 3D mode
  if (viewMode !== "3d") return null;
  if (walls.length === 0) return null;

  // Build cumulative Y positions for each floor slab
  const slabs: Array<{ floor: number; y: number }> = [];
  let cumulativeY = 0;
  for (let f = 0; f < floorCount; f++) {
    slabs.push({ floor: f, y: cumulativeY });
    const h = floorHeights[f] ?? 3.0;
    cumulativeY += h;
  }

  return (
    <group>
      {slabs.map(({ floor, y }) => (
        <mesh
          key={floor}
          position={[cx, y, cz]}
          receiveShadow
        >
          <boxGeometry args={[width, 0.05, depth]} />
          <meshStandardMaterial color={0xe0e0e0} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
