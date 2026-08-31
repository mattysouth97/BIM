// src/lib/layers/electrical-routing.ts
// MEP Electrical routing 전기 간선
//
// GRAPH-DRIVEN since the 2026-08-31 MEP realism rework: the T5 hierarchy
// (transformer/MSB → riser → floor panel → circuits → loads) derives from
// the canonical MEP model — corridor cable-tray containment, conduit branch
// circuits with per-zone lighting feeds, facade receptacle drops, and
// mechanical-equipment feeders that terminate at a disconnect beside each
// unit (rule E4). The old five-magic-constant tray tiling is gone.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { planMepSystemsForRecipe } from "@/lib/mep";
import type { LayerGenerator } from "./types";
import { renderMepEquipment, renderMepSystems } from "./mep-render";

const AMBER = 0xf59e0b;

export class ElectricalRoutingLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1): THREE.Group {
    const group = new THREE.Group();
    group.name = "electrical-routing";
    this.group = group;

    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    if (aboveFloors.length === 0 || density <= 0) return group;

    const model = planMepSystemsForRecipe(recipe);

    // Containment (tray) and branch circuits (conduit) share the amber
    // language; the tray reads wider and flatter by its engineered section.
    renderMepSystems(model, group, {
      systems: ["tray"],
      style: {
        color: AMBER,
        emissiveIntensity: 0.35,
        opacity: 0.85,
        runTag: "electrical-cable-tray",
      },
      density,
    });
    renderMepSystems(model, group, {
      systems: ["pw"],
      style: {
        color: AMBER,
        emissiveIntensity: 0.3,
        opacity: 0.8,
        runTag: "electrical-conduit",
        terminalTag: "electrical-receptacle",
      },
      density,
    });

    // Switchboard + per-floor panels from the graph (rule E1/T5).
    renderMepEquipment(model, group, {
      systems: ["pw"],
      material: new THREE.MeshStandardMaterial({
        color: AMBER,
        emissive: AMBER,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.92,
        roughness: 0.5,
        metalness: 0.4,
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
