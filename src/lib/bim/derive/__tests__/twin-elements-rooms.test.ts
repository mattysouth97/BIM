// src/lib/bim/derive/__tests__/twin-elements-rooms.test.ts
// deriveRoomElements had no test at all. Found via a live measurement of
// 서울청운초등학교 (pk 1002122071): the register's own 층별개요 gives seven
// wildly uneven storeys (198 to 2,961.97 m², summing to the stated 연면적
// 12,957.58 m² to the cent — docs/04_Agent-Handoffs/2026-09-04-register-search-and-school-findings.md),
// but the Rooms panel reported 7 x 2,749.71 = 19,247.6 m² (+48.5%) because
// `area` was computed once via footprintArea(recipe), outside the per-floor
// map, and floor.plate was never consulted. This blocked P2-29/P2-30
// sign-off (docs/work-plan/README.md:117) — one producer and per-storey
// envelope can't both be claimed while this consumer extrudes the footprint.
import { describe, expect, it } from "vitest";
import { deriveRoomElements } from "../twin-elements";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

function recipe(floors: FloorSpec[]): BuildingRecipe {
  return {
    footprintWidth: 50,
    footprintDepth: 55, // 50 x 55 = 2,750 m², ~ the school's stated 건축면적 2,749.71
    floors,
    totalHeight: floors.reduce((sum, f) => sum + f.height, 0),
    wallThickness: 0.2,
    era: "2000-2009",
    strctCd: "21",
    mainPurpsCd: "10101",
    facade: {
      windowWidth: 1.5, windowHeight: 1.5, sillHeight: 0.9, windowSpacing: 3,
      windowRatio: 0.3, mullionDepth: 0.05, mullionWidth: 0.05, glassInset: 0.03,
      solidPanelChance: 0, parapetHeight: 0.9, cornerInset: 0,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.25, gableHeight: 0, hipInset: 0 },
    materials: {
      wall: { color: "#ccc", roughness: 0.8, metalness: 0 },
      glass: { color: "#88b", roughness: 0.1, metalness: 0 },
      mullion: { color: "#666", roughness: 0.4, metalness: 0.5 },
      slab: { color: "#ccc", roughness: 0.8, metalness: 0 },
      column: { color: "#ccc", roughness: 0.8, metalness: 0 },
      roof: { color: "#888", roughness: 0.8, metalness: 0 },
      groundFloor: { color: "#ccc", roughness: 0.8, metalness: 0 },
    },
    siteWidth: 90, siteDepth: 95, buildingName: "서울청운초등학교", address: "청운동",
  };
}

/** A square plate of the given area, centred on the origin. */
function squarePlate(areaSqm: number): [number, number][][] {
  const half = Math.sqrt(areaSqm) / 2;
  return [[[-half, -half], [half, -half], [half, half], [-half, half]]];
}

describe("deriveRoomElements", () => {
  it("gives each storey its own plate area, not the whole-building footprint for every floor", () => {
    // Mirrors the school: real per-floor areas, wildly uneven, summing to the
    // stated total rather than to floorCount x footprint.
    const stated = [198, 2961.97, 2499.78, 2587.7, 1884.13, 1884.13, 941.87];
    const floors: FloorSpec[] = stated.map((area, i) => ({
      floorNo: i - 1, // B2..5F, arbitrary numbering — not the point under test
      label: `F${i}`,
      type: "above",
      y: i * 4,
      height: 4,
      isGroundFloor: i === 2,
      plate: squarePlate(area),
    }));

    const rooms = deriveRoomElements({ recipe: recipe(floors) });

    expect(rooms).toHaveLength(7);
    const areas = rooms.map((r) => r.area);
    // The whole point: seven DIFFERENT numbers, matching what each floor's
    // own plate states, not one number repeated seven times.
    expect(new Set(areas).size).toBeGreaterThan(1);
    for (let i = 0; i < stated.length; i++) {
      expect(areas[i]).toBeCloseTo(stated[i], 1);
    }
    const total = areas.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(12957.58, 0);
    // Not the old bug's number.
    expect(total).not.toBeCloseTo(2749.71 * 7, 0);
  });

  it("falls back to the building footprint for a storey with no plate of its own (P2-30 default)", () => {
    const floors: FloorSpec[] = [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 4, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 4, height: 4, isGroundFloor: false },
    ];
    const rooms = deriveRoomElements({ recipe: recipe(floors) });
    expect(rooms[0].area).toBeCloseTo(50 * 55, 2);
    expect(rooms[1].area).toBeCloseTo(50 * 55, 2);
  });
});
