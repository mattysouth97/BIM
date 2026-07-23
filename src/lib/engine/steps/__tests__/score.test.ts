import { describe, it, expect } from "vitest";
import { score } from "../score";
import type { GeneratedElement, ValidationReport } from "../../types";

const ok: ValidationReport = { passed: true, checks: [] };
const el = (expressId: number, geom: GeneratedElement["geomSource"], height: GeneratedElement["heightSource"]): GeneratedElement =>
  ({ expressId, kind: "wall", storey: 0, geomSource: geom, heightSource: height });
const windowEl = (
  expressId: number,
  geom: GeneratedElement["geomSource"],
  height: GeneratedElement["heightSource"],
  facadeSource: GeneratedElement["facadeSource"] = "era-estimate",
): GeneratedElement => ({ expressId, kind: "window", storey: 0, geomSource: geom, heightSource: height, facadeSource });

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

  it("caps a window's geomScore at the era-estimate facade score even with cad-exact footprint geometry, and flags it (< 0.85)", () => {
    // sconf = 0.6*min(geomScore, FACADE_ESTIMATE_SCORE=0.5) + 0.4*heightScore
    //       = 0.6*min(1.0, 0.5) + 0.4*1.0 = 0.6*0.5 + 0.4 = 0.7 < 0.85
    const { elements, hitlFlags } = score([windowEl(4, "cad-exact", "ledger")], ok);
    expect(elements[0].geomScore).toBeCloseTo(0.5);
    expect(elements[0].sconf).toBeCloseTo(0.7);
    expect(hitlFlags).toHaveLength(1);
    expect(hitlFlags[0].reason).toMatch(/facade \(estimated window placement\)/);
  });

  it("never scores a window >= HITL_THRESHOLD regardless of geom/height source (era-estimate facade always caps it)", () => {
    const { elements } = score([windowEl(5, "cad-exact", "ledger", "era-estimate")], ok);
    expect(elements[0].sconf).toBeLessThan(0.85);
  });
});
