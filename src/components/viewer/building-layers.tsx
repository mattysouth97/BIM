"use client";

import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useLayerStore } from "@/store/layer-store";
import { LayerManager } from "@/lib/layers/layer-manager";
import { ALL_LAYER_IDS, MEP_SUB_IDS } from "@/lib/layers/types";
import { useEnergyBreakdown } from "@/hooks/use-energy-breakdown";
import { useRecipeStore } from "@/store/recipe-store";
import {
  buildEnergyHeatmap,
  disposeHeatmapGroup,
} from "@/lib/layers/energy-heatmap-builder";
import { CoolingLayer } from "@/lib/layers/layer-3-cooling";
import { HeatingLayer } from "@/lib/layers/layer-4-heating";
import { VentilationLayer } from "@/lib/layers/layer-5-ventilation";
import { DHWLayer } from "@/lib/layers/layer-6-dhw";
import { LightingLayer } from "@/lib/layers/layer-7-lighting";
import { ElectricalRoutingLayer } from "@/lib/layers/electrical-routing";
import { MicrogridLayer } from "@/lib/layers/layer-14-microgrid";
import { BASLayer } from "@/lib/layers/layer-10-bas";
import { SafetyLayer } from "@/lib/layers/layer-13-safety";
import { TransportLayer } from "@/lib/layers/layer-12-transport";
import { useEquipmentAssets } from "@/hooks/use-equipment-assets";
import {
  setupMepSubGroups,
  assignToSubGroup,
} from "@/lib/layers/mep-coordinator";
import { useEquipmentStore } from "@/store/equipment-store";
import { useScenarioStore } from "@/store/scenario-store";
import { deriveEquipmentScenario } from "@/lib/layers/equipment-scenario";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";

interface BuildingLayersProps {
  buildingPk?: string;
}

