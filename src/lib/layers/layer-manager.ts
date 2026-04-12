// src/lib/layers/layer-manager.ts
// LayerManager orchestrates visibility for the 5 purpose-driven Digital Twin layers.
// Pure Three.js, no React.

import * as THREE from "three";
import type { LayerId, MepSubLayerId } from "./types";
import { ALL_LAYER_IDS, LAYER_CONFIGS } from "./types";

/** Maps legacy component type strings to the new 5-layer groups */
const COMPONENT_TO_LAYER: Record<string, LayerId> = {
  // Envelope
  wall: "envelope",
  "exterior-wall": "envelope",
  "interior-wall": "envelope",
  window: "envelope",
  door: "envelope",
  roof: "envelope",
  opening: "envelope",
  facade: "envelope",
  glass: "envelope",
  mullion: "envelope",
  parapet: "envelope",

  // Structure
  column: "structure",
  slab: "structure",
  foundation: "structure",
  beam: "structure",
  "structural-wall": "structure",
  core: "structure",

  // MEP (all MEP subsystems combined)
  "mep-pipe": "mep",
  "mep-duct": "mep",
  "mep-electrical": "mep",
  cooling: "mep",
  heating: "mep",
  ventilation: "mep",
  dhw: "mep",
  lighting: "mep",
  media: "mep",
  waste: "mep",
  bas: "mep",
  telecom: "mep",
  transport: "mep",
  safety: "mep",
  microgrid: "mep",

  // Energy zones
  "energy-zone": "energy-zones",
  "thermal-zone": "energy-zones",
  "heat-loss": "energy-zones",

  // Retrofit targets
  "retrofit-target": "retrofit-targets",
  "upgrade-candidate": "retrofit-targets",
};

/**
 * Returns the Digital Twin layer that owns a given component type.
 * Falls back to "structure" for unknown component types.
 */
export function getLayerForComponent(componentType: string): LayerId {
  return COMPONENT_TO_LAYER[componentType] ?? "structure";
}

/**
 * LayerManager manages visibility state for the 5 Digital Twin layers.
 * Groups are populated externally (e.g. by BuildingLayers) and registered here.
 */
export class LayerManager {
  private groups: Map<LayerId, THREE.Group> = new Map();
  private parentGroup: THREE.Group;

  constructor() {
    this.parentGroup = new THREE.Group();
    this.parentGroup.name = "building-layers";

    // Pre-create a group per layer so visibility can be toggled before generation
    for (const id of ALL_LAYER_IDS) {
      const group = new THREE.Group();
      group.name = `layer-${id}`;
      group.visible = true; // All layers visible by default
      this.groups.set(id, group);
      this.parentGroup.add(group);
    }
  }

  /** Return the group for a layer (always exists, may be empty before generation). */
  getGroup(id: LayerId): THREE.Group {
    return this.groups.get(id)!;
  }

  /** Set a layer's visibility. */
  setVisible(id: LayerId, visible: boolean): void {
    const group = this.groups.get(id);
    if (group) {
      group.visible = visible;
    }
  }

  /** Set visibility for a MEP sub-group (electrical, HVAC, lighting, DHW). */
  setMepSubVisible(subId: MepSubLayerId, visible: boolean): void {
    const mepGroup = this.groups.get("mep");
    if (!mepGroup) return;
    const child = mepGroup.getObjectByName(`sub-${subId}`);
    if (child) child.visible = visible;
  }

  /** Whether a layer is currently visible. */
  isVisible(id: LayerId): boolean {
    return this.groups.get(id)?.visible ?? false;
  }

  /** Show a layer. */
  show(id: LayerId): void {
    this.setVisible(id, true);
  }

  /** Hide a layer. */
  hide(id: LayerId): void {
    this.setVisible(id, false);
  }

  /** Toggle a layer's visibility; returns the new state. */
  toggle(id: LayerId): boolean {
    const next = !this.isVisible(id);
    this.setVisible(id, next);
    return next;
  }

  /** Update ShaderMaterial uTime uniforms for animated layers. */
  updateAnimations(elapsedTime: number): void {
    this.groups.forEach((group) => {
      if (!group.visible) return;
      group.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.InstancedMesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.Line  // VentilationLayer airflow trails use Line + ShaderMaterial
        ) {
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

  /** Dispose geometry/materials for a specific layer group. */
  disposeLayer(id: LayerId): void {
    const group = this.groups.get(id);
    if (!group) return;
    group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.InstancedMesh ||
        obj instanceof THREE.Points ||
        obj instanceof THREE.Line
      ) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          (mat as THREE.Material).dispose();
        }
      }
    });
    // Clear children but keep the group itself (so visibility still works)
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  /** Dispose all layers and clear the manager. */
  dispose(): void {
    ALL_LAYER_IDS.forEach((id) => this.disposeLayer(id));
    this.groups.clear();
  }

  /** Returns config metadata for a layer. */
  getConfig(id: LayerId) {
    return LAYER_CONFIGS[id];
  }
}
