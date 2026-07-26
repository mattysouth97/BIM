// src/lib/procedural/__tests__/envelope-scenario.test.ts
// Green-retrofit ENVELOPE scenario: the two new EquipmentScenario flags and
// the facade variants they drive.
//   - windowUpgrade  → "mullion-he" replaces "mullion" for h + v mullions
//   - wallInsulation → "facade-panel-insulated" replaces "facade-panel" AND
//     the solid-panel instances deepen to wallThickness + 0.08
// Distinct multi-box fakes give each asset id a unique merged vertex count so
// the swaps are observable without loading real GLBs.

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { generateFacade } from "../facade-generator";
import { ProceduralBuilding } from "../procedural-building";
import {
  deriveEquipmentScenario,
  equipmentScenarioKey,
  SHOWCASE_EQUIPMENT_SCENARIO,
  type EquipmentScenario,
} from "@/lib/layers/equipment-scenario";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "../types";

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

/** n unit boxes merged → 24·n vertices, giving each asset id a unique count. */
function makeFakeAsset(boxes: number): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < boxes; i++) {
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
      )
    );
  }
  return group;
}

/** Inject all four facade assets with distinguishable vertex counts. */
function injectFacadeKit(): void {
  __injectEquipmentAssetForTest("mullion", makeFakeAsset(1)); // 24
  __injectEquipmentAssetForTest("mullion-he", makeFakeAsset(2)); // 48
  __injectEquipmentAssetForTest("facade-panel", makeFakeAsset(1)); // 24
  __injectEquipmentAssetForTest("facade-panel-insulated", makeFakeAsset(3)); // 72
}

function facadeParts(group: THREE.Group) {
  const [glass, solid, hMullions, vMullions] = group.children as THREE.InstancedMesh[];
  return { glass, solid, hMullions, vMullions };
}

function verts(im: THREE.InstancedMesh): number {
  return im.geometry.getAttribute("position").count;
}

/** Decomposed scale of a given instance. */
function instanceScale(im: THREE.InstancedMesh, index: number): THREE.Vector3 {
  const mat4 = new THREE.Matrix4();
  im.getMatrixAt(index, mat4);
  const scl = new THREE.Vector3();
  mat4.decompose(new THREE.Vector3(), new THREE.Quaternion(), scl);
  return scl;
}

const WINDOW_UPGRADE: EquipmentScenario = {
  ...SHOWCASE_EQUIPMENT_SCENARIO,
  windowUpgrade: true,
};
const WALL_INSULATION: EquipmentScenario = {
  ...SHOWCASE_EQUIPMENT_SCENARIO,
  wallInsulation: true,
};
const FULL_ENVELOPE: EquipmentScenario = {
  ...SHOWCASE_EQUIPMENT_SCENARIO,
  windowUpgrade: true,
  wallInsulation: true,
};

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

// ---------------------------------------------------------------------------
// deriveEquipmentScenario / equipmentScenarioKey
// ---------------------------------------------------------------------------

describe("deriveEquipmentScenario — envelope flags", () => {
  it("defaults BOTH envelope flags to false for the showcase scenario (null ids)", () => {
    const s = deriveEquipmentScenario(null);
    expect(s).toEqual(SHOWCASE_EQUIPMENT_SCENARIO);
    expect(s.windowUpgrade).toBe(false);
    expect(s.wallInsulation).toBe(false);
    // ...unlike solarPv, which the showcase does render
    expect(s.solarPv).toBe(true);
  });

  it("leaves both flags false for an empty selection", () => {
    const s = deriveEquipmentScenario([]);
    expect(s.windowUpgrade).toBe(false);
    expect(s.wallInsulation).toBe(false);
  });

  it("sets windowUpgrade for envelope-window-replacement", () => {
    const s = deriveEquipmentScenario(["envelope-window-replacement"]);
    expect(s.windowUpgrade).toBe(true);
    expect(s.wallInsulation).toBe(false);
  });

  it("sets wallInsulation for envelope-wall-insulation", () => {
    const s = deriveEquipmentScenario(["envelope-wall-insulation"]);
    expect(s.wallInsulation).toBe(true);
    expect(s.windowUpgrade).toBe(false);
  });

  it("matches by prefix so suffixed variants still count", () => {
    const s = deriveEquipmentScenario([
      "envelope-window-replacement-lowe",
      "envelope-wall-insulation-eifs",
    ]);
    expect(s.windowUpgrade).toBe(true);
    expect(s.wallInsulation).toBe(true);
  });

  it("ignores unrelated envelope measures (roof insulation changes no facade hardware)", () => {
    const s = deriveEquipmentScenario(["envelope-roof-insulation"]);
    expect(s.windowUpgrade).toBe(false);
    expect(s.wallInsulation).toBe(false);
  });

  it("keeps the pre-existing hvac/lighting/solar derivation intact", () => {
    const s = deriveEquipmentScenario([
      "hvac-heat-pump",
      "lighting-led",
      "solar-pv-flat",
      "envelope-window-replacement",
    ]);
    expect(s).toEqual({
      heating: "heat-pump",
      lightingLed: true,
      solarPv: true,
      windowUpgrade: true,
      wallInsulation: false,
    });
  });
});

