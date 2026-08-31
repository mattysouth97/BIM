// src/lib/layers/layer-6-dhw.ts
// Layer 6: MEP Domestic Water + Sanitary 급수·급탕·오배수
//
// GRAPH-DRIVEN since the 2026-08-31 MEP realism rework: the domestic
// cold/hot/recirc tree, gravity sanitary drainage (real 1–2% slopes, wet-core
// stacks, kitchen stack, vent-to-roof) and fixtures all derive from the
// canonical MEP model. Water renders in the familiar orange x-ray; drainage
// renders muted green — gravity piping is not pressurized piping and should
// not read as it (rule P1). Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planMepSystemsForRecipe } from "@/lib/mep";
import type { LayerGenerator } from "./types";
import type { DhwParams } from "./mep-equipment-params";
import { renderMepEquipment, renderMepSystems } from "./mep-render";

const DHW_ORANGE = 0xf97316;
const DRAIN_GREEN = 0x84a98c;

export class DHWLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1, equipParams: Partial<DhwParams> = {}): THREE.Group {
    void equipParams; // tank dims now derive from the engineered plant node
    const group = new THREE.Group();
    group.name = "layer-6-dhw";
    this.group = group;

    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0 || density <= 0) return group;

    const model = planMepSystemsForRecipe(recipe);

    // Pressurized domestic water: cold + hot + recirc.
    renderMepSystems(model, group, {
      systems: ["dcw", "dhws", "dhwr"],
      style: {
        color: DHW_ORANGE,
        emissiveIntensity: 0.4,
        opacity: 0.85,
        runTag: "dhw-branch",
      },
      density,
    });

    // Gravity drainage + vent: separate topology, separate look (rule P1).
    renderMepSystems(model, group, {
      systems: ["san", "vent"],
      style: {
        color: DRAIN_GREEN,
        emissiveIntensity: 0.25,
        opacity: 0.8,
        runTag: "dhw-drain",
      },
      density,
    });

    // DHW tank, water meter, bathroom fixtures from the graph.
    renderMepEquipment(model, group, {
      systems: ["dcw", "dhws", "dhwr", "san"],
      material: new THREE.MeshStandardMaterial({
        color: DHW_ORANGE,
        emissive: DHW_ORANGE,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.9,
        roughness: 0.5,
        metalness: 0.3,
      }),
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
