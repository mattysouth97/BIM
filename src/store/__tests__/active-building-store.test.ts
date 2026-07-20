// src/store/__tests__/active-building-store.test.ts
// P1-08 (c) — real active-building state, replacing the material-store
// insertion-order lottery.

import { describe, it, expect, beforeEach } from "vitest";
import { useActiveBuildingStore } from "../active-building-store";

describe("useActiveBuildingStore", () => {
  beforeEach(() => {
    useActiveBuildingStore.getState().clearActiveBuilding();
  });

  it("starts with no active building", () => {
    expect(useActiveBuildingStore.getState().buildingPk).toBeNull();
    expect(useActiveBuildingStore.getState().sigunguCd).toBeNull();
  });

  it("setActiveBuilding records pk and sigunguCd", () => {
    useActiveBuildingStore.getState().setActiveBuilding("PK-BUSAN-1", "26110");
    expect(useActiveBuildingStore.getState().buildingPk).toBe("PK-BUSAN-1");
    expect(useActiveBuildingStore.getState().sigunguCd).toBe("26110");
  });

  it("setActiveBuilding without sigunguCd stores null (explicit unknown, not stale)", () => {
    useActiveBuildingStore.getState().setActiveBuilding("PK-A", "26110");
    useActiveBuildingStore.getState().setActiveBuilding("PK-B");
    expect(useActiveBuildingStore.getState().buildingPk).toBe("PK-B");
    expect(useActiveBuildingStore.getState().sigunguCd).toBeNull();
  });

  it("clearActiveBuilding resets both fields", () => {
    useActiveBuildingStore.getState().setActiveBuilding("PK-A", "11110");
    useActiveBuildingStore.getState().clearActiveBuilding();
    expect(useActiveBuildingStore.getState().buildingPk).toBeNull();
    expect(useActiveBuildingStore.getState().sigunguCd).toBeNull();
  });
});
