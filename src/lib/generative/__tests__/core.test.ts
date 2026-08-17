import { describe, expect, it } from "vitest";

import { generateCore } from "../generate/core";
import { generateMassing, polygonBounds } from "../generate/massing";
import { rectDepth, rectWidth, rectsOverlap, type CoreLayout, type Rect } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

/** Matches the ring `generateCore` promises to leave around the core. */
const MIN_PERIMETER_M = 1.5;
/** Geometry tolerance. Anything larger would hide a real escape. */
const TOL = 1e-9;

const CORE_STRATEGIES = ["central", "offset", "end", "dual", "perimeter-split"] as const;

/** Minimum plan sizes the layout contract guarantees, orientation-agnostic. */
const MIN_SIZE: Record<string, { short: number; long: number }> = {
  stair: { short: 2.5, long: 5.0 },
  elevator: { short: 2.0, long: 2.2 },
  shaft: { short: 0.8, long: 0.8 },
};

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

/** The real plate the massing pass would hand the core generator. */
function plateOf(spec: BuildingSpec): Rect {
  const bounds = polygonBounds(generateMassing(spec).primary);
  return {
    minX: bounds.minX,
    minZ: bounds.minZ,
    maxX: bounds.maxX,
    maxZ: bounds.maxZ,
  };
}

function floorsOf(spec: BuildingSpec): number[] {
  return spec.levels.map((level) => level.floorNo).sort((a, b) => a - b);
}

/** Re-point the core at a strategy with a genuine (over-large) displacement. */
function withStrategy(
  spec: BuildingSpec,
  strategy: (typeof CORE_STRATEGIES)[number],
): BuildingSpec {
  return {
    ...spec,
    core: {
      ...spec.core,
      strategy: { ...spec.core.strategy, value: strategy },
      // Deliberately larger than half the plate: an honoured offset must still
      // be clamped back inside.
      offsetXMm: Math.round(spec.massing.widthMm.value * 0.45),
      offsetZMm: Math.round(spec.massing.depthMm.value * 0.45),
    },
  };
}

function withCoreSize(spec: BuildingSpec, widthMm: number, depthMm: number): BuildingSpec {
  return {
    ...spec,
    core: {
      ...spec.core,
      widthMm: { ...spec.core.widthMm, value: widthMm },
      depthMm: { ...spec.core.depthMm, value: depthMm },
    },
  };
}

function expectInside(inner: Rect, outer: Rect, marginM = 0): void {
  expect(inner.minX).toBeGreaterThanOrEqual(outer.minX + marginM - TOL);
  expect(inner.maxX).toBeLessThanOrEqual(outer.maxX - marginM + TOL);
  expect(inner.minZ).toBeGreaterThanOrEqual(outer.minZ + marginM - TOL);
  expect(inner.maxZ).toBeLessThanOrEqual(outer.maxZ - marginM + TOL);
}

function expectNoOverlaps(layout: CoreLayout): void {
  for (let i = 0; i < layout.components.length; i += 1) {
    for (let j = i + 1; j < layout.components.length; j += 1) {
      const a = layout.components[i];
      const b = layout.components[j];
      expect(
        rectsOverlap(a.rect, b.rect),
        `${a.id} overlaps ${b.id}`,
      ).toBe(false);
    }
  }
}

const PROMPTS = [
  "A five storey office building.",
  "A 12 storey office building of 24,000 m² with a central service core.",
  "A 9 storey residential building with two egress stairs.",
  "An L-shaped four storey education building.",
  "A 3 storey retail building with one basement.",
];

describe("generateCore — placement", () => {
  it("keeps the core inside the plate with a 1.5 m ring, for every strategy", async () => {
    for (const prompt of PROMPTS) {
      const base = await specFor(prompt);
      const plate = plateOf(base);

      for (const strategy of CORE_STRATEGIES) {
        const spec = withStrategy(base, strategy);
        const layout = generateCore({ spec, plate, floorNos: floorsOf(spec) });

        expectInside(layout.rect, plate, MIN_PERIMETER_M);
        expect(rectWidth(layout.rect)).toBeGreaterThan(0);
        expect(rectDepth(layout.rect)).toBeGreaterThan(0);
      }
    }
  });

  it("moves the core where the strategy says, not just to the middle", async () => {
    const base = await specFor("A 12 storey office building of 24,000 m².");
    const plate = plateOf(base);
    const floorNos = floorsOf(base);

    const layoutFor = (strategy: (typeof CORE_STRATEGIES)[number]) =>
      generateCore({ spec: withStrategy(base, strategy), plate, floorNos }).rect;

    const central = layoutFor("central");
    const offset = layoutFor("offset");
    const end = layoutFor("end");
    const split = layoutFor("perimeter-split");

    // Central sits on the plate centre.
    expect((central.minX + central.maxX) / 2).toBeCloseTo((plate.minX + plate.maxX) / 2, 9);
    // Offset is displaced in +X, `end` toward +Z, `perimeter-split` toward -X.
    expect(offset.minX).toBeGreaterThan(central.minX);
    expect(end.maxZ).toBeGreaterThan(central.maxZ);
    expect(split.minX).toBeLessThan(central.minX);
    // A dual core is two upstream calls, so this one stays central.
    expect(layoutFor("dual")).toEqual(central);
  });

  it("clamps a core far larger than the plate instead of letting it escape", async () => {
    const base = await specFor("A five storey office building.");
    const plate = plateOf(base);

    for (const strategy of CORE_STRATEGIES) {
      // 400 m of core on a ~30 m plate — pure abuse.
      const spec = withCoreSize(withStrategy(base, strategy), 400_000, 400_000);
      const layout = generateCore({ spec, plate, floorNos: floorsOf(spec) });

      expectInside(layout.rect, plate, MIN_PERIMETER_M);
      // Clamped to exactly the habitable window, not silently zeroed.
      expect(rectWidth(layout.rect)).toBeCloseTo(rectWidth(plate) - 2 * MIN_PERIMETER_M, 9);
      expect(rectDepth(layout.rect)).toBeCloseTo(rectDepth(plate) - 2 * MIN_PERIMETER_M, 9);

      for (const component of layout.components) expectInside(component.rect, layout.rect);
      expectNoOverlaps(layout);
    }
  });
});

