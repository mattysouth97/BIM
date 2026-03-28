import { describe, it, expect, beforeEach } from "vitest";
import { usePlanStore } from "../plan-store";
import type { WallSegment } from "../plan-store";

describe("usePlanStore", () => {
  beforeEach(() => {
    usePlanStore.setState({
      walls: [],
      viewMode: "3d",
      drawingWall: null,
      activeFloor: 0,
      gridSize: 0.5,
    });
  });

  it("addWall creates a wall segment", () => {
    const wall: WallSegment = {
      id: "wall-1",
      start: [0, 0],
      end: [5, 0],
      thickness: 0.2,
      height: 3.0,
      floor: 0,
    };

    usePlanStore.getState().addWall(wall);
    expect(usePlanStore.getState().walls).toHaveLength(1);
    expect(usePlanStore.getState().walls[0].id).toBe("wall-1");
  });

  it("removeWall removes by ID", () => {
    const wall1: WallSegment = {
      id: "wall-1", start: [0, 0], end: [5, 0], thickness: 0.2, height: 3, floor: 0,
    };
    const wall2: WallSegment = {
      id: "wall-2", start: [5, 0], end: [5, 5], thickness: 0.2, height: 3, floor: 0,
    };

    usePlanStore.getState().addWall(wall1);
    usePlanStore.getState().addWall(wall2);
    expect(usePlanStore.getState().walls).toHaveLength(2);

    usePlanStore.getState().removeWall("wall-1");
    expect(usePlanStore.getState().walls).toHaveLength(1);
    expect(usePlanStore.getState().walls[0].id).toBe("wall-2");
  });

  it("setViewMode toggles between 3d and plan", () => {
    expect(usePlanStore.getState().viewMode).toBe("3d");

    usePlanStore.getState().setViewMode("plan");
    expect(usePlanStore.getState().viewMode).toBe("plan");

    usePlanStore.getState().setViewMode("3d");
    expect(usePlanStore.getState().viewMode).toBe("3d");
  });

  it("setViewMode cancels active drawing", () => {
    usePlanStore.getState().startDrawing([1, 2]);
    expect(usePlanStore.getState().drawingWall).not.toBeNull();

    usePlanStore.getState().setViewMode("plan");
    expect(usePlanStore.getState().drawingWall).toBeNull();
  });

  it("startDrawing sets drawing state", () => {
    usePlanStore.getState().startDrawing([3, 4]);
    expect(usePlanStore.getState().drawingWall).toEqual({ start: [3, 4] });
  });

  it("cancelDrawing clears drawing state", () => {
    usePlanStore.getState().startDrawing([3, 4]);
    usePlanStore.getState().cancelDrawing();
    expect(usePlanStore.getState().drawingWall).toBeNull();
  });

  it("setActiveFloor updates active floor", () => {
    usePlanStore.getState().setActiveFloor(5);
    expect(usePlanStore.getState().activeFloor).toBe(5);
  });

  it("setGridSize updates grid size", () => {
    usePlanStore.getState().setGridSize(1.0);
    expect(usePlanStore.getState().gridSize).toBe(1.0);
  });
});
