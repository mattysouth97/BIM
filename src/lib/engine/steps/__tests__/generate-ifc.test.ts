import { describe, it, expect, vi } from "vitest";
import { generateIfc, compressIfcGuid } from "../generate-ifc";
import type { FusedModel } from "../../types";

const IFC_GUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** Test-only inverse of compressIfcGuid, used to prove the byte-grouping round-trips. */
function decompressIfcGuid(compressed: string): string {
  const fromDigits = (str: string) => {
    let value = 0;
    for (const ch of str) value = value * 64 + IFC_GUID_ALPHABET.indexOf(ch);
    return value;
  };
  const byte0 = fromDigits(compressed.slice(0, 2));
  let hex = byte0.toString(16).padStart(2, "0");
  for (let g = 0; g < 5; g += 1) {
    const value = fromDigits(compressed.slice(2 + g * 4, 6 + g * 4));
    const b0 = (value >> 16) & 0xff;
    const b1 = (value >> 8) & 0xff;
    const b2 = value & 0xff;
    hex += b0.toString(16).padStart(2, "0") + b1.toString(16).padStart(2, "0") + b2.toString(16).padStart(2, "0");
  }
  return hex;
}

const model: FusedModel = {
  pk: "p", title: "T",
  footprint: [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]],
  footprintSource: "cad-exact",
  floors: 2, floorsSource: "ledger",
  storeyHeightM: 3.3, totalHeightM: 6.6, heightSource: "ledger",
  wallThicknessM: 0.3,
};

function fakeSession() {
  let id = 0;
  return {
    createModel: vi.fn(() => 1),
    writeLine: vi.fn((_modelId: number, _lineObject: unknown) => ++id), // returns a fresh expressId
    saveModel: vi.fn(() => new Uint8Array([1, 2, 3])),
    closeModel: vi.fn(),
  };
}

// IFC4 express type codes for IfcUnitAssignment / IfcSIUnit — verified
// against node_modules/web-ifc/web-ifc-api.js (see generate-ifc.ts header).
const IFCUNITASSIGNMENT = 180925521;
const IFCSIUNIT = 448429030;
const IFCPROJECT = 103090709;

describe("generateIfc", () => {
  it("emits one wall per footprint edge per storey and one slab per floor", async () => {
    const session = fakeSession();
    const { ifcBytes, elements } = await generateIfc(model, session as never);
    // 4 edges × 2 storeys = 8 walls; 2 slabs
    expect(elements.filter((e) => e.kind === "wall")).toHaveLength(8);
    expect(elements.filter((e) => e.kind === "slab")).toHaveLength(2);
    expect(elements.every((e) => e.geomSource === "cad-exact")).toBe(true);
    expect(ifcBytes).toBeInstanceOf(Uint8Array);
    expect(session.saveModel).toHaveBeenCalledOnce();
  });

  it("writes an IfcUnitAssignment (metres + square metres) on IfcProject.UnitsInContext", async () => {
    const session = fakeSession();
    await generateIfc(model, session as never);

    const projectCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCPROJECT);
    expect(projectCall).toBeDefined();
    const project = projectCall![1] as { UnitsInContext: { type: number; Units: { type: number; UnitType: { value: string }; Name: { value: string } }[] } };

    expect(project.UnitsInContext.type).toBe(IFCUNITASSIGNMENT);
    expect(project.UnitsInContext.Units).toHaveLength(2);
    expect(project.UnitsInContext.Units.every((u) => u.type === IFCSIUNIT)).toBe(true);
    expect(project.UnitsInContext.Units.map((u) => u.UnitType.value)).toEqual(["LENGTHUNIT", "AREAUNIT"]);
    expect(project.UnitsInContext.Units.map((u) => u.Name.value)).toEqual(["METRE", "SQUARE_METRE"]);
  });
});

describe("compressIfcGuid", () => {
  it("emits a 22-character string using only the IFC GUID alphabet", () => {
    const compressed = compressIfcGuid("6f236354ada34c7a815732e38462e3ca");
    expect(compressed).toHaveLength(22);
    expect([...compressed].every((ch) => IFC_GUID_ALPHABET.includes(ch))).toBe(true);
  });

  it("round-trips through a local decompressor, proving the byte-grouping is correct", () => {
    const hex32 = "6f236354ada34c7a815732e38462e3ca";
    expect(decompressIfcGuid(compressIfcGuid(hex32))).toBe(hex32);
  });

  it("produces distinct GUIDs for distinct UUIDs", () => {
    const a = compressIfcGuid("00000000000000000000000000000000".slice(0, 32));
    const b = compressIfcGuid("ffffffffffffffffffffffffffffffff".slice(0, 32));
    expect(a).not.toBe(b);
  });
});
