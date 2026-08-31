// src/lib/layers/__tests__/detailed-assets.test.ts
// Detailed Blender-asset paths in the MEP layer generators, over the
// canonical MEP graph:
//   - assets swap in when the cache is primed (injected here)
//   - graph equipment nodes seat plant correctly (roof / basement)
//   - coarse fallbacks remain when the cache is empty
//   - green-retrofit scenario swaps the plant hero, never the network

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { CoolingLayer } from "../layer-3-cooling";
import { HeatingLayer } from "../layer-4-heating";
import { DHWLayer } from "../layer-6-dhw";
import { ElectricalRoutingLayer } from "../electrical-routing";
import { MicrogridLayer } from "../layer-14-microgrid";
import { VentilationLayer } from "../layer-5-ventilation";
import { SafetyLayer } from "../layer-13-safety";
import {
  deriveEquipmentScenario,
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "../equipment-scenario";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import { clearMepPlanCache } from "@/lib/mep";
import { makeRecipe as makeGraphRecipe, caseTowerOffice } from "@/lib/mep/__tests__/fixtures";
import type { BuildingRecipe } from "@/lib/procedural/types";

/** Legacy 3-floor fixture (roofTopY = 9.15) still used by the microgrid tests. */
function makeRecipe(): BuildingRecipe {
  return makeGraphRecipe({
    footprintWidth: 12,
    footprintDepth: 10,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 9.0,
    era: "2010-2019",
    mainPurpsCd: "02000",
    column: { spacing: 6, size: 0.4, inset: 1 },
    siteWidth: 20,
    siteDepth: 18,
  });
}

const CENTRAL = () => makeGraphRecipe({ era: "1990-1999", mainPurpsCd: "14000" });
const VRF = () => makeGraphRecipe({ era: "2010-2019", mainPurpsCd: "14000" });

const BASE_SCENARIO: EquipmentScenario = {
  heating: "baseline",
  lightingLed: false,
  solarPv: false,
  windowUpgrade: false,
  wallInsulation: false,
};

function makeFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  group.add(mesh);
  return group;
}

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
  clearMepPlanCache();
});

describe("CoolingLayer detailed assets (graph placement)", { timeout: 30_000 }, () => {
  it("uses the Blender chiller hero and seats it on the roof", () => {
    __injectEquipmentAssetForTest("chiller", makeFakeAsset());
    const recipe = CENTRAL();
    const roofY = recipe.totalHeight + recipe.roof.flatThickness;
    const group = new CoolingLayer().generate(recipe);
    const plant = findByType(group, "cooling-plant")!;
    expect(plant).toBeDefined();
    // Base-origin GLB seats at (node centre − h/2) ≈ the roof surface.
    expect(plant.position.y).toBeGreaterThanOrEqual(roofY - 0.15);
    expect(plant.position.y).toBeLessThanOrEqual(roofY + 0.6);
    // Every descendant mesh carries the selection tag.
    let taggedMeshes = 0;
    plant.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.type === "cooling-plant") taggedMeshes++;
    });
    expect(taggedMeshes).toBeGreaterThan(0);
  });

  it("coarse fallback still places the plant when the cache is empty", () => {
    const group = new CoolingLayer().generate(CENTRAL());
    expect(findByType(group, "cooling-plant")).toBeDefined();
    expect(findByType(group, "cooling-tower")).toBeDefined();
  });
});

describe("HeatingLayer detailed assets (graph placement)", { timeout: 30_000 }, () => {
  it("keeps the boiler in the basement plant room", () => {
    __injectEquipmentAssetForTest("boiler", makeFakeAsset());
    const group = new HeatingLayer().generate(CENTRAL(), 1, {}, BASE_SCENARIO);
    const boiler = findByType(group, "heating-boiler")!;
    expect(boiler).toBeDefined();
    expect(boiler.position.y).toBeLessThan(0);
  });

  it("instances VRF ceiling cassettes from the graph terminals", () => {
    clearMepPlanCache();
    const group = new HeatingLayer().generate(VRF(), 1, {}, BASE_SCENARIO);
    const cassettes = findByType(group, "heating-fan-coil") as THREE.InstancedMesh;
    expect(cassettes?.isInstancedMesh).toBe(true);
    expect(cassettes.count).toBeGreaterThan(4);
    expect(cassettes.instanceMatrix.version).toBeGreaterThanOrEqual(1);
  });
});

describe("DHWLayer detailed assets (graph placement)", { timeout: 30_000 }, () => {
  it("seats the DHW tank on the basement plant floor", () => {
    __injectEquipmentAssetForTest("dhw-tank", makeFakeAsset());
    const group = new DHWLayer().generate(makeRecipe());
    const tank = findByType(group, "dhw-storage-tank")!;
    expect(tank).toBeDefined();
    expect(tank.position.y).toBeLessThan(0);
  });
});

