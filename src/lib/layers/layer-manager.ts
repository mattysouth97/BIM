// src/lib/layers/layer-manager.ts
// LayerManager orchestrates lazy generation, visibility, and animation updates
// for all 10 building system layers. Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerId, LayerGenerator } from "./types";
import { ArchitectureLayer } from "./layer-1-architecture";
import { MEPLayer } from "./layer-2-mep";
import { BASLayer } from "./layer-3-bas";
import { TransportLayer } from "./layer-4-transport";

/**
 * Placeholder layer generator for layers 5-10.
 * Returns an empty named THREE.Group. Plan 02 will replace these.
 */
class PlaceholderLayer implements LayerGenerator {
  private group: THREE.Group | null = null;
  private readonly layerId: LayerId;

  constructor(layerId: LayerId) {
    this.layerId = layerId;
  }

  generate(_recipe: BuildingRecipe): THREE.Group {
    this.dispose();
    const group = new THREE.Group();
    group.name = `layer-${this.layerId}-placeholder`;
    this.group = group;
    return group;
  }

  dispose(): void {
    // Placeholder has no geometry to dispose
    this.group = null;
  }
}

/**
 * LayerManager manages the lifecycle of all 10 building system layers:
 * - Lazy generation on first visibility request
 * - Cached group references for subsequent toggles
 * - Unified animation update for ShaderMaterial uniforms
 * - Central dispose for cleanup
 */
export class LayerManager {
  private generators: Map<LayerId, LayerGenerator> = new Map();
  private groups: Map<LayerId, THREE.Group> = new Map();
  private parentGroup: THREE.Group;

  constructor() {
    this.parentGroup = new THREE.Group();
    this.parentGroup.name = "building-layers";

    // Real generators for layers 1-4
    this.generators.set(1, new ArchitectureLayer());
    this.generators.set(2, new MEPLayer());
    this.generators.set(3, new BASLayer());
    this.generators.set(4, new TransportLayer());

    // Placeholder generators for layers 5-10 (Plan 02 replaces these)
    for (let id = 5; id <= 10; id++) {
      this.generators.set(id as LayerId, new PlaceholderLayer(id as LayerId));
    }
  }

  /**
   * Lazy generate a layer on first request, return cached group thereafter.
   * Automatically adds the generated group to the parent group.
   */
  getOrGenerate(id: LayerId, recipe: BuildingRecipe): THREE.Group {
    const existing = this.groups.get(id);
    if (existing) return existing;

    const generator = this.generators.get(id);
    if (!generator) {
      throw new Error(`No generator registered for layer ${id}`);
    }

    const group = generator.generate(recipe);
    this.groups.set(id, group);
    this.parentGroup.add(group);
    return group;
  }

  /**
   * Set layer visibility. If the layer hasn't been generated yet and
   * visible=true, the caller must call getOrGenerate first.
   */
  setVisible(id: LayerId, visible: boolean): void {
    const group = this.groups.get(id);
    if (group) {
      group.visible = visible;
    }
  }

  /**
   * Update all ShaderMaterial uniforms with uTime across all generated layers.
   * Called once per frame from the R3F render loop.
   */
  updateAnimations(elapsedTime: number): void {
    this.groups.forEach((group) => {
      if (!group.visible) return;

      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          const mat = obj.material;
          if (
            mat instanceof THREE.ShaderMaterial &&
            mat.uniforms &&
            "uTime" in mat.uniforms
          ) {
            mat.uniforms.uTime.value = elapsedTime;
          }
        }
      });
    });
  }

  /** Get the parent group that contains all layer groups */
  getParentGroup(): THREE.Group {
    return this.parentGroup;
  }

  /** Check if a layer has been generated */
  isGenerated(id: LayerId): boolean {
    return this.groups.has(id);
  }

  /** Dispose all generators and clear all cached groups */
  dispose(): void {
    this.generators.forEach((gen) => gen.dispose());
    this.generators.clear();
    this.groups.clear();

    // Remove all children from parent
    while (this.parentGroup.children.length > 0) {
      this.parentGroup.remove(this.parentGroup.children[0]);
    }
  }
}
