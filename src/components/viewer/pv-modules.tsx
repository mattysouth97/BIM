"use client";

// src/components/viewer/pv-modules.tsx
//
// The PV modules a roof actually holds, drawn where the layout put them —
// stage 4 of the PV placement methodology. Two instanced batches (frame and
// cell face), composed from each module's own centre and quaternion.
// Nothing here decides placement: the layout (`usePvLayout`) is
// the single source the twin, the model pages, the legend and the economics
// all read, so the count drawn here is the count priced.
//
// `centre` is the scene offset the host viewer already applies to the
// building (the model-page viewer recentres the whole GLB); the twin passes
// none because its recipe is already at the origin.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { PvLayoutResult } from "@/lib/retrofit/pv-layout";
import { createPvModuleVisual } from "@/lib/rendering/pv-module-visual";

export function pvModuleInstances(layout: PvLayoutResult | null) {
  return layout ? layout.planes.flatMap((p) => p.modules) : [];
}

export function PvModulesVisual({
  layout,
  centre,
  onDrawn,
}: {
  layout: PvLayoutResult | null;
  centre?: THREE.Vector3;
  /** Reports the instanced count, so a page can assert legend = drawn. */
  onDrawn?: (count: number) => void;
}) {
  const modules = useMemo(() => pvModuleInstances(layout), [layout]);

  const visual = useMemo(() => createPvModuleVisual(modules), [modules]);

  useEffect(() => {
    onDrawn?.(modules.length);
  }, [modules.length, onDrawn]);

  useEffect(() => {
    if (!visual) return;
    return () => visual.dispose();
  }, [visual]);

  if (!visual) return null;
  return (
    <group position={centre ? [-centre.x, -centre.y, -centre.z] : [0, 0, 0]}>
      <primitive object={visual.group} />
    </group>
  );
}
