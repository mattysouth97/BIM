import { describe, it, expect } from "vitest";
import { buildingInfoContainers } from "../iso19650-status";

describe("buildingInfoContainers", () => {
  it("always includes the published ledger and WIP estimated containers", () => {
    const containers = buildingInfoContainers({ hasCadFootprint: false });
    expect(containers.map((c) => c.key)).toEqual(["ledger", "estimated"]);
    expect(containers[0].state).toBe("published");
    expect(containers[0].suitability).toBe("A");
    expect(containers[1].state).toBe("wip");
    expect(containers[1].suitability).toBe("S0");
  });

  it("adds the CAD container as Shared/S2 only when a footprint exists", () => {
    const containers = buildingInfoContainers({ hasCadFootprint: true });
    const cad = containers.find((c) => c.key === "cad")!;
    expect(cad.state).toBe("shared");
    expect(cad.suitability).toBe("S2");
    // Ordered ledger → cad → estimated (authority descending)
    expect(containers.map((c) => c.key)).toEqual(["ledger", "cad", "estimated"]);
  });
});
