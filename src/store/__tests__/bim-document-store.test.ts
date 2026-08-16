import { describe, it, expect, beforeEach } from "vitest";
import { useBimDocumentStore } from "../bim-document-store";

describe("useBimDocumentStore", () => {
  beforeEach(() => {
    useBimDocumentStore.setState({
      phase: "existing",
      scheduleOpen: false,
      activeScheduleId: "wall-schedule-v1",
    });
  });

  it("toggles the schedule shelf and keeps a default id", () => {
    useBimDocumentStore.getState().toggleSchedule();
    expect(useBimDocumentStore.getState().scheduleOpen).toBe(true);
    expect(useBimDocumentStore.getState().activeScheduleId).toBe("wall-schedule-v1");
  });

  it("opening a schedule also opens the shelf", () => {
    useBimDocumentStore.getState().setActiveSchedule("room-schedule-v1");
    expect(useBimDocumentStore.getState().scheduleOpen).toBe(true);
    expect(useBimDocumentStore.getState().activeScheduleId).toBe("room-schedule-v1");
  });

  it("switches phase", () => {
    useBimDocumentStore.getState().setPhase("retrofit");
    expect(useBimDocumentStore.getState().phase).toBe("retrofit");
  });
});
