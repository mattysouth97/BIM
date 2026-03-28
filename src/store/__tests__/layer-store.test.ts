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

  it("default: only layer 1 is visible", () => {
    const { visibility } = useLayerStore.getState();
    expect(visibility[1]).toBe(true);
    for (let id = 2; id <= 14; id++) {
      expect(visibility[id as LayerId]).toBe(false);
    }
  });

  it("all 14 layers have default entries", () => {
    const { visibility, generated, density } = useLayerStore.getState();
    for (const id of ALL_LAYER_IDS) {
      expect(visibility[id]).toBeDefined();
      expect(generated[id]).toBeDefined();
      expect(density[id]).toBeDefined();
    }
    expect(ALL_LAYER_IDS).toHaveLength(14);
  });

  it("toggleLayer flips visibility", () => {
    expect(useLayerStore.getState().visibility[1]).toBe(true);
    useLayerStore.getState().toggleLayer(1);
    expect(useLayerStore.getState().visibility[1]).toBe(false);
    useLayerStore.getState().toggleLayer(1);
    expect(useLayerStore.getState().visibility[1]).toBe(true);
  });

  it("toggleLayer makes invisible layer visible", () => {
    expect(useLayerStore.getState().visibility[3]).toBe(false);
    useLayerStore.getState().toggleLayer(3);
    expect(useLayerStore.getState().visibility[3]).toBe(true);
  });

  it("setDensity updates density for specific layer", () => {
    useLayerStore.getState().setDensity(5, 75);
    expect(useLayerStore.getState().density[5]).toBe(75);
    // Other layers unchanged
    expect(useLayerStore.getState().density[1]).toBe(50);
  });

  it("setLayerVisible sets explicit visibility", () => {
    useLayerStore.getState().setLayerVisible(7, true);
    expect(useLayerStore.getState().visibility[7]).toBe(true);
    useLayerStore.getState().setLayerVisible(7, false);
    expect(useLayerStore.getState().visibility[7]).toBe(false);
  });

  it("setGenerated marks layer as generated", () => {
    expect(useLayerStore.getState().generated[3]).toBe(false);
    useLayerStore.getState().setGenerated(3);
    expect(useLayerStore.getState().generated[3]).toBe(true);
  });

  it("resetAll returns to defaults", () => {
    // Modify several things
    useLayerStore.getState().toggleLayer(1);
    useLayerStore.getState().toggleLayer(5);
    useLayerStore.getState().setDensity(3, 90);
    useLayerStore.getState().setGenerated(7);

    // Reset
    useLayerStore.getState().resetAll();

    // Verify defaults
    expect(useLayerStore.getState().visibility[1]).toBe(true);
    expect(useLayerStore.getState().visibility[5]).toBe(false);
    expect(useLayerStore.getState().density[3]).toBe(50);
    expect(useLayerStore.getState().generated[7]).toBe(false);
  });

  it("default density is 50 for all layers", () => {
    for (const id of ALL_LAYER_IDS) {
      expect(useLayerStore.getState().density[id]).toBe(50);
    }
  });
});