export function BuildingLayers({ buildingPk }: BuildingLayersProps) {
  const managerRef = useRef<LayerManager | null>(null);

  const visibility = useLayerStore((s) => s.visibility);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const density = useLayerStore((s) => s.density);

  // Heatmap data — call hooks unconditionally (Rules of Hooks); gate downstream work with pk check
  const pk = buildingPk ?? "";
  const breakdown = useEnergyBreakdown(pk);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[pk]);
  const overrides = useRecipeStore((s) => s.overrides[pk]);

  // Equipment params for MEP generators — snapshot-safe selector, falls back to defaults
  const equipmentParams = useEquipmentStore((s) => s.params[pk]) ?? DEFAULT_MEP_EQUIPMENT_PARAMS;

  // Green-retrofit hardware scenario: the knapsack-selected measures decide
  // WHICH physical equipment renders (boiler vs condensing cascade vs ASHP
  // bank, fluorescent vs LED, PV present or not). Changing budget/track in
  // the scenario rail regenerates the MEP layers with the swapped hardware.
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  const equipmentScenario = useMemo(
    () => deriveEquipmentScenario(selectedMeasureIds),
    [selectedMeasureIds]
  );

  // Detailed Blender GLB assets — regenerate MEP geometry once preloaded so
  // the synchronous generators swap their coarse fallbacks for real models.
  const equipmentAssetsReady = useEquipmentAssets();

  // Derive effective recipe geometry (footprint + floors) for heatmap sizing.
  // Mirrors the merge logic in use-energy-breakdown.ts — footprint overrides only.
  const effectiveRecipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return {
      ...baseRecipe,
      ...(overrides.footprintWidth !== undefined
        ? { footprintWidth: overrides.footprintWidth }
        : {}),
      ...(overrides.footprintDepth !== undefined
        ? { footprintDepth: overrides.footprintDepth }
        : {}),
    };
  }, [baseRecipe, overrides]);

  // Create LayerManager once
  if (managerRef.current == null) {
    managerRef.current = new LayerManager();
  }

  // Sync visibility state to Three.js groups
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    for (const id of ALL_LAYER_IDS) {
      manager.setVisible(id, visibility[id]);
    }
  }, [visibility]);

  // Sync MEP sub-layer visibility to Three.js sub-groups.
  // Depends on both mepSubVisibility AND visibility so that when the main MEP toggle
  // goes off→on (Three.js re-shows all children), sub-group states are immediately
  // re-applied, preventing the "all show" bug documented in 22-RESEARCH.md Pitfall 2.
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    for (const subId of MEP_SUB_IDS) {
      manager.setMepSubVisible(subId, mepSubVisibility[subId]);
    }
  }, [mepSubVisibility, visibility]);

  // Heatmap rebuild — runs when energy breakdown or effective recipe changes.
  // Dependency array [buildingPk, breakdown, effectiveRecipe] per Pitfall 5:
  // breakdown is a stable memoized reference from useEnergyBreakdown (Phase 23 guarantee).
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const energyGroup = manager.getGroup("energy-zones");

    // Always dispose previous heatmap first (targeted named-child traversal — D-06).
    // This runs even when pk/breakdown/recipe are absent, to clean up on unmount/pk change.
    disposeHeatmapGroup(energyGroup);

    // Bail when prerequisites are missing
    if (!buildingPk || !breakdown || !effectiveRecipe) return;
    if (!breakdown.perFloor?.length) return;

    const heatmap = buildEnergyHeatmap(
      effectiveRecipe.floors,
      breakdown.perFloor,
      effectiveRecipe
    );
    energyGroup.add(heatmap);
  }, [buildingPk, breakdown, effectiveRecipe]);

  // MEP geometry generation — runs when recipe or equipment params change.
  // Disposes previous MEP children (but NOT the named sub-groups themselves, which are
  // recreated idempotently by setupMepSubGroups), then re-generates all 5 MEP layers.
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    if (!effectiveRecipe) return;

    const mepGroup = manager.getGroup("mep");

    // Dispose geometry/materials for all existing MEP content (non-sub-group children
    // and children of sub-groups), then remove them.  The named sub-group Objects
    // themselves are intentionally kept / recreated by setupMepSubGroups below.
    mepGroup.traverse((obj) => {
      if (
        obj !== mepGroup &&
        (obj instanceof THREE.Mesh ||
          obj instanceof THREE.InstancedMesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.Line)
      ) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m: THREE.Material) => m.dispose());
        } else if (mat) {
          (mat as THREE.Material).dispose();
        }
      }
    });
    // Remove all children from sub-groups and then from mepGroup itself
    for (const child of [...mepGroup.children]) {
      if (child instanceof THREE.Group) {
        // Named sub-group — clear its children but leave the group node
        while (child.children.length > 0) {
          child.remove(child.children[0]);
        }
      } else {
        mepGroup.remove(child);
      }
    }

    // (Re)create the 4 named sub-groups — idempotent
    setupMepSubGroups(mepGroup);

    // Convert density from store scale (0-100) to generator scale (0.0-1.0).
    // Fall back to 1.0 (full density) when the store value is undefined.
    const mepDensity = (density.mep ?? 100) / 100;

    // Instantiate generators and generate geometry
    const coolingOutput = new CoolingLayer().generate(
      effectiveRecipe,
      mepDensity,
      equipmentParams.chiller
    );
    assignToSubGroup(mepGroup, coolingOutput.name, coolingOutput);

    const heatingOutput = new HeatingLayer().generate(
      effectiveRecipe,
      mepDensity,
      equipmentParams.boiler,
      equipmentScenario
    );
    assignToSubGroup(mepGroup, heatingOutput.name, heatingOutput);

    const ventOutput = new VentilationLayer().generate(
      effectiveRecipe,
      mepDensity,
      equipmentParams.ahu
    );
    assignToSubGroup(mepGroup, ventOutput.name, ventOutput);

    const dhwOutput = new DHWLayer().generate(
      effectiveRecipe,
      mepDensity,
      equipmentParams.dhw
    );
    assignToSubGroup(mepGroup, dhwOutput.name, dhwOutput);

    const lightingOutput = new LightingLayer().generate(
      effectiveRecipe,
      mepDensity,
      {
        fixture: equipmentParams.lightingFixture,
        panel: equipmentParams.electricalPanel,
      },
      equipmentScenario
    );
    assignToSubGroup(mepGroup, lightingOutput.name, lightingOutput);

    const electricalOutput = new ElectricalRoutingLayer().generate(
      effectiveRecipe,
      mepDensity
    );
    assignToSubGroup(mepGroup, electricalOutput.name, electricalOutput);

    // Rooftop PV + BESS + inverters (was previously never instantiated —
    // this is what puts the solar array on the roof). PV presence follows
    // the retrofit scenario's solar measure.
    const microgridOutput = new MicrogridLayer().generate(
      effectiveRecipe,
      mepDensity,
      equipmentScenario
    );
    assignToSubGroup(mepGroup, microgridOutput.name, microgridOutput);

    // BAS/IoT nervous system: sensors, data webs, DDC panels, head-end
    const basOutput = new BASLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, basOutput.name, basOutput);

    // Safety / fire-protection: fire zones, stairwells, sprinklers, smoke
    // detectors, exit signs, extinguishers, hydrant cabinets
    const safetyOutput = new SafetyLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, safetyOutput.name, safetyOutput);

    // Kinetic transport: elevator shafts, animated cabs, counterweights,
    // landing doors, and hoist machines
    const transportOutput = new TransportLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, transportOutput.name, transportOutput);
  }, [effectiveRecipe, equipmentParams, density, equipmentAssetsReady, equipmentScenario]);

  // Animation loop — update ShaderMaterial uniforms each frame
  useFrame((state) => {
    managerRef.current?.updateAnimations(state.clock.elapsedTime);
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  // eslint-disable-next-line react-hooks/refs
  const parentGroup = managerRef.current?.getParentGroup();
  if (!parentGroup) return null;

  return <primitive object={parentGroup} />;
}