describe("equipmentScenarioKey", () => {
  it("distinguishes all four envelope-flag combinations", () => {
    const keys = [
      equipmentScenarioKey(SHOWCASE_EQUIPMENT_SCENARIO),
      equipmentScenarioKey(WINDOW_UPGRADE),
      equipmentScenarioKey(WALL_INSULATION),
      equipmentScenarioKey(FULL_ENVELOPE),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it("still distinguishes the pre-existing heating/lighting/solar axes", () => {
    const keys = new Set([
      equipmentScenarioKey(SHOWCASE_EQUIPMENT_SCENARIO),
      equipmentScenarioKey({ ...SHOWCASE_EQUIPMENT_SCENARIO, heating: "condensing" }),
      equipmentScenarioKey({ ...SHOWCASE_EQUIPMENT_SCENARIO, heating: "heat-pump" }),
      equipmentScenarioKey({ ...SHOWCASE_EQUIPMENT_SCENARIO, lightingLed: true }),
      equipmentScenarioKey({ ...SHOWCASE_EQUIPMENT_SCENARIO, solarPv: false }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("is stable for equal scenarios and reacts to an envelope measure", () => {
    const withInsulation = deriveEquipmentScenario(["envelope-wall-insulation"]);
    expect(equipmentScenarioKey(withInsulation)).toBe(
      equipmentScenarioKey(deriveEquipmentScenario(["envelope-wall-insulation"]))
    );
    expect(equipmentScenarioKey(withInsulation)).not.toBe(
      equipmentScenarioKey(deriveEquipmentScenario([]))
    );
  });

  // Regression coverage for the regen-thrash fix in procedural-building-model.tsx
  // / building-layers.tsx: those components now memoize the EquipmentScenario
  // object on this key (instead of on the raw selectedMeasureIds array) so a
  // measure-selection change that maps to no hardware doesn't rebuild the
  // whole scene. This proves the key is the right thing to memoize on: it
  // stays identical when the id-set churns without changing any hardware
  // flag, and still changes when a hardware-affecting measure is added.
  it("stays identical when selectedMeasureIds changes but no hardware flag is affected", () => {
    const before = deriveEquipmentScenario(["envelope-wall-insulation"]);
    // envelope-roof-insulation matches neither the window nor the wall
    // measure prefix — see deriveEquipmentScenario's own comment.
    const after = deriveEquipmentScenario([
      "envelope-wall-insulation",
      "envelope-roof-insulation",
    ]);
    expect(equipmentScenarioKey(before)).toBe(equipmentScenarioKey(after));
  });

  it("changes when a hardware-affecting measure is actually added", () => {
    const before = deriveEquipmentScenario(["envelope-wall-insulation"]);
    const after = deriveEquipmentScenario([
      "envelope-wall-insulation",
      "envelope-window-replacement",
    ]);
    expect(equipmentScenarioKey(before)).not.toBe(equipmentScenarioKey(after));
  });
});

// ---------------------------------------------------------------------------
// generateFacade — baseline behavior must be untouched
// ---------------------------------------------------------------------------

describe("generateFacade — baseline (pre-task behavior)", () => {
  it("falls back to unit boxes and wallThickness depth with an empty cache", () => {
    const facade = generateFacade(makeRecipe());
    expect(facade.children).toHaveLength(4);
    const { glass, solid, hMullions, vMullions } = facadeParts(facade);

    expect(glass.userData.type).toBe("glass");
    expect(verts(glass)).toBe(4); // PlaneGeometry(1,1)
    expect(verts(solid)).toBe(24);
    expect(verts(hMullions)).toBe(24);
    expect(verts(vMullions)).toBe(24);

    expect(solid.count).toBeGreaterThan(0);
    expect(instanceScale(solid, 0).z).toBeCloseTo(0.2, 6); // wallThickness
  });

  it("uses the baseline mullion/panel assets when the scenario is omitted", () => {
    injectFacadeKit();
    const facade = generateFacade(makeRecipe());
    const { solid, hMullions, vMullions } = facadeParts(facade);
    expect(verts(solid)).toBe(24); // facade-panel
    expect(verts(hMullions)).toBe(24); // mullion
    expect(verts(vMullions)).toBe(24); // mullion
    expect(instanceScale(solid, 0).z).toBeCloseTo(0.2, 6);
  });

  it("explicitly passing the showcase scenario matches the omitted-arg output", () => {
    injectFacadeKit();
    const implicitParts = facadeParts(generateFacade(makeRecipe()));
    const explicitParts = facadeParts(
      generateFacade(makeRecipe(), SHOWCASE_EQUIPMENT_SCENARIO)
    );
    expect(verts(explicitParts.solid)).toBe(verts(implicitParts.solid));
    expect(verts(explicitParts.vMullions)).toBe(verts(implicitParts.vMullions));
    expect(explicitParts.solid.count).toBe(implicitParts.solid.count);
    expect(explicitParts.glass.count).toBe(implicitParts.glass.count);
  });
});

// ---------------------------------------------------------------------------
// generateFacade — windowUpgrade
// ---------------------------------------------------------------------------

describe("generateFacade — windowUpgrade", () => {
  it("swaps BOTH horizontal and vertical mullions to mullion-he", () => {
    injectFacadeKit();
    const facade = generateFacade(makeRecipe(), WINDOW_UPGRADE);
    const { solid, hMullions, vMullions } = facadeParts(facade);
    expect(verts(hMullions)).toBe(48); // mullion-he
    expect(verts(vMullions)).toBe(48); // mullion-he
    expect(verts(solid)).toBe(24); // panel untouched
  });

  it("leaves the solid-panel depth at wallThickness", () => {
    injectFacadeKit();
    const { solid } = facadeParts(generateFacade(makeRecipe(), WINDOW_UPGRADE));
    expect(instanceScale(solid, 0).z).toBeCloseTo(0.2, 6);
  });

  it("keeps instance counts identical to the baseline", () => {
    injectFacadeKit();
    const base = facadeParts(generateFacade(makeRecipe(), SHOWCASE_EQUIPMENT_SCENARIO));
    const upgraded = facadeParts(generateFacade(makeRecipe(), WINDOW_UPGRADE));
    expect(upgraded.hMullions.count).toBe(base.hMullions.count);
    expect(upgraded.vMullions.count).toBe(base.vMullions.count);
    expect(upgraded.glass.count).toBe(base.glass.count);
  });

  it("degrades to the baseline mullion asset when mullion-he is not cached (never worse than pre-retrofit)", () => {
    // 2-box fake → 48 verts, distinguishable from both the 24-vert box
    // fallback and the mullion-he fake used elsewhere in this file.
    __injectEquipmentAssetForTest("mullion", makeFakeAsset(2)); // baseline only
    const { hMullions, vMullions } = facadeParts(
      generateFacade(makeRecipe(), WINDOW_UPGRADE)
    );
    expect(verts(hMullions)).toBe(48); // baseline mullion, NOT the box
    expect(verts(vMullions)).toBe(48);
  });

  it("falls back to the unit box when BOTH mullion-he and the baseline mullion are missing", () => {
    // Truly empty cache — nothing injected.
    const { hMullions, vMullions } = facadeParts(
      generateFacade(makeRecipe(), WINDOW_UPGRADE)
    );
    expect(verts(hMullions)).toBe(24); // BoxGeometry fallback
    expect(verts(vMullions)).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// generateFacade — wallInsulation
// ---------------------------------------------------------------------------

describe("generateFacade — wallInsulation", () => {
  it("swaps the solid panels to facade-panel-insulated", () => {
    injectFacadeKit();
    const { solid, hMullions, vMullions } = facadeParts(
      generateFacade(makeRecipe(), WALL_INSULATION)
    );
    expect(verts(solid)).toBe(72); // facade-panel-insulated
    expect(verts(hMullions)).toBe(24); // mullions untouched
    expect(verts(vMullions)).toBe(24);
  });

  it("deepens every solid-panel instance to wallThickness + 0.08", () => {
    injectFacadeKit();
    const { solid } = facadeParts(generateFacade(makeRecipe(), WALL_INSULATION));
    expect(solid.count).toBeGreaterThan(0);
    for (let i = 0; i < solid.count; i++) {
      expect(instanceScale(solid, i).z).toBeCloseTo(0.28, 6);
    }
  });

  it("leaves the glass instances untouched", () => {
    injectFacadeKit();
    const base = facadeParts(generateFacade(makeRecipe(), SHOWCASE_EQUIPMENT_SCENARIO));
    const insulated = facadeParts(generateFacade(makeRecipe(), WALL_INSULATION));
    expect(insulated.glass.count).toBe(base.glass.count);
    expect(instanceScale(insulated.glass, 0).z).toBeCloseTo(
      instanceScale(base.glass, 0).z,
      6
    );
  });

  it("degrades to the baseline facade-panel asset when facade-panel-insulated is not cached (never worse than pre-retrofit)", () => {
    // 2-box fake → 48 verts, distinguishable from both the 24-vert box
    // fallback and the facade-panel-insulated fake used elsewhere in this file.
    __injectEquipmentAssetForTest("facade-panel", makeFakeAsset(2)); // baseline only
    const { solid } = facadeParts(generateFacade(makeRecipe(), WALL_INSULATION));
    expect(verts(solid)).toBe(48); // baseline facade-panel, NOT the box
    // Depth still deepens — the extra depth is a scenario property (the
    // retrofit itself), independent of which panel asset rendered it.
    expect(solid.count).toBeGreaterThan(0);
    for (let i = 0; i < solid.count; i++) {
      expect(instanceScale(solid, i).z).toBeCloseTo(0.28, 6);
    }
  });

  it("still deepens the panels when BOTH facade-panel-insulated and the baseline facade-panel are missing", () => {
    // Truly empty cache — nothing injected. Depth is a scenario property,
    // not an asset property — the coarse box fallback must thicken too,
    // otherwise the retrofit reads as a no-op.
    const { solid } = facadeParts(generateFacade(makeRecipe(), WALL_INSULATION));
    expect(verts(solid)).toBe(24); // BoxGeometry fallback
    expect(instanceScale(solid, 0).z).toBeCloseTo(0.28, 6);
  });
});

describe("generateFacade — both envelope measures", () => {
  it("applies the he-mullion and the insulated panel together", () => {
    injectFacadeKit();
    const { solid, hMullions, vMullions } = facadeParts(
      generateFacade(makeRecipe(), FULL_ENVELOPE)
    );
    expect(verts(hMullions)).toBe(48);
    expect(verts(vMullions)).toBe(48);
    expect(verts(solid)).toBe(72);
    expect(instanceScale(solid, 0).z).toBeCloseTo(0.28, 6);
  });

  it("hands out independent geometries to the h and v mullion meshes", () => {
    injectFacadeKit();
    const { hMullions, vMullions } = facadeParts(
      generateFacade(makeRecipe(), FULL_ENVELOPE)
    );
    expect(hMullions.geometry).not.toBe(vMullions.geometry);
  });
});

// ---------------------------------------------------------------------------
// ProceduralBuilding scenario pass-through
// ---------------------------------------------------------------------------

describe("ProceduralBuilding — scenario constructor argument", () => {
  function facadeOf(group: THREE.Group) {
    const facade = group.getObjectByName("facade") as THREE.Group;
    return facadeParts(facade);
  }

  it("defaults to the showcase (baseline envelope) when omitted", () => {
    injectFacadeKit();
    const { solid, vMullions } = facadeOf(new ProceduralBuilding(makeRecipe()).generate());
    expect(verts(vMullions)).toBe(24);
    expect(verts(solid)).toBe(24);
  });

  it("threads the retrofit scenario into the facade pass", () => {
    injectFacadeKit();
    const { solid, hMullions, vMullions } = facadeOf(
      new ProceduralBuilding(makeRecipe(), FULL_ENVELOPE).generate()
    );
    expect(verts(hMullions)).toBe(48);
    expect(verts(vMullions)).toBe(48);
    expect(verts(solid)).toBe(72);
    expect(instanceScale(solid, 0).z).toBeCloseTo(0.28, 6);
  });

  it("applies the scenario to every section of a multi-section facade", () => {
    injectFacadeKit();
    const recipe = makeRecipe();
    recipe.sections = [
      { startFloor: 1, endFloor: 1, mainPurpsCd: "03000", facade: recipe.facade },
      { startFloor: 2, endFloor: 3, mainPurpsCd: "02000", facade: recipe.facade },
    ];
    const group = new ProceduralBuilding(recipe, FULL_ENVELOPE).generate();
    const facadeGroup = group.getObjectByName("facade") as THREE.Group;
    expect(facadeGroup.children).toHaveLength(2);
    for (const section of facadeGroup.children as THREE.Group[]) {
      const { solid, vMullions } = facadeParts(section);
      expect(verts(vMullions)).toBe(48);
      expect(verts(solid)).toBe(72);
    }
  });

  it("dispose() does not throw with the retrofit kit present", () => {
    injectFacadeKit();
    const building = new ProceduralBuilding(makeRecipe(), FULL_ENVELOPE);
    building.generate();
    expect(() => building.dispose()).not.toThrow();
  });
});
