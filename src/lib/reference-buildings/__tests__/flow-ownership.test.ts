import { describe, expect, it } from "vitest";
import { collectFlowNetwork } from "../../../../scripts/lib/ifc-flow.mjs";

const IFC = { IFCRELCONNECTSPORTTOELEMENT: 1, IFCDISTRIBUTIONPORT: 2, IFCRELCONNECTSPORTS: 3, IFCRELNESTS: 4 };
const ref = (value: unknown) => ({ value });
function network({ nested = true, conflict = false, connected = true, sourceAndSink = false } = {}) {
  const rows: Record<number, Record<string, unknown>> = {
    10: { FlowDirection: ref(sourceAndSink ? "SOURCEANDSINK" : "SOURCE") },
    11: { FlowDirection: ref(sourceAndSink ? "SOURCEANDSINK" : "SINK") },
    20: { RelatingPort: ref(10), RelatedPort: ref(11) },
    30: { RelatingObject: ref(100), RelatedObjects: [ref(10), ref(999)] },
    31: { RelatingObject: ref(101), RelatedObjects: [ref(11)] },
    32: { RelatingObject: ref(102), RelatedObjects: [ref(10)] },
    100: { type: 5 }, 101: { type: 5 },
  };
  const ids: Record<number, number[]> = { 1: [], 2: [10, 11], 3: connected ? [20] : [], 4: nested ? conflict ? [30, 31, 32] : [30, 31] : [] };
  const api = {
    GetLineIDsWithType: (_: number, type: number) => ({ size: () => ids[type].length, get: (i: number) => ids[type][i] }),
    GetLine: (_: number, id: number) => rows[id],
    GetNameFromTypeCode: () => "IfcPipeSegment",
    StreamAllMeshes: () => undefined,
  };
  return collectFlowNetwork(api, IFC, 0);
}

describe("IFC4 nested port ownership", () => {
  it("resolves source-directed connections without treating all nested objects as ports", () => {
    const result = network();
    expect(result.directedEdges).toBe(1);
    expect(result.unresolvedConnections).toBe(0);
    expect(result.ungeometried).toBe(1);
    expect(result.drawnEdges).toBe(0);
  });
  it("does not choose between conflicting port owners", () => {
    const result = network({ conflict: true });
    expect(result.directedEdges).toBe(0);
    expect(result.unresolvedConnections).toBe(1);
    expect(result.reason).toContain("1 of 1 port connections have unresolved");
    expect(result.reason).not.toContain("bidirectional");
  });
  it("distinguishes missing ownership, absent connections and ambiguous direction", () => {
    expect(network({ nested: false }).reason).toContain("unresolved");
    expect(network({ connected: false }).reason).toContain("no port-to-port connections");
    const result = network({ sourceAndSink: true });
    expect(result.bidirectionalEdges).toBe(1);
    expect(result.reason).toContain("no unambiguous SOURCE-to-SINK");
  });
});
