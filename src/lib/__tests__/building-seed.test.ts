import { describe, expect, it } from "vitest";
import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import { seedBuildingFromLedger } from "../building-seed";

describe("seedBuildingFromLedger", () => {
  it("seeds the demo office so energy exists before the 3D canvas mounts", () => {
    const seeded = seedBuildingFromLedger(demoTitle, demoFloors);
    expect(seeded).not.toBeNull();
    expect(seeded?.pk).toBe(demoTitle.mgmBldrgstPk);
    expect(seeded?.recipe.floors.length).toBeGreaterThan(0);
    expect(seeded?.recipe.footprintWidth).toBeCloseTo(34, 5);
    expect(seeded?.recipe.footprintDepth).toBeCloseTo(24, 5);
    expect(seeded?.recipe.footprintPolygon?.[0].length).toBeGreaterThanOrEqual(4);
    expect(seeded?.materials.envelope.walls[0]?.uValue).toBeGreaterThan(0);
  });

  it("returns null without a building pk", () => {
    expect(
      seedBuildingFromLedger({ ...demoTitle, mgmBldrgstPk: "" }, demoFloors),
    ).toBeNull();
  });
});
