import { describe, it, expect, vi } from "vitest";
import { generateIfc, compressIfcGuid, computeWindowLayout } from "../generate-ifc";
import type { FusedModel, FacadeParams } from "../../types";

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
  facade: null,
  facadeSource: "era-estimate",
};

const FACADE: FacadeParams = { windowWidth: 1.2, windowHeight: 1.5, sillHeight: 0.9, windowSpacing: 1.5 };

const modelWithFacade: FusedModel = { ...model, facade: FACADE, facadeSource: "era-estimate" };

// IFC4 express type codes for the Slice-2 opening/window entities — verified
// against node_modules/web-ifc/web-ifc-api.js (see generate-ifc.ts header).
const IFCOPENINGELEMENT = 3588315303;
const IFCRELVOIDSELEMENT = 1401173127;
const IFCWINDOW = 3304561284;
const IFCRELFILLSELEMENT = 3940055652;

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

  it("emits no windows/openings when model.facade is null", async () => {
    const session = fakeSession();
    const { elements } = await generateIfc(model, session as never);

    expect(elements.filter((e) => e.kind === "window")).toHaveLength(0);
    expect(session.writeLine.mock.calls.some(([, obj]) => (obj as { type: number }).type === IFCOPENINGELEMENT)).toBe(false);
    expect(session.writeLine.mock.calls.some(([, obj]) => (obj as { type: number }).type === IFCWINDOW)).toBe(false);
    expect(session.writeLine.mock.calls.some(([, obj]) => (obj as { type: number }).type === IFCRELVOIDSELEMENT)).toBe(false);
    expect(session.writeLine.mock.calls.some(([, obj]) => (obj as { type: number }).type === IFCRELFILLSELEMENT)).toBe(false);
  });

  it("emits windows hosted via voids/fills per wall edge when model.facade is set", async () => {
    const session = fakeSession();
    const { elements } = await generateIfc(modelWithFacade, session as never);

    // Rectangle has 2 edges of 10m and 2 edges of 8m. FACADE pitch = 1.2 +
    // 1.5 = 2.7 -> floor(10/2.7)=3, floor(8/2.7)=2 -> (3+2)*2 = 10
    // windows/storey per computeWindowLayout, × 2 storeys.
    const windowsPerStorey = 2 * (computeWindowLayout(10, FACADE).length + computeWindowLayout(8, FACADE).length);
    expect(windowsPerStorey).toBe(10);

    const windowElements = elements.filter((e) => e.kind === "window");
    expect(windowElements).toHaveLength(windowsPerStorey * modelWithFacade.floors);
    expect(windowElements.every((e) => e.facadeSource === "era-estimate")).toBe(true);
    expect(windowElements.every((e) => e.geomSource === modelWithFacade.footprintSource)).toBe(true);
    expect(windowElements.every((e) => e.heightSource === modelWithFacade.heightSource)).toBe(true);

    const typeCounts = (type: number) =>
      session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === type).length;
    expect(typeCounts(IFCWINDOW)).toBe(windowElements.length);
    expect(typeCounts(IFCOPENINGELEMENT)).toBe(windowElements.length);
    expect(typeCounts(IFCRELVOIDSELEMENT)).toBe(windowElements.length);
    expect(typeCounts(IFCRELFILLSELEMENT)).toBe(windowElements.length);
  });

  it("writes IfcWindow with OverallHeight/OverallWidth from the facade recipe", async () => {
    const session = fakeSession();
    await generateIfc(modelWithFacade, session as never);

    const windowCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCWINDOW);
    expect(windowCall).toBeDefined();
    const windowObj = windowCall![1] as { OverallHeight: { value: number }; OverallWidth: { value: number } };
    expect(windowObj.OverallHeight.value).toBeCloseTo(FACADE.windowHeight);
    expect(windowObj.OverallWidth.value).toBeCloseTo(FACADE.windowWidth);
  });

  it("hosts each opening/window pair via matching RelatingBuildingElement/RelatedOpeningElement and RelatingOpeningElement/RelatedBuildingElement links", async () => {
    const session = fakeSession();
    await generateIfc(modelWithFacade, session as never);

    const voidsCalls = session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === IFCRELVOIDSELEMENT);
    const fillsCalls = session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === IFCRELFILLSELEMENT);

    for (const [, obj] of voidsCalls) {
      const rel = obj as { RelatingBuildingElement: { type: number }; RelatedOpeningElement: { type: number } };
      expect(rel.RelatingBuildingElement.type).toBe(3512223829); // IfcWallStandardCase
      expect(rel.RelatedOpeningElement.type).toBe(IFCOPENINGELEMENT);
    }
    for (const [, obj] of fillsCalls) {
      const rel = obj as { RelatingOpeningElement: { type: number }; RelatedBuildingElement: { type: number } };
      expect(rel.RelatingOpeningElement.type).toBe(IFCOPENINGELEMENT);
      expect(rel.RelatedBuildingElement.type).toBe(IFCWINDOW);
    }
  });
});

describe("computeWindowLayout", () => {
  it("returns an empty array when the edge is shorter than one window pitch", () => {
    expect(computeWindowLayout(2, FACADE)).toEqual([]);
  });

  it("computes a centered row of windows for a 10m edge", () => {
    // pitch = 1.2 + 1.5 = 2.7; floor(10/2.7) = 3; totalSpan = 3*1.2+2*1.5 = 6.6;
    // startOffset = (10-6.6)/2 = 1.7
    const positions = computeWindowLayout(10, FACADE);
    expect(positions).toHaveLength(3);
    expect(positions[0]).toBeCloseTo(1.7);
    expect(positions[1]).toBeCloseTo(1.7 + 2.7);
    expect(positions[2]).toBeCloseTo(1.7 + 2 * 2.7);
    // Symmetric: distance from the last window's right edge to the far end
    // of the wall equals the starting offset.
    const lastRightEdge = positions[2] + FACADE.windowWidth;
    expect(10 - lastRightEdge).toBeCloseTo(positions[0]);
  });

  it("is deterministic for the same inputs", () => {
    expect(computeWindowLayout(10, FACADE)).toEqual(computeWindowLayout(10, FACADE));
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
