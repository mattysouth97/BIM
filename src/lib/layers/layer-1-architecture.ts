// src/lib/layers/layer-1-architecture.ts
// Layer 1: Architecture & Structure — floor wireframes using EdgesGeometry + LineSegments.
// Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/**
 * ArchitectureLayer generates wireframe outlines for each floor slab,
 * providing a ghosted structural grid overlay.
 */
export class ArchitectureLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe): THREE.Group {
    this.dispose();

    const group = new THREE.Group();
    group.name = "layer-1-architecture";

    const { floors, footprintWidth, footprintDepth } = recipe;
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x9e9e9e,
      transparent: true,
      opacity: 0.4,
    });

    for (const floor of floors) {
      const boxGeo = new THREE.BoxGeometry(
        footprintWidth,
        floor.height,
        footprintDepth
      );
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const lineSegments = new THREE.LineSegments(edgesGeo, lineMaterial.clone());

      lineSegments.position.set(0, floor.y + floor.height / 2, 0);
      lineSegments.userData = {
        type: "floor-wireframe",
        floorNo: floor.floorNo,
      };

      group.add(lineSegments);

      // Dispose the intermediate box geometry — edges geometry retains its own buffer
      boxGeo.dispose();
    }

    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.group = null;
  }
}
