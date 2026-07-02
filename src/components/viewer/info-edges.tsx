"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

interface InfoEdgesProps {
  mesh: THREE.Mesh;
  visible?: boolean;
}

/**
 * InfoEdges — renders a wireframe-style edge overlay on a mesh using EdgesGeometry.
 * Uses 15-degree crease threshold to show only sharp silhouette edges.
 * Disposed on unmount to avoid GPU memory leaks.
 */
export function InfoEdges({ mesh, visible = true }: InfoEdgesProps) {
  const edgesGeometry = useMemo(() => {
    return new THREE.EdgesGeometry(mesh.geometry, 15);
  }, [mesh.geometry]);

  useEffect(() => {
    return () => {
      edgesGeometry.dispose();
    };
  }, [edgesGeometry]);

  return (
    <lineSegments
      geometry={edgesGeometry}
      visible={visible}
      matrixAutoUpdate={false}
      matrix={mesh.matrixWorld}
    >
      <lineBasicMaterial
        color="#1a1a2e"
        transparent
        opacity={0.35}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </lineSegments>
  );
}
