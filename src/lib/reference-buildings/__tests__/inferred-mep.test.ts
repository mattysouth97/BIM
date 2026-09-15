// src/lib/reference-buildings/__tests__/inferred-mep.test.ts
//
// The point of these tests is not that a network is produced. It is that an
// inferred network stays visibly an inference, and that it refuses rather
// than invents when the stated geometry cannot carry it.

import { describe, expect, it } from "vitest";
import {
  INFERRED_MEP_LAYER,
  floorsFromStoreys,
  mainPurposeCodeFor,
  planInferredMep,
  type ManifestStorey,
} from "../inferred-mep";

const storey = (
  partial: Partial<ManifestStorey> & Pick<ManifestStorey, "id" | "elevationM">,
): ManifestStorey => ({
  name: partial.id,
  floorToFloorHeightM: 3,
  ...partial,
});

describe("inferred MEP declares itself an inference", () => {
  it("says in both languages that the source has no MEP and this is not evidence", () => {
    for (const text of [INFERRED_MEP_LAYER.note.ko, INFERRED_MEP_LAYER.note.en]) {
      expect(text.length).toBeGreaterThan(40);
    }
    // The two claims that must survive any future copy edit: the source has
    // none, and this must not be cited as measured.
    expect(INFERRED_MEP_LAYER.note.en).toMatch(/no MEP/i);
    expect(INFERRED_MEP_LAYER.note.en).toMatch(/not.*(surveyed|installed)/i);
    expect(INFERRED_MEP_LAYER.note.en).toMatch(/not cite it as measured/i);
    expect(INFERRED_MEP_LAYER.note.ko).toMatch(/원본 파일에는 설비/);
    expect(INFERRED_MEP_LAYER.note.ko).toMatch(/실제 설치된 설비가 아닙니다/);
    // The label a viewer reads at a glance must carry it too, not only the note.
    expect(INFERRED_MEP_LAYER.ko).toContain("원본 아님");
    expect(INFERRED_MEP_LAYER.en).toContain("not from source");
  });

  it("is not shaped like a published source layer", () => {
    // A published ReferenceServiceLayer carries byteLength/elements/sha256.
    // If this ever grows them it could be mistaken for a source artifact.
    expect(INFERRED_MEP_LAYER).not.toHaveProperty("byteLength");
    expect(INFERRED_MEP_LAYER).not.toHaveProperty("elements");
    expect(INFERRED_MEP_LAYER).not.toHaveProperty("sha256");
  });
});

describe("floorsFromStoreys", () => {
  it("orders by elevation and marks only the lowest as ground", () => {
    const floors = floorsFromStoreys([
      storey({ id: "second", elevationM: 6 }),
      storey({ id: "ground", elevationM: 0 }),
      storey({ id: "first", elevationM: 3 }),
    ])!;
    expect(floors.map((f) => f.label)).toEqual(["ground", "first", "second"]);
    expect(floors.filter((f) => f.isGroundFloor)).toHaveLength(1);
    expect(floors[0].isGroundFloor).toBe(true);
  });

  it("recovers a zero stated height from the next storey's elevation, which is still measured", () => {
    // FZK Haus's Dachgeschoss states floorToFloorHeightM: 0. Routing a plenum
    // through a zero-height storey would put ducts in a void.
    const floors = floorsFromStoreys([
      storey({ id: "eg", elevationM: 0, floorToFloorHeightM: 2.7 }),
      storey({ id: "dg", elevationM: 2.7, floorToFloorHeightM: 0 }),
    ])!;
    expect(floors[1].height).toBe(2.7); // inherited, not defaulted to a guess
    expect(floors.every((f) => f.height > 0)).toBe(true);
  });

  it("refuses rather than defaults when no height can be recovered at all", () => {
    expect(floorsFromStoreys([storey({ id: "only", elevationM: 0, floorToFloorHeightM: 0 })])).toBeNull();
    expect(floorsFromStoreys([])).toBeNull();
  });
});

describe("mainPurposeCodeFor", () => {
  it("maps the use types the gallery actually carries", () => {
    expect(mainPurposeCodeFor("office_building")).toBe("14000");
    expect(mainPurposeCodeFor("single_family_house")).toBe("01000");
    expect(mainPurposeCodeFor("hotel")).toBe("15000");
  });

  it("falls back to the generic table for an unknown type instead of guessing a use", () => {
    // Claiming a specific use the source never established is the defect
    // classifyEraExplicit exists to prevent on the energy path.
    expect(mainPurposeCodeFor(undefined)).toBe("14000");
    expect(mainPurposeCodeFor("something_unmapped")).toBe("14000");
  });
});

describe("planInferredMep", () => {
  const goodStoreys = [
    storey({ id: "ground", elevationM: 0, floorToFloorHeightM: 4 }),
    storey({ id: "first", elevationM: 4, floorToFloorHeightM: 4 }),
  ];

  it("plans a connected network from measured extent and stated storeys", () => {
    const model = planInferredMep({
      storeys: goodStoreys,
      footprint: { widthM: 24, depthM: 16 },
      useType: "hotel",
    })!;
    expect(model).not.toBeNull();
    expect(model.segments.length).toBeGreaterThan(0);
    expect(model.systems.length).toBeGreaterThan(0);
    // One floor entry per stated storey — the network must not invent levels.
    expect(model.floors).toHaveLength(goodStoreys.length);
  });

  it("refuses a model with no usable footprint rather than assuming one", () => {
    expect(
      planInferredMep({ storeys: goodStoreys, footprint: { widthM: 0, depthM: 16 } }),
    ).toBeNull();
    expect(
      planInferredMep({ storeys: goodStoreys, footprint: { widthM: 24, depthM: -1 } }),
    ).toBeNull();
  });

  it("refuses when the storeys cannot yield a height", () => {
    expect(
      planInferredMep({
        storeys: [storey({ id: "flat", elevationM: 0, floorToFloorHeightM: 0 })],
        footprint: { widthM: 24, depthM: 16 },
      }),
    ).toBeNull();
  });

  it("is deterministic — the same stated geometry gives the same network", () => {
    const input = { storeys: goodStoreys, footprint: { widthM: 24, depthM: 16 }, useType: "office_building" };
    const a = planInferredMep(input)!;
    const b = planInferredMep(input)!;
    expect(a.segments.length).toBe(b.segments.length);
    expect(a.segments.map((s) => s.id)).toEqual(b.segments.map((s) => s.id));
  });
});
