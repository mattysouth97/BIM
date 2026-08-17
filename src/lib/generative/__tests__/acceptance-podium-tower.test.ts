// src/lib/generative/__tests__/acceptance-podium-tower.test.ts
//
// ACCEPTANCE: a "tower on a podium" prompt survives the whole chain.
//
//   prompt → HeuristicReasoningProvider → BuildingSpec
//          → generateBuildingFromSpec → GeneratedBuilding
//          → emitSnapshot          → BimModelSnapshot
//          → validateBuilding      → ValidationReport
//          → compileSpecToRecipe   → BuildingRecipe / MassingResult
//
// `podium-tower` is the one parametric massing strategy with ZERO coverage
// anywhere in this suite (grep "podium" over __tests__ returned nothing before
// this file). Unlike l-shape/courtyard/twin-bar it is never reachable through
// the blueprint compiler — `compileBlueprintToSpec` always emits "custom"
// (see blueprint/compile.ts) — so the only way to reach it deterministically
// is a prompt through the heuristic provider, which is also the realistic
// path: `detectMassing` in heuristic-provider.ts matches the word "podium".
//
// The shape under test: `generateMassing` (massing.ts ~L349-364) gives every
// level at or below `podiumLevels` the podium rectangle and every level above
// it the tower rectangle, where `towerW/D = min(width, podium*0.62)` — always
// strictly smaller and centred on the same origin, so the tower is always
// wholly inside the podium footprint by construction. What is NOT guaranteed
// by construction is everything downstream that has to survive the plate
// shrinking partway up the stack: the core (one rect for the whole building,
// sized off the PODIUM plate in heuristic-provider.ts's `coreFromPlate` call)
// has to still fit inside the narrower TOWER plate, and structure/walls/slabs
// have to track the level's own plate rather than the shared "primary" one.
//
// Deterministic path only: no network, fixed seed derived from the prompt.

import { beforeAll, describe, expect, it } from "vitest";

import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { polygonArea, polygonBounds, type Polygon } from "../generate/massing";
import { clipRectToPolygon, pointInPolygon } from "../geom";
import { emitSnapshot } from "../graph/emit";
import { generationIdFor } from "../build";
import { seedFromPrompt } from "../rng";
import { validateBuilding } from "../validate/rules";
import type { BimElement } from "@/lib/bim/model/types";

/* ------------------------------------------------------------------ */
/* Chain runner                                                        */
/* ------------------------------------------------------------------ */

const provider = new HeuristicReasoningProvider();

async function runChain(prompt: string, seed: number) {
  const { data: spec } = await provider.generateBuilding({ prompt, seed });
  const building = generateBuildingFromSpec(spec);
  const compiled = compileSpecToRecipe(spec); // { recipe, massing, totalHeightM, grossAreaSqm, approximations }
  const snapshot = emitSnapshot({
    buildingPk: "BLD-ACCEPTANCE",
    generationId: generationIdFor(seed, 0),
    spec,
    building,
  });
  const validation = validateBuilding(building, spec);
  return { spec, building, snapshot, validation, ...compiled };
}

type Chain = Awaited<ReturnType<typeof runChain>>;

/** Bounding-box width/depth of a level plate, metres. */
function extentOf(polygon: Polygon): { widthM: number; depthM: number } {
  const b = polygonBounds(polygon);
  return { widthM: b.maxX - b.minX, depthM: b.maxZ - b.minZ };
}

const outlineOf = (element: BimElement): Polygon =>
  JSON.parse(element.instanceParameters.outlineJson as string) as Polygon;

// "15-storey" (digits, not a word number — WORD_NUMBERS in heuristic-provider
// tops out at twelve) so the tower has plenty of storeys above any podium
// height `massingParameters` can roll (podiumLevels is rng.int(2, 3)).
const PROMPT =
  "A 15-storey office building: a tower rising above a two-storey podium base.";
const SEED = seedFromPrompt(PROMPT);

