/* @vitest-environment happy-dom */
//
// HistoryPanel — design history as a tree you can walk (brief §56, §58).
//
// What these tests defend is the panel's premise: nothing is ever discarded, a
// fork is shown as a fork, and any node can be made current with one click.
// So the cases are written from what an architect can see and do — every design
// still listed with enough identity to tell it from its sibling, the branch
// point called out, children visibly under their parent, and undo/redo as
// ordinary movement through that same tree.

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

import { HistoryPanel } from "../history-panel";
import { buildDesign } from "@/lib/generative/build";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import {
  commit,
  emptyHistory,
  flatten,
  type DesignHistory,
  type HistoryRow,
} from "@/lib/generative/session/history";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import type { DesignState } from "@/store/generative-session-store";

/* ------------------------------------------------------------------ */
/* Fixture — a real design, built offline and deterministically        */
/* ------------------------------------------------------------------ */

const PROMPT =
  "Create a five-story office building, approximately 6,000 m², with a central core.";

async function makeDesign(prompt = PROMPT): Promise<DesignState> {
  const { data: spec } = await new HeuristicReasoningProvider().generateBuilding({
    prompt,
    seed: 4242,
  });
  const built = buildDesign({ spec, buildingPk: "generated", generationId: "GEN-0001" });
  return {
    spec,
    recipe: built.recipe,
    snapshot: built.snapshot,
    metrics: built.metrics,
    validation: built.validation,
    status: built.status,
    approximations: built.approximations,
    generationId: "GEN-0001",
    revision: 0,
    seed: 4242,
    provider: {
      name: "heuristic",
      model: "deterministic",
      latencyMs: 1,
      inputTokens: 0,
      outputTokens: 0,
      retries: 0,
    },
  };
}

let design: DesignState;

/** A fixed wall-clock instant, so "Xm ago" labels are assertable. */
const NOW = new Date("2026-08-17T12:00:00Z").getTime();
const MINUTE = 60_000;

/**
 * Root, then two children of that SAME root — committing twice from the root is
 * exactly the gesture that forks the tree, so the root becomes a branch point.
 */
function branchedHistory(): DesignHistory<DesignState> {
  let history = emptyHistory<DesignState>();
  history = commit(history, {
    id: "root",
    parentId: null,
    kind: "generate",
    label: "Generated a five-story office",
    createdAt: NOW - 5 * MINUTE,
    payload: design,
  });
  history = commit(history, {
    id: "branch-a",
    parentId: "root",
    kind: "modify",
    label: "Widened the atrium",
    detail: "plate 42 m → 48 m",
    createdAt: NOW - 3 * MINUTE,
    payload: { ...design, generationId: "GEN-0001.1" },
  });
  history = commit(history, {
    id: "branch-b",
    parentId: "root",
    kind: "option",
    label: "Moved the core to the east wall",
    createdAt: NOW - MINUTE,
    payload: { ...design, generationId: "GEN-0001.2" },
  });
  return history;
}

function rootOnlyHistory(): DesignHistory<DesignState> {
  return commit(emptyHistory<DesignState>(), {
    id: "root",
    parentId: null,
    kind: "generate",
    label: "Generated a five-story office",
    createdAt: NOW - 5 * MINUTE,
    payload: design,
  });
}

interface Overrides {
  rows?: HistoryRow<DesignState>[];
  currentId?: string | null;
  onGoTo?: (id: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

function renderPanel(overrides: Overrides = {}) {
  const props = {
    rows: overrides.rows ?? flatten(branchedHistory()),
    currentId: overrides.currentId === undefined ? "branch-b" : overrides.currentId,
    onGoTo: overrides.onGoTo ?? vi.fn(),
    onUndo: overrides.onUndo ?? vi.fn(),
    onRedo: overrides.onRedo ?? vi.fn(),
    canUndo: overrides.canUndo ?? true,
    canRedo: overrides.canRedo ?? true,
  };
  render(<HistoryPanel {...props} />);
  return props;
}

/** The clickable design rows, in the order they appear on screen. */
function designRows(): HTMLElement[] {
  return screen
    .getAllByRole("listitem")
    .map((li) => within(li).getByRole("button") as HTMLElement);
}

function rowNamed(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(label, "i") });
}

function undoButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /undo/i }) as HTMLButtonElement;
}

function redoButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /redo/i }) as HTMLButtonElement;
}

beforeAll(async () => {
  design = await makeDesign();
}, 60_000);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */

describe("HistoryPanel", () => {
  it("keeps every design in the list — the fork is shown, not truncated", () => {
    renderPanel();

    const rows = designRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Generated a five-story office"),
      expect.stringContaining("Widened the atrium"),
      expect.stringContaining("Moved the core to the east wall"),
    ]);
    expect(screen.getByText("3 designs")).toBeTruthy();
  });

  it("gives each design the identity needed to tell it from its sibling", () => {
    renderPanel();

    const expectedFloors = `${design.metrics.floorCount}F`;
    const expectedArea = `${Math.round(design.metrics.grossAreaSqm).toLocaleString()} m²`;

    const cases: Array<[string, string]> = [
      ["Generated a five-story office", "GEN-0001"],
      ["Widened the atrium", "GEN-0001.1"],
      ["Moved the core to the east wall", "GEN-0001.2"],
    ];

    for (const [label, generationId] of cases) {
      const row = rowNamed(label);
      expect(within(row).getByText(label)).toBeTruthy();
      expect(within(row).getByText(generationId)).toBeTruthy();
      expect(within(row).getByText(expectedFloors)).toBeTruthy();
      expect(within(row).getByText(expectedArea)).toBeTruthy();
    }
  });

  it("labels each row with the kind of move that produced it", () => {
    renderPanel();

    expect(within(rowNamed("Generated a five-story office")).getByText("generated")).toBeTruthy();
    expect(within(rowNamed("Widened the atrium")).getByText("edit")).toBeTruthy();
    expect(within(rowNamed("Moved the core to the east wall")).getByText("option")).toBeTruthy();
  });

  it("shows what an edit actually changed", () => {
    renderPanel();

    expect(within(rowNamed("Widened the atrium")).getByText("plate 42 m → 48 m")).toBeTruthy();
  });

  it("marks the current design, and only the current design", () => {
    renderPanel({ currentId: "branch-b" });

    const statusLabel = STATUS_LABEL[design.status.level];
    const current = rowNamed("Moved the core to the east wall");
    expect(within(current).getByText(statusLabel)).toBeTruthy();

    expect(
      within(rowNamed("Generated a five-story office")).queryByText(statusLabel),
    ).toBeNull();
    expect(within(rowNamed("Widened the atrium")).queryByText(statusLabel)).toBeNull();
    // Exactly one row carries the marker, wherever it sits in the tree.
    expect(screen.getAllByText(statusLabel)).toHaveLength(1);
  });

  it("moves the marker when a different node is current", () => {
    renderPanel({ currentId: "root" });

    const statusLabel = STATUS_LABEL[design.status.level];
    expect(
      within(rowNamed("Generated a five-story office")).getByText(statusLabel),
    ).toBeTruthy();
    expect(
      within(rowNamed("Moved the core to the east wall")).queryByText(statusLabel),
    ).toBeNull();
  });

  it("makes any node current with one click, including an interior one", () => {
    const onGoTo = vi.fn();
    renderPanel({ currentId: "branch-b", onGoTo });

    fireEvent.click(rowNamed("Widened the atrium"));
    expect(onGoTo).toHaveBeenCalledWith("branch-a");

    // The root is an ancestor of the current node, not a dead end — walking
    // back to it is navigation, so it must be clickable too.
    fireEvent.click(rowNamed("Generated a five-story office"));
    expect(onGoTo).toHaveBeenLastCalledWith("root");
    expect(onGoTo).toHaveBeenCalledTimes(2);
  });

  it("re-selecting the current design is still an ordinary click", () => {
    const onGoTo = vi.fn();
    renderPanel({ currentId: "branch-b", onGoTo });

    fireEvent.click(rowNamed("Moved the core to the east wall"));
    expect(onGoTo).toHaveBeenCalledWith("branch-b");
  });

  it("marks the fork and explains it, on the node that actually forked", () => {
    renderPanel();

    // The explanation is part of the row's accessible name, not a hover-only
    // title — a branch point has to be perceivable without a mouse.
    const root = rowNamed("Generated a five-story office");
    expect(root.textContent).toContain("⑂");
    expect(within(root).getByText(/more than one direction/i)).toBeTruthy();

    // The children are leaves — nothing forked there.
    expect(
      within(rowNamed("Widened the atrium")).queryByText(/more than one direction/i),
    ).toBeNull();
    expect(
      within(rowNamed("Moved the core to the east wall")).queryByText(
        /more than one direction/i,
      ),
    ).toBeNull();
    expect(screen.getAllByText(/more than one direction/i)).toHaveLength(1);
  });

  it("shows no fork marker on a straight line of history", () => {
    let history = rootOnlyHistory();
    history = commit(history, {
      id: "only-child",
      parentId: "root",
      kind: "modify",
      label: "Raised the parapet",
      createdAt: NOW - MINUTE,
      payload: design,
    });

    renderPanel({ rows: flatten(history), currentId: "only-child" });
    expect(screen.queryByText(/more than one direction/i)).toBeNull();
  });

  it("sits children visibly under their parent", () => {
    renderPanel();

    const [rootItem, childA, childB] = screen.getAllByRole("listitem");
    const indent = (el: HTMLElement) => parseFloat(el.style.paddingLeft || "0");

    expect(indent(childA)).toBeGreaterThan(indent(rootItem));
    // Siblings share a depth, so the fork reads as two parallel lines.
    expect(indent(childB)).toBe(indent(childA));
  });

  /* ---------------- undo / redo ---------------- */

  it("disables Undo and Redo exactly when there is nowhere to go", () => {
    renderPanel({ canUndo: false, canRedo: false });
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);
  });

  it("enables Undo alone when the tree has a parent but no branch to walk back down", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderPanel({ canUndo: true, canRedo: false, onUndo, onRedo });

    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);

    fireEvent.click(undoButton());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("enables Redo alone at the root of a tree that still has children", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderPanel({ canUndo: false, canRedo: true, currentId: "root", onUndo, onRedo });

    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);

    fireEvent.click(redoButton());
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("does not navigate when a disabled movement is clicked", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderPanel({ canUndo: false, canRedo: false, onUndo, onRedo });

    fireEvent.click(undoButton());
    fireEvent.click(redoButton());
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  /* ---------------- the branching note ---------------- */

  it("explains branching only once there is more than one design", () => {
    renderPanel({ rows: flatten(rootOnlyHistory()), currentId: "root" });

    expect(screen.getByText("1 design")).toBeTruthy();
    expect(screen.queryByText(/branches instead of discarding/i)).toBeNull();
  });

  it("explains branching once a second design exists", () => {
    renderPanel();

    // The note has to make the promise, not merely mention forks: what came
    // after the node you edit from survives.
    const note = screen.getByText(/branches instead of discarding/i);
    expect(note.textContent).toMatch(/nothing here is ever overwritten/i);
  });

  it("says nothing at all about branching with an empty history", () => {
    renderPanel({ rows: [], currentId: null });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("0 designs")).toBeTruthy();
    expect(screen.queryByText(/branches instead of discarding/i)).toBeNull();
  });

  /* ---------------- age ---------------- */

  it("ages each design against a single clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    renderPanel();

    expect(within(rowNamed("Generated a five-story office")).getByText("5m ago")).toBeTruthy();
    expect(within(rowNamed("Widened the atrium")).getByText("3m ago")).toBeTruthy();
    expect(
      within(rowNamed("Moved the core to the east wall")).getByText("1m ago"),
    ).toBeTruthy();
  });

  it("keeps ageing while the panel stays open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    renderPanel();
    expect(within(rowNamed("Widened the atrium")).getByText("3m ago")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2 * MINUTE);
    });

    expect(within(rowNamed("Widened the atrium")).getByText("5m ago")).toBeTruthy();
  });
});
