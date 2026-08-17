// src/hooks/__tests__/use-bim-model.test.tsx
//
// Which hydration path a pk takes. A generated pk must reach the stored
// design's own snapshot; every other pk class must keep the recipe path it has
// always had, including when a recipe happens to exist for the generated pk too
// (the energy bridge seeds one, so the branch has to be on the pk, not on
// whether a recipe is present).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

import { getRecipe } from "@/lib/procedural/recipe";
import type { BimModelSnapshot } from "@/lib/bim/model";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { useBimModelStore } from "@/store/bim-model-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useBimModel } from "../use-bim-model";

const getOrBuildDesign = vi.fn();

vi.mock("@/lib/generative/design-storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/generative/design-storage")>();
  return {
    ...actual,
    // Only the IndexedDB round trip is stubbed; `isGeneratedPk` stays real, so
    // this test also pins the pk classification the wiring depends on.
    getOrBuildDesign: (id: string) => getOrBuildDesign(id),
  };
});

const GEN_PK = "GEN-0042";
const LEDGER_PK = "11680-12345678";

function testRecipe(): BuildingRecipe {
  return {
    ...getRecipe("21", "2010-2019", "14000"),
    footprintWidth: 20,
    footprintDepth: 12,
    floors: [
      {
        floorNo: 1,
        label: "1F",
        type: "above" as const,
        y: 0,
        height: 4,
        isGroundFloor: true,
      },
    ],
    totalHeight: 4,
    wallThickness: 0.2,
    era: "2010-2019" as const,
    strctCd: "21",
    mainPurpsCd: "14000",
    siteWidth: 30,
    siteDepth: 20,
    buildingName: "Test",
    address: "Seoul",
  };
}

function designSnapshot(): BimModelSnapshot {
  return {
    // The engine builds under its own pk; the store files it under the active one.
    buildingPk: "generated",
    levels: [
      {
        id: "level:1",
        name: "1F",
        elevation: 0,
        height: 4,
        floorNo: 1,
        associatedViewId: "view:plan:1",
      },
    ],
    grids: [],
    types: {},
    elements: [
      {
        id: "CORE-stair-L1",
        origin: "generated",
        kind: "stair",
        category: "Stairs",
        family: "stair",
        typeId: "generated-stair",
        buildingPk: "generated",
        levelId: "level:1",
        hostId: null,
        mark: "CORE-stair-L1",
        instanceParameters: {},
        placement: { x: 0, y: 0, z: 0, rotationY: 0 },
        phaseCreated: "new",
        visible: true,
        system: "core",
        generationSource: { type: "GENERATED", generationId: GEN_PK, version: 1 },
      },
    ],
    documents: [],
    visibility: {},
  };
}

describe("useBimModel hydration path", () => {
  // Auto-cleanup is off (vitest runs without globals), so a hook left mounted
  // would keep hydrating into the next test's store.
  afterEach(cleanup);

  beforeEach(() => {
    getOrBuildDesign.mockReset();
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
    useBimModelStore.setState({
      byBuilding: {},
      snapshot: null,
      log: { past: [], future: [] },
      selectedElementId: null,
      activeLevelId: null,
      editingTypeId: null,
    });
  });

  it("hydrates a generated pk from its stored design snapshot", async () => {
    getOrBuildDesign.mockResolvedValue({ snapshot: designSnapshot() });
    // A recipe exists for this pk (the energy bridge seeds one) and must not
    // be what the model is built from.
    useRecipeStore.setState({ baseRecipes: { [GEN_PK]: testRecipe() } });

    renderHook(() => useBimModel(GEN_PK));

    await waitFor(() => {
      expect(useBimModelStore.getState().snapshot?.buildingPk).toBe(GEN_PK);
    });
    expect(getOrBuildDesign).toHaveBeenCalledWith(GEN_PK);

    const model = useBimModelStore.getState().snapshot!;
    const stair = model.elements.find((el) => el.id === "CORE-stair-L1");
    expect(stair?.generationSource?.generationId).toBe(GEN_PK);
    // The recipe path emits walls/rooms/openings and no stair; this is the
    // engine's snapshot, not a re-derivation.
    expect(model.elements.every((el) => el.id === "CORE-stair-L1")).toBe(true);
  });

  it("leaves the model empty when the generated design cannot be loaded", async () => {
    getOrBuildDesign.mockResolvedValue(null);
    useRecipeStore.setState({ baseRecipes: { [GEN_PK]: testRecipe() } });

    renderHook(() => useBimModel(GEN_PK));

    await waitFor(() => expect(getOrBuildDesign).toHaveBeenCalled());
    expect(useBimModelStore.getState().snapshot).toBeNull();
  });

  it("keeps the recipe path for a ledger pk", async () => {
    useRecipeStore.setState({ baseRecipes: { [LEDGER_PK]: testRecipe() } });

    renderHook(() => useBimModel(LEDGER_PK));

    await waitFor(() => {
      expect(useBimModelStore.getState().snapshot?.buildingPk).toBe(LEDGER_PK);
    });
    expect(getOrBuildDesign).not.toHaveBeenCalled();

    const model = useBimModelStore.getState().snapshot!;
    expect(model.elements.some((el) => el.kind === "wall")).toBe(true);
    expect(model.elements.some((el) => el.kind === "stair")).toBe(false);
  });

  it("hydrates nothing without a pk", async () => {
    renderHook(() => useBimModel(""));
    await waitFor(() => expect(useBimModelStore.getState().snapshot).toBeNull());
    expect(getOrBuildDesign).not.toHaveBeenCalled();
  });
});
