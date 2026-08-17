import { describe, expect, it } from "vitest";

import {
  ancestry,
  branchTips,
  canRedo,
  canUndo,
  childrenOf,
  commit,
  currentNode,
  emptyHistory,
  flatten,
  goTo,
  isBranchPoint,
  redo,
  roots,
  siblingsOf,
  undo,
  type DesignHistory,
  type DesignNode,
  type DesignNodeKind,
} from "../session/history";

/** The tree never looks inside a payload, so a counter is a complete stand-in. */
interface Payload {
  n: number;
}

type History = DesignHistory<Payload>;

const ids = (nodes: DesignNode<Payload>[]) => nodes.map((node) => node.id);

/**
 * Ids and timestamps are the caller's job — that is the point of the module
 * being pure — so this supplies both deterministically. Omitting `parentId`
 * exercises the "default to whatever is current" path; passing it explicitly
 * (including `null`) exercises the other one. The two are not the same.
 */
function add(
  history: History,
  id: string,
  parentId?: string | null,
  kind: DesignNodeKind = "modify",
): History {
  const seq = history.order.length + 1;
  const node = {
    id,
    kind,
    label: `made ${id}`,
    createdAt: 1_000 + seq,
    payload: { n: seq },
  };
  return parentId === undefined ? commit(history, node) : commit(history, { ...node, parentId });
}

/**
 *        A
 *      /   \
 *     B     C
 *     |     |
 *     D     E
 *
 * Committed branch-first (A, B, D, then C, E) so insertion order and tree order
 * deliberately disagree — flatten and the redo trail have to reconcile that
 * themselves rather than getting the answer for free from `order`.
 */
function forkTree(): History {
  let history = add(emptyHistory<Payload>(), "A", null, "generate");
  history = add(history, "B");
  history = add(history, "D");
  history = add(history, "C", "A", "option");
  history = add(history, "E");
  return history;
}

function deepFreeze(history: History): History {
  Object.freeze(history.order);
  Object.freeze(history.lastChild);
  for (const node of Object.values(history.nodes)) Object.freeze(node);
  Object.freeze(history.nodes);
  return Object.freeze(history);
}

describe("commit", () => {
  it("makes the new design current and hangs it off whatever was current", () => {
    const empty = emptyHistory<Payload>();
    expect(currentNode(empty)).toBeNull();
    expect(canUndo(empty)).toBe(false);
    expect(canRedo(empty)).toBe(false);

    const one = add(empty, "A");
    expect(one.currentId).toBe("A");
    expect(one.nodes.A.parentId).toBeNull();
    expect(currentNode(one)?.payload).toEqual({ n: 1 });
    expect(ids(roots(one))).toEqual(["A"]);

    // Second commit chains: the default parent is the previous current node.
    const two = add(one, "B");
    expect(two.currentId).toBe("B");
    expect(two.nodes.B.parentId).toBe("A");
    expect(two.order).toEqual(["A", "B"]);
    expect(ids(childrenOf(two, "A"))).toEqual(["B"]);
    expect(ids(ancestry(two, "B"))).toEqual(["A", "B"]);
  });

  it("starts a second root when the caller passes parentId null explicitly", () => {
    // `undefined` means "inherit current"; an explicit null means "unparented",
    // which is how a fresh generation starts a new line beside an existing one.
    const history = add(add(emptyHistory<Payload>(), "A"), "R", null, "generate");

    expect(history.nodes.R.parentId).toBeNull();
    expect(ids(roots(history))).toEqual(["A", "R"]);
    expect(canUndo(history)).toBe(false);
    // A parentless commit leaves no redo trail to rewrite.
    expect(history.lastChild).toEqual({});
  });

  it("branches instead of truncating when the current node already has a child", () => {
    let history = add(add(emptyHistory<Payload>(), "A"), "B");
    history = undo(history);
    history = add(history, "C");

    expect(history.currentId).toBe("C");
    // The whole reason for a tree: B survives editing from an earlier state.
    expect(history.nodes.B).toBeDefined();
    expect(history.order).toEqual(["A", "B", "C"]);
    expect(ids(childrenOf(history, "A"))).toEqual(["B", "C"]);
    expect(ids(ancestry(history, "B"))).toEqual(["A", "B"]);
    expect(isBranchPoint(history, "A")).toBe(true);
    expect(ids(branchTips(history))).toEqual(["B", "C"]);
  });

  it("does not mutate the history it was given", () => {
    const before = deepFreeze(add(emptyHistory<Payload>(), "A"));
    const snapshot = JSON.stringify(before);

    const after = add(before, "B");

    expect(JSON.stringify(before)).toBe(snapshot);
    expect(before.currentId).toBe("A");
    expect(before.order).toEqual(["A"]);
    expect(after.nodes).not.toBe(before.nodes);
    expect(after.order).not.toBe(before.order);
    expect(after.lastChild).not.toBe(before.lastChild);
  });

  it("replaces a node committed under an existing id without duplicating its row", () => {
    // A repair pass that reuses an id must overwrite the design in place;
    // a second row for the same id would render as a phantom branch.
    const chain = add(add(emptyHistory<Payload>(), "A"), "B");
    const repaired = commit(chain, {
      id: "B",
      parentId: "A",
      kind: "repair",
      label: "repaired B",
      createdAt: 2_000,
      payload: { n: 99 },
    });

    expect(repaired.order).toEqual(["A", "B"]);
    expect(repaired.nodes.B.label).toBe("repaired B");
    expect(repaired.nodes.B.payload).toEqual({ n: 99 });
    expect(flatten(repaired)).toHaveLength(2);
  });
});

