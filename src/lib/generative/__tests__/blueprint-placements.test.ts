import { describe, expect, it } from "vitest";

import {
  addBoundary,
  addPlacement,
  applySchematicPlacements,
  blueprintPlacements,
  emptyBlueprint,
  makeRectLoop,
  parseBlueprintSpec,
  safeParseBlueprintSpec,
  validateBlueprint,
} from "../blueprint";
import { runBlueprintGeneration } from "../server/generate-from-blueprint";
import { buildInteriorModel } from "@/lib/interior";

const FLOORS = [1, 2, 3];

function plate() {
  return addBoundary(emptyBlueprint("Placement schematic"), {
    loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 }),
    floorNos: FLOORS,
  });
}

describe("schematic family placements", () => {
  it("parses a blueprint that never had a placements field", () => {
    const { placements: _ignored, ...legacy } = emptyBlueprint("Legacy");
    expect("placements" in legacy).toBe(false);
    const parsed = parseBlueprintSpec(legacy);
    expect(blueprintPlacements(parsed)).toEqual([]);
  });

  it("rejects a placement on storey 0", () => {
    const spec = addPlacement(plate(), {
      id: "col-1",
      familyId: "column-struct-round-450",
      tool: "column",
      positionMm: { xMm: 6_000, zMm: 4_000 },
      floorNos: [0],
    });
    expect(safeParseBlueprintSpec(spec).success).toBe(false);
  });

  it("flags an unknown family as a P1 issue", () => {
    const spec = addPlacement(plate(), {
      id: "col-1",
      familyId: "not-a-real-family",
      tool: "column",
      positionMm: { xMm: 6_000, zMm: 4_000 },
      floorNos: [1],
    });
    const report = validateBlueprint(spec);
    expect(report.violations.some((v) => v.code === "UNKNOWN_FAMILY")).toBe(true);
  });

  it("compiles columns and lights into the generated snapshot and interior poses", () => {
    let spec = plate();
    spec = addPlacement(spec, {
      id: "col-user",
      familyId: "column-struct-round-450",
      tool: "column",
      positionMm: { xMm: 6_000, zMm: 4_000 },
      floorNos: [1, 2],
    });
    spec = addPlacement(spec, {
      id: "light-user",
      familyId: "light-troffer-600",
      tool: "lighting",
      positionMm: { xMm: 10_000, zMm: 8_000 },
      floorNos: [1],
    });

    const outcome = runBlueprintGeneration({ blueprint: spec, seed: 4242 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const columns = outcome.payload.snapshot.elements.filter((el) =>
      el.id.startsWith("sch:col-user:"),
    );
    const lights = outcome.payload.snapshot.elements.filter((el) =>
      el.id.startsWith("sch:light-user:"),
    );
    expect(columns).toHaveLength(2);
    expect(lights).toHaveLength(1);
    expect(columns.every((el) => el.typeId === "column-struct-round-450")).toBe(true);
    expect(lights[0]?.kind).toBe("lighting");

    // 30×20 m plate centred on the origin: (6, 4) m → (−9, −6) m.
    expect(columns[0]?.placement.x).toBeCloseTo(-9, 3);
    expect(columns[0]?.placement.z).toBeCloseTo(-6, 3);

    const interior = buildInteriorModel(outcome.payload.snapshot, { includeExterior: true });
    const poses = Object.values(interior.posesByFloor).flat();
    expect(poses.some((pose) => pose.elementId.startsWith("sch:col-user:"))).toBe(true);
    expect(poses.some((pose) => pose.familyId === "light-troffer-600")).toBe(true);
  });

  it("is a no-op when the schematic has no placements", () => {
    const outcome = runBlueprintGeneration({ blueprint: plate(), seed: 1 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const again = applySchematicPlacements({
      snapshot: outcome.payload.snapshot,
      blueprint: plate(),
      buildingPk: "generated",
      generationId: outcome.payload.generationId,
    });
    expect(again.elements).toHaveLength(outcome.payload.snapshot.elements.length);
  });
});
