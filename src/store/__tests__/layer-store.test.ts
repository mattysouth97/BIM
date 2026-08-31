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
import { ALL_LAYER_IDS } from "@/lib/layers/types";

describe("useLayerStore", () => {
  beforeEach(() => {
    useLayerStore.getState().resetAll();
  });

  it("default: envelope and structure are on; diagnostic layers are off", () => {
    const { visibility } = useLayerStore.getState();
    expect(visibility.envelope).toBe(true);
    expect(visibility.structure).toBe(true);
    expect(visibility.mep).toBe(false);
    expect(visibility["energy-zones"]).toBe(false);
    expect(visibility["retrofit-targets"]).toBe(false);
  });

  it("airflow is visible by default and can be toggled independently", () => {
    expect(useLayerStore.getState().airflowVisible).toBe(true);

    useLayerStore.getState().toggleAirflow();
    expect(useLayerStore.getState().airflowVisible).toBe(false);
    expect(useLayerStore.getState().mepSubVisibility["mep-hvac"]).toBe(true);

    useLayerStore.getState().setAirflowVisible(true);
    expect(useLayerStore.getState().airflowVisible).toBe(true);
  });

  it("interior is off by default in the workspace and can be toggled independently", () => {
    expect(useLayerStore.getState().interiorVisible).toBe(false);
    expect(useLayerStore.getState().interiorIncludeExterior).toBe(false);
    useLayerStore.getState().toggleInterior();
    expect(useLayerStore.getState().interiorVisible).toBe(true);
    useLayerStore.getState().setInteriorVisible(false);
    expect(useLayerStore.getState().interiorVisible).toBe(false);
    useLayerStore.getState().toggleInteriorIncludeExterior();
    expect(useLayerStore.getState().interiorIncludeExterior).toBe(true);
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
    expect(useLayerStore.getState().visibility["envelope"]).toBe(true);
    useLayerStore.getState().toggleLayer("envelope");
    expect(useLayerStore.getState().visibility["envelope"]).toBe(false);
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
    useLayerStore.getState().setAirflowVisible(false);
    useLayerStore.getState().setInteriorVisible(true);
    useLayerStore.getState().toggleInteriorIncludeExterior();

    // Reset
    useLayerStore.getState().resetAll();

    // Verify defaults
    expect(useLayerStore.getState().visibility["envelope"]).toBe(true);
    expect(useLayerStore.getState().visibility["mep"]).toBe(false);
    expect(useLayerStore.getState().density["structure"]).toBe(50);
    expect(useLayerStore.getState().generated["energy-zones"]).toBe(false);
    expect(useLayerStore.getState().airflowVisible).toBe(true);
    expect(useLayerStore.getState().interiorVisible).toBe(false);
    expect(useLayerStore.getState().interiorIncludeExterior).toBe(false);
  });

  it("default density is 50 for all layers", () => {
    for (const id of ALL_LAYER_IDS) {
      expect(useLayerStore.getState().density[id]).toBe(50);
    }
  });
it("MEP x-ray (설비 강조) forces the services visible and clears occluders", () => {
    useLayerStore.getState().resetAll();
    useLayerStore.getState().setLayerVisible("mep", false);
    useLayerStore.getState().setInteriorVisible(true);
    useLayerStore.getState().setAnalysisOverlayVisible("overlay-structure", true);

    useLayerStore.getState().toggleMepIsolation();

    const s1 = useLayerStore.getState();
    expect(s1.mepIsolation).toBe(true);
    expect(s1.visibility["mep"]).toBe(true);
    expect(s1.interiorVisible).toBe(false);
    expect(s1.analysisOverlays["overlay-structure"]).toBe(false);

    // Leaving the x-ray restores nothing behind the user's back.
    useLayerStore.getState().toggleMepIsolation();
    const s2 = useLayerStore.getState();
    expect(s2.mepIsolation).toBe(false);
    expect(s2.visibility["mep"]).toBe(true);
    expect(s2.interiorVisible).toBe(false);
  });
});
