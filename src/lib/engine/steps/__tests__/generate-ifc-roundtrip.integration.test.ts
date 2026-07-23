// @vitest-environment node
//
// A2 — REAL write→read round-trip: unlike generate-ifc.test.ts (which uses a
// fake counting write session and never touches WASM), this test builds a
// genuine IfcWriteSession backed by web-ifc-node.wasm, runs the full engine
// pipeline against it, then re-opens the resulting bytes with a second
// `OpenModel` call and asserts on the actual parsed IFC4 line counts. This is
// the honest round-trip check that "element-count" (validate.ts, renamed
// from "roundtrip-count") explicitly does NOT perform.

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { runEngine } from "../../orchestrator";
import type { BimEngineInput } from "../../types";
import type { IfcWriteSession, RawIfcLine } from "../../../ifc/ifc-session";

// IFC4 express type codes — verified against node_modules/web-ifc/web-ifc-api.js
// (same source as generate-ifc.ts's IFC4_TYPE table).
const IFCWALLSTANDARDCASE = 3512223829;
const IFCSLAB = 1529196076;
const IFCBUILDINGSTOREY = 3124254112;
const IFCSIUNIT = 448429030;

// Minimal shape of the bits of web-ifc's IfcAPI this test actually calls —
// avoids importing web-ifc's own types at module scope so the file still
// parses (and other engine tests still run) if web-ifc's node entry ever
// fails to resolve; the real shape is checked at runtime in beforeAll.
interface RealIfcApi {
  Init(locateFile: (path: string) => string): Promise<void>;
  CreateModel(model: { schema: string }): number;
  WriteLine(modelId: number, lineObject: RawIfcLine): void;
  SaveModel(modelId: number): Uint8Array;
  CloseModel(modelId: number): void;
  OpenModel(bytes: Uint8Array): number;
  GetLineIDsWithType(modelId: number, type: number): { size(): number; get(i: number): number };
  GetLine(modelId: number, expressId: number): Record<string, unknown>;
}

let api: RealIfcApi;

describe("generateIfc real write→read round-trip (web-ifc-node.wasm)", () => {
  beforeAll(async () => {
    const WebIFC = await import("web-ifc");
    api = new WebIFC.IfcAPI() as unknown as RealIfcApi;
    await api.Init((wasmPath: string) => {
      if (wasmPath.endsWith(".wasm")) {
        return path.join(process.cwd(), "node_modules", "web-ifc", "web-ifc-node.wasm");
      }
      return wasmPath;
    });
  });

  it("round-trips an 8-wall / 2-slab / 2-storey 10x8 CAD-exact building through real IFC4 bytes", async () => {
    const session: IfcWriteSession = {
      createModel: () => api.CreateModel({ schema: "IFC4" }),
      writeLine: (modelId: number, lineObject: RawIfcLine) => {
        api.WriteLine(modelId, lineObject);
        return lineObject.expressID;
      },
      saveModel: (modelId: number) => api.SaveModel(modelId),
      closeModel: (modelId: number) => api.CloseModel(modelId),
    };

    const input: BimEngineInput = {
      pk: "roundtrip",
      title: "Roundtrip Test Building",
      cadFootprint: {
        rings: [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]],
        source: "cad-exact",
      },
      ledger: { heightM: 6.6, floors: 2 },
    };

    const result = await runEngine(input, session);
    expect(result.ifcBytes.length).toBeGreaterThan(0);
    // Sanity: the pure element-count check (renamed from "roundtrip-count")
    // agrees with the construction formula before we even touch WASM again.
    expect(result.validation.checks.find((c) => c.id === "element-count")?.passed).toBe(true);

    const readModelId = api.OpenModel(result.ifcBytes);
    try {
      expect(api.GetLineIDsWithType(readModelId, IFCWALLSTANDARDCASE).size()).toBe(8);
      expect(api.GetLineIDsWithType(readModelId, IFCSLAB).size()).toBe(2);
      expect(api.GetLineIDsWithType(readModelId, IFCBUILDINGSTOREY).size()).toBe(2);

      const siUnitIds = api.GetLineIDsWithType(readModelId, IFCSIUNIT);
      expect(siUnitIds.size()).toBeGreaterThanOrEqual(1);

      let foundLengthUnit = false;
      for (let i = 0; i < siUnitIds.size(); i += 1) {
        const line = api.GetLine(readModelId, siUnitIds.get(i)) as { UnitType?: { value?: string } | string };
        const unitType = typeof line.UnitType === "string" ? line.UnitType : line.UnitType?.value;
        if (unitType === "LENGTHUNIT") foundLengthUnit = true;
      }
      expect(foundLengthUnit).toBe(true);
    } finally {
      api.CloseModel(readModelId);
    }
  });
});
