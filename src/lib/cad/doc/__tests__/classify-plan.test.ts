import { describe, it, expect } from "vitest";
import {
  classifyPlanPolylines,
  pointInPolygon,
  serviceCoreFromPlan,
} from "../classify-plan";
import type { CadDocument, CadPolyline } from "../types";

function closedRect(
  id: string,
  layer: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): CadPolyline {
  return {
    id,
    kind: "polyline",
    layer,
    closed: true,
    vertices: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    bulges: [0, 0, 0, 0],
  };
}

function docOf(...entities: CadPolyline[]): CadDocument {
  return {
    id: "t",
    layers: [{ name: "0", colorIndex: 7, visible: true }],
    entities,
    unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 20, y: 16 } },
    warnings: [],
    stats: { totalParsed: entities.length, mapped: entities.length, skipped: {} },
  };
}

describe("pointInPolygon", () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it("detects interior and exterior", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe("classifyPlanPolylines", () => {
  it("labels the largest closed polyline as outline and an interior band as core", () => {
    const classified = classifyPlanPolylines(
      docOf(
        closedRect("out", "OUTLINE", 0, 0, 20, 16),
        closedRect("core", "CORE", 7, 1, 13, 5),
        closedRect("room", "ROOM", 1, 8, 5, 14),
      ),
    );
    expect(classified.find((c) => c.entityId === "out")?.role).toBe("outline");
    expect(classified.find((c) => c.entityId === "core")?.role).toBe("core");
    expect(classified.find((c) => c.entityId === "room")?.role).toBe("room");
  });

  it("serviceCoreFromPlan is relative to the outline bbox centre", () => {
    const classified = classifyPlanPolylines(
      docOf(
        closedRect("out", "OUTLINE", 0, 0, 20, 16),
        closedRect("core", "CORE", 7, 1, 13, 5),
      ),
    );
    const slot = serviceCoreFromPlan(classified)!;
    // outline centre (10, 8); core centroid (10, 3) → (0, -5)
    expect(slot.x).toBeCloseTo(0, 5);
    expect(slot.z).toBeCloseTo(-5, 5);
  });

  it("picking the outline falls back to the classified core", () => {
    const classified = classifyPlanPolylines(
      docOf(
        closedRect("out", "OUTLINE", 0, 0, 20, 16),
        closedRect("core", "CORE", 7, 1, 13, 5),
      ),
    );
    const slot = serviceCoreFromPlan(classified, "out")!;
    expect(slot.z).toBeCloseTo(-5, 5);
  });
});