describe("undo / redo", () => {
  it("redoes back onto the branch you left, not merely the first child", () => {
    let history = add(add(emptyHistory<Payload>(), "A"), "B");
    history = undo(history);
    history = add(history, "C");
    expect(ids(childrenOf(history, "A"))).toEqual(["B", "C"]);

    history = undo(history);
    expect(history.currentId).toBe("A");
    expect(canRedo(history)).toBe(true);

    history = redo(history);
    // C, the fork actually being explored — B is only the older sibling.
    expect(history.currentId).toBe("C");
  });

  it("cannot undo past a root or redo past a leaf", () => {
    const tree = forkTree();

    const atRoot = goTo(tree, "A");
    expect(canUndo(atRoot)).toBe(false);
    expect(undo(atRoot)).toBe(atRoot); // a no-op returns the same history

    const atLeaf = goTo(tree, "E");
    expect(canRedo(atLeaf)).toBe(false);
    expect(redo(atLeaf)).toBe(atLeaf);
  });

  it("refuses to undo into a parent that was never committed", () => {
    // A dangling parentId is the malformed case a caller can hand in; undo must
    // not strand currentId on an id with no node behind it.
    const orphan = commit(emptyHistory<Payload>(), {
      id: "X",
      parentId: "ghost",
      kind: "modify",
      label: "made X",
      createdAt: 1,
      payload: { n: 1 },
    });

    expect(canUndo(orphan)).toBe(false);
    expect(undo(orphan)).toBe(orphan);
    expect(currentNode(orphan)?.id).toBe("X");
    // Ancestry stops at the gap rather than inventing the missing parent.
    expect(ids(ancestry(orphan, "X"))).toEqual(["X"]);
  });
});

describe("goTo", () => {
  it("repoints current and rewrites the redo trail down the whole ancestry", () => {
    let history = forkTree(); // current is E, tip of the most recent branch
    history = goTo(history, "D");

    expect(history.currentId).toBe("D");
    // A and B now point down the D branch; the untouched C branch keeps its own.
    expect(history.lastChild).toEqual({ A: "B", B: "D", C: "E" });

    history = undo(history);
    expect(history.currentId).toBe("B");
    history = undo(history);
    expect(history.currentId).toBe("A");
    expect(canUndo(history)).toBe(false);

    // Redo walks back down the branch goTo selected, not the one last committed.
    history = redo(history);
    expect(history.currentId).toBe("B");
    history = redo(history);
    expect(history.currentId).toBe("D");
  });

  it("ignores an id that is not in the tree", () => {
    const history = forkTree();
    expect(goTo(history, "nope")).toBe(history);
    expect(goTo(history, "nope").currentId).toBe("E");
  });
});

describe("tree queries", () => {
  it("returns ancestry root-first and inclusive", () => {
    const history = forkTree();
    expect(ids(ancestry(history, "E"))).toEqual(["A", "C", "E"]);
    expect(ids(ancestry(history, "A"))).toEqual(["A"]);
    expect(ancestry(history, "missing")).toEqual([]);
  });

  it("terminates on a parent cycle instead of walking forever", () => {
    let history = add(add(emptyHistory<Payload>(), "A"), "B");
    // Malformed re-parent: A under its own child. Nothing in the API should
    // spin, because a breadcrumb render walks this on every frame.
    history = commit(history, {
      id: "A",
      parentId: "B",
      kind: "modify",
      label: "cycled A",
      createdAt: 3,
      payload: { n: 3 },
    });

    const chain = ids(ancestry(history, "A"));
    expect(chain).toEqual(["B", "A"]);
    expect(new Set(chain).size).toBe(chain.length);
  });

  it("reports siblings and marks only genuine forks as branch points", () => {
    const history = forkTree();

    expect(ids(siblingsOf(history, "B"))).toEqual(["B", "C"]);
    expect(ids(siblingsOf(history, "D"))).toEqual(["D"]);
    expect(siblingsOf(history, "missing")).toEqual([]);

    expect(isBranchPoint(history, "A")).toBe(true);
    expect(isBranchPoint(history, "B")).toBe(false); // one child is a continuation
    expect(isBranchPoint(history, "D")).toBe(false); // a leaf forks nothing
  });

  it("offers exactly the leaves as branch tips", () => {
    expect(ids(branchTips(forkTree()))).toEqual(["D", "E"]);
    expect(ids(branchTips(add(emptyHistory<Payload>(), "A")))).toEqual(["A"]);
    expect(branchTips(emptyHistory<Payload>())).toEqual([]);
  });

  it("flattens depth-first with children under their parent", () => {
    const history = forkTree();
    const rows = flatten(history);

    // D sits directly under B, ahead of C, even though C was committed first.
    expect(rows.map((row) => row.node.id)).toEqual(["A", "B", "D", "C", "E"]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 1, 2]);
    expect(rows.map((row) => row.isLastSibling)).toEqual([true, false, true, true, true]);
    expect(rows.map((row) => row.isBranchPoint)).toEqual([true, false, false, false, false]);
    expect(rows).toHaveLength(history.order.length);
    expect(flatten(emptyHistory<Payload>())).toEqual([]);
  });
});
