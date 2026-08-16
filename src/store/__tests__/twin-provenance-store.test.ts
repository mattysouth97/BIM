import { describe, it, expect, beforeEach } from "vitest";
import { useTwinProvenanceStore } from "../twin-provenance-store";

describe("useTwinProvenanceStore", () => {
  beforeEach(() => {
    useTwinProvenanceStore.setState({ byPk: {} });
  });

  it("returns empty flags for an unknown pk", () => {
    const p = useTwinProvenanceStore.getState().get("missing");
    expect(p.hasCadFootprint).toBe(false);
    expect(p.hasCadPlan).toBe(false);
    expect(p.hasEquipmentSchedule).toBe(false);
    expect(p.hasIfcModel).toBe(false);
  });

  it("patches flags without dropping siblings", () => {
    useTwinProvenanceStore.getState().patch("pk-1", { hasCadFootprint: true });
    useTwinProvenanceStore.getState().patch("pk-1", { hasCadPlan: true });
    const p = useTwinProvenanceStore.getState().get("pk-1");
    expect(p.hasCadFootprint).toBe(true);
    expect(p.hasCadPlan).toBe(true);
  });
});
