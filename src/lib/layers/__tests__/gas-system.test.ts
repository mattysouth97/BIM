// src/lib/layers/__tests__/gas-system.test.ts
// Building-code rules + era-aware gas system:
//   - getBuildingCodeRules thresholds (건축법 제64조 elevators, 소방시설법
//     sprinklers, 도시가스 vs LPG supply era)
//   - GasLayer renders city-gas service/meter/riser/branches for 1990+
//     permits and an LPG cylinder cage for earlier eras

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { GasLayer } from "../gas-system";
import { getBuildingCodeRules } from "../building-code-rules";
import { __resetEquipmentAssetsForTest } from "@/lib/equipment-assets";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BuildingEra } from "@/lib/material-types";

function makeFloors(count: number, height = 3.0) {
  return Array.from({ length: count }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * height,
    height,
    isGroundFloor: i === 0,
  }));
}

function makeRecipe(era: BuildingEra, floorCount = 4): BuildingRecipe {
  return {
    footprintWidth: 12,
    footprintDepth: 10,
    floors: makeFloors(floorCount),
    totalHeight: floorCount * 3.0,
    wallThickness: 0.2,
    era,
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

function collectTypes(group: THREE.Group): Map<string, number> {
  const counts = new Map<string, number>();
  group.traverse((obj) => {
    const t = obj.userData?.type;
    if (typeof t === "string") counts.set(t, (counts.get(t) ?? 0) + 1);
  });
  return counts;
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

describe("getBuildingCodeRules", () => {
  it("requires an elevator from 6 above-ground floors (건축법 제64조)", () => {
    expect(getBuildingCodeRules(makeRecipe("2010-2019", 5)).elevatorRequired).toBe(false);
    expect(getBuildingCodeRules(makeRecipe("2010-2019", 6)).elevatorRequired).toBe(true);
  });

  it("requires sprinklers from 11 above-ground floors (소방시설법)", () => {
    expect(getBuildingCodeRules(makeRecipe("2010-2019", 10)).sprinklersRequired).toBe(false);
    expect(getBuildingCodeRules(makeRecipe("2010-2019", 11)).sprinklersRequired).toBe(true);
  });

  it("assigns LPG to pre-1990 permit eras, city gas from 1990 on", () => {
    expect(getBuildingCodeRules(makeRecipe("pre-1970")).gasSupply).toBe("lpg");
    expect(getBuildingCodeRules(makeRecipe("1970-1989")).gasSupply).toBe("lpg");
    expect(getBuildingCodeRules(makeRecipe("1990-1999")).gasSupply).toBe("city-gas");
    expect(getBuildingCodeRules(makeRecipe("2020+")).gasSupply).toBe("city-gas");
  });
});

describe("GasLayer — city gas era (1990+)", () => {
  it("renders service line, meter, exterior riser, per-floor branches, valves, boiler feed", () => {
    const recipe = makeRecipe("2010-2019", 4);
    const group = new GasLayer().generate(recipe);
    const counts = collectTypes(group);

    expect(counts.get("gas-service-line")).toBeGreaterThanOrEqual(2);
    expect(counts.get("gas-meter")).toBe(1); // coarse fallback box (no assets in test)
    expect(counts.get("gas-riser")).toBe(1);
    // One branch run (2 segments) + one valve per above floor
    expect(counts.get("gas-branch")).toBe(4 * 2);
    expect(counts.get("gas-valve")).toBe(4);
    expect(counts.get("gas-boiler-feed")).toBeGreaterThanOrEqual(3);
    // No LPG hardware in the city-gas era
    expect(counts.has("gas-lpg-cage")).toBe(false);
  });

  it("places the riser OUTSIDE the +Z facade (exposed exterior piping)", () => {
    const recipe = makeRecipe("2010-2019", 4);
    const group = new GasLayer().generate(recipe);
    let riser: THREE.Object3D | undefined;
    group.traverse((o) => {
      if (!riser && o.userData?.type === "gas-riser") riser = o;
    });
    expect(riser).toBeDefined();
    // Tube geometry is authored in world space; verify via bounding box
    const box = new THREE.Box3().setFromObject(riser!);
    const hd = recipe.footprintDepth / 2;
    expect(box.min.z).toBeGreaterThan(hd); // strictly outside the facade
  });
});

describe("GasLayer — LPG era (pre-1990)", () => {
  it("renders the cylinder cage instead of a city-gas meter", () => {
    const group = new GasLayer().generate(makeRecipe("1970-1989", 4));
    const counts = collectTypes(group);

    expect(counts.get("gas-lpg-cage")).toBe(1); // coarse fallback box
    expect(counts.has("gas-meter")).toBe(false);
    expect(counts.get("gas-riser")).toBe(1);
    expect(counts.get("gas-valve")).toBe(4);
  });
});

describe("GasLayer dispose()", () => {
  it("does not throw", () => {
    const layer = new GasLayer();
    layer.generate(makeRecipe("2010-2019", 4));
    expect(() => layer.dispose()).not.toThrow();
  });
});
