// src/lib/procedural/procedural-building.ts
// Composer class that orchestrates all procedural generators.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe, FloorSpec } from "./types";
import { generateFacade } from "./facade-generator";
import {
  generateSlabs,
  generateColumns,
  generateBeams,
  generateRoof,
  generateRoofFurniture,
} from "./structure-generator";
import {
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "@/lib/layers/equipment-scenario";

/**
 * ProceduralBuilding generates a complete Three.js scene graph
 * from a BuildingRecipe using InstancedMesh for high performance.
 *
 * Draw call budget: facade (4) + slabs (1) + columns (1) + roof (1) = 7 total.
 *
 * The optional `scenario` threads the green-retrofit measure selection into
 * the facade pass (window / wall-insulation envelope variants). It defaults to
 * the showcase scenario so every existing call site keeps its behavior.
 */
export class ProceduralBuilding {
  private group: THREE.Group | null = null;
  private recipe: BuildingRecipe;
  private scenario: EquipmentScenario;

  constructor(
    recipe: BuildingRecipe,
    scenario: EquipmentScenario = SHOWCASE_EQUIPMENT_SCENARIO
  ) {
    this.recipe = recipe;
    this.scenario = scenario;
  }

  generate(): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "ProceduralBuilding";

    // Multi-section facade: each section gets its own facade pass
    if (this.recipe.sections && this.recipe.sections.length > 1) {
      const facadeGroup = new THREE.Group();
      facadeGroup.name = "facade";
      const topSectionEnd = Math.max(...this.recipe.sections.map((section) => section.endFloor));
      for (let si = 0; si < this.recipe.sections.length; si++) {
        const section = this.recipe.sections[si];
        const sectionFloors = this.recipe.floors.filter(
          f => f.floorNo >= section.startFloor && f.floorNo <= section.endFloor
        );
        if (sectionFloors.length === 0) continue;

        // Build a sub-recipe for this section's floors
        const sectionRecipe: BuildingRecipe = {
          ...this.recipe,
          floors: sectionFloors,
          facade: section.facade,
          curtainWall: section.curtainWall,
          // Sections share structural dimensions but have unique facades
        };
        const sectionFacade = generateFacade(sectionRecipe, this.scenario, {
          includeParapet: section.endFloor === topSectionEnd && this.recipe.roof.type === "flat",
        });
        sectionFacade.name = `facade-section-${si}`;
        facadeGroup.add(sectionFacade);
      }
      group.add(facadeGroup);
    } else {
      const facade = generateFacade(this.recipe, this.scenario);
      facade.name = "facade";
      group.add(facade);
    }

    const slabs = generateSlabs(this.recipe);
    slabs.name = "slabs";
    group.add(slabs);

    const columns = generateColumns(this.recipe);
    columns.name = "columns";
    group.add(columns);

    // Structural beams spanning the column grid (1 extra draw call)
    const beams = generateBeams(this.recipe);
    if (beams) {
      beams.name = "beams";
      group.add(beams);
    }

    const roof = generateRoof(this.recipe);
    roof.name = "roof";
    group.add(roof);

    // Flat-roof furniture (stair bulkhead, vents, skylight) — only when the
    // detailed Blender asset is preloaded.
    const roofFurniture = generateRoofFurniture(this.recipe);
    if (roofFurniture) {
      roofFurniture.name = "roof-furniture";
      group.add(roofFurniture);
    }

    this.group = group;
    return group;
  }

  getSlabMesh(): THREE.InstancedMesh | THREE.Group | null {
    if (!this.group) return null;
    return this.group.getObjectByName("slabs") as THREE.InstancedMesh | THREE.Group | null;
  }

  getFloorFromInstanceId(instanceId: number): FloorSpec | null {
    const slabs = this.getSlabMesh();
    if (!slabs) return null;

    // InstancedMesh path (rectangular buildings)
    if (slabs instanceof THREE.InstancedMesh) {
      const map = slabs.userData.instanceToFloor as Map<number, FloorSpec> | undefined;
      return map?.get(instanceId) ?? null;
    }

    // Group path (polygon buildings) — instanceId maps to child mesh index
    if (slabs instanceof THREE.Group) {
      const map = slabs.userData.instanceToFloor as Map<number, FloorSpec> | undefined;
      return map?.get(instanceId) ?? null;
    }

    return null;
  }

  /**
   * Resolve a FloorSpec by its floor number from the recipe this builder holds.
   * Used by the polygon-slab pick path where plain meshes carry userData.floorNo.
   */
  getFloorByFloorNo(floorNo: number): FloorSpec | null {
    return this.recipe.floors.find((f) => f.floorNo === floorNo) ?? null;
  }

  updateRecipe(recipe: BuildingRecipe): THREE.Group {
    this.recipe = recipe;
    return this.generate();
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.group = null;
  }

  getGroup(): THREE.Group | null {
    return this.group;
  }
}
