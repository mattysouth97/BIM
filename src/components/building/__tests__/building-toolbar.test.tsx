/* @vitest-environment happy-dom */
// The toolbar must clearly label the demo building (데모모드) so visitors
// know they are looking at bundled sample data, not a real ledger record.
// It also owns the door out of an existing building into a new design: that
// action is only offered when there is a footprint to seed the design from.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { BuildingToolbar } from "../building-toolbar";
import { demoTitle } from "@/lib/demo/demo-building";
import { getRecipe } from "@/lib/procedural/recipe";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useBlueprintStore } from "@/store/blueprint-store";
import type { BrTitleInfo } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

const realTitle: BrTitleInfo = {
  ...demoTitle,
  mgmBldrgstPk: "11680-12345678",
  bldNm: "실제 건물",
};

const PK = "11680-12345678";

function seedRecipe() {
  useRecipeStore.setState({
    baseRecipes: {
      [PK]: {
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
        buildingName: "실제 건물",
        address: "Seoul",
      },
    },
    overrides: {},
  });
}

describe("BuildingToolbar demo badge", () => {
  it("shows the 데모 badge for the demo building", () => {
    render(
      <BuildingToolbar
        title={demoTitle}
        exportData={[]}
        exportFilename="demo"
        loading={false}
      />,
    );
    expect(screen.getByText("데모 데이터")).toBeTruthy();
  });

  it("does not show the badge for a real building", () => {
    render(
      <BuildingToolbar
        title={realTitle}
        exportData={[]}
        exportFilename="real"
        loading={false}
      />,
    );
    expect(screen.queryByText("데모 데이터")).toBeNull();
  });
});

describe("BuildingToolbar 다른 설계 생성", () => {
  beforeEach(() => {
    push.mockReset();
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
    useActiveBuildingStore.getState().setActiveBuilding(PK);
    useBlueprintStore.getState().reset();
  });

  it("seeds a blueprint from the footprint and opens the studio", async () => {
    seedRecipe();
    render(
      <BuildingToolbar
        title={realTitle}
        exportData={[]}
        exportFilename="real"
        loading={false}
      />,
    );

    const button = await screen.findByRole("button", { name: /다른 설계 생성/ });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/studio"));

    const blueprint = useBlueprintStore.getState().blueprint;
    expect(blueprint.boundaries).toHaveLength(1);
    // 20 × 12 m box, centred, in millimetres.
    const xs = blueprint.boundaries[0].loop.segments.map((s) =>
      s.kind === "polyline" ? s.pointsMm[0].xMm : s.startMm.xMm,
    );
    expect(Math.min(...xs)).toBe(-10_000);
    expect(Math.max(...xs)).toBe(10_000);
    expect(useBlueprintStore.getState().validation.blueprintValid).toBe(true);
  });

  it("is disabled, and says why, when the building has no footprint", async () => {
    render(
      <BuildingToolbar
        title={realTitle}
        exportData={[]}
        exportFilename="real"
        loading={false}
      />,
    );

    const button = await screen.findByRole("button", { name: /다른 설계 생성/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("title")).toContain("평면 윤곽이 없어");
    fireEvent.click(button);
    expect(push).not.toHaveBeenCalled();
  });
});
