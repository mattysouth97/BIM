// src/lib/mep/qa-cases.ts
// Procedural QA building set (§31): representative recipes that expose
// generator weaknesses. Shared by the engine, validation and renderer tests.

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

function floorRun(count: number, height = 3.4, basements = 0): FloorSpec[] {
  const floors: FloorSpec[] = [];
  for (let b = basements; b >= 1; b -= 1) {
    floors.push({
      floorNo: -b,
      label: `B${b}`,
      type: "below",
      y: -b * height,
      height,
      isGroundFloor: false,
    });
  }
  for (let i = 0; i < count; i += 1) {
    floors.push({
      floorNo: i + 1,
      label: `${i + 1}F`,
      type: "above",
      y: i * height,
      height,
      isGroundFloor: i === 0,
    });
  }
  return floors;
}

export function makeRecipe(overrides: Partial<BuildingRecipe> = {}): BuildingRecipe {
  const floors = overrides.floors ?? floorRun(5);
  const above = floors.filter((f) => f.type === "above");
  return {
    footprintWidth: 30,
    footprintDepth: 20,
    floors,
    totalHeight: above.reduce((s, f) => Math.max(s, f.y + f.height), 0),
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "14000",
    column: { spacing: 7.5, size: 0.5, inset: 1 },
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
    siteWidth: 45,
    siteDepth: 35,
    buildingName: "QA Building",
    address: "",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0.0 },
      column: { color: "#bbbbbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999999", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#dddddd", roughness: 0.9, metalness: 0.0 },
    },
    ...overrides,
  };
}

/** Case A — small low-rise office (no elevator, no sprinklers). */
export const caseSmallOffice = (): BuildingRecipe =>
  makeRecipe({ footprintWidth: 16, footprintDepth: 12, floors: floorRun(3, 3.2) });

/** Case B — 12-storey office (sprinklers + full vertical distribution). */
export const caseTowerOffice = (): BuildingRecipe =>
  makeRecipe({ footprintWidth: 32, footprintDepth: 22, floors: floorRun(12, 3.6, 1) });

/** Case C — 15-storey apartment (residential archetype). */
export const caseApartment = (): BuildingRecipe =>
  makeRecipe({
    mainPurpsCd: "02001",
    footprintWidth: 40,
    footprintDepth: 12,
    floors: floorRun(15, 2.9, 1),
  });

/** Case D — retail podium floor (packaged archetype). */
export const caseRetail = (): BuildingRecipe =>
  makeRecipe({ mainPurpsCd: "03001", footprintWidth: 36, footprintDepth: 28, floors: floorRun(2, 4.5) });

/** Case E — mechanical-room-heavy: pre-2000 central plant with basement. */
export const casePlantHeavy = (): BuildingRecipe =>
  makeRecipe({ era: "1990-1999", footprintWidth: 34, footprintDepth: 24, floors: floorRun(11, 3.8, 2) });

/** Case F — irregular CAD-derived L-shaped plate. */
export const caseLShape = (): BuildingRecipe =>
  makeRecipe({
    footprintWidth: 30,
    footprintDepth: 24,
    floors: floorRun(6, 3.5),
    footprintPolygon: [
      [
        [-15, -12],
        [15, -12],
        [15, 2],
        [-1, 2],
        [-1, 12],
        [-15, 12],
      ],
    ],
  });

/** CAD room polygons for the L-shape (classified plan output shape). */
export const caseLShapeRooms = (): { polygon: [number, number][] }[] => [
  { polygon: [[-14, -11], [-5, -11], [-5, -4], [-14, -4]] },
  { polygon: [[-4, -11], [5, -11], [5, -4], [-4, -4]] },
  { polygon: [[6, -11], [14, -11], [14, -4], [6, -4]] },
  { polygon: [[6, -3], [14, -3], [14, 1], [6, 1]] },
  { polygon: [[-14, 3], [-2, 3], [-2, 11], [-14, 11]] },
];
