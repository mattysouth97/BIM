// src/lib/layers/__tests__/detailed-assets.test.ts
// Detailed Blender-asset paths in the MEP layer generators:
//   - assets swap in when the cache is primed (injected here)
//   - placement geometry fixes: roof-top seating, basement plant floor
//   - coarse fallbacks remain when the cache is empty
//   - the new ElectricalRoutingLayer (wires) in both modes

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { CoolingLayer } from "../layer-3-cooling";
import { HeatingLayer } from "../layer-4-heating";
import { DHWLayer } from "../layer-6-dhw";
import { ElectricalRoutingLayer } from "../electrical-routing";
import { MicrogridLayer } from "../layer-14-microgrid";
import {
  deriveEquipmentScenario,
  SHOWCASE_EQUIPMENT_SCENARIO,
} from "../equipment-scenario";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "@/lib/procedural/types";

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 12,
    footprintDepth: 10,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 9.0,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "02000",
    column: { spacing: 6, size: 0.4, inset: 1 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.4,
      windowHeight: 1.6,
      sillHeight: 0.9,
      windowSpacing: 0.5,
      windowRatio: 0.6,
      mullionDepth: 0.06,
      mullionWidth: 0.05,
      glassInset: 0.04,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.2,
    },
    roof: { type: "flat", flatThickness: 0.15, gableHeight: 0, hipInset: 0 },
    siteWidth: 20,
    siteDepth: 18,
    buildingName: "Test Building",
    address: "Seoul, Korea",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0.0 },
      column: { color: "#bbbbbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999999", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#dddddd", roughness: 0.9, metalness: 0.0 },
    },
  };
}

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
});

describe("CoolingLayer detailed assets", () => {
  it("uses the Blender chiller and seats it ON the flat-roof top surface", () => {
    __injectEquipmentAssetForTest("chiller", makeFakeAsset());
    const group = new CoolingLayer().generate(makeRecipe());
    const plant = findByType(group, "cooling-plant")!;
    expect(plant).toBeDefined();
    // Base-origin asset: y = totalHeight + flatThickness (9.15), not embedded
    expect(plant.position.y).toBeCloseTo(9.15, 5);
    // Every descendant mesh carries the selection tag (click handler reads
    // userData from the raycast-hit mesh directly)
    let taggedMeshes = 0;
    plant.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.type === "cooling-plant") taggedMeshes++;
    });
    expect(taggedMeshes).toBeGreaterThan(0);
  });

  it("seats the detailed cooling tower on the roof top (clipping fix)", () => {
    __injectEquipmentAssetForTest("cooling-tower", makeFakeAsset());
    const group = new CoolingLayer().generate(makeRecipe(), 1.0, {
      showCoolingTower: true,
    });
    const tower = findByType(group, "cooling-tower")!;
    expect(tower).toBeDefined();
    expect(tower.position.y).toBeCloseTo(9.15, 5);
  });

  it("coarse fallback still seats equipment above the flat roof slab", () => {
    const group = new CoolingLayer().generate(makeRecipe(), 1.0, {
      showCoolingTower: true,
    });
    const plant = findByType(group, "cooling-plant") as THREE.Mesh;
    // Centre-origin merged geometry: 9.15 + bodyHeight/2
    expect(plant.position.y).toBeCloseTo(9.15 + 0.75, 5);
    const tower = findByType(group, "cooling-tower") as THREE.Mesh;
    // Cylinder (height 0.8×bodyHeight, centre origin) base at 9.15
    expect(tower.position.y).toBeCloseTo(9.15 + 0.6, 5);
  });
});

describe("HeatingLayer detailed assets", () => {
  it("keeps the boiler body fully below the ground slab (clipping fix)", () => {
    __injectEquipmentAssetForTest("boiler", makeFakeAsset());
    const group = new HeatingLayer().generate(makeRecipe());
    const boiler = findByType(group, "heating-boiler")!;
    // Base-origin asset at plant floor: -(height + 0.3) = -2.1
    expect(boiler.position.y).toBeCloseTo(-2.1, 5);
  });

  it("coarse boiler fallback is also re-seated below the slab", () => {
    const group = new HeatingLayer().generate(makeRecipe());
    const boiler = findByType(group, "heating-boiler") as THREE.Mesh;
    // Centre-origin: -2.1 + height/2 = -1.2 → body top at -0.3
    expect(boiler.position.y).toBeCloseTo(-1.2, 5);
  });

  it("swaps the VRF InstancedMesh geometry for the Blender asset", () => {
    __injectEquipmentAssetForTest("vrf-outdoor", makeFakeAsset());
    const group = new HeatingLayer().generate(makeRecipe());
    const vrf = findByType(group, "heating-vrf-head") as THREE.InstancedMesh;
    expect(vrf).toBeDefined();
    // Injected fake is a single 24-vert box (vs 4 merged boxes = 96 verts coarse)
    expect(vrf.geometry.getAttribute("position").count).toBe(24);
  });

  it("seats roof VRF cluster units on the flat-roof top surface (clipping fix)", () => {
    const group = new HeatingLayer().generate(makeRecipe());
    const vrf = findByType(group, "heating-vrf-head") as THREE.InstancedMesh;
    const mat4 = new THREE.Matrix4();
    vrf.getMatrixAt(0, mat4);
    const pos = new THREE.Vector3();
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    // roofTopY (9.0 + 0.15) + 0.31 lift for the centre-origin unit
    expect(pos.y).toBeCloseTo(9.15 + 0.31, 5);
  });

  it("renders the geothermal installation only when the asset is loaded", () => {
    const without = new HeatingLayer().generate(makeRecipe());
    expect(findByType(without, "heating-gshp")).toBeUndefined();

    __injectEquipmentAssetForTest("gshp", makeFakeAsset());
    const withAsset = new HeatingLayer().generate(makeRecipe());
    const gshp = findByType(withAsset, "heating-gshp")!;
    expect(gshp).toBeDefined();
    expect(gshp.position.y).toBeCloseTo(-2.1, 5);
  });
});

