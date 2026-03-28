// src/lib/layers/layer-15-structural.ts
// Structural Analysis Layer (Layer 15) — KBC 2016 structural overlay.
// Stub implementation — full visual generator implemented in Plan 02.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerGenerator } from "./types";

/**
 * StructuralAnalysisLayer renders load path arrows, stress color coding,
 * and member sizing labels based on KBC 2016 calculations.
 *
 * This stub satisfies the LayerGenerator interface and allows the layer system
 * to compile while Plan 02 implements the full visual generator.
 */
export class StructuralAnalysisLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, _density = 1.0): THREE.Group {
    this.dispose();
    const group = new THREE.Group();
    group.name = "layer-15-structural";
    // Stub — full implementation in Plan 02
    void recipe; // suppress unused warning
    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          (obj.material as THREE.Material).dispose();
        }
      }
    });
    this.group = null;
  }
}
