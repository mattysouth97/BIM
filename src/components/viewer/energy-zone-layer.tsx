"use client";

// src/components/viewer/energy-zone-layer.tsx
// Thin R3F mount for the 에너지존 (energy zone) analysis overlay.
//
// Zones are grouped and apportioned in
// src/lib/layers/analysis/zone-overlay.ts (formula documented in that module's
// header). This component supplies the snapshot and the HVAC demand from the
// real physics hook, and owns Three resource lifetime.

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";
import { useBimModelStore } from "@/store/bim-model-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { disposeObject3D } from "@/lib/layers/analysis/overlay-types";
import {
  buildEnergyZones,
  buildZoneOverlay,
  hasRoomElements,
  type EnergyZone,
} from "@/lib/layers/analysis/zone-overlay";

/**
 * Program zones for a building. Returns null when the active BIM snapshot holds
 * no Room elements — there is nothing to zone, and an empty legend beats a
 * fabricated one.
 */
export function useEnergyZoneAnalysis(buildingPk: string): EnergyZone[] | null {
  const snapshot = useBimModelStore((s) => s.snapshot);
  const metrics = useEnergyMetrics(buildingPk);

  return useMemo<EnergyZone[] | null>(() => {
    if (!snapshot || snapshot.buildingPk !== buildingPk) return null;
    if (!hasRoomElements(snapshot)) return null;
    // Heating + cooling site demand, kWh/yr — the quantity the zone
    // apportionment divides up.
    return buildEnergyZones(snapshot, metrics?.demand.totalDemand ?? 0);
  }, [snapshot, buildingPk, metrics]);
}

interface EnergyZoneLayerProps {
  buildingPk: string;
}

export function EnergyZoneLayer({ buildingPk }: EnergyZoneLayerProps) {
  const enabled = useLayerStore((s) => s.analysisOverlays["overlay-zone"]);
  const zones = useEnergyZoneAnalysis(buildingPk);

  // Lazy state initializer, not a ref: the group must be readable during render
  // to be handed to <primitive>.
  const [root] = useState(() => {
    const group = new THREE.Group();
    group.name = "analysis-zone-root";
    return group;
  });

  useEffect(() => {
    if (!enabled || !zones || zones.length === 0) return;

    const group = buildZoneOverlay(zones);
    root.add(group);

    return () => {
      root.remove(group);
      disposeObject3D(group);
    };
  }, [enabled, zones, root]);

  useEffect(() => {
    return () => {
      disposeObject3D(root);
      root.clear();
    };
  }, [root]);

  return <primitive object={root} visible={enabled} />;
}
