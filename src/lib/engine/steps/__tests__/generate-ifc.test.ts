import { describe, it, expect, vi } from "vitest";
import {
  generateIfc,
  compressIfcGuid,
  computeWindowLayout,
  pickEntranceEdge,
  buildWindowAssembly,
  buildDoorAssembly,
} from "../generate-ifc";
import type { FusedModel, FacadeParams } from "../../types";
import { ENGINE_CONSTANTS } from "../../types";

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
// Slice-3: verified against node_modules/web-ifc/web-ifc-api.js (IFC4 schema
// slot, ToRawLineData[2][395920057]) — see generate-ifc.ts header.
const IFCDOOR = 395920057;
// Slice-4: same IFCEXTRUDEDAREASOLID type code already used (and verified) for
// wall/slab/opening solids — see generate-ifc.ts header comment.
const IFCEXTRUDEDAREASOLID = 477187591;

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

  it("emits no windows when model.facade is null (the entrance door's own opening/void/fill still exist)", async () => {
    const session = fakeSession();
    const { elements } = await generateIfc(model, session as never);

    // No facade => no windows, but Slice-3's entrance door is unconditional —
    // it still emits exactly one IfcOpeningElement/IfcRelVoidsElement/
    // IfcRelFillsElement triple for itself (see the "entrance door" describe
    // block below for door-specific assertions).
    expect(elements.filter((e) => e.kind === "window")).toHaveLength(0);
    expect(session.writeLine.mock.calls.some(([, obj]) => (obj as { type: number }).type === IFCWINDOW)).toBe(false);
    const typeCounts = (type: number) =>
      session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === type).length;
    expect(typeCounts(IFCOPENINGELEMENT)).toBe(1);
    expect(typeCounts(IFCRELVOIDSELEMENT)).toBe(1);
    expect(typeCounts(IFCRELFILLSELEMENT)).toBe(1);
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

    // +1 to each opening/void/fill count for the Slice-3 entrance door, which
    // is hosted via the same machinery but is not itself a window.
    const typeCounts = (type: number) =>
      session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === type).length;
    expect(typeCounts(IFCWINDOW)).toBe(windowElements.length);
    expect(typeCounts(IFCOPENINGELEMENT)).toBe(windowElements.length + 1);
    expect(typeCounts(IFCRELVOIDSELEMENT)).toBe(windowElements.length + 1);
    expect(typeCounts(IFCRELFILLSELEMENT)).toBe(windowElements.length + 1);
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

  it("builds a detailed window assembly (frame + glass + mullion) instead of a single placeholder box", async () => {
    const session = fakeSession();
    await generateIfc(modelWithFacade, session as never);

    const windowCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCWINDOW);
    expect(windowCall).toBeDefined();
    const windowObj = windowCall![1] as {
      Representation: { Representations: { Items: { type: number; Position: unknown }[] }[] };
    };
    const items = windowObj.Representation.Representations[0].Items;

    // Single source of truth: buildWindowAssembly is the exact function that
    // produced these items, so its own output length is what we assert
    // against — no duplicated "6 items" magic number.
    const expected = buildWindowAssembly(FACADE.windowWidth, FACADE.windowHeight, modelWithFacade.wallThicknessM);
    expect(items).toHaveLength(expected.length);
    // No longer the Slice-2 single placeholder box.
    expect(items.length).toBeGreaterThan(1);
    expect(items.every((it) => it.type === IFCEXTRUDEDAREASOLID)).toBe(true);
    // Frame/glass/mullion members are each offset within the window's local
    // frame via a non-null Position — unlike the old single box, which
    // always had Position: null (occupied the whole local frame).
    expect(items.some((it) => it.Position !== null)).toBe(true);
  });

  it("builds a lighter door assembly (frame + solid panel, no glass/mullion)", async () => {
    const session = fakeSession();
    await generateIfc(model, session as never);

    const doorCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCDOOR);
    expect(doorCall).toBeDefined();
    const doorObj = doorCall![1] as {
      Representation: { Representations: { Items: { type: number; Position: unknown }[] }[] };
    };
    const items = doorObj.Representation.Representations[0].Items;

    const expectedDoor = buildDoorAssembly(
      ENGINE_CONSTANTS.DEFAULT_DOOR.width,
      ENGINE_CONSTANTS.DEFAULT_DOOR.height,
      model.wallThicknessM,
    );
    expect(items).toHaveLength(expectedDoor.length);
    expect(items.every((it) => it.type === IFCEXTRUDEDAREASOLID)).toBe(true);

    // "Lighter treatment": the door has no glass pane/mullion, so it has
    // fewer solids than a window assembly of comparable size.
    const expectedWindow = buildWindowAssembly(
      ENGINE_CONSTANTS.DEFAULT_DOOR.width,
      ENGINE_CONSTANTS.DEFAULT_DOOR.height,
      model.wallThicknessM,
    );
    expect(expectedDoor.length).toBeLessThan(expectedWindow.length);
  });

  it("hosts each opening/window pair via matching RelatingBuildingElement/RelatedOpeningElement and RelatingOpeningElement/RelatedBuildingElement links", async () => {
    const session = fakeSession();
    await generateIfc(modelWithFacade, session as never);

    // voidsCalls also includes the entrance door's own void (same shape:
    // wall <-> opening), which the loop below already covers generically.
    const voidsCalls = session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === IFCRELVOIDSELEMENT);
    // Scoped to window fills only — the entrance door's own fill (opening
    // <-> IfcDoor) is asserted separately in the "entrance door" tests below.
    const windowFillsCalls = session.writeLine.mock.calls.filter(
      ([, obj]) =>
        (obj as { type: number }).type === IFCRELFILLSELEMENT &&
        (obj as { RelatedBuildingElement: { type: number } }).RelatedBuildingElement.type === IFCWINDOW,
    );

    for (const [, obj] of voidsCalls) {
      const rel = obj as { RelatingBuildingElement: { type: number }; RelatedOpeningElement: { type: number } };
      expect(rel.RelatingBuildingElement.type).toBe(3512223829); // IfcWallStandardCase
      expect(rel.RelatedOpeningElement.type).toBe(IFCOPENINGELEMENT);
    }
    for (const [, obj] of windowFillsCalls) {
      const rel = obj as { RelatingOpeningElement: { type: number }; RelatedBuildingElement: { type: number } };
      expect(rel.RelatingOpeningElement.type).toBe(IFCOPENINGELEMENT);
      expect(rel.RelatedBuildingElement.type).toBe(IFCWINDOW);
    }
  });

  it("emits exactly ONE entrance IfcDoor on storey 0, even with no facade (no windows)", async () => {
    const session = fakeSession();
    const { elements } = await generateIfc(model, session as never);

    const doors = elements.filter((e) => e.kind === "door");
    expect(doors).toHaveLength(1);
    expect(doors[0].storey).toBe(0);
    expect(doors[0].geomSource).toBe(model.footprintSource);
    expect(doors[0].heightSource).toBe(model.heightSource);
    expect(doors[0].facadeSource).toBe("era-estimate");

    const doorCalls = session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === IFCDOOR);
    expect(doorCalls).toHaveLength(1);
  });

  it("hosts the entrance door via a real IfcOpeningElement void + fill on the entrance-edge wall", async () => {
    const session = fakeSession();
    await generateIfc(model, session as never);

    const doorCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCDOOR);
    expect(doorCall).toBeDefined();
    const doorLine = doorCall![1] as { type: number };

    const voidsCalls = session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === IFCRELVOIDSELEMENT);
    const fillsCalls = session.writeLine.mock.calls.filter(([, obj]) => (obj as { type: number }).type === IFCRELFILLSELEMENT);

    const doorFill = fillsCalls.find(
      ([, obj]) => (obj as { RelatedBuildingElement: unknown }).RelatedBuildingElement === doorLine,
    );
    expect(doorFill).toBeDefined();
    const fillObj = doorFill![1] as { RelatingOpeningElement: { type: number } };
    expect(fillObj.RelatingOpeningElement.type).toBe(IFCOPENINGELEMENT);

    const doorVoid = voidsCalls.find(
      ([, obj]) => (obj as { RelatedOpeningElement: unknown }).RelatedOpeningElement === fillObj.RelatingOpeningElement,
    );
    expect(doorVoid).toBeDefined();
    const voidObj = doorVoid![1] as { RelatingBuildingElement: { type: number } };
    expect(voidObj.RelatingBuildingElement.type).toBe(3512223829); // IfcWallStandardCase
  });

  it("writes IfcDoor with OverallHeight/OverallWidth from ENGINE_CONSTANTS.DEFAULT_DOOR", async () => {
    const session = fakeSession();
    await generateIfc(model, session as never);

    const doorCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCDOOR);
    expect(doorCall).toBeDefined();
    const doorObj = doorCall![1] as { OverallHeight: { value: number }; OverallWidth: { value: number } };
    expect(doorObj.OverallHeight.value).toBeCloseTo(ENGINE_CONSTANTS.DEFAULT_DOOR.height);
    expect(doorObj.OverallWidth.value).toBeCloseTo(ENGINE_CONSTANTS.DEFAULT_DOOR.width);
  });

  it("centers the entrance door on the longest footprint edge (pickEntranceEdge)", async () => {
    const session = fakeSession();
    await generateIfc(model, session as never);

    // model's ring is a 10x8 rectangle: edges [10,8,10,8]. Longest length is
    // 10, tied between index 0 and 2 — pickEntranceEdge breaks ties toward
    // the lowest index, so edge 0 ((0,0)->(10,0)) hosts the door.
    const entranceEdgeIndex = pickEntranceEdge(model.footprint[0]);
    expect(entranceEdgeIndex).toBe(0);

    const doorCall = session.writeLine.mock.calls.find(([, obj]) => (obj as { type: number }).type === IFCDOOR);
    const doorObj = doorCall![1] as { ObjectPlacement: { RelativePlacement: { Location: { Coordinates: { value: number }[] } } } };
    const [localX, , localZ] = doorObj.ObjectPlacement.RelativePlacement.Location.Coordinates.map((c) => c.value);
    // Centered: (edgeLength(10) - doorWidth(1.2)) / 2 = 4.4; sill 0 (floor level).
    expect(localX).toBeCloseTo(4.4);
    expect(localZ).toBeCloseTo(0);
  });

  it("does not emit a door on storey 1 (only storey 0 gets the entrance door)", async () => {
    const session = fakeSession();
    const { elements } = await generateIfc(model, session as never);

    const doorsByStorey = new Map<number, number>();
    for (const e of elements.filter((el) => el.kind === "door")) {
      doorsByStorey.set(e.storey, (doorsByStorey.get(e.storey) ?? 0) + 1);
    }
    expect(doorsByStorey.get(0)).toBe(1);
    expect(doorsByStorey.get(1)).toBeUndefined();
  });
});

