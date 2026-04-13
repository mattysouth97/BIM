import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../workflow-store";
import type { WorkflowStage } from "../../lib/workflow/stages";

const allFalse: Record<WorkflowStage, boolean> = {
  search: false,
  upload: false,
  twin:   false,
  report: false,
};

function resetStore() {
  useWorkflowStore.setState({
    stage: "search",
    completion: { ...allFalse },
  });
}

// A minimal valid footprint polygon (square, 10m x 10m) used to satisfy the upload guard.
const VALID_POLYGON: [number, number][][] = [[
  [-5, -5],
  [ 5, -5],
  [ 5,  5],
  [-5,  5],
]];

describe("useWorkflowStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('initial stage is "search"', () => {
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  it("initial completion flags are all false for all 4 stages", () => {
    const { completion } = useWorkflowStore.getState();
    expect(completion.search).toBe(false);
    expect(completion.upload).toBe(false);
    expect(completion.twin).toBe(false);
    expect(completion.report).toBe(false);
  });

  // -------------------------------------------------------------------------
  // advance()
  // -------------------------------------------------------------------------

  it('advance() from "search" sets stage to "upload"', () => {
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it('advance() from "upload" is blocked without footprintPolygon', () => {
    useWorkflowStore.setState({ stage: "upload" });
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it('advance() from "upload" with a valid footprintPolygon sets stage to "twin"', () => {
    useWorkflowStore.setState({ stage: "upload" });
    useWorkflowStore.getState().advance({ footprintPolygon: VALID_POLYGON });
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it('advance() from "twin" sets stage to "report"', () => {
    useWorkflowStore.setState({ stage: "twin" });
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("report");
  });

  it('advance() from "report" keeps stage at "report" (terminal no-op)', () => {
    useWorkflowStore.setState({ stage: "report" });
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("report");
  });

  // -------------------------------------------------------------------------
  // retreat()
  // -------------------------------------------------------------------------

  it('retreat() from "search" keeps stage at "search" (start no-op)', () => {
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  it('retreat() from "upload" sets stage to "search"', () => {
    useWorkflowStore.setState({ stage: "upload" });
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  it('retreat() from "twin" sets stage to "upload"', () => {
    useWorkflowStore.setState({ stage: "twin" });
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("upload");
  });

  it('retreat() from "report" sets stage to "twin"', () => {
    useWorkflowStore.setState({ stage: "report" });
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  // -------------------------------------------------------------------------
  // setStage()
  // -------------------------------------------------------------------------

  it('setStage("twin") from any stage sets stage to "twin"', () => {
    useWorkflowStore.getState().setStage("twin");
    expect(useWorkflowStore.getState().stage).toBe("twin");
  });

  it("setStage() allows jumping to any valid stage", () => {
    useWorkflowStore.getState().setStage("report");
    expect(useWorkflowStore.getState().stage).toBe("report");

    useWorkflowStore.getState().setStage("upload");
    expect(useWorkflowStore.getState().stage).toBe("upload");

    useWorkflowStore.getState().setStage("search");
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  // -------------------------------------------------------------------------
  // canAdvance()
  // -------------------------------------------------------------------------

  it('canAdvance() returns true when current stage guard returns true (e.g. "search")', () => {
    useWorkflowStore.setState({ stage: "search" });
    expect(useWorkflowStore.getState().canAdvance()).toBe(true);
  });

  it('canAdvance() returns false for "upload" without a footprintPolygon', () => {
    useWorkflowStore.setState({ stage: "upload" });
    expect(useWorkflowStore.getState().canAdvance()).toBe(false);
  });

  it('canAdvance() returns true for "upload" once a valid footprintPolygon is provided', () => {
    useWorkflowStore.setState({ stage: "upload" });
    expect(
      useWorkflowStore.getState().canAdvance({ footprintPolygon: VALID_POLYGON })
    ).toBe(true);
  });

  it('canAdvance() rejects a degenerate polygon with <3 vertices', () => {
    useWorkflowStore.setState({ stage: "upload" });
    const tooFew: [number, number][][] = [[[0, 0], [1, 1]]];
    expect(
      useWorkflowStore.getState().canAdvance({ footprintPolygon: tooFew })
    ).toBe(false);
  });

  it('canAdvance() returns true for "twin" stage', () => {
    useWorkflowStore.setState({ stage: "twin" });
    expect(useWorkflowStore.getState().canAdvance()).toBe(true);
  });

  it('canAdvance() returns false at terminal stage "report"', () => {
    useWorkflowStore.setState({ stage: "report" });
    expect(useWorkflowStore.getState().canAdvance()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // markComplete()
  // -------------------------------------------------------------------------

  it('markComplete("search") sets completion.search to true', () => {
    useWorkflowStore.getState().markComplete("search");
    expect(useWorkflowStore.getState().completion.search).toBe(true);
  });

  it('markComplete("upload") sets completion.upload to true', () => {
    useWorkflowStore.getState().markComplete("upload");
    expect(useWorkflowStore.getState().completion.upload).toBe(true);
  });

  it("markComplete does not change other completion flags", () => {
    useWorkflowStore.getState().markComplete("search");
    const { completion } = useWorkflowStore.getState();
    expect(completion.upload).toBe(false);
    expect(completion.twin).toBe(false);
    expect(completion.report).toBe(false);
  });

  // -------------------------------------------------------------------------
  // resetWorkflow()
  // -------------------------------------------------------------------------

  it('resetWorkflow() sets stage back to "search"', () => {
    useWorkflowStore.setState({ stage: "twin" });
    useWorkflowStore.getState().resetWorkflow();
    expect(useWorkflowStore.getState().stage).toBe("search");
  });

  it("resetWorkflow() sets all completion flags to false", () => {
    useWorkflowStore.setState({
      completion: { search: true, upload: true, twin: true, report: true },
    });
    useWorkflowStore.getState().resetWorkflow();
    const { completion } = useWorkflowStore.getState();
    expect(Object.values(completion).every((v) => v === false)).toBe(true);
  });
});
