// src/lib/layers/__tests__/layer-manager.test.ts
// Unit tests for the 5-layer Digital Twin LayerManager.

import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { LayerManager, getLayerForComponent } from "../layer-manager";
import { ALL_LAYER_IDS } from "../types";
import type { LayerId } from "../types";

describe("LayerManager — 5-layer Digital Twin system", () => {
  let manager: LayerManager;

  beforeEach(() => {
    manager = new LayerManager();
  });

  // ---------------------------------------------------------------------------
  // Layer existence
  // ---------------------------------------------------------------------------

  it("ALL_LAYER_IDS has exactly 5 entries", () => {
    expect(ALL_LAYER_IDS).toHaveLength(5);
    expect(ALL_LAYER_IDS).toEqual([
      "envelope",
      "structure",
      "mep",
      "energy-zones",
      "retrofit-targets",
    ]);
  });

  it("all 5 layers exist as groups in the manager", () => {
    for (const id of ALL_LAYER_IDS) {
      const group = manager.getGroup(id);
      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.name).toBe(`layer-${id}`);
    }
  });

  it("all 5 layers are visible by default", () => {
    for (const id of ALL_LAYER_IDS) {
      expect(manager.isVisible(id)).toBe(true);
    }
  });

  it("getParentGroup returns a Group named 'building-layers'", () => {
    const parent = manager.getParentGroup();
    expect(parent).toBeInstanceOf(THREE.Group);
    expect(parent.name).toBe("building-layers");
  });

  it("parent group contains exactly 5 child groups", () => {
    expect(manager.getParentGroup().children).toHaveLength(5);
  });

  // ---------------------------------------------------------------------------
  // Visibility: setVisible / show / hide / toggle
  // ---------------------------------------------------------------------------

  it("setVisible(false) hides a layer", () => {
    manager.setVisible("envelope", false);
    expect(manager.isVisible("envelope")).toBe(false);
  });

  it("setVisible(true) shows a layer", () => {
    manager.setVisible("mep", false);
    manager.setVisible("mep", true);
    expect(manager.isVisible("mep")).toBe(true);
  });

  it("hide() hides a layer", () => {
    manager.hide("structure");
    expect(manager.isVisible("structure")).toBe(false);
  });

  it("show() shows a hidden layer", () => {
    manager.hide("energy-zones");
    manager.show("energy-zones");
    expect(manager.isVisible("energy-zones")).toBe(true);
  });

  it("toggle() flips visibility and returns new state", () => {
    // Starts visible
    const afterFirst = manager.toggle("retrofit-targets");
    expect(afterFirst).toBe(false);
    expect(manager.isVisible("retrofit-targets")).toBe(false);

    const afterSecond = manager.toggle("retrofit-targets");
    expect(afterSecond).toBe(true);
    expect(manager.isVisible("retrofit-targets")).toBe(true);
  });

  it("hiding one layer does not affect others", () => {
    manager.hide("mep");
    expect(manager.isVisible("envelope")).toBe(true);
    expect(manager.isVisible("structure")).toBe(true);
    expect(manager.isVisible("energy-zones")).toBe(true);
    expect(manager.isVisible("retrofit-targets")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // getLayerForComponent — component type to layer mapping
  // ---------------------------------------------------------------------------

  it("maps envelope component types correctly", () => {
    const envelopeTypes = ["wall", "exterior-wall", "window", "door", "roof", "facade", "glass", "mullion", "parapet"];
    for (const type of envelopeTypes) {
      expect(getLayerForComponent(type)).toBe("envelope");
    }
  });

  it("maps structure component types correctly", () => {
    const structureTypes = ["column", "slab", "foundation", "beam", "structural-wall", "core"];
    for (const type of structureTypes) {
      expect(getLayerForComponent(type)).toBe("structure");
    }
  });

  it("maps MEP component types correctly", () => {
    const mepTypes = [
      "mep-pipe", "mep-duct", "mep-electrical",
      "cooling", "heating", "ventilation", "dhw",
      "lighting", "media", "waste", "bas", "telecom", "transport", "safety", "microgrid",
    ];
    for (const type of mepTypes) {
      expect(getLayerForComponent(type)).toBe("mep");
    }
  });

  it("maps energy-zone component types correctly", () => {
    const energyTypes = ["energy-zone", "thermal-zone", "heat-loss"];
    for (const type of energyTypes) {
      expect(getLayerForComponent(type)).toBe("energy-zones");
    }
  });

  it("maps retrofit component types correctly", () => {
    const retrofitTypes = ["retrofit-target", "upgrade-candidate"];
    for (const type of retrofitTypes) {
      expect(getLayerForComponent(type)).toBe("retrofit-targets");
    }
  });

  it("unknown component type falls back to 'structure'", () => {
    expect(getLayerForComponent("unknown-widget")).toBe("structure");
    expect(getLayerForComponent("")).toBe("structure");
  });

  // ---------------------------------------------------------------------------
  // disposeLayer / dispose
  // ---------------------------------------------------------------------------

  it("disposeLayer clears children but keeps the group", () => {
    const group = manager.getGroup("envelope");
    // Add a dummy mesh
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    group.add(mesh);
    expect(group.children).toHaveLength(1);

    manager.disposeLayer("envelope");
    expect(group.children).toHaveLength(0);
    // Group itself still accessible
    expect(manager.getGroup("envelope")).toBe(group);
  });

  it("dispose() does not throw and clears all groups", () => {
    expect(() => manager.dispose()).not.toThrow();
    // After dispose the groups map is cleared
    expect(() => manager.dispose()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // getConfig
  // ---------------------------------------------------------------------------

  it("getConfig returns correct metadata for each layer", () => {
    const configs: Array<[LayerId, string, string]> = [
      ["envelope", "Envelope", "외피"],
      ["structure", "Structure", "구조"],
      ["mep", "MEP", "기계전기설비"],
      ["energy-zones", "Energy Zones", "에너지 존"],
      ["retrofit-targets", "Retrofit Targets", "개선 대상"],
    ];
    for (const [id, name, nameKo] of configs) {
      const cfg = manager.getConfig(id);
      expect(cfg.id).toBe(id);
      expect(cfg.name).toBe(name);
      expect(cfg.nameKo).toBe(nameKo);
    }
  });
});
