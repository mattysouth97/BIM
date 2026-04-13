import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

// Mock three.js since layer-store imports from layers/types which imports THREE
vi.mock("three", () => ({
  default: {},
  Group: class {},
  Mesh: class {},
  BoxGeometry: class {},
  MeshStandardMaterial: class {},
}));

import { useLayerStore } from "../layer-store";
import type { LayerId } from "@/lib/layers/types";
import { ALL_LAYER_IDS } from "@/lib/layers/types";

describe("useLayerStore", () => {
  beforeEach(() => {
    useLayerStore.getState().resetAll();
  });

  it("default: all 5 layers are visible", () => {
    const { visibility } = useLayerStore.getState();
    for (const id of ALL_LAYER_IDS) {
      expect(visibility[id]).toBe(true);
    }
  });

  it("all 5 layers have default entries", () => {
    const { visibility, generated, density } = useLayerStore.getState();
    for (const id of ALL_LAYER_IDS) {
      expect(visibility[id]).toBeDefined();
      expect(generated[id]).toBeDefined();
      expect(density[id]).toBeDefined();
    }
    expect(ALL_LAYER_IDS).toHaveLength(5);
  });

  it("toggleLayer flips visibility", () => {
    expect(useLayerStore.getState().visibility["envelope"]).toBe(true);
    useLayerStore.getState().toggleLayer("envelope");
    expect(useLayerStore.getState().visibility["envelope"]).toBe(false);
    useLayerStore.getState().toggleLayer("envelope");
    expect(useLayerStore.getState().visibility["envelope"]).toBe(true);
  });

  it("toggleLayer hides a visible layer", () => {
    expect(useLayerStore.getState().visibility["mep"]).toBe(true);
    useLayerStore.getState().toggleLayer("mep");
    expect(useLayerStore.getState().visibility["mep"]).toBe(false);
  });

  it("setDensity updates density for specific layer", () => {
    useLayerStore.getState().setDensity("structure", 75);
    expect(useLayerStore.getState().density["structure"]).toBe(75);
    // Other layers unchanged
    expect(useLayerStore.getState().density["envelope"]).toBe(50);
  });

  it("setLayerVisible sets explicit visibility", () => {
    useLayerStore.getState().setLayerVisible("energy-zones", false);
    expect(useLayerStore.getState().visibility["energy-zones"]).toBe(false);
    useLayerStore.getState().setLayerVisible("energy-zones", true);
    expect(useLayerStore.getState().visibility["energy-zones"]).toBe(true);
  });

  it("setGenerated marks layer as generated", () => {
    expect(useLayerStore.getState().generated["retrofit-targets"]).toBe(false);
    useLayerStore.getState().setGenerated("retrofit-targets");
    expect(useLayerStore.getState().generated["retrofit-targets"]).toBe(true);
  });

  it("resetAll returns to defaults", () => {
    // Modify several things
    useLayerStore.getState().toggleLayer("envelope");
    useLayerStore.getState().toggleLayer("mep");
    useLayerStore.getState().setDensity("structure", 90);
    useLayerStore.getState().setGenerated("energy-zones");

    // Reset
    useLayerStore.getState().resetAll();

    // Verify defaults
    expect(useLayerStore.getState().visibility["envelope"]).toBe(true);
    expect(useLayerStore.getState().visibility["mep"]).toBe(true);
    expect(useLayerStore.getState().density["structure"]).toBe(50);
    expect(useLayerStore.getState().generated["energy-zones"]).toBe(false);
  });

  it("default density is 50 for all layers", () => {
    for (const id of ALL_LAYER_IDS) {
      expect(useLayerStore.getState().density[id]).toBe(50);
    }
  });
});