describe("pickEntranceEdge", () => {
  it("picks the longest edge, breaking ties toward the lowest index", () => {
    // 10x8 rectangle: edges of length 10, 8, 10, 8 — tie between index 0 and 2.
    expect(pickEntranceEdge([[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]])).toBe(0);
  });

  it("picks the unique longest edge on an irregular polygon", () => {
    // A skewed quadrilateral where edge index 2 ((4,4)->(-2,4), length 6) is
    // uniquely longest: edges are 4, 4, 6, sqrt(20)≈4.47.
    const ring: [number, number][] = [[0, 0], [4, 0], [4, 4], [-2, 4], [0, 0]];
    expect(pickEntranceEdge(ring)).toBe(2);
  });

  it("is deterministic for the same input", () => {
    const ring: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]];
    expect(pickEntranceEdge(ring)).toBe(pickEntranceEdge(ring));
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

describe("buildWindowAssembly", () => {
  it("emits a frame (4 members) + glass pane + mullion, all IfcExtrudedAreaSolid", () => {
    const items = buildWindowAssembly(FACADE.windowWidth, FACADE.windowHeight, 0.3);
    expect(items).toHaveLength(6); // 4 frame members + 1 glass pane + 1 mullion
    expect(items.every((it) => it.type === IFCEXTRUDEDAREASOLID)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildWindowAssembly(FACADE.windowWidth, FACADE.windowHeight, 0.3);
    const b = buildWindowAssembly(FACADE.windowWidth, FACADE.windowHeight, 0.3);
    expect(a).toEqual(b);
  });

  it("gives every member an explicit (non-null) Position offset", () => {
    const wallThicknessM = 0.3;
    const items = buildWindowAssembly(FACADE.windowWidth, FACADE.windowHeight, wallThicknessM);
    // Every item has an explicit (non-null) Position — none occupies the
    // whole local frame the way the old single placeholder box did.
    expect(items.every((it) => it.Position !== null)).toBe(true);
  });
});

describe("buildDoorAssembly", () => {
  it("emits a frame (4 members) + a single solid panel, all IfcExtrudedAreaSolid", () => {
    const items = buildDoorAssembly(ENGINE_CONSTANTS.DEFAULT_DOOR.width, ENGINE_CONSTANTS.DEFAULT_DOOR.height, 0.3);
    expect(items).toHaveLength(5); // 4 frame members + 1 panel
    expect(items.every((it) => it.type === IFCEXTRUDEDAREASOLID)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildDoorAssembly(ENGINE_CONSTANTS.DEFAULT_DOOR.width, ENGINE_CONSTANTS.DEFAULT_DOOR.height, 0.3);
    const b = buildDoorAssembly(ENGINE_CONSTANTS.DEFAULT_DOOR.width, ENGINE_CONSTANTS.DEFAULT_DOOR.height, 0.3);
    expect(a).toEqual(b);
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
