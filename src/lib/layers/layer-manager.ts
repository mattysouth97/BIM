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
import { SafetyLayer } from "./layer-5-safety";
import { MediaLayer } from "./layer-6-media";
import { MicrogridLayer } from "./layer-7-microgrid";
import { TelecomLayer } from "./layer-8-telecom";
import { WasteLayer } from "./layer-9-waste";
import { EnvelopeLayer } from "./layer-10-envelope";

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

    // All 10 layer generators
    this.generators.set(1, new ArchitectureLayer());
    this.generators.set(2, new MEPLayer());
    this.generators.set(3, new BASLayer());
    this.generators.set(4, new TransportLayer());
    this.generators.set(5, new SafetyLayer());
    this.generators.set(6, new MediaLayer());
    this.generators.set(7, new MicrogridLayer());
    this.generators.set(8, new TelecomLayer());
    this.generators.set(9, new WasteLayer());
    this.generators.set(10, new EnvelopeLayer());
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

  /** Dispose a single layer and remove from cache (for regeneration) */
  disposeLayer(id: LayerId): void {
    const group = this.groups.get(id);
    if (group) {
      this.parentGroup.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else if (mat) {
            mat.dispose();
          }
        }
      });
      this.groups.delete(id);
    }
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
