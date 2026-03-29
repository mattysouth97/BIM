import { describe, it, expect, beforeEach } from "vitest";
import {
  useWorkspaceStore,
  LEFT_DOCK_MIN,
  LEFT_DOCK_MAX,
  LEFT_DOCK_DEFAULT,
  RIGHT_DOCK_MIN,
  RIGHT_DOCK_MAX,
  RIGHT_DOCK_DEFAULT,
} from "../workspace-store";

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      leftDockOpen: true,
      rightDockOpen: true,
      bottomShelfOpen: true,
      leftDockSize: LEFT_DOCK_DEFAULT,
      rightDockSize: RIGHT_DOCK_DEFAULT,
    });
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  it("initial state: leftDockOpen is true", () => {
    expect(useWorkspaceStore.getState().leftDockOpen).toBe(true);
  });

  it("initial state: rightDockOpen is true", () => {
    expect(useWorkspaceStore.getState().rightDockOpen).toBe(true);
  });

  it("initial state: bottomShelfOpen is true", () => {
    expect(useWorkspaceStore.getState().bottomShelfOpen).toBe(true);
  });

  it("initial state: leftDockSize is 18", () => {
    expect(useWorkspaceStore.getState().leftDockSize).toBe(18);
  });

  it("initial state: rightDockSize is 22", () => {
    expect(useWorkspaceStore.getState().rightDockSize).toBe(22);
  });

  // ---------------------------------------------------------------------------
  // Toggle actions
  // ---------------------------------------------------------------------------

  it("toggleLeftDock flips leftDockOpen from true to false", () => {
    useWorkspaceStore.getState().toggleLeftDock();
    expect(useWorkspaceStore.getState().leftDockOpen).toBe(false);
  });

  it("toggleLeftDock called twice returns to true", () => {
    useWorkspaceStore.getState().toggleLeftDock();
    useWorkspaceStore.getState().toggleLeftDock();
    expect(useWorkspaceStore.getState().leftDockOpen).toBe(true);
  });

  it("toggleRightDock flips rightDockOpen from true to false", () => {
    useWorkspaceStore.getState().toggleRightDock();
    expect(useWorkspaceStore.getState().rightDockOpen).toBe(false);
  });

  it("toggleBottomShelf flips bottomShelfOpen from true to false", () => {
    useWorkspaceStore.getState().toggleBottomShelf();
    expect(useWorkspaceStore.getState().bottomShelfOpen).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Set open/closed directly
  // ---------------------------------------------------------------------------

  it("setLeftDockOpen(false) sets leftDockOpen to false", () => {
    useWorkspaceStore.getState().setLeftDockOpen(false);
    expect(useWorkspaceStore.getState().leftDockOpen).toBe(false);
  });

  it("setRightDockOpen(false) sets rightDockOpen to false", () => {
    useWorkspaceStore.getState().setRightDockOpen(false);
    expect(useWorkspaceStore.getState().rightDockOpen).toBe(false);
  });

  it("setBottomShelfOpen(false) sets bottomShelfOpen to false", () => {
    useWorkspaceStore.getState().setBottomShelfOpen(false);
    expect(useWorkspaceStore.getState().bottomShelfOpen).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Size actions
  // ---------------------------------------------------------------------------

  it("setLeftDockSize(25) sets leftDockSize to 25", () => {
    useWorkspaceStore.getState().setLeftDockSize(25);
    expect(useWorkspaceStore.getState().leftDockSize).toBe(25);
  });

  it("setRightDockSize(30) sets rightDockSize to 30", () => {
    useWorkspaceStore.getState().setRightDockSize(30);
    expect(useWorkspaceStore.getState().rightDockSize).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // Clamping
  // ---------------------------------------------------------------------------

  it("setLeftDockSize clamps to min 12 when value is below range", () => {
    useWorkspaceStore.getState().setLeftDockSize(5);
    expect(useWorkspaceStore.getState().leftDockSize).toBe(LEFT_DOCK_MIN);
  });

  it("setLeftDockSize clamps to max 28 when value is above range", () => {
    useWorkspaceStore.getState().setLeftDockSize(50);
    expect(useWorkspaceStore.getState().leftDockSize).toBe(LEFT_DOCK_MAX);
  });

  it("setRightDockSize clamps to min 16 when value is below range", () => {
    useWorkspaceStore.getState().setRightDockSize(5);
    expect(useWorkspaceStore.getState().rightDockSize).toBe(RIGHT_DOCK_MIN);
  });

  it("setRightDockSize clamps to max 35 when value is above range", () => {
    useWorkspaceStore.getState().setRightDockSize(60);
    expect(useWorkspaceStore.getState().rightDockSize).toBe(RIGHT_DOCK_MAX);
  });

  // ---------------------------------------------------------------------------
  // resetLayout
  // ---------------------------------------------------------------------------

  it("resetLayout restores all values to defaults", () => {
    // Modify all values first
    useWorkspaceStore.getState().toggleLeftDock();
    useWorkspaceStore.getState().toggleRightDock();
    useWorkspaceStore.getState().toggleBottomShelf();
    useWorkspaceStore.getState().setLeftDockSize(20);
    useWorkspaceStore.getState().setRightDockSize(28);

    // Reset
    useWorkspaceStore.getState().resetLayout();

    const s = useWorkspaceStore.getState();
    expect(s.leftDockOpen).toBe(true);
    expect(s.rightDockOpen).toBe(true);
    expect(s.bottomShelfOpen).toBe(true);
    expect(s.leftDockSize).toBe(LEFT_DOCK_DEFAULT);
    expect(s.rightDockSize).toBe(RIGHT_DOCK_DEFAULT);
  });

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  it("exports LEFT_DOCK_MIN = 12", () => {
    expect(LEFT_DOCK_MIN).toBe(12);
  });

  it("exports LEFT_DOCK_MAX = 28", () => {
    expect(LEFT_DOCK_MAX).toBe(28);
  });

  it("exports LEFT_DOCK_DEFAULT = 18", () => {
    expect(LEFT_DOCK_DEFAULT).toBe(18);
  });

  it("exports RIGHT_DOCK_MIN = 16", () => {
    expect(RIGHT_DOCK_MIN).toBe(16);
  });

  it("exports RIGHT_DOCK_MAX = 35", () => {
    expect(RIGHT_DOCK_MAX).toBe(35);
  });

  it("exports RIGHT_DOCK_DEFAULT = 22", () => {
    expect(RIGHT_DOCK_DEFAULT).toBe(22);
  });
});