describe("DHWLayer detailed assets — shared plant floor", () => {
  it("tank, recirc tank, and pump all stand on the same basement floor", () => {
    __injectEquipmentAssetForTest("dhw-tank", makeFakeAsset());
    __injectEquipmentAssetForTest("dhw-pump", makeFakeAsset());
    const group = new DHWLayer().generate(makeRecipe());

    const tank = findByType(group, "dhw-storage-tank")!;
    const recirc = findByType(group, "dhw-recirc-tank")!;
    const pump = findByType(group, "dhw-pump")!;
    // Plant floor = -tankHeight = -1.8; all base-origin assets seated there
    expect(tank.position.y).toBeCloseTo(-1.8, 5);
    expect(recirc.position.y).toBeCloseTo(-1.8, 5);
    expect(pump.position.y).toBeCloseTo(-1.8, 5);
  });

  it("coarse fallback: recirc tank and pump no longer float", () => {
    const group = new DHWLayer().generate(makeRecipe());
    const recirc = findByType(group, "dhw-recirc-tank") as THREE.Mesh;
    // Centre-origin cylinder h = 0.8×1.8: base at -1.8 → centre at -1.08
    expect(recirc.position.y).toBeCloseTo(-1.8 + 0.72, 5);
    const pump = findByType(group, "dhw-pump") as THREE.Mesh;
    // Pump axis one body radius (0.18) above the plant floor
    expect(pump.position.y).toBeCloseTo(-1.8 + 0.18, 5);
  });
});

describe("ElectricalRoutingLayer (wires)", () => {
  it("falls back to emissive conduits without assets", () => {
    const group = new ElectricalRoutingLayer().generate(makeRecipe());
    expect(group.name).toBe("electrical-routing");
    expect(findByType(group, "electrical-riser")).toBeDefined();
    let runs = 0;
    group.traverse((o) => {
      if (o.userData?.type === "electrical-run") runs++;
    });
    expect(runs).toBe(3); // one per above floor
  });

  it("tiles cable-tray modules in a single InstancedMesh when loaded", () => {
    __injectEquipmentAssetForTest("cable-tray", makeFakeAsset());
    const group = new ElectricalRoutingLayer().generate(makeRecipe());
    const tray = findByType(group, "electrical-cable-tray") as THREE.InstancedMesh;
    expect(tray).toBeDefined();
    // riser ceil(9)=9 + 3 floors × (mainRun floor(12×0.7)=8 + zRun floor(10×0.5)=5)
    expect(tray.count).toBe(9 + 3 * (8 + 5));
    // Realism additions: conduit banks/drops + junction boxes
    const conduits = findByType(group, "electrical-conduit") as THREE.InstancedMesh;
    expect(conduits).toBeDefined();
    expect(conduits.count).toBe(3 * 5); // 3 bank + 2 drops per floor
    const jboxes = findByType(group, "electrical-junction-box") as THREE.InstancedMesh;
    expect(jboxes).toBeDefined();
    expect(jboxes.count).toBe(3 * 3);
  });

  it("dispose() clears without throwing", () => {
    const layer = new ElectricalRoutingLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});

describe("Green-retrofit equipment scenario", () => {
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

  it("heat-pump scenario replaces the boiler with an ASHP bank", () => {
    const group = new HeatingLayer().generate(makeRecipe(), 1.0, {}, {
      heating: "heat-pump",
      lightingLed: false,
      solarPv: false,
      windowUpgrade: false,
      wallInsulation: false,
    });
    expect(findByType(group, "heating-boiler")).toBeUndefined();
    let ashpCount = 0;
    group.traverse((o) => {
      if (o.userData?.type === "heating-heat-pump-plant" && o.parent === group) ashpCount++;
    });
    expect(ashpCount).toBe(3);
  });

  it("condensing scenario swaps in the cascade and drops the legacy boiler", () => {
    const group = new HeatingLayer().generate(makeRecipe(), 1.0, {}, {
      heating: "condensing",
      lightingLed: false,
      solarPv: false,
      windowUpgrade: false,
      wallInsulation: false,
    });
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
});
