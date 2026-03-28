import { describe, it, expect, beforeEach } from "vitest";
import { usePlanStore } from "../plan-store";
import type { WallSegment, Opening, Room } from "../plan-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWall(id: string, floor = 0): WallSegment {
  return { id, start: [0, 0], end: [5, 0], thickness: 0.2, height: 3.0, floor };
}

function makeOpening(id: string, wallId: string, floor = 0): Opening {
  return { id, wallId, t: 0.5, presetId: "door-900", floor };
}

function makeRoom(id: string, floor = 0): Room {
  return {
    id,
    polygon: [[0, 0], [5, 0], [5, 5], [0, 5]],
    area: 25,
    centroid: [2.5, 2.5],
    type: "living",
    floor,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePlanStore", () => {
  beforeEach(() => {
    usePlanStore.setState({
      walls: [],
      viewMode: "3d",
      drawingWall: null,
      activeFloor: 0,
      gridSize: 0.5,
      openings: [],
      rooms: [],
      floorHeights: {},
      floorCount: 1,
      drawingMode: null,
    });
  });

  // -------------------------------------------------------------------------
  // Existing tests (must still pass)
  // -------------------------------------------------------------------------

  it("addWall creates a wall segment", () => {
    const wall = makeWall("wall-1");
    usePlanStore.getState().addWall(wall);
    expect(usePlanStore.getState().walls).toHaveLength(1);
    expect(usePlanStore.getState().walls[0].id).toBe("wall-1");
  });

  it("removeWall removes by ID", () => {
    usePlanStore.getState().addWall(makeWall("wall-1"));
    usePlanStore.getState().addWall(makeWall("wall-2"));
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

  // -------------------------------------------------------------------------
  // New tests: Opening actions
  // -------------------------------------------------------------------------

  it("addOpening adds to openings array", () => {
    const opening = makeOpening("op-1", "wall-1");
    usePlanStore.getState().addOpening(opening);
    expect(usePlanStore.getState().openings).toHaveLength(1);
    expect(usePlanStore.getState().openings[0].id).toBe("op-1");
  });

  it("addOpening preserves existing openings", () => {
    usePlanStore.getState().addOpening(makeOpening("op-1", "wall-1"));
    usePlanStore.getState().addOpening(makeOpening("op-2", "wall-2"));
    expect(usePlanStore.getState().openings).toHaveLength(2);
  });

  it("removeOpening removes by id", () => {
    usePlanStore.getState().addOpening(makeOpening("op-1", "wall-1"));
    usePlanStore.getState().addOpening(makeOpening("op-2", "wall-2"));
    usePlanStore.getState().removeOpening("op-1");
    expect(usePlanStore.getState().openings).toHaveLength(1);
    expect(usePlanStore.getState().openings[0].id).toBe("op-2");
  });

  // -------------------------------------------------------------------------
  // New tests: Room actions
  // -------------------------------------------------------------------------

  it("setRooms replaces rooms array", () => {
    usePlanStore.getState().setRooms([makeRoom("r-1"), makeRoom("r-2")]);
    expect(usePlanStore.getState().rooms).toHaveLength(2);

    usePlanStore.getState().setRooms([makeRoom("r-3")]);
    expect(usePlanStore.getState().rooms).toHaveLength(1);
    expect(usePlanStore.getState().rooms[0].id).toBe("r-3");
  });

  it("setRoomType updates type of matching room", () => {
    usePlanStore.getState().setRooms([makeRoom("r-1")]);
    usePlanStore.getState().setRoomType("r-1", "bedroom");
    expect(usePlanStore.getState().rooms[0].type).toBe("bedroom");
  });

  it("setRoomType does not affect other rooms", () => {
    usePlanStore.getState().setRooms([makeRoom("r-1"), makeRoom("r-2")]);
    usePlanStore.getState().setRoomType("r-1", "kitchen");
    expect(usePlanStore.getState().rooms[1].type).toBe("living");
  });

  // -------------------------------------------------------------------------
  // New tests: Floor management
  // -------------------------------------------------------------------------

  it("setFloorHeight stores per-floor height", () => {
    usePlanStore.getState().setFloorHeight(0, 3.5);
    expect(usePlanStore.getState().floorHeights[0]).toBe(3.5);
  });

  it("setFloorHeight can store multiple floors independently", () => {
    usePlanStore.getState().setFloorHeight(0, 3.0);
    usePlanStore.getState().setFloorHeight(1, 4.0);
    expect(usePlanStore.getState().floorHeights[0]).toBe(3.0);
    expect(usePlanStore.getState().floorHeights[1]).toBe(4.0);
  });

  it("setFloorCount updates floorCount", () => {
    usePlanStore.getState().setFloorCount(5);
    expect(usePlanStore.getState().floorCount).toBe(5);
  });

  // -------------------------------------------------------------------------
  // New tests: copyFloor
  // -------------------------------------------------------------------------

  it("copyFloor duplicates walls from floor 0 to floor 1", () => {
    usePlanStore.getState().addWall(makeWall("wall-1", 0));
    usePlanStore.getState().addWall(makeWall("wall-2", 0));
    usePlanStore.getState().copyFloor(0, 1);

    const allWalls = usePlanStore.getState().walls;
    expect(allWalls).toHaveLength(4);

    const floor1Walls = allWalls.filter((w) => w.floor === 1);
    expect(floor1Walls).toHaveLength(2);
  });

  it("copyFloor creates walls with new unique IDs", () => {
    usePlanStore.getState().addWall(makeWall("wall-1", 0));
    usePlanStore.getState().copyFloor(0, 1);

    const allIds = usePlanStore.getState().walls.map((w) => w.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length); // all IDs are unique — no duplicates
    // Original wall-1 still on floor 0; copied wall has a new UUID
    expect(usePlanStore.getState().walls.filter((w) => w.id === "wall-1")).toHaveLength(1);
    const floor1Walls = usePlanStore.getState().walls.filter((w) => w.floor === 1);
    expect(floor1Walls[0].id).not.toBe("wall-1"); // new UUID
  });

  it("copyFloor duplicates openings from floor 0 to floor 1", () => {
    usePlanStore.getState().addWall(makeWall("wall-1", 0));
    usePlanStore.getState().addOpening(makeOpening("op-1", "wall-1", 0));
    usePlanStore.getState().copyFloor(0, 1);

    const allOpenings = usePlanStore.getState().openings;
    expect(allOpenings).toHaveLength(2);

    const floor1Openings = allOpenings.filter((o) => o.floor === 1);
    expect(floor1Openings).toHaveLength(1);
    expect(floor1Openings[0].id).not.toBe("op-1"); // new UUID
  });

  it("copyFloor only copies walls from specified source floor", () => {
    usePlanStore.getState().addWall(makeWall("wall-floor0", 0));
    usePlanStore.getState().addWall(makeWall("wall-floor2", 2));
    usePlanStore.getState().copyFloor(0, 1);

    const floor1Walls = usePlanStore.getState().walls.filter((w) => w.floor === 1);
    expect(floor1Walls).toHaveLength(1); // only the floor 0 wall was copied
  });

  // -------------------------------------------------------------------------
  // New tests: drawingMode
  // -------------------------------------------------------------------------

  it("setDrawingMode changes drawingMode", () => {
    expect(usePlanStore.getState().drawingMode).toBeNull();

    usePlanStore.getState().setDrawingMode("wall");
    expect(usePlanStore.getState().drawingMode).toBe("wall");

    usePlanStore.getState().setDrawingMode("opening");
    expect(usePlanStore.getState().drawingMode).toBe("opening");

    usePlanStore.getState().setDrawingMode(null);
    expect(usePlanStore.getState().drawingMode).toBeNull();
  });
});
