"use client";

// src/components/viewer/context-massing.tsx
// P2-26 — Renders surrounding buildings as gray extrusions for solar/shading context.
// Mounted in building-scene.tsx single-building path only (not campus), only when
// footprintData?.polygon exists.

import { useMemo } from "react";
import * as THREE from "three";
import { useNeighborMassing } from "@/hooks/use-neighbor-massing";
import { toLocalNeighbors } from "@/lib/context-massing";

/** MeshStandardMaterial shared across all neighbor meshes — avoids per-mesh allocations. */
const NEIGHBOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: "#cfcfcf",
  roughness: 0.95,
});

interface ContextMassingProps {
  /**
   * WGS84 centroid of the subject building's outer ring, as [lng, lat].
   * Computed by the caller from footprintData.polygon[0].
   * Pass null to suppress fetching/rendering entirely.
   */
  centerLngLat: [number, number] | null;
  /**
   * Subject building's WGS84 outer ring ([lng, lat] pairs).
   * Used to exclude the subject itself from the neighbor list.
   */
  subjectOuterRing: [number, number][] | null;
}

export function ContextMassing({ centerLngLat, subjectOuterRing }: ContextMassingProps) {
  const { data } = useNeighborMassing(centerLngLat);

  const localNeighbors = useMemo(() => {
    if (!data?.neighbors || !centerLngLat || !subjectOuterRing) return [];
    return toLocalNeighbors(
      data.neighbors,
      centerLngLat[0],
      centerLngLat[1],
      subjectOuterRing
    );
  }, [data, centerLngLat, subjectOuterRing]);

  if (localNeighbors.length === 0) return null;

  return (
    <group name="context-massing">
      {localNeighbors.map((neighbor, i) => {
        // Build THREE.Shape from projected [x, z] points
        const shape = new THREE.Shape();
        const [first, ...rest] = neighbor.points;
        if (!first) return null;
        shape.moveTo(first[0], first[1]);
        for (const pt of rest) {
          shape.lineTo(pt[0], pt[1]);
        }
        shape.closePath();

        // ExtrudeGeometry: depth = height, extruded along Z, then rotate to lay flat in XZ plane
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: neighbor.height,
          bevelEnabled: false,
        });

        // ExtrudeGeometry extrudes along local Z. Rotate -90° around X so it stands vertically
        // in the Three.js Y-up world (x/z footprint → x/y extrusion → rotate to x/z/y).
        geometry.rotateX(-Math.PI / 2);

        return (
          <mesh
            key={i}
            geometry={geometry}
            material={NEIGHBOR_MATERIAL}
            castShadow
            receiveShadow
          />
        );
      })}
    </group>
  );
}
