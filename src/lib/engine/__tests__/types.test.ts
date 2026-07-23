import { describe, it, expect } from "vitest";
import { ENGINE_CONSTANTS } from "../types";

describe("engine constants", () => {
  it("pins the Slice-1 scoring weights and thresholds", () => {
    expect(ENGINE_CONSTANTS.W_GEOM + ENGINE_CONSTANTS.W_HEIGHT).toBeCloseTo(1);
    expect(ENGINE_CONSTANTS.HITL_THRESHOLD).toBe(0.85);
    expect(ENGINE_CONSTANTS.TOPOLOGY_PENALTY).toBe(0.2);
  });
});
