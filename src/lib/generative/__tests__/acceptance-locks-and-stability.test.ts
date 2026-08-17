// src/lib/generative/__tests__/acceptance-locks-and-stability.test.ts
//
// ACCEPTANCE: the promises the chain makes ABOUT ITSELF.
//
//   • fidelity "exact" produces lock tokens the session lock system accepts,
//     and those locks actually refuse a spec write and actually survive a
//     regeneration merge;
//   • the same blueprint and seed produce a byte-identical building, snapshot
//     and recipe;
//   • editing one wing's program does not disturb the other wing's plate;
//   • a user-modified element survives regeneration.
//
// `session/locks.ts` is imported READ-ONLY — this file asserts against it and
// never changes it.

import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addCore,
  addVoid,
  addZone,
  compileBlueprintToSpec,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
} from "../blueprint";
import { generationIdFor } from "../build";
import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { generateBuildingFromSpec } from "../generate/pipeline";
import { generateMassing } from "../generate/massing";
import { emitElements, emitSnapshot, mergeGenerated } from "../graph/emit";
import {
  applyLocksToElements,
  elementLock,
  lockedSystems,
  lockRejection,
  parseLock,
  systemLock,
} from "../session/locks";
import { validateBuilding } from "../validate/rules";
import type { BuildingSpec } from "../spec/building-spec";
import type { BimElement } from "@/lib/bim/model/types";

const FLOORS = [1, 2, 3];
const BUILDING_PK = "BLD-ACCEPTANCE";

function runChain(blueprint: BlueprintSpec, seed: number) {
  const { spec, locks } = compileBlueprintToSpec(blueprint, { seed });
  const building = generateBuildingFromSpec(spec);
  const compiled = compileSpecToRecipe(spec);
  const snapshot = emitSnapshot({
    buildingPk: BUILDING_PK,
    generationId: generationIdFor(seed, 0),
    spec,
    building,
  });
  const validation = validateBuilding(building, spec);
  return { spec, locks, building, snapshot, validation, ...compiled };
}

/* ------------------------------------------------------------------ */
/* Blueprints                                                          */
/* ------------------------------------------------------------------ */

const EXACT_WIDTH_MM = 80_000;
const EXACT_DEPTH_MM = 56_000;

