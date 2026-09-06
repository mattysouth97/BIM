import { describe, expect, it } from "vitest";
// Extraction helper is an unbundled Node module.
import { attachEquipmentShadows, conservativeShadowHull } from "../../../../scripts/lib/ifc-roof-equipment.mjs";

const rectangle = (x: number, z: number, y: number) => [
  [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1]],
  [[x, y, z], [x + 1, y, z + 1], [x, y, z + 1]],
];
const roof = (y = -14.5) => ({ id: "roof", minElevationM: y, maxElevationM: y,
  outline: [{ kind: "outer", points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }],
  obstructions: [] as { plan: number[][]; elementName: string }[],
});

describe("source roof equipment shadows", () => {
  it("uses a convex envelope containing every source vertex without joining disconnected components", () => {
    const concave = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
    const hull = conservativeShadowHull(concave) as number[][];
    expect(hull).toEqual([[0, 0], [3, 0], [3, 1], [1, 3], [0, 3], [0, 0]]);
    // Every original vertex lies on or to the left of each CCW hull edge.
    for (const p of concave) for (let i = 0; i < hull.length - 1; i++) {
      const a = hull[i], b = hull[i + 1];
      expect((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])).toBeGreaterThanOrEqual(0);
    }
    expect(conservativeShadowHull([[0, 0], [1, 0], [2, 0], [0, 0]])).toEqual([]);
  });
  it("keeps disconnected array pieces and matches the actual negative world elevation", () => {
    const plane = roof();
    const rows = attachEquipmentShadows([plane], [{ ref: "ifc://source#1", type: "IfcSolarDevice", name: "Two-part array", triangles: [...rectangle(1, 1, -14.4), ...rectangle(4, 1, -14.4)] }]);
    expect(rows[0].planeIds).toEqual(["roof"]);
    expect(rows[0].projectedSqm).toBeCloseTo(2);
    expect(plane.obstructions).toHaveLength(2);
    expect(plane.obstructions.every((o) => o.elementName === "Two-part array")).toBe(true);
  });
  it("does not attach equipment inside the building or outside the roof outline", () => {
    const plane = roof();
    const rows = attachEquipmentShadows([plane], [
      { ref: "ifc://source#1", type: "IfcChiller", name: "Lower floor", triangles: rectangle(1, 1, -19.4) },
      { ref: "ifc://source#2", type: "IfcSolarDevice", name: "Outside roof", triangles: rectangle(11, 1, -14.4) },
    ]);
    expect(rows.map((r: { status: string }) => r.status)).toEqual(["not_associated_with_published_roof", "not_associated_with_published_roof"]);
    expect(plane.obstructions).toHaveLength(0);
  });
  it("does not treat a roof hole as usable support", () => {
    const plane = roof();
    plane.outline.push({ kind: "hole", points: [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]] });
    attachEquipmentShadows([plane], [{ ref: "ifc://source#3", type: "IfcSolarDevice", name: "Over hole", triangles: rectangle(1.2, 1.2, -14.4) }]);
    expect(plane.obstructions).toHaveLength(0);
  });
});
