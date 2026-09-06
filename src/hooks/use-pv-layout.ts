"use client";

// src/hooks/use-pv-layout.ts
//
// The one PV layout every surface reads: `layoutRoofPlanes` over the roof
// planes the active building published to the scenario store. The 3D draws
// its modules, the legend counts them, and the economics prices its kWp —
// from this object, so the three cannot disagree. Null until a building has
// published planes; a building with no measured roof draws no PV and says so.

import { useMemo } from "react";
import { useScenarioStore } from "@/store/scenario-store";
import { layoutRoofPlanes, type PvLayoutResult } from "@/lib/retrofit/pv-layout";

export function usePvLayout(): PvLayoutResult | null {
  const roofPlanes = useScenarioStore((s) => s.roofPlanes);
  return useMemo(() => (roofPlanes ? layoutRoofPlanes(roofPlanes) : null), [roofPlanes]);
}
