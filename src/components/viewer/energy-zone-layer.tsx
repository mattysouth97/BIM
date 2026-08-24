"use client";

// src/components/viewer/energy-zone-layer.tsx
// Thin R3F mount for the 에너지존 (energy zone) analysis overlay.
//
// Zones are grouped and apportioned in
// src/lib/layers/analysis/zone-overlay.ts (formula documented in that module's
// header). This component supplies the snapshot and the HVAC demand from the
// real physics hook, and owns Three resource lifetime.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";
import { useBimModelStore } from "@/store/bim-model-store";
import { useSelectionStore } from "@/store/selection-store";
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

export interface EnergyZoneLayerProps {
  buildingPk: string;
  /** Receives stable canonical zone and room ids after a 3D pick. */
  onSelectZone?: (zoneId: string, roomId: string | null) => void;
  /**
   * Exact externally-computed analysis. Undefined keeps the ordinary viewer's
   * reactive hook path; null deliberately renders no result.
   */
  analysisOverride?: readonly EnergyZone[] | null;
}

export function EnergyZoneLayer({
  buildingPk,
  onSelectZone,
  analysisOverride,
}: EnergyZoneLayerProps) {
  if (analysisOverride !== undefined) {
    return (
      <EnergyZoneOverlayMount
        buildingPk={buildingPk}
        zones={analysisOverride}
        onSelectZone={onSelectZone}
      />
    );
  }
  return (
    <ViewerDerivedEnergyZoneLayer
      buildingPk={buildingPk}
      onSelectZone={onSelectZone}
    />
  );
}

function ViewerDerivedEnergyZoneLayer({
  buildingPk,
  onSelectZone,
}: Omit<EnergyZoneLayerProps, "analysisOverride">) {
  const zones = useEnergyZoneAnalysis(buildingPk);
  return (
    <EnergyZoneOverlayMount
      buildingPk={buildingPk}
      zones={zones}
      onSelectZone={onSelectZone}
    />
  );
}

function EnergyZoneOverlayMount({
  buildingPk,
  zones,
  onSelectZone,
}: Readonly<{
  buildingPk: string;
  zones: readonly EnergyZone[] | null;
  onSelectZone?: (zoneId: string, roomId: string | null) => void;
}>) {
  const enabled = useLayerStore((s) => s.analysisOverlays["overlay-zone"]);
  const selectedCanonical = useSelectionStore(
    (state) => state.selectedCanonical,
  );
  const selectedZoneKeys = useMemo(() => {
    if (
      !selectedCanonical ||
      selectedCanonical.buildingPk !== buildingPk ||
      !zones
    ) {
      return [];
    }
    const selectedIds = new Set(selectedCanonical.canonicalObjectIds);
    if (selectedCanonical.kind === "thermal_zone") {
      selectedIds.add(selectedCanonical.id);
    }
    return zones
      .filter((zone) => selectedIds.has(zone.key))
      .map((zone) => zone.key);
  }, [buildingPk, selectedCanonical, zones]);
  const selectCanonical = useSelectionStore((state) => state.selectCanonical);
  const selectLegacy = useSelectionStore((state) => state.select);

  // Lazy state initializer, not a ref: the group must be readable during render
  // to be handed to <primitive>.
  const [root] = useState(() => {
    const group = new THREE.Group();
    group.name = "analysis-zone-root";
    return group;
  });

  useEffect(() => {
    if (!enabled || !zones || zones.length === 0) return;

    const group = buildZoneOverlay(zones, { selectedZoneKeys });
    root.add(group);

    return () => {
      root.remove(group);
      disposeObject3D(group);
    };
  }, [enabled, zones, root, selectedZoneKeys]);

  const handleZoneClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const object = event.object;
      if (object.userData.type !== "analysis-energy-zone") return;

      const zoneId =
        typeof object.userData.zoneKey === "string"
          ? object.userData.zoneKey
          : null;
      if (!zoneId) return;

      event.stopPropagation();
      const roomIds = Array.isArray(object.userData.roomIdsByInstance)
        ? object.userData.roomIdsByInstance.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [];
      const roomId =
        typeof event.instanceId === "number"
          ? (roomIds[event.instanceId] ?? null)
          : null;
      const threeObjectId = object.name || `energy-zone:${zoneId}`;

      selectCanonical({
        kind: "thermal_zone",
        buildingPk,
        id: zoneId,
        documentId: null,
        canonicalObjectIds: roomId ? [zoneId, roomId] : [zoneId],
        threeObjectIds: [threeObjectId],
        ...(roomId ? { roomId } : {}),
      });
      if (roomId) selectLegacy("room", roomId, buildingPk);
      onSelectZone?.(zoneId, roomId);
    },
    [buildingPk, onSelectZone, selectCanonical, selectLegacy],
  );

  useEffect(() => {
    return () => {
      disposeObject3D(root);
      root.clear();
    };
  }, [root]);

  return (
    <primitive object={root} visible={enabled} onClick={handleZoneClick} />
  );
}
