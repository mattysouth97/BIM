// src/lib/bim/sheets/__tests__/sheet-store.test.ts
// Unit tests for SheetDefinition CRUD and viewport round-trips.

import { beforeEach, describe, expect, it } from "vitest";
import { useSheetStore } from "../sheet-store";
import type { SheetDefinition, ViewportBlock } from "../sheet-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSheet(overrides: Partial<SheetDefinition> = {}): SheetDefinition {
  return {
    id: "sheet-1",
    name: "Ground Floor Plan",
    pageSize: "A1",
    orientation: "landscape",
    viewports: [],
    titleBlock: {
      projectName: "Test Project",
      buildingName: "Test Building",
      architectName: "Kim Architect",
      auditorName: "Lee Auditor",
      date: "2026-04-12",
      sheetNumber: "A-001",
      revision: "P1",
      locale: "ko",
    },
    ...overrides,
  };
}

function makeViewport(overrides: Partial<ViewportBlock> = {}): ViewportBlock {
  return {
    id: "vp-1",
    kind: "view",
    targetId: "view-plan-gf",
    x: 10,
    y: 10,
    width: 200,
    height: 150,
    scale: 100,
    title: "Ground Floor Plan 1:100",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset store before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSheetStore.setState({ sheets: [], activeSheetId: null });
});

// ---------------------------------------------------------------------------
// Sheet CRUD
// ---------------------------------------------------------------------------

describe("addSheet", () => {
  it("adds a sheet to the store", () => {
    const sheet = makeSheet();
    useSheetStore.getState().addSheet(sheet);
    expect(useSheetStore.getState().sheets).toHaveLength(1);
    expect(useSheetStore.getState().sheets[0].id).toBe("sheet-1");
  });

  it("sets the first added sheet as the active sheet", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    expect(useSheetStore.getState().activeSheetId).toBe("sheet-1");
  });

  it("does not change active sheet when adding a second sheet", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-2" }));
    expect(useSheetStore.getState().activeSheetId).toBe("sheet-1");
    expect(useSheetStore.getState().sheets).toHaveLength(2);
  });
});

describe("removeSheet", () => {
  it("removes a sheet by id", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().removeSheet("sheet-1");
    expect(useSheetStore.getState().sheets).toHaveLength(0);
  });

  it("clears activeSheetId when the active sheet is removed", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    expect(useSheetStore.getState().activeSheetId).toBe("sheet-1");
    useSheetStore.getState().removeSheet("sheet-1");
    expect(useSheetStore.getState().activeSheetId).toBeNull();
  });

  it("does not affect activeSheetId when a non-active sheet is removed", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-2" }));
    useSheetStore.getState().removeSheet("sheet-2");
    expect(useSheetStore.getState().activeSheetId).toBe("sheet-1");
  });

  it("is a no-op when the id does not exist", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().removeSheet("no-such-id");
    expect(useSheetStore.getState().sheets).toHaveLength(1);
  });
});

describe("updateSheet", () => {
  it("updates a sheet's scalar fields", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1", name: "Old Name" }));
    useSheetStore.getState().updateSheet("sheet-1", { name: "New Name" });
    expect(useSheetStore.getState().sheets[0].name).toBe("New Name");
  });

  it("preserves fields not included in the patch", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1", pageSize: "A1" }));
    useSheetStore.getState().updateSheet("sheet-1", { name: "Updated" });
    expect(useSheetStore.getState().sheets[0].pageSize).toBe("A1");
  });

  it("is a no-op when the id does not exist", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().updateSheet("no-such-id", { name: "Ghost" });
    expect(useSheetStore.getState().sheets[0].name).toBe("Ground Floor Plan");
  });
});

// ---------------------------------------------------------------------------
// Viewport CRUD
// ---------------------------------------------------------------------------

describe("addViewport", () => {
  it("appends a viewport to the correct sheet", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1" }));
    expect(useSheetStore.getState().sheets[0].viewports).toHaveLength(1);
    expect(useSheetStore.getState().sheets[0].viewports[0].id).toBe("vp-1");
  });

  it("does not affect other sheets", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-2" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1" }));
    expect(useSheetStore.getState().sheets[1].viewports).toHaveLength(0);
  });
});

describe("removeViewport", () => {
  it("removes the viewport from the sheet", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1" }));
    useSheetStore.getState().removeViewport("sheet-1", "vp-1");
    expect(useSheetStore.getState().sheets[0].viewports).toHaveLength(0);
  });

  it("is a no-op when the viewport id does not exist", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1" }));
    useSheetStore.getState().removeViewport("sheet-1", "vp-99");
    expect(useSheetStore.getState().sheets[0].viewports).toHaveLength(1);
  });
});

describe("updateViewport", () => {
  it("updates viewport fields and round-trips them back correctly", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1", x: 10, y: 10 }));
    useSheetStore.getState().updateViewport("sheet-1", "vp-1", { x: 50, y: 80, scale: 200 });

    const vp = useSheetStore.getState().sheets[0].viewports[0];
    expect(vp.x).toBe(50);
    expect(vp.y).toBe(80);
    expect(vp.scale).toBe(200);
    // id and kind must not change
    expect(vp.id).toBe("vp-1");
    expect(vp.kind).toBe("view");
  });

  it("preserves unreferenced viewport fields during a partial update", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1", width: 200, height: 150 }));
    useSheetStore.getState().updateViewport("sheet-1", "vp-1", { title: "Updated Title" });

    const vp = useSheetStore.getState().sheets[0].viewports[0];
    expect(vp.width).toBe(200);
    expect(vp.height).toBe(150);
    expect(vp.title).toBe("Updated Title");
  });

  it("is a no-op when the viewport id does not exist", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addViewport("sheet-1", makeViewport({ id: "vp-1", x: 10 }));
    useSheetStore.getState().updateViewport("sheet-1", "vp-99", { x: 999 });
    expect(useSheetStore.getState().sheets[0].viewports[0].x).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Active sheet
// ---------------------------------------------------------------------------

describe("setActiveSheet", () => {
  it("sets the active sheet id", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-2" }));
    useSheetStore.getState().setActiveSheet("sheet-2");
    expect(useSheetStore.getState().activeSheetId).toBe("sheet-2");
  });

  it("accepts null to deselect", () => {
    useSheetStore.getState().addSheet(makeSheet({ id: "sheet-1" }));
    useSheetStore.getState().setActiveSheet(null);
    expect(useSheetStore.getState().activeSheetId).toBeNull();
  });
});
