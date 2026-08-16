import { describe, it, expect } from "vitest";
import { ENGINE_CONSTANTS, DEFAULT_FACADE } from "../types";

describe("engine constants", () => {
  it("pins the Slice-1 scoring weights and thresholds", () => {
    expect(ENGINE_CONSTANTS.W_GEOM + ENGINE_CONSTANTS.W_HEIGHT).toBeCloseTo(1);
    expect(ENGINE_CONSTANTS.HITL_THRESHOLD).toBe(0.85);
    expect(ENGINE_CONSTANTS.TOPOLOGY_PENALTY).toBe(0.2);
  });

  it("pins the Slice-2 facade-estimate score below the HITL threshold (windows must always be flagged)", () => {
    expect(ENGINE_CONSTANTS.FACADE_ESTIMATE_SCORE).toBe(0.5);
    // 0.6*0.5 + 0.4*1.0 = 0.7 < 0.85 — even with perfect height score, an
    // era-estimate window can never clear HITL_THRESHOLD.
    const bestCaseWindowSconf = ENGINE_CONSTANTS.W_GEOM * ENGINE_CONSTANTS.FACADE_ESTIMATE_SCORE + ENGINE_CONSTANTS.W_HEIGHT * 1.0;
    expect(bestCaseWindowSconf).toBeLessThan(ENGINE_CONSTANTS.HITL_THRESHOLD);
  });

  it("pins the Slice-2 default era-based facade dimensions", () => {
    expect(DEFAULT_FACADE).toEqual({ windowWidth: 1.2, windowHeight: 1.5, sillHeight: 0.9, windowSpacing: 1.5 });
  });
});
