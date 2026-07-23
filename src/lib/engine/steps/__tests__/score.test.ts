import { describe, it, expect } from "vitest";
import { score } from "../score";
import type { GeneratedElement, ValidationReport } from "../../types";

const ok: ValidationReport = { passed: true, checks: [] };
const el = (expressId: number, geom: GeneratedElement["geomSource"], height: GeneratedElement["heightSource"]): GeneratedElement =>
  ({ expressId, kind: "wall", storey: 0, geomSource: geom, heightSource: height });

describe("score", () => {
  it("does not flag a cad-exact + ledger element (sconf 1.0)", () => {
    const { elements, hitlFlags } = score([el(1, "cad-exact", "ledger")], ok);
    expect(elements[0].sconf).toBeCloseTo(1.0);
    expect(hitlFlags).toHaveLength(0);
  });
  it("flags a vworld + era-estimate element (sconf 0.68 < 0.85)", () => {
    const { elements, hitlFlags } = score([el(2, "vworld-measured", "era-estimate")], ok);
    expect(elements[0].sconf).toBeCloseTo(0.68);
    expect(hitlFlags).toHaveLength(1);
  });
  it("applies the topology penalty to elements implicated in a failed check", () => {
    const bad: ValidationReport = { passed: false, checks: [{ id: "ring-closed", passed: false, detail: "open", elementIds: [3] }] };
    const { elements } = score([el(3, "cad-exact", "ledger")], bad);
    expect(elements[0].topologyPenalty).toBe(0.2);
    expect(elements[0].sconf).toBeCloseTo(0.8);
  });
});
