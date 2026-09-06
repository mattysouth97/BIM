import { expect, it } from "vitest";
import { roofPlanes } from "../../../../scripts/lib/ifc-roof-planes.mjs";

it("selects the source top surface only when an explicit audited winding correction exists", () => {
  // A closed slab with its source winding reversed: top points down, bottom up.
  const top = [[[0,1,0],[2,1,0],[2,1,2]],[[0,1,0],[2,1,2],[0,1,2]]];
  const bottom = top.map((t) => [...t].reverse().map(([x,,z])=>[x,0,z]));
  const rows = [{name:"Reversed slab",ref:"ifc://fixture#1",typeName:"IfcRoof",triangles:[...top,...bottom]}];
  const original = JSON.stringify(rows);
  expect(roofPlanes(rows).planes[0].maxElevationM).toBe(0);
  const corrected = roofPlanes(rows, {reverseWinding:[{elementRef:"ifc://fixture#1",basis:"Independent top/bottom source ray audit"}]}).planes;
  expect(corrected).toHaveLength(1);
  expect(corrected[0].maxElevationM).toBe(1);
  expect(corrected[0].normal).toEqual([0,1,0]);
  expect(corrected[0].windingCorrection).toContain("source ray audit");
  expect(corrected[0].projectedSqm).toBe(4);
  expect(JSON.stringify(rows)).toBe(original);
});

it("retains a measured plane made entirely of small disconnected outline pieces", () => {
  const triangles = Array.from({length:12},(_,i)=>i*.12).flatMap((x)=>[
    [[x,1,0],[x,1,.3],[x+.1,1,.3]], [[x,1,0],[x+.1,1,.3],[x+.1,1,0]],
  ]);
  const planes = roofPlanes([{name:"Small strips",ref:"ifc://fixture#2",typeName:"IfcRoof",triangles}]).planes;
  expect(planes).toHaveLength(1);
  expect(planes[0].projectedSqm).toBeCloseTo(.36);
  expect(planes[0].outline.filter((ring: {kind:string})=>ring.kind==="outer")).toHaveLength(12);
});
