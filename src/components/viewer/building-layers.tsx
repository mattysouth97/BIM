"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useLayerStore } from "@/store/layer-store";
import { LayerManager } from "@/lib/layers/layer-manager";
import { ALL_LAYER_IDS, MEP_SUB_IDS } from "@/lib/layers/types";
import { useEnergyBreakdown } from "@/hooks/use-energy-breakdown";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import {
  buildEnergyHeatmap,
  disposeHeatmapGroup,
} from "@/lib/layers/energy-heatmap-builder";
import { StructuralAnalysisLayer } from "@/lib/layers/layer-15-structural";
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
import { TelecomLayer } from "@/lib/layers/layer-11-telecom";
import { MediaLayer } from "@/lib/layers/layer-8-media";
import { WasteLayer } from "@/lib/layers/layer-9-waste";
import { GasLayer } from "@/lib/layers/gas-system";
import { useEquipmentAssets } from "@/hooks/use-equipment-assets";
import {
  setupMepSubGroups,
  assignToSubGroup,
} from "@/lib/layers/mep-coordinator";
import { useEquipmentStore } from "@/store/equipment-store";
import { useScenarioStore } from "@/store/scenario-store";
import {
  deriveEquipmentScenario,
  equipmentScenarioKey,
} from "@/lib/layers/equipment-scenario";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";
import { useViewStore } from "@/lib/bim/views/view-store";
import {
  deriveVisualState,
  RENEWED_EQUIPMENT_COLOR,
  PROPOSAL_EMISSIVE,
} from "@/lib/retrofit/measure-visuals";

interface BuildingLayersProps {
  buildingPk?: string;
}

