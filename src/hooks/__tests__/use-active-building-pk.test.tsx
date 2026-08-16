// src/hooks/__tests__/use-active-building-pk.test.tsx
// P1-08 (c) — active-building resolution: explicit selection wins over
// material-store insertion order; legacy first-key fallback only when the
// active-building store is empty.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActiveBuildingPk } from "../use-active-building-pk";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useMaterialStore } from "@/store/material-store";
import { makeMaterials } from "./test-fixtures";

describe("useActiveBuildingPk", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
    useActiveBuildingStore.getState().clearActiveBuilding();
  });

  it("returns the override argument when provided", () => {
    useActiveBuildingStore.getState().setActiveBuilding("PK-STORE");
    const { result } = renderHook(() => useActiveBuildingPk("PK-OVERRIDE"));
    expect(result.current).toBe("PK-OVERRIDE");
  });

  it("active-building store wins over material-store insertion order", () => {
    useMaterialStore.setState({
      properties: { "PK-FIRST": makeMaterials(), "PK-SECOND": makeMaterials() },
    });
    useActiveBuildingStore.getState().setActiveBuilding("PK-SECOND");

    const { result } = renderHook(() => useActiveBuildingPk());
    expect(result.current).toBe("PK-SECOND");
  });

  it("falls back to the first material-store key when the store is empty (legacy)", () => {
    useMaterialStore.setState({
      properties: { "PK-FIRST": makeMaterials(), "PK-SECOND": makeMaterials() },
    });

    const { result } = renderHook(() => useActiveBuildingPk());
    expect(result.current).toBe("PK-FIRST");
  });

  it('returns "" when nothing is registered anywhere', () => {
    const { result } = renderHook(() => useActiveBuildingPk());
    expect(result.current).toBe("");
  });
});