describe("ElectricalRoutingLayer (graph-driven)", { timeout: 30_000 }, () => {
  it("renders conduit + tray runs without assets (primitive path)", () => {
    const group = new ElectricalRoutingLayer().generate(makeRecipe());
    expect(findByType(group, "electrical-conduit")).toBeDefined();
    expect(findByType(group, "electrical-cable-tray")).toBeDefined();
  });

  it("places the switchboard and per-floor panels from the T5 hierarchy", () => {
    const group = new ElectricalRoutingLayer().generate(makeRecipe());
    expect(findByType(group, "lighting-panel")).toBeDefined();
  });

  it("dispose() clears without throwing", () => {
    const layer = new ElectricalRoutingLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});

describe("Green-retrofit equipment scenario", { timeout: 30_000 }, () => {
  it("derives hardware swaps from selected measure ids", () => {
    expect(deriveEquipmentScenario(null)).toEqual(SHOWCASE_EQUIPMENT_SCENARIO);
    expect(deriveEquipmentScenario([])).toEqual({
      heating: "baseline",
      lightingLed: false,
      solarPv: false,
      windowUpgrade: false,
      wallInsulation: false,
    });
    expect(
      deriveEquipmentScenario(["hvac-boiler-upgrade", "lighting-led", "solar-pv-flat"])
    ).toEqual({
      heating: "condensing",
      lightingLed: true,
      solarPv: true,
      windowUpgrade: false,
      wallInsulation: false,
    });
    // Heat-pump conversion supersedes the boiler upgrade
    expect(
      deriveEquipmentScenario(["hvac-boiler-upgrade", "hvac-heat-pump"]).heating
    ).toBe("heat-pump");
    expect(deriveEquipmentScenario(["lighting-led-smart"]).lightingLed).toBe(true);
  });

  it("heat-pump scenario replaces the boiler hero with the ASHP asset", () => {
    const group = new HeatingLayer().generate(CENTRAL(), 1.0, {}, { ...BASE_SCENARIO, heating: "heat-pump" });
    expect(findByType(group, "heating-boiler")).toBeUndefined();
    expect(findByType(group, "heating-heat-pump-plant")).toBeDefined();
  });

  it("condensing scenario swaps in the cascade and drops the legacy boiler", () => {
    const group = new HeatingLayer().generate(CENTRAL(), 1.0, {}, { ...BASE_SCENARIO, heating: "condensing" });
    expect(findByType(group, "heating-boiler")).toBeUndefined();
    expect(findByType(group, "heating-condensing-boiler")).toBeDefined();
  });

  it("solar measure gates the PV array, BESS, and inverters", () => {
    const noPv = new MicrogridLayer().generate(makeRecipe(), 1.0, {
      heating: "baseline",
      lightingLed: false,
      solarPv: false,
      windowUpgrade: false,
      wallInsulation: false,
    });
    expect(findByType(noPv, "microgrid-pv-panel")).toBeUndefined();
    expect(findByType(noPv, "microgrid-bess")).toBeUndefined();
    // Distribution backbone still renders without PV
    expect(findByType(noPv, "microgrid-backbone")).toBeDefined();

    const withPv = new MicrogridLayer().generate(makeRecipe(), 1.0, {
      heating: "baseline",
      lightingLed: false,
      solarPv: true,
      windowUpgrade: false,
      wallInsulation: false,
    });
    expect(findByType(withPv, "microgrid-pv-panel")).toBeDefined();
    expect(findByType(withPv, "microgrid-bess")).toBeDefined();
  });

  it("seats tilted PV modules and racks on the finished roof top", () => {
    const group = new MicrogridLayer().generate(makeRecipe(), 1.0, {
      heating: "baseline",
      lightingLed: false,
      solarPv: true,
      windowUpgrade: false,
      wallInsulation: false,
    });
    const panels = findByType(group, "microgrid-pv-panel") as THREE.InstancedMesh;
    const racks = findByType(group, "microgrid-pv-frame") as THREE.InstancedMesh;
    expect(panels.count).toBeGreaterThan(0);
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    panels.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    // roofTopY = 9.15; centre-origin tilt lift + 0.02 stack offset
    expect(pos.y).toBeGreaterThan(9.15);
    racks.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.y).toBeGreaterThan(9.15);
  });
});

describe("New site kit (graph equipment)", { timeout: 30_000 }, () => {
  it("renders the exhaust fan hero (primitive fallback with a cold cache)", () => {
    const group = new VentilationLayer().generate(VRF());
    expect(findByType(group, "vent-exhaust-fan")).toBeDefined();
  });

  it("places the fire pump on sprinklered towers from the graph source node", () => {
    const group = new SafetyLayer().generate(caseTowerOffice());
    expect(findByType(group, "safety-fire-pump")).toBeDefined();
  });
});