export function BuildingLayers({ buildingPk }: BuildingLayersProps) {
  const managerRef = useRef<LayerManager | null>(null);
  // P2-20 — original materials of tinted MEP meshes (clone-and-restore)
  const mepTintOriginalsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const appliedMeasureIds = useScenarioStore((s) => s.appliedMeasureIds);

  const visibility = useLayerStore((s) => s.visibility);
  const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
  const airflowVisible = useLayerStore((s) => s.airflowVisible);
  const density = useLayerStore((s) => s.density);
  const structuralIsolation = useLayerStore((s) => s.structuralIsolation);
  const activeViewId = useViewStore((s) => s.activeViewId);
  const views = useViewStore((s) => s.views);
  const activeViewKind = useMemo(() => {
    return views.find((v) => v.id === activeViewId)?.kind ?? null;
  }, [views, activeViewId]);
  const drawingView = !!activeViewKind && activeViewKind !== "3d";

  // Heatmap data — call hooks unconditionally (Rules of Hooks); gate downstream work with pk check
  const pk = buildingPk ?? "";
  const breakdown = useEnergyBreakdown(pk);

  // Equipment params for MEP generators — snapshot-safe selector, falls back to defaults
  const equipmentParams = useEquipmentStore((s) => s.params[pk]) ?? DEFAULT_MEP_EQUIPMENT_PARAMS;

  // Green-retrofit hardware scenario: the knapsack-selected measures decide
  // WHICH physical equipment renders (boiler vs condensing cascade vs ASHP
  // bank, fluorescent vs LED, PV present or not). Changing budget/track in
  // the scenario rail regenerates the MEP layers with the swapped hardware.
  // Measure-selection churn (e.g. toggling a measure that maps to no
  // hardware, like envelope-roof-insulation or a DHW measure) still produces
  // a new selectedMeasureIds identity, but deriveEquipmentScenario's OUTPUT
  // is what actually matters for regeneration. `equipmentScenario` below is
  // stabilized on equipmentScenarioKey (its stable semantic fingerprint)
  // using React's "adjust state during render" pattern, so it keeps the
  // SAME object reference — and the MEP generation effect below does not
  // re-run — whenever the derived scenario is unchanged.
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  const derivedScenario = useMemo(
    () => deriveEquipmentScenario(selectedMeasureIds),
    [selectedMeasureIds]
  );
  const derivedScenarioKey = equipmentScenarioKey(derivedScenario);
  const [scenarioKey, setScenarioKey] = useState(derivedScenarioKey);
  const [equipmentScenario, setEquipmentScenario] = useState(derivedScenario);
  if (derivedScenarioKey !== scenarioKey) {
    setScenarioKey(derivedScenarioKey);
    setEquipmentScenario(derivedScenario);
  }

  // Detailed Blender GLB assets — regenerate MEP geometry once preloaded so
  // the synchronous generators swap their coarse fallbacks for real models.
  const equipmentAssetsReady = useEquipmentAssets();

  // P1-08 (a): single canonical merge for heatmap sizing — this was the
  // SIXTH hand-copied merge block (found by the fitness grep, missed by the
  // review's count of five).
  const effectiveRecipe = useEffectiveRecipe(pk);

  // Create LayerManager once
  if (managerRef.current == null) {
    managerRef.current = new LayerManager();
  }

  // Sync visibility state to Three.js groups
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    for (const id of ALL_LAYER_IDS) {
      const hiddenByView =
        (drawingView && (id === "energy-zones" || id === "retrofit-targets")) ||
        (activeViewKind === "plan" && id === "mep");
      manager.setVisible(id, hiddenByView ? false : visibility[id]);
    }
  }, [visibility, drawingView, activeViewKind]);

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
    if (!visibility["energy-zones"]) return;

    const heatmap = buildEnergyHeatmap(
      effectiveRecipe.floors,
      breakdown.perFloor,
      effectiveRecipe
    );
    energyGroup.add(heatmap);
  }, [buildingPk, breakdown, effectiveRecipe, visibility]);

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

    // Telecom / IT: server racks, fiber backbone, WAPs, CCTV, rooftop antenna
    const telecomOutput = new TelecomLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, telecomOutput.name, telecomOutput);

    // Specialized media: med-gas / compressed-air Manhattan-routed corridors
    const mediaOutput = new MediaLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, mediaOutput.name, mediaOutput);

    // Waste & recovery: segmented chutes, floor hoppers, ground wheelie bins,
    // and the downward particle flow
    const wasteOutput = new WasteLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, wasteOutput.name, wasteOutput);

    // Gas supply (era-aware): city-gas service + exterior riser + kitchen
    // branches, or LPG cylinder cage for pre-1990 permits
    const gasOutput = new GasLayer().generate(effectiveRecipe, mepDensity);
    assignToSubGroup(mepGroup, gasOutput.name, gasOutput);
  }, [effectiveRecipe, equipmentParams, density, equipmentAssetsReady, equipmentScenario]);

  // P2-22 — KBC 2016 structural analysis overlay (stress-colored columns,
  // animated load-path arrows, foundation markers). The layer class existed
  // since Phase 22 but was never instantiated — StructuralTooltip searched
  // for a group no code created. Mounted under the "structure" layer group
  // so the existing structure toggle controls it alongside slabs/columns;
  // updateAnimations() picks up its uTime arrow shaders automatically.
  // Hide only the batched streamline object, leaving HVAC equipment mounted.
  // Re-apply after any MEP regeneration so the user's preference is stable.
  useEffect(() => {
    managerRef.current?.setAirflowVisible(airflowVisible);
  }, [airflowVisible, effectiveRecipe, equipmentParams, density]);

  const structuralLayerRef = useRef<StructuralAnalysisLayer | null>(null);
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !effectiveRecipe || !structuralIsolation) return;

    const structureGroup = manager.getGroup("structure");
    structuralLayerRef.current?.dispose();
    const layer = new StructuralAnalysisLayer();
    const group = layer.generate(effectiveRecipe);
    structuralLayerRef.current = layer;
    structureGroup.add(group);

    return () => {
      structureGroup.remove(group);
      layer.dispose();
      structuralLayerRef.current = null;
    };
  }, [effectiveRecipe, structuralIsolation]);

  // P2-20 — applied HVAC/lighting measures recolor their MEP sub-groups to
  // "new equipment" green. Materials are cloned per-mesh (they are shared
  // within a sub-layer) and originals restored when the measure is
  // un-applied. Declared AFTER the generation effect so a regeneration in
  // the same commit is re-tinted; ShaderMaterial children (animated flows)
  // are left untouched.
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const originals = mepTintOriginalsRef.current;

    const restoreAll = () => {
      for (const [mesh, original] of originals) {
        if (mesh.material !== original && !Array.isArray(mesh.material)) {
          mesh.material.dispose();
        }
        mesh.material = original;
      }
      originals.clear();
    };
    restoreAll();

    const v = deriveVisualState(appliedMeasureIds);
    const targets: string[] = [];
    if (v.hvacUpgraded) targets.push("sub-mep-hvac");
    if (v.lightingUpgraded) targets.push("sub-mep-lighting");
    if (targets.length === 0) return;

    const mepGroup = manager.getGroup("mep");
    for (const child of mepGroup.children) {
      if (!(child instanceof THREE.Group) || !targets.includes(child.name)) continue;
      const isLighting = child.name === "sub-mep-lighting";
      child.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (Array.isArray(obj.material)) return;
        if (!(obj.material instanceof THREE.MeshStandardMaterial)) return;
        originals.set(obj, obj.material);
        const clone = obj.material.clone();
        if (isLighting) {
          // P2-23 — new LED fixtures: actually LIT (bright neutral white
          // with a mint hint as the "proposed" differentiator)
          clone.color.set("#ffffff");
          clone.emissive.set("#e6fff4");
          clone.emissiveIntensity = 0.65;
        } else {
          // P2-23 — replacement HVAC plant: clean factory-new metal housing
          // with the shared proposal accent
          clone.color.lerp(new THREE.Color(RENEWED_EQUIPMENT_COLOR), 0.65);
          clone.metalness = Math.max(clone.metalness, 0.45);
          clone.roughness = Math.min(clone.roughness, 0.35);
          clone.emissive.set(PROPOSAL_EMISSIVE);
          clone.emissiveIntensity = 0.15;
        }
        obj.material = clone;
      });
    }
    return restoreAll;
  }, [appliedMeasureIds, effectiveRecipe, equipmentParams, density]);

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
