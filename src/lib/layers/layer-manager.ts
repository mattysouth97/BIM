// src/lib/layers/layer-manager.ts
// LayerManager orchestrates lazy generation, visibility, and animation updates
// for all 14 building system layers. Pure Three.js, no React.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { LayerId, LayerGenerator } from "./types";
import { ALL_LAYER_IDS } from "./types";
import { ShellLayer } from "./layer-1-shell";
import { EnvelopeLayer } from "./layer-2-envelope";
import { CoolingLayer } from "./layer-3-cooling";
import { HeatingLayer } from "./layer-4-heating";
import { VentilationLayer } from "./layer-5-ventilation";
import { DHWLayer } from "./layer-6-dhw";
import { LightingLayer } from "./layer-7-lighting";
import { MediaLayer } from "./layer-8-media";
import { WasteLayer } from "./layer-9-waste";
import { BASLayer } from "./layer-10-bas";
import { TelecomLayer } from "./layer-11-telecom";
import { TransportLayer } from "./layer-12-transport";
import { SafetyLayer } from "./layer-13-safety";
import { MicrogridLayer } from "./layer-14-microgrid";

/**
 * LayerManager manages the lifecycle of all 14 building system layers:
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

    // All 14 layer generators
    this.generators.set(1, new ShellLayer());
    this.generators.set(2, new EnvelopeLayer());
    this.generators.set(3, new CoolingLayer());
    this.generators.set(4, new HeatingLayer());
    this.generators.set(5, new VentilationLayer());
    this.generators.set(6, new DHWLayer());
    this.generators.set(7, new LightingLayer());
    this.generators.set(8, new MediaLayer());
    this.generators.set(9, new WasteLayer());
    this.generators.set(10, new BASLayer());
    this.generators.set(11, new TelecomLayer());
    this.generators.set(12, new TransportLayer());
    this.generators.set(13, new SafetyLayer());
    this.generators.set(14, new MicrogridLayer());
  }

  getOrGenerate(id: LayerId, recipe: BuildingRecipe, density?: number): THREE.Group {
    const existing = this.groups.get(id);
    if (existing) return existing;

    const generator = this.generators.get(id);
    if (!generator) {
      throw new Error(`No generator registered for layer ${id}`);
    }

    const group = generator.generate(recipe, density);
    this.groups.set(id, group);
    this.parentGroup.add(group);
    return group;
  }

  setVisible(id: LayerId, visible: boolean): void {
    const group = this.groups.get(id);
    if (group) {
      group.visible = visible;
    }
  }

  updateAnimations(elapsedTime: number): void {
    this.groups.forEach((group) => {
      if (!group.visible) return;

      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh || obj instanceof THREE.Points) {
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

  getParentGroup(): THREE.Group {
    return this.parentGroup;
  }

  disposeLayer(id: LayerId): void {
    const group = this.groups.get(id);
    if (group) {
      this.parentGroup.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else if (mat) {
            (mat as THREE.Material).dispose();
          }
        }
      });
      this.groups.delete(id);
    }
  }

  isGenerated(id: LayerId): boolean {
    return this.groups.has(id);
  }

  dispose(): void {
    ALL_LAYER_IDS.forEach((id) => this.disposeLayer(id));
    this.generators.clear();
    this.groups.clear();
  }
}