/** One outline, one void, one core, one grid — every lockable object drawn. */
function exactBlueprint(): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Exact");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("exact-outline", {
      xMm: 0,
      zMm: 0,
      widthMm: EXACT_WIDTH_MM,
      depthMm: EXACT_DEPTH_MM,
    }),
    floorNos: FLOORS,
  });
  blueprint = addVoid(blueprint, {
    id: "exact-atrium",
    kind: "atrium",
    region: {
      kind: "rect",
      originMm: { xMm: EXACT_WIDTH_MM / 2, zMm: EXACT_DEPTH_MM / 2 },
      widthMm: 24_000,
      depthMm: 16_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  // North of the atrium, on solid floor, so the lift lobby is reachable from
  // the ring corridors on every storey.
  blueprint = addCore(blueprint, {
    id: "exact-core",
    region: {
      kind: "rect",
      originMm: { xMm: EXACT_WIDTH_MM / 2, zMm: 45_000 },
      widthMm: 12_000,
      depthMm: 10_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
    contents: ["stair", "elevator"],
  });
  for (let i = 0; i < 6; i += 1) {
    blueprint = addZone(blueprint, {
      id: `exact-zone-${i}`,
      program: i % 3 === 2 ? "meeting" : "office-open",
      region: {
        kind: "rect",
        originMm: { xMm: EXACT_WIDTH_MM / 2, zMm: EXACT_DEPTH_MM / 2 },
        widthMm: 14_000 + i * 1_000,
        depthMm: 11_000,
        rotationRad: 0,
      },
      floorNos: FLOORS,
    });
  }
  return {
    ...blueprint,
    fidelityMode: "exact",
    gridSystems: [
      {
        id: "exact-grid",
        originMm: { xMm: 0, zMm: 0 },
        rotationRad: 0,
        // Bays enough to reach the far corner of the plate; the compiler
        // shifts the origin to the plate's own corner with everything else.
        xSpacingsMm: Array.from({ length: 9 }, () => 8_400),
        zSpacingsMm: Array.from({ length: 6 }, () => 8_400),
      },
    ],
  };
}

/**
 * Two touching wings, each with its own program zone. The plates come from the
 * BOUNDARIES alone, so re-programming one wing must leave both plates alone —
 * that is the partial-stability property being asserted.
 */
function twoWingBlueprint(wingBProgram: "office-open" | "meeting"): BlueprintSpec {
  let blueprint = emptyBlueprint("Acceptance Wings Stability");
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("wing-a", { xMm: 0, zMm: 0, widthMm: 44_000, depthMm: 18_000 }),
    floorNos: FLOORS,
    role: "wing",
  });
  blueprint = addBoundary(blueprint, {
    loop: makeRectLoop("wing-b", {
      xMm: 26_000,
      zMm: 0,
      widthMm: 18_000,
      depthMm: 50_000,
    }),
    floorNos: FLOORS,
    role: "wing",
  });
  blueprint = addZone(blueprint, {
    id: "zone-wing-a",
    program: "office-open",
    region: {
      kind: "rect",
      originMm: { xMm: 12_000, zMm: 9_000 },
      widthMm: 18_000,
      depthMm: 12_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  blueprint = addZone(blueprint, {
    id: "zone-wing-b",
    program: wingBProgram,
    region: {
      kind: "rect",
      originMm: { xMm: 35_000, zMm: 34_000 },
      widthMm: 15_000,
      depthMm: 12_000,
      rotationRad: 0,
    },
    floorNos: FLOORS,
  });
  return blueprint;
}

/* ================================================================== */
/* 4. Fidelity → locks                                                 */
/* ================================================================== */

describe("ACCEPTANCE: fidelity \"exact\" yields locks the session system accepts", () => {
  const chain = runChain(exactBlueprint(), 7_919);

  it("locks every system whose geometry the blueprint declared exact", () => {
    // Boundary and void → massing; core → core; grid → structure.
    expect(chain.locks).toEqual([
      systemLock("core"),
      systemLock("massing"),
      systemLock("structure"),
    ]);
  });

  it("produces tokens that parse in the session lock grammar", () => {
    for (const token of chain.locks) {
      const parsed = parseLock(token);
      expect(parsed, `"${token}" is not a lock the session can read`).not.toBeNull();
      expect(parsed!.kind).toBe("system");
    }
    expect(lockedSystems(chain.locks)).toEqual(["core", "massing", "structure"]);
  });

  it("actually refuses a spec write into locked territory", () => {
    const reject = (path: string) =>
      lockRejection({ path, op: "set", tokens: chain.locks, spec: chain.spec });

    expect(reject("/massing/widthMm/value")).toMatch(/Massing is locked/);
    expect(reject("/massing")).toMatch(/Massing is locked/);
    expect(reject("/core/widthMm/value")).toMatch(/Core is locked/);
    expect(reject("/structure/gridXMm/value")).toMatch(/Structure is locked/);
    // Nothing declared the roof or the facade exact, so both stay editable —
    // a lock that refused everything would be indistinguishable from a bug.
    expect(reject("/roof/parapetMm")).toBeNull();
    expect(reject("/facade/sides/0/glazingRatio")).toBeNull();
  });

  it("stamps the locked systems onto the elements they generated", () => {
    const stamped = applyLocksToElements(chain.snapshot.elements, chain.locks);
    const coreElements = stamped.filter((element) => element.system === "core");
    const structureElements = stamped.filter((element) => element.system === "structure");
    const envelopeElements = stamped.filter((element) => element.system === "envelope");

    expect(coreElements.length).toBeGreaterThan(0);
    expect(structureElements.length).toBeGreaterThan(0);
    expect(envelopeElements.length).toBeGreaterThan(0);
    expect(coreElements.every((element) => element.locked === true)).toBe(true);
    expect(structureElements.every((element) => element.locked === true)).toBe(true);
    expect(envelopeElements.every((element) => element.locked === false)).toBe(true);
  });

  it("preserves a locked element unchanged through a regeneration merge", () => {
    const previous = applyLocksToElements(chain.snapshot.elements, chain.locks);
    const locked = previous.find((element) => element.system === "core")!;

    // The user then edits the locked element. Regeneration must not undo it.
    const edited: BimElement = {
      ...locked,
      instanceParameters: { ...locked.instanceParameters, areaM2: 999.99 },
      generationSource: { type: "MODIFIED", generationId: chain.snapshot.buildingPk, version: 2 },
    };
    const before = previous.map((element) => (element.id === locked.id ? edited : element));

    // A genuinely different regeneration: the same spec, a new generation id.
    const regenerated = emitElements({
      buildingPk: BUILDING_PK,
      generationId: generationIdFor(7_919, 1),
      spec: chain.spec,
      building: chain.building,
    });
    const fresh = regenerated.find((element) => element.id === locked.id)!;
    expect(fresh.instanceParameters.areaM2).not.toBe(999.99);

    const merged = mergeGenerated(before, regenerated);
    expect(merged.preservedIds).toContain(locked.id);

    const survivor = merged.elements.filter((element) => element.id === locked.id);
    expect(survivor).toHaveLength(1);
    expect(survivor[0]).toEqual(edited);
    // Nothing was duplicated or dropped on the way through.
    expect(new Set(merged.elements.map((e) => e.id)).size).toBe(merged.elements.length);
    expect(merged.elements).toHaveLength(regenerated.length);
  });

  it("builds a valid building from the exact blueprint", () => {
    expect(
      chain.validation.violations.filter((v) => v.severity === "critical"),
    ).toEqual([]);
  });
});

/* ================================================================== */
/* 5. Determinism + partial stability                                  */
/* ================================================================== */

describe("ACCEPTANCE: determinism and plate-level stability", () => {
  it("produces a byte-identical building, snapshot and recipe for one seed", () => {
    const a = runChain(exactBlueprint(), 8_243);
    const b = runChain(exactBlueprint(), 8_243);

    expect(JSON.stringify(a.spec)).toEqual(JSON.stringify(b.spec));
    expect(JSON.stringify(a.building)).toEqual(JSON.stringify(b.building));
    expect(JSON.stringify(a.snapshot)).toEqual(JSON.stringify(b.snapshot));
    expect(JSON.stringify(a.recipe)).toEqual(JSON.stringify(b.recipe));
    expect(JSON.stringify(a.validation)).toEqual(JSON.stringify(b.validation));
    // Non-vacuous: there is a real building in there.
    expect(a.snapshot.elements.length).toBeGreaterThan(100);
  });

  it("keeps the drawn geometry seed-independent", () => {
    const a = runChain(exactBlueprint(), 8_243);
    const b = runChain(exactBlueprint(), 9_001);

    expect(a.spec.generationSeed).toBe(8_243);
    expect(b.spec.generationSeed).toBe(9_001);
    // The plate is drawn, not sampled: it must not move with the seed. (The
    // seed reaches only tie-breaking jitter in the space solver and the opening
    // placer, so on this blueprint the whole building happens to be
    // seed-invariant too — that is a property of the heuristics, not a promise
    // this test makes.)
    expect(JSON.stringify(a.recipe.footprintPolygon)).toEqual(
      JSON.stringify(b.recipe.footprintPolygon),
    );
    expect(JSON.stringify(a.building.levels)).toEqual(JSON.stringify(b.building.levels));
    expect(JSON.stringify(a.spec.massing)).toEqual(JSON.stringify(b.spec.massing));
  });

  it("leaves both wings' plates byte-identical when one wing is re-programmed", () => {
    const base = runChain(twoWingBlueprint("office-open"), 8_641);
    const edited = runChain(twoWingBlueprint("meeting"), 8_641);

    // The edit landed.
    const programOf = (spec: BuildingSpec) =>
      spec.program.find((item) => item.id === "zone-wing-b")!.type;
    expect(programOf(base.spec)).toBe("office-open");
    expect(programOf(edited.spec)).toBe("meeting");
    expect(JSON.stringify(base.building.spaces)).not.toEqual(
      JSON.stringify(edited.building.spaces),
    );

    // Massing layer: untouched, to the last bit.
    expect(JSON.stringify(generateMassing(base.spec).plates)).toEqual(
      JSON.stringify(generateMassing(edited.spec).plates),
    );
    expect(JSON.stringify(base.spec.massing.customPlates)).toEqual(
      JSON.stringify(edited.spec.massing.customPlates),
    );
    expect(JSON.stringify(base.recipe.footprintPolygon)).toEqual(
      JSON.stringify(edited.recipe.footprintPolygon),
    );
    expect(
      JSON.stringify(base.building.levels.map((level) => level.polygon)),
    ).toEqual(JSON.stringify(edited.building.levels.map((level) => level.polygon)));

    // …and the slabs the BIM graph carries move with the plates, so they are
    // untouched too.
    const slabsOf = (elements: BimElement[]) =>
      elements
        .filter((element) => element.kind === "slab")
        .map((element) => [element.id, element.instanceParameters.outlineJson]);
    expect(JSON.stringify(slabsOf(base.snapshot.elements))).toEqual(
      JSON.stringify(slabsOf(edited.snapshot.elements)),
    );
  });

  it("re-solves the untouched wing's rooms — partial regeneration is not yet room-level", () => {
    // Documented, not celebrated: a program edit re-runs the whole floor solve,
    // so rooms in the wing that was NOT edited also move. Locks are the only
    // mechanism that currently pins them. Asserted so the day the solver gains
    // real partial regeneration, this test fails and gets updated rather than
    // the limitation being forgotten.
    const base = runChain(twoWingBlueprint("office-open"), 8_641);
    const edited = runChain(twoWingBlueprint("meeting"), 8_641);

    const wingASpaces = (spaces: typeof base.building.spaces) =>
      spaces
        .filter((space) => space.floorNo === 1 && space.rect.maxX < 0)
        .map((space) => `${space.type}@${space.rect.minX.toFixed(3)},${space.rect.minZ.toFixed(3)}`)
        .sort();

    const before = wingASpaces(base.building.spaces);
    const after = wingASpaces(edited.building.spaces);
    expect(before.length).toBeGreaterThan(0);
    expect(after).not.toEqual(before);
  });
});

/* ================================================================== */
/* 6. A user-modified element survives regeneration                    */
/* ================================================================== */

describe("ACCEPTANCE: a MODIFIED element survives regeneration", () => {
  const chain = runChain(exactBlueprint(), 6_733);

  it("keeps the human's edit and drops the engine's replacement", () => {
    const original = chain.snapshot.elements.find(
      (element) => element.kind === "wall" && element.instanceParameters.exterior === true,
    )!;
    expect(original.generationSource?.type).toBe("GENERATED");

    const modified: BimElement = {
      ...original,
      instanceParameters: {
        ...original.instanceParameters,
        thicknessMm: 450,
        role: "exterior",
      },
      generationSource: {
        type: "MODIFIED",
        generationId: original.generationSource!.generationId,
        version: 2,
      },
    };
    const previous = chain.snapshot.elements.map((element) =>
      element.id === original.id ? modified : element,
    );

    const regenerated = emitElements({
      buildingPk: BUILDING_PK,
      generationId: generationIdFor(6_733, 1),
      spec: chain.spec,
      building: chain.building,
    });
    // The engine really would have overwritten it.
    const replacement = regenerated.find((element) => element.id === original.id)!;
    expect(replacement.instanceParameters.thicknessMm).not.toBe(450);

    const merged = mergeGenerated(previous, regenerated);
    const survivor = merged.elements.find((element) => element.id === original.id)!;
    expect(survivor).toEqual(modified);
    expect(survivor.instanceParameters.thicknessMm).toBe(450);
    expect(merged.preservedIds).toEqual([original.id]);
    // Every other element was regenerated, none lost, none duplicated.
    expect(merged.elements).toHaveLength(regenerated.length);
    expect(
      merged.elements.filter(
        (element) => element.generationSource?.generationId === generationIdFor(6_733, 1),
      ),
    ).toHaveLength(regenerated.length - 1);
  });

  it("preserves an element locked by token alone, with no edit to it", () => {
    const target = chain.snapshot.elements.find(
      (element) => element.kind === "column",
    )!;
    const tokens = [elementLock(target.id)];
    const previous = applyLocksToElements(chain.snapshot.elements, tokens);
    expect(previous.find((element) => element.id === target.id)!.locked).toBe(true);

    const regenerated = emitElements({
      buildingPk: BUILDING_PK,
      generationId: generationIdFor(6_733, 2),
      spec: chain.spec,
      building: chain.building,
    });
    const merged = mergeGenerated(previous, regenerated);
    expect(merged.preservedIds).toEqual([target.id]);
    expect(merged.elements.find((element) => element.id === target.id)!.locked).toBe(true);
    expect(
      merged.elements.find((element) => element.id === target.id)!.generationSource
        ?.generationId,
    ).toBe(chain.snapshot.elements[0].generationSource?.generationId);
  });
});
