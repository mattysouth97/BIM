import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../workflow-store";
import type { WorkflowStage } from "../../lib/workflow/stages";

const allFalse: Record<WorkflowStage, boolean> = {
  select: false,
  assemble: false,
  configure: false,
  analyze: false,
  export: false,
};

function resetStore() {
  useWorkflowStore.setState({
    stage: "select",
    completion: { ...allFalse },
  });
}

describe("useWorkflowStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('initial stage is "select"', () => {
    expect(useWorkflowStore.getState().stage).toBe("select");
  });

  it("initial completion flags are all false", () => {
    const { completion } = useWorkflowStore.getState();
    expect(completion.select).toBe(false);
    expect(completion.assemble).toBe(false);
    expect(completion.configure).toBe(false);
    expect(completion.analyze).toBe(false);
    expect(completion.export).toBe(false);
  });

  // -------------------------------------------------------------------------
  // advance()
  // -------------------------------------------------------------------------

  it('advance() from "select" sets stage to "assemble"', () => {
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("assemble");
  });

  it('advance() from "assemble" sets stage to "configure"', () => {
    useWorkflowStore.setState({ stage: "assemble" });
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("configure");
  });

  it('advance() from "analyze" sets stage to "export"', () => {
    useWorkflowStore.setState({ stage: "analyze" });
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("export");
  });

  it('advance() from "export" keeps stage at "export" (terminal no-op)', () => {
    useWorkflowStore.setState({ stage: "export" });
    useWorkflowStore.getState().advance();
    expect(useWorkflowStore.getState().stage).toBe("export");
  });

  // -------------------------------------------------------------------------
  // retreat()
  // -------------------------------------------------------------------------

  it('retreat() from "select" keeps stage at "select" (start no-op)', () => {
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("select");
  });

  it('retreat() from "assemble" sets stage to "select"', () => {
    useWorkflowStore.setState({ stage: "assemble" });
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("select");
  });

  it('retreat() from "configure" sets stage to "assemble"', () => {
    useWorkflowStore.setState({ stage: "configure" });
    useWorkflowStore.getState().retreat();
    expect(useWorkflowStore.getState().stage).toBe("assemble");
  });

  // -------------------------------------------------------------------------
  // setStage()
  // -------------------------------------------------------------------------

  it('setStage("analyze") from any stage sets stage to "analyze"', () => {
    useWorkflowStore.getState().setStage("analyze");
    expect(useWorkflowStore.getState().stage).toBe("analyze");
  });

  it("setStage() allows jumping to any valid stage", () => {
    useWorkflowStore.getState().setStage("export");
    expect(useWorkflowStore.getState().stage).toBe("export");

    useWorkflowStore.getState().setStage("select");
    expect(useWorkflowStore.getState().stage).toBe("select");
  });

  // -------------------------------------------------------------------------
  // canAdvance()
  // -------------------------------------------------------------------------

  it('canAdvance() returns true when current stage guard returns true (e.g. "select")', () => {
    useWorkflowStore.setState({ stage: "select" });
    expect(useWorkflowStore.getState().canAdvance()).toBe(true);
  });

  it('canAdvance() returns false at terminal stage "export"', () => {
    useWorkflowStore.setState({ stage: "export" });
    expect(useWorkflowStore.getState().canAdvance()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // markComplete()
  // -------------------------------------------------------------------------

  it('markComplete("select") sets completion.select to true', () => {
    useWorkflowStore.getState().markComplete("select");
    expect(useWorkflowStore.getState().completion.select).toBe(true);
  });

  it("markComplete does not change other completion flags", () => {
    useWorkflowStore.getState().markComplete("select");
    const { completion } = useWorkflowStore.getState();
    expect(completion.assemble).toBe(false);
    expect(completion.configure).toBe(false);
    expect(completion.analyze).toBe(false);
    expect(completion.export).toBe(false);
  });

  // -------------------------------------------------------------------------
  // resetWorkflow()
  // -------------------------------------------------------------------------

  it('resetWorkflow() sets stage back to "select"', () => {
    useWorkflowStore.setState({ stage: "analyze" });
    useWorkflowStore.getState().resetWorkflow();
    expect(useWorkflowStore.getState().stage).toBe("select");
  });

  it("resetWorkflow() sets all completion flags to false", () => {
    useWorkflowStore.setState({
      completion: { select: true, assemble: true, configure: true, analyze: true, export: true },
    });
    useWorkflowStore.getState().resetWorkflow();
    const { completion } = useWorkflowStore.getState();
    expect(Object.values(completion).every((v) => v === false)).toBe(true);
  });
});
