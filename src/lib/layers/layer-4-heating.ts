// src/lib/layers/layer-4-heating.ts
// Layer 4: MEP Heating 난방
//
// GRAPH-DRIVEN since the 2026-08-31 MEP realism rework: heating-water
// supply/return pairs (central archetype → perimeter FCU coils; residential
// archetype → underfloor loops at slab level) derive from the canonical MEP
// model. The retrofit scenario still visibly swaps the heating plant hero
// (fire-tube boiler → condensing cascade → ASHP) — that is the point of
// green remodeling — by overriding the graph node's asset, never its
// topology. Ceiling terminal units (FCUs, VRF cassettes) render here from
// the graph's equipment terminals so clicking one keeps the familiar
// heating-fan-coil semantics. Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planMepSystemsForRecipe, type MepModel } from "@/lib/mep";
import type { LayerGenerator } from "./types";
import type { BoilerParams } from "./mep-equipment-params";
import type { EquipmentScenario } from "./equipment-scenario";
import { renderMepEquipment, renderMepSystems } from "./mep-render";

const WARM_ORANGE = 0xfb923c;

const HEATING_SYSTEMS = ["hws", "hwr"];

function scenarioAsset(model: MepModel, scenario: EquipmentScenario | undefined, tag: string): string | undefined {
  void model;
  if (!scenario || tag !== "heating-boiler") return undefined;
  if (scenario.heating === "heat-pump") return "heat-pump";
  if (scenario.heating === "condensing") return "boiler-condensing";
  return undefined;
}

export class HeatingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(
    recipe: BuildingRecipe,
    density = 1,
    equipParams: Partial<BoilerParams> = {},
    scenario?: EquipmentScenario,
  ): THREE.Group {
    void equipParams; // plant dims now derive from engineered loads (rule W3)
    const group = new THREE.Group();
    group.name = "layer-4-heating";
    this.group = group;

    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0 || density <= 0) return group;

    const model = planMepSystemsForRecipe(recipe);

    renderMepSystems(model, group, {
      systems: HEATING_SYSTEMS,
      style: {
        color: WARM_ORANGE,
        emissiveIntensity: 0.4,
        opacity: 0.85,
        runTag: "heating-riser",
      },
      density,
    });

    // Heating plant hero (scenario-swappable) + every terminal unit tagged
    // heating-fan-coil across the model (FCUs on the chw/hw pairs, VRF
    // cassettes on the refrigerant network).
    const xray = new THREE.MeshStandardMaterial({
      color: WARM_ORANGE,
      emissive: WARM_ORANGE,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9,
      roughness: 0.5,
      metalness: 0.3,
    });
    renderMepEquipment(model, group, {
      systems: model.systems.map((s) => s.id),
      filter: (e) => e.tag === "heating-boiler" || e.tag === "heating-fan-coil",
      material: xray,
      assetOverride: (e) => scenarioAsset(model, scenario, e.tag),
      tagOverride: (e) =>
        e.tag === "heating-boiler" && scenario?.heating === "heat-pump"
          ? "heating-heat-pump-plant"
          : e.tag === "heating-boiler" && scenario?.heating === "condensing"
            ? "heating-condensing-boiler"
            : e.tag,
    });

    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    this.group = null;
  }
}
