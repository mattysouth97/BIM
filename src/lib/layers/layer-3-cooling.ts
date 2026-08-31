// src/lib/layers/layer-3-cooling.ts
// Layer 3: MEP Cooling 냉방
//
// GRAPH-DRIVEN since the 2026-08-31 MEP realism rework: chilled-water
// supply/return pairs, condenser water, and VRF refrigerant networks derive
// from the canonical MEP model — engineered DN sizes, real elbows/tees,
// hangers, flow accumulation — instead of the old decorative CatmullRom
// splines with cosmetic wobble. Plant heroes (chiller, cooling tower, VRF CU
// bank) place at the graph's equipment nodes, which sit on the same
// core-layout slots the old code used, so the coordinated rooftop reads
// unchanged. Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planMepSystemsForRecipe } from "@/lib/mep";
import type { LayerGenerator } from "./types";
import type { ChillerParams } from "./mep-equipment-params";
import { renderMepEquipment, renderMepSystems } from "./mep-render";

const COOL_BLUE = 0x38bdf8;

const COOLING_SYSTEMS = ["chws", "chwr", "cw", "ref"];

export class CoolingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1, equipParams: Partial<ChillerParams> = {}): THREE.Group {
    void equipParams; // plant dims now derive from engineered loads (rule W3)
    const group = new THREE.Group();
    group.name = "layer-3-cooling";
    this.group = group;

    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0 || density <= 0) return group;

    const model = planMepSystemsForRecipe(recipe);

    renderMepSystems(model, group, {
      systems: COOLING_SYSTEMS,
      style: {
        color: COOL_BLUE,
        emissiveIntensity: 0.4,
        opacity: 0.85,
        runTag: "cooling-branch",
      },
      density,
    });

    // Plant heroes: chiller/cooling tower (central archetype) or the VRF
    // condensing-unit bank (post-2000 offices). Rooftop plant keeps the GLB's
    // own materials — it reads as real equipment against the sky.
    renderMepEquipment(model, group, {
      systems: COOLING_SYSTEMS,
      filter: (e) => e.tag !== "heating-fan-coil",
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