describe("generateCore — components", () => {
  it("packs every component inside the core without overlaps", async () => {
    for (const prompt of PROMPTS) {
      const base = await specFor(prompt);
      const plate = plateOf(base);

      for (const strategy of CORE_STRATEGIES) {
        const spec = withStrategy(base, strategy);
        const layout = generateCore({ spec, plate, floorNos: floorsOf(spec) });

        for (const component of layout.components) {
          expectInside(component.rect, layout.rect);
          const size = MIN_SIZE[component.kind];
          const w = rectWidth(component.rect);
          const d = rectDepth(component.rect);
          expect(Math.min(w, d)).toBeGreaterThanOrEqual(size.short - TOL);
          expect(Math.max(w, d)).toBeGreaterThanOrEqual(size.long - TOL);
        }
        expectNoOverlaps(layout);
      }
    }
  });

  it("emits one component per stair, elevator and shaft when there is room", async () => {
    const base = await specFor("A 12 storey office building of 24,000 m².");
    // A genuinely generous core, so nothing has an excuse to be dropped.
    const spec = withCoreSize(base, 14_000, 11_000);
    const layout = generateCore({ spec, plate: plateOf(spec), floorNos: floorsOf(spec) });

    const byKind = (kind: string) => layout.components.filter((c) => c.kind === kind);
    expect(byKind("stair")).toHaveLength(spec.core.stairs.value);
    expect(byKind("elevator")).toHaveLength(spec.core.elevators.value);
    expect(byKind("shaft")).toHaveLength(spec.core.shafts.length);

    // Ids are stable, readable and unique.
    expect(byKind("stair")[0].id).toBe("CORE-STAIR-1");
    expect(byKind("elevator")[0].id).toBe("CORE-ELEV-1");
    expect(layout.components.some((c) => c.id === "CORE-SHAFT-MECHANICAL-1")).toBe(true);
    expect(new Set(layout.components.map((c) => c.id)).size).toBe(layout.components.length);
    expect(byKind("shaft").every((c) => c.subKind)).toBe(true);
    expectNoOverlaps(layout);
  });

  it("drops what cannot fit rather than overlapping, keeping egress first", async () => {
    const base = await specFor("A 12 storey office building of 24,000 m².");
    // A core barely wide enough for a single stair.
    const spec = withCoreSize(base, 5_200, 5_400);
    const layout = generateCore({
      spec,
      plate: { minX: -20, minZ: -14, maxX: 20, maxZ: 14 },
      floorNos: floorsOf(spec),
    });

    expect(layout.components.length).toBeLessThan(
      spec.core.stairs.value + spec.core.elevators.value + spec.core.shafts.length,
    );
    expect(layout.components.some((c) => c.kind === "stair")).toBe(true);
    for (const component of layout.components) expectInside(component.rect, layout.rect);
    expectNoOverlaps(layout);
  });

  it("runs every component through the full level range", async () => {
    const spec = await specFor("A 9 storey office building with two levels of basement parking.");
    const floorNos = floorsOf(spec);
    const layout = generateCore({ spec, plate: plateOf(spec), floorNos });

    expect(floorNos[0]).toBeLessThan(0); // basements really are in the range
    expect(layout.components.length).toBeGreaterThan(0);
    for (const component of layout.components) {
      expect(component.fromFloorNo).toBe(floorNos[0]);
      expect(component.toFloorNo).toBe(floorNos[floorNos.length - 1]);
    }
    // Stairs reach the topmost level for roof access.
    for (const stair of layout.components.filter((c) => c.kind === "stair")) {
      expect(stair.toFloorNo).toBe(Math.max(...floorNos));
    }
  });

  it("is deterministic for the same spec and plate", async () => {
    for (const prompt of PROMPTS) {
      const spec = await specFor(prompt);
      const plate = plateOf(spec);
      const floorNos = floorsOf(spec);
      const a = generateCore({ spec, plate, floorNos });
      const b = generateCore({ spec, plate, floorNos: [...floorNos] });
      expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
    }
  });
});