describe("ACCEPTANCE: a podium-tower prompt narrows the plate above the podium", () => {
  let chain: Chain;

  beforeAll(async () => {
    chain = await runChain(PROMPT, SEED);
  });

  it("resolves the prompt to the podium-tower strategy with a real podium/tower split", () => {
    expect(chain.spec.massing.strategy.value).toBe("podium-tower");

    const podiumLevels = chain.spec.massing.parameters.podiumLevels;
    expect(podiumLevels).toBeDefined();
    expect(podiumLevels!).toBeGreaterThanOrEqual(1);

    const totalStoreys = chain.building.levels.filter((l) => l.floorNo > 0).length;
    expect(totalStoreys).toBeGreaterThan(0);
    // A tower with nothing above the podium is not a tower.
    expect(podiumLevels!).toBeLessThan(totalStoreys);

    expect(chain.massing.variesByLevel).toBe(true);
    // `compileSpecToRecipe` surfaces the same fact as a human-readable note
    // for the UI, so a variesByLevel massing never renders as if it were flat.
    expect(chain.approximations.some((note) => note.includes("varies by level"))).toBe(true);
  });

  it("gives podium levels a strictly larger plate than tower levels, tower wholly inside", () => {
    const podiumLevels = chain.spec.massing.parameters.podiumLevels!;
    const aboveGrade = chain.building.levels.filter((l) => l.floorNo > 0);

    const podium = aboveGrade.filter((l) => l.floorNo <= podiumLevels);
    const tower = aboveGrade.filter((l) => l.floorNo > podiumLevels);
    expect(podium.length).toBeGreaterThan(0);
    expect(tower.length).toBeGreaterThan(0);

    // Every podium plate is the SAME rectangle, every tower plate is the SAME
    // (smaller) rectangle — massing.ts's podium-tower branch does not vary
    // within either band, so picking the first of each is representative, and
    // the loop below re-confirms it holds for every level, not just one.
    const podiumExtent = extentOf(podium[0].polygon);
    const towerExtent = extentOf(tower[0].polygon);

    expect(towerExtent.widthM).toBeLessThan(podiumExtent.widthM);
    expect(towerExtent.depthM).toBeLessThan(podiumExtent.depthM);
    expect(podium[0].plateAreaSqm).toBeGreaterThan(tower[0].plateAreaSqm);

    for (const level of podium) {
      expect(extentOf(level.polygon)).toEqual(podiumExtent);
      expect(level.plateAreaSqm).toBeCloseTo(podium[0].plateAreaSqm, 6);
    }
    for (const level of tower) {
      expect(extentOf(level.polygon)).toEqual(towerExtent);
      expect(level.plateAreaSqm).toBeCloseTo(tower[0].plateAreaSqm, 6);

      // Not just narrower — actually INSIDE the podium footprint. Every tower
      // corner must lie in the podium plate, and the whole tower rect must
      // clip cleanly against it.
      const towerBounds = polygonBounds(level.polygon);
      const towerRect = {
        minX: towerBounds.minX,
        maxX: towerBounds.maxX,
        minZ: towerBounds.minZ,
        maxZ: towerBounds.maxZ,
      };
      expect(
        clipRectToPolygon(towerRect, podium[0].polygon, 0.01),
        `tower level ${level.floorNo} escapes the podium footprint`,
      ).toBe(true);
      for (const [x, z] of level.polygon[0]) {
        expect(pointInPolygon([x, z], podium[0].polygon, 1e-6)).toBe(true);
      }
    }
  });

  it("assigns the podium plate at/below podiumLevels and the tower plate above it (massing.plates)", () => {
    const podiumLevels = chain.spec.massing.parameters.podiumLevels!;
    const byFloor = new Map(chain.massing.plates.map((p) => [p.floorNo, p]));

    const podiumArea = byFloor.get(1)!.areaSqm;
    // Every floorNo above 0 up to podiumLevels shares the podium plate...
    for (let floorNo = 1; floorNo <= podiumLevels; floorNo += 1) {
      const plate = byFloor.get(floorNo);
      expect(plate, `no plate for podium level ${floorNo}`).toBeDefined();
      expect(plate!.areaSqm).toBeCloseTo(podiumArea, 6);
    }
    // ...and every one above it is on the (strictly smaller) tower plate.
    const maxFloorNo = Math.max(...[...byFloor.keys()].filter((n) => n > 0));
    for (let floorNo = podiumLevels + 1; floorNo <= maxFloorNo; floorNo += 1) {
      const plate = byFloor.get(floorNo);
      expect(plate, `no plate for tower level ${floorNo}`).toBeDefined();
      expect(plate!.areaSqm).toBeLessThan(podiumArea);
    }
  });

  it("carries the podium/tower split into the emitted slab outlines", () => {
    const podiumLevels = chain.spec.massing.parameters.podiumLevels!;
    const slabs = chain.snapshot.elements.filter((element) => element.kind === "slab");
    expect(slabs).toHaveLength(chain.building.levels.length);

    for (const level of chain.building.levels) {
      const slab = slabs.find((s) => s.levelId === `level:${level.floorNo}`);
      expect(slab, `no slab emitted for level ${level.floorNo}`).toBeDefined();
      const outline = outlineOf(slab!);
      expect(polygonArea(outline)).toBeCloseTo(level.plateAreaSqm, 2);
      expect(slab!.instanceParameters.areaM2).toBeCloseTo(level.plateAreaSqm, 2);
    }

    const podiumSlab = slabs.find((s) => s.levelId === `level:${podiumLevels}`)!;
    const towerSlab = slabs.find((s) => s.levelId === `level:${podiumLevels + 1}`)!;
    expect(Number(towerSlab.instanceParameters.areaM2)).toBeLessThan(
      Number(podiumSlab.instanceParameters.areaM2),
    );
  });

  it("traces exterior walls to each level's own plate at the podium/tower boundary", () => {
    const podiumLevels = chain.spec.massing.parameters.podiumLevels!;
    const levelByFloor = new Map(chain.building.levels.map((l) => [l.floorNo, l]));
    const podiumLevel = levelByFloor.get(podiumLevels)!;
    const towerLevel = levelByFloor.get(podiumLevels + 1)!;

    const exteriorWalls = chain.snapshot.elements.filter(
      (element) => element.kind === "wall" && element.instanceParameters.exterior === true,
    );

    for (const [floorNo, level] of [
      [podiumLevels, podiumLevel] as const,
      [podiumLevels + 1, towerLevel] as const,
    ]) {
      const wallsOnLevel = exteriorWalls.filter((w) => w.levelId === `level:${floorNo}`);
      expect(wallsOnLevel.length).toBeGreaterThan(0);
      for (const wall of wallsOnLevel) {
        const sx = wall.instanceParameters.startX as number;
        const sz = wall.instanceParameters.startZ as number;
        const ex = wall.instanceParameters.endX as number;
        const ez = wall.instanceParameters.endZ as number;
        // Every exterior wall endpoint sits on that level's OWN plate — a
        // podium-sized wall surviving onto the tower floor (or vice versa)
        // would mean the plate change never reached the wall pass.
        expect(pointInPolygon([sx, sz], level.polygon, 1e-3) || onRingApprox(level.polygon, sx, sz)).toBe(
          true,
        );
        expect(pointInPolygon([ex, ez], level.polygon, 1e-3) || onRingApprox(level.polygon, ex, ez)).toBe(
          true,
        );
      }
    }

    // The tower's perimeter is strictly shorter than the podium's, so it
    // cannot take as many — or as long — exterior wall segments.
    const podiumWallLen = sumWallLength(
      exteriorWalls.filter((w) => w.levelId === `level:${podiumLevels}`),
    );
    const towerWallLen = sumWallLength(
      exteriorWalls.filter((w) => w.levelId === `level:${podiumLevels + 1}`),
    );
    expect(towerWallLen).toBeLessThan(podiumWallLen);
  });

  it("keeps the core continuous and standing on solid floor at every level, tower included", () => {
    const floorNos = chain.building.levels.map((l) => l.floorNo);
    const min = Math.min(...floorNos);
    const max = Math.max(...floorNos);
    expect(chain.building.core.components.length).toBeGreaterThan(0);

    for (const component of chain.building.core.components) {
      // One shaft for the whole building — it cannot stop at the podium roof.
      expect(component.fromFloorNo).toBeLessThanOrEqual(min);
      expect(component.toFloorNo).toBeGreaterThanOrEqual(max);
    }

    // The core rect is sized once, off the (wider) podium plate — the sharpest
    // version of this check is confirming it still fits the narrowest (tower)
    // plate the strategy produces, not just the podium it was derived from.
    const podiumLevels = chain.spec.massing.parameters.podiumLevels!;
    const topTowerLevel = chain.building.levels.find((l) => l.floorNo === max)!;
    expect(max).toBeGreaterThan(podiumLevels);
    for (const component of chain.building.core.components) {
      expect(
        clipRectToPolygon(component.rect, topTowerLevel.polygon, 0.05),
        `core component ${component.id} does not fit the tower plate at the roof`,
      ).toBe(true);
    }
  });

  it("validates with no critical violations, including at the podium/tower boundary levels", () => {
    const critical = chain.validation.violations.filter((v) => v.severity === "critical");
    expect(critical).toEqual([]);
    expect(chain.validation.geometricallyValid).toBe(true);

    const podiumLevels = chain.spec.massing.parameters.podiumLevels!;
    const boundaryViolations = chain.validation.violations.filter(
      (v) => v.floorNo === podiumLevels || v.floorNo === podiumLevels + 1,
    );
    expect(boundaryViolations.filter((v) => v.severity === "critical")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

/** Point on the ring's boundary (within tolerance) — for wall endpoints that
 * legitimately sit exactly on the plate edge, where `pointInPolygon`'s
 * even-odd test can be ambiguous. */
function onRingApprox(polygon: Polygon, x: number, z: number, toleranceM = 1e-2): boolean {
  const ring = polygon[0];
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
    const distance = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (distance <= toleranceM) return true;
  }
  return false;
}

function sumWallLength(walls: BimElement[]): number {
  return walls.reduce((sum, wall) => {
    const sx = wall.instanceParameters.startX as number;
    const sz = wall.instanceParameters.startZ as number;
    const ex = wall.instanceParameters.endX as number;
    const ez = wall.instanceParameters.endZ as number;
    return sum + Math.hypot(ex - sx, ez - sz);
  }, 0);
}
