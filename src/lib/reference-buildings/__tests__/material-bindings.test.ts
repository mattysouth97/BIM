// @vitest-environment node
import { describe, expect, it } from "vitest";
import { materialAssignments } from "../../../../scripts/lib/ifc-material-bindings.mjs";

type Row = { expressID: number; kind?: string; [key: string]: unknown };
const webIfc = { IFCRELASSOCIATESMATERIAL: 1, IFCRELDEFINESBYTYPE: 2 };
const assignment = (expressID: number, target: number, material: number): Row => ({ expressID, RelatedObjects: [{ value: target }], RelatingMaterial: material });
const typeRelation = (expressID: number, type: number): Row => ({ expressID, RelatedObjects: [{ value: 100 }], RelatingType: type });
const materials: Row[] = [
  { expressID: 10, kind: "IfcMaterial", Name: { value: "Source concrete" } },
  { expressID: 11, kind: "IfcMaterial", Name: "Source brick" },
  { expressID: 20, Material: 10 },
  { expressID: 21, Material: 11 },
  { expressID: 30, kind: "IfcMaterialLayerSet", MaterialLayers: [20, 21] },
  { expressID: 31, kind: "IfcMaterialLayerSetUsage", ForLayerSet: 30 },
  { expressID: 40, kind: "IfcMaterialProfileSet" },
];
function resolve(assignments: Row[] = [], types: Row[] = []) {
  const entities = new Map(materials.map((row) => [row.expressID, row]));
  const file = {
    byType: (type: number) => type === 1 ? assignments : types,
    deref: (id: number | { value: number }) => entities.get(typeof id === "number" ? id : id?.value),
    ref: (row: Row) => `ifc://source.ifc#${row.expressID}`,
    typeName: (row: Row) => row.kind,
  };
  return materialAssignments(file, webIfc)({ expressID: 100 });
}

describe("source material assignment evidence", () => {
  it("resolves layer-set usage and preserves the occurrence association citation", () => {
    expect(resolve([assignment(50, 100, 31)])).toMatchObject({ status: "layer_set", assemblyRef: "ifc://source.ifc#30", materialNames: ["Source concrete", "Source brick"], relationRef: "ifc://source.ifc#50", basis: "occurrence" });
  });
  it("inherits a type only when the occurrence has no assignment", () => {
    const rows = [assignment(50, 200, 31)];
    expect(resolve(rows, [typeRelation(60, 200)])).toMatchObject({ status: "layer_set", basis: "type" });
    expect(resolve([...rows, assignment(51, 100, 11)], [typeRelation(60, 200)])).toMatchObject({ status: "single_material", assemblyRef: null, materialNames: ["Source brick"], relationRef: "ifc://source.ifc#51", basis: "occurrence" });
  });
  it("never invents a layer stack for missing, unsupported or conflicting assignments", () => {
    expect(resolve()).toMatchObject({ status: "unassigned", assemblyRef: null });
    expect(resolve([assignment(50, 100, 40)])).toMatchObject({ status: "unsupported", assemblyRef: null, materialNames: [] });
    expect(resolve([assignment(50, 100, 31), assignment(51, 100, 11)])).toMatchObject({ status: "ambiguous", assemblyRef: null, materialNames: [] });
  });
  it("deduplicates the same assignment but refuses conflicting type declarations", () => {
    expect(resolve([assignment(50, 100, 31), assignment(51, 100, 31)])).toMatchObject({ status: "layer_set" });
    expect(resolve([assignment(50, 200, 31), assignment(51, 201, 11)], [typeRelation(60, 200), typeRelation(61, 201)])).toMatchObject({ status: "ambiguous", assemblyRef: null });
  });
});
