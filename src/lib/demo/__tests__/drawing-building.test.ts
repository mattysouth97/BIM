import { describe, it, expect } from "vitest";
import {
  DRAWING_BUILDING_ID,
  DRAWING_BUILDING_PK,
  DRAWING_BUILDING_PARAMS,
  DEMO_BUILDING_PARAMS,
  isDrawingParams,
  isDemoParams,
  decodeBuildingId,
} from "@/lib/constants";
import {
  DRAWING_ADDRESS,
  drawingTitle,
  drawingFloors,
  getDrawingResponse,
  getDrawingFootprintResult,
} from "@/lib/demo/drawing-building";
import { searchBuildings, getFloorInfo } from "@/lib/api-client";

describe("drawing building routing", () => {
  it("decodeBuildingId('drawing') returns the drawing sentinel", () => {
    expect(decodeBuildingId(DRAWING_BUILDING_ID)).toEqual(DRAWING_BUILDING_PARAMS);
  });

  it("is not the demo office fixture", () => {
    expect(isDrawingParams(DRAWING_BUILDING_PARAMS)).toBe(true);
    expect(isDemoParams(DRAWING_BUILDING_PARAMS)).toBe(false);
    expect(isDrawingParams(DEMO_BUILDING_PARAMS)).toBe(false);
    expect(drawingTitle.mgmBldrgstPk).toBe(DRAWING_BUILDING_PK);
    expect(drawingTitle.bldNm).not.toMatch(/데모/);
    expect(drawingTitle.grndFlrCnt).toBe(1);
    expect(drawingFloors).toHaveLength(1);
  });
});

describe("drawing fixtures", () => {
  it("serves title and floors without a network call", async () => {
    const title = await searchBuildings(DRAWING_BUILDING_PARAMS);
    expect(title.items[0]?.mgmBldrgstPk).toBe(DRAWING_BUILDING_PK);
    expect(title.items[0]?.bldNm).toBe("도면에서 시작");
    const floors = await getFloorInfo({ ...DRAWING_BUILDING_PARAMS, numOfRows: 500 });
    expect(floors.items).toHaveLength(1);
  });

  it("does not invent a cadastral footprint", () => {
    expect(getDrawingFootprintResult(DRAWING_ADDRESS)).toEqual({
      polygon: null,
      error: null,
    });
    expect(getDrawingFootprintResult("서울특별시 강남구 역삼동 000-0 (데모)")).toBeNull();
  });

  it("returns empty items for unused ledger extras", () => {
    expect(getDrawingResponse("/api/bldrgst/basis")?.items).toEqual([]);
  });
});
