import { beforeEach, describe, expect, it } from "vitest";
import { getRecipe } from "@/lib/procedural/recipe";
import { deriveTwinElements } from "@/lib/bim/derive/twin-elements";
import { useBimModelStore } from "../bim-model-store";

describe("useBimModelStore", () => {
  beforeEach(() => {
    useBimModelStore.setState({
      byBuilding: {},
      snapshot: null,
      log: { past: [], future: [] },
      selectedElementId: null,
      activeLevelId: null,
      editingTypeId: null,
    });
  });

  it("hydrates levels and persists an authored door", () => {
    const recipe = {
      ...getRecipe("21", "2010-2019", "14000"),
      footprintWidth: 20,
      footprintDepth: 12,
      floors: [
        { floorNo: 1, label: "1F", type: "above" as const, y: 0, height: 4, isGroundFloor: true },
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
    useBimModelStore.getState().hydrate({
      buildingPk: "pk-store",
      recipe,
      derived: deriveTwinElements({ recipe }),
    });
    const id = useBimModelStore.getState().applyPlace({
      typeId: "door-single-flush-910",
      buildingPk: "pk-store",
      levelId: "level:1",
      hostId: "W-1-S",
      placement: { x: 0, y: 0, z: 1, rotationY: 0 },
    });
    expect(id).toBeTruthy();
    expect(useBimModelStore.getState().byBuilding["pk-store"].authored).toHaveLength(1);
    useBimModelStore.getState().undoLast();
    expect(useBimModelStore.getState().byBuilding["pk-store"].authored).toHaveLength(0);
  });
});
