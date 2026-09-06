import { describe, expect, it } from "vitest";
import { positiveProperty, statedPropertyIndex } from "../../../../scripts/lib/ifc-stated-properties.mjs";

type Line = { expressID: number; [key: string]: unknown };
const label = (value: unknown) => ({ value });
function fixture() {
  const lines = new Map<number, Line>([
    [10, { expressID: 10, HasPropertySets: [label(20)] }],
    [20, { expressID: 20, Name: label("Pset_WallCommon"), HasProperties: [label(30), label(31)] }],
    [30, { expressID: 30, Name: label("ThermalTransmittance"), NominalValue: { name: "IFCTHERMALTRANSMITTANCEMEASURE", value: 0.14 }, Unit: label(90) }],
    [31, { expressID: 31, Name: label("IsExternal"), NominalValue: { name: "IFCBOOLEAN", value: true } }],
    [40, { expressID: 40, Name: label("Pset_WallCommon"), HasProperties: [label(50)] }],
    [50, { expressID: 50, Name: label("ThermalTransmittance"), NominalValue: { name: "IFCTHERMALTRANSMITTANCEMEASURE", value: 0.13 } }],
    [60, { expressID: 60, Name: label("Dimensions"), HasProperties: [label(70), label(71)] }],
    [70, { expressID: 70, Name: label("Area"), NominalValue: { name: "IFCAREAMEASURE", value: 2.1899 } }],
    [71, { expressID: 71, Name: label("Code"), NominalValue: { name: "IFCLABEL", value: "0013" } }],
  ]);
  const api = { IFCRELDEFINESBYTYPE: 1, IFCRELDEFINESBYPROPERTIES: 2 };
  const file = {
    byType(type: number) {
      return type === 1 ? [{ RelatingType: label(10), RelatedObjects: [label(1), label(2)] }] : [
        { RelatingPropertyDefinition: label(40), RelatedObjects: [label(1)] },
        { RelatingPropertyDefinition: label(60), RelatedObjects: [label(1)] },
      ];
    },
    deref(slot: { value: number }) { return lines.get(slot.value); },
    ref(value: number | Line) { return `ifc://fixture.ifc#${typeof value === "number" ? value : value.expressID}`; },
    typeName() { return "IfcPropertySingleValue"; },
  };
  return { file, api };
}

describe("source properties with IFC type inheritance", () => {
  it("retains exact property/type citations and lets occurrence values override the same inherited key", () => {
    const { file, api } = fixture();
    const index = statedPropertyIndex(file, api);
    expect(index.get(2).get("Pset_WallCommon.ThermalTransmittance")).toMatchObject({
      value: 0.14, scope: "type", elementRef: "ifc://fixture.ifc#2",
      propertyRef: "ifc://fixture.ifc#30", propertySetRef: "ifc://fixture.ifc#20",
      typeRef: "ifc://fixture.ifc#10", unitRef: "ifc://fixture.ifc#90",
    });
    expect(index.get(1).get("Pset_WallCommon.ThermalTransmittance")).toMatchObject({ value: 0.13, scope: "occurrence", propertyRef: "ifc://fixture.ifc#50", unitRef: null });
    expect(index.get(1).get("Dimensions.Area").value).toBe(2.1899);
  });

  it("preserves boolean and identifier literals instead of manufacturing numeric facts", () => {
    const { file, api } = fixture();
    const index = statedPropertyIndex(file, api);
    expect(index.get(1).get("Pset_WallCommon.IsExternal").value).toBe(true);
    expect(index.get(1).get("Dimensions.Code").value).toBe("0013");
    expect(positiveProperty(index.get(1), "Dimensions.Code")).toBeNull();
    expect(positiveProperty(new Map([["U", { value: 0 }]]), "U")).toBeNull();
    expect(positiveProperty(index.get(1), "Pset_WallCommon.ThermalTransmittance")?.value).toBe(0.13);
  });
});
