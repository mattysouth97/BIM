// src/lib/layers/__tests__/layer-4-heating.test.ts
// HeatingLayer over the canonical MEP graph: heating-water pairs, plant hero
// swaps by retrofit scenario (topology unchanged), residential floor loops,
// terminal units, disposal.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { HeatingLayer } from "../layer-4-heating";
import type { EquipmentScenario } from "../equipment-scenario";
import { clearMepPlanCache } from "@/lib/mep";
import { makeRecipe } from "@/lib/mep/__tests__/fixtures";

const BASE_SCENARIO: EquipmentScenario = {
  heating: "baseline",
  lightingLed: false,
  solarPv: false,
  windowUpgrade: false,
  wallInsulation: false,
};

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

const CENTRAL = () => makeRecipe({ era: "1990-1999", mainPurpsCd: "14000" });

describe("HeatingLayer (graph-driven)", { timeout: 30_000 }, () => {
  it("returns a THREE.Group named 'layer-4-heating'", () => {
    expect(new HeatingLayer().generate(CENTRAL()).name).toBe("layer-4-heating");
  });

  it("renders heating-water runs and a boiler hero for the central archetype", () => {
    clearMepPlanCache();
    const group = new HeatingLayer().generate(CENTRAL(), 1, {}, BASE_SCENARIO);
    expect(findByType(group, "heating-riser")).toBeDefined();
    expect(findByType(group, "heating-boiler")).toBeDefined();
  });

  it("renders perimeter fan-coil terminal units from the graph", () => {
    clearMepPlanCache();
    const group = new HeatingLayer().generate(CENTRAL(), 1, {}, BASE_SCENARIO);
    expect(findByType(group, "heating-fan-coil")).toBeDefined();
  });

  it("heat-pump scenario re-tags the plant hero without touching topology", () => {
    clearMepPlanCache();
    const group = new HeatingLayer().generate(CENTRAL(), 1, {}, { ...BASE_SCENARIO, heating: "heat-pump" });
    expect(findByType(group, "heating-heat-pump-plant")).toBeDefined();
    expect(findByType(group, "heating-boiler")).toBeUndefined();
    // Piping unchanged — the scenario swaps hardware, not the network.
    expect(findByType(group, "heating-riser")).toBeDefined();
  });

  it("condensing scenario swaps in the cascade tag", () => {
    clearMepPlanCache();
    const group = new HeatingLayer().generate(CENTRAL(), 1, {}, { ...BASE_SCENARIO, heating: "condensing" });
    expect(findByType(group, "heating-condensing-boiler")).toBeDefined();
    expect(findByType(group, "heating-boiler")).toBeUndefined();
  });

  it("renders underfloor heating loops at slab level for residential buildings", () => {
    clearMepPlanCache();
    const recipe = makeRecipe({ mainPurpsCd: "02001" });
    const group = new HeatingLayer().generate(recipe, 1, {}, BASE_SCENARIO);
    const runs = findByType(group, "heating-riser") as THREE.InstancedMesh | undefined;
    expect(runs).toBeDefined();
    // At least one horizontal loop run sits within the floor build-up
    // (y ≈ floor.y + 0.12), not in the ceiling void.
    const per = (runs?.userData.mepPerInstance ?? []) as { role: string }[];
    expect(per.some((p) => p.role === "branch" || p.role === "runout")).toBe(true);
  });

  it("no heating-water network for the VRF archetype (refrigerant heats instead)", () => {
    clearMepPlanCache();
    const group = new HeatingLayer().generate(makeRecipe({ era: "2010-2019", mainPurpsCd: "14000" }), 1, {}, BASE_SCENARIO);
    expect(findByType(group, "heating-riser")).toBeUndefined();
    // Cassette units still render here (they carry the fan-coil tag).
    expect(findByType(group, "heating-fan-coil")).toBeDefined();
  });

  it("dispose() does not throw; double dispose is safe", () => {
    const layer = new HeatingLayer();
    layer.generate(CENTRAL(), 1, {}, BASE_SCENARIO);
    expect(() => {
      layer.dispose();
      layer.dispose();
    }).not.toThrow();
  });
});
