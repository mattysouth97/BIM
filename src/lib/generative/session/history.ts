// src/lib/generative/session/history.ts
//
// Design history as a TREE, not a stack (brief §56, §58).
//
// A linear undo stack throws away the alternative the moment you back up and
// try something else — which is exactly the moment an architect wants both
// versions side by side. So editing from an earlier state branches instead of
// truncating: every design that ever existed stays reachable, and comparing two
// approaches is navigation rather than regeneration.
//
// Deliberately pure: no clock, no id generator, no storage. Ids and timestamps
// are supplied by the caller so the same history can be replayed exactly in a
// test. The Zustand store owns the impure parts.

export type DesignNodeKind =
  | "generate"
  | "modify"
  | "repair"
  | "option"
  | "regenerate";

export interface DesignNode<T> {
  id: string;
  parentId: string | null;
  kind: DesignNodeKind;
  /** One line, past tense — this is the undo entry the user reads. */
  label: string;
  detail?: string;
  createdAt: number;
  payload: T;
}

export interface DesignHistory<T> {
  nodes: Record<string, DesignNode<T>>;
  /** Insertion order. Rendering never depends on object key order. */
  order: string[];
  currentId: string | null;
  /**
   * Last child visited per node. Redo needs an opinion about which branch to
   * walk back down; remembering the one you came from is the least surprising.
   */
  lastChild: Record<string, string>;
}

export function emptyHistory<T>(): DesignHistory<T> {
  return { nodes: {}, order: [], currentId: null, lastChild: {} };
}

/**
 * Add a design and make it current. Its parent defaults to whatever is current,
 * so committing from a node that already has children creates a branch rather
 * than overwriting the existing one.
 */
export function commit<T>(
  history: DesignHistory<T>,
  node: Omit<DesignNode<T>, "parentId"> & { parentId?: string | null },
): DesignHistory<T> {
  const parentId = node.parentId === undefined ? history.currentId : node.parentId;
  const full: DesignNode<T> = { ...node, parentId };

  return {
    nodes: { ...history.nodes, [full.id]: full },
    order: history.order.includes(full.id) ? history.order : [...history.order, full.id],
    currentId: full.id,
    lastChild: parentId ? { ...history.lastChild, [parentId]: full.id } : history.lastChild,
  };
}

export function currentNode<T>(history: DesignHistory<T>): DesignNode<T> | null {
  return history.currentId ? (history.nodes[history.currentId] ?? null) : null;
}

export function childrenOf<T>(
  history: DesignHistory<T>,
  id: string | null,
): DesignNode<T>[] {
  return history.order
    .map((nodeId) => history.nodes[nodeId])
    .filter((node): node is DesignNode<T> => Boolean(node) && node.parentId === id);
}

export function roots<T>(history: DesignHistory<T>): DesignNode<T>[] {
  return childrenOf(history, null);
}

/** Root → node, inclusive. The lineage shown as a breadcrumb. */
export function ancestry<T>(history: DesignHistory<T>, id: string): DesignNode<T>[] {
  const chain: DesignNode<T>[] = [];
  const seen = new Set<string>();
  let cursor: string | null = id;

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node: DesignNode<T> | undefined = history.nodes[cursor];
    if (!node) break;
    chain.unshift(node);
    cursor = node.parentId;
  }
  return chain;
}

export function siblingsOf<T>(history: DesignHistory<T>, id: string): DesignNode<T>[] {
  const node = history.nodes[id];
  if (!node) return [];
  return childrenOf(history, node.parentId);
}

/** More than one child ⇒ the design forked here. Drawn as a branch marker. */
export function isBranchPoint<T>(history: DesignHistory<T>, id: string): boolean {
  return childrenOf(history, id).length > 1;
}

export function canUndo<T>(history: DesignHistory<T>): boolean {
  const node = currentNode(history);
  return Boolean(node?.parentId && history.nodes[node.parentId]);
}

export function canRedo<T>(history: DesignHistory<T>): boolean {
  if (!history.currentId) return false;
  const next = history.lastChild[history.currentId] ?? childrenOf(history, history.currentId)[0]?.id;
  return Boolean(next && history.nodes[next]);
}

export function undo<T>(history: DesignHistory<T>): DesignHistory<T> {
  const node = currentNode(history);
  if (!node?.parentId || !history.nodes[node.parentId]) return history;
  // Record the branch we are stepping off, so redo returns to this one.
  return {
    ...history,
    currentId: node.parentId,
    lastChild: { ...history.lastChild, [node.parentId]: node.id },
  };
}

export function redo<T>(history: DesignHistory<T>): DesignHistory<T> {
  if (!history.currentId) return history;
  const next =
    history.lastChild[history.currentId] ?? childrenOf(history, history.currentId)[0]?.id;
  if (!next || !history.nodes[next]) return history;
  return { ...history, currentId: next };
}

/** Jump anywhere in the tree, updating the redo trail along the way. */
export function goTo<T>(history: DesignHistory<T>, id: string): DesignHistory<T> {
  if (!history.nodes[id]) return history;

  const lastChild = { ...history.lastChild };
  for (const node of ancestry(history, id)) {
    if (node.parentId) lastChild[node.parentId] = node.id;
  }
  return { ...history, currentId: id, lastChild };
}

/**
 * Every leaf — the tip of each line of exploration. This is the list worth
 * offering as "other designs you have", because interior nodes are just older
 * states of the branch that continues past them.
 *
 * Restricted to nodes reachable from a root, so it cannot disagree with
 * `flatten`. A node whose `parentId` names something that does not exist is
 * invisible to the history tree; offering it here would put a row in the UI
 * that the tree can neither show nor navigate to.
 */
export function branchTips<T>(history: DesignHistory<T>): DesignNode<T>[] {
  const reachable = new Set(flatten(history).map((row) => row.node.id));
  return history.order
    .map((id) => history.nodes[id])
    .filter(
      (node): node is DesignNode<T> =>
        Boolean(node) &&
        reachable.has(node.id) &&
        childrenOf(history, node.id).length === 0,
    );
}

/**
 * Flatten for display: depth-first, so children sit under their parent, with a
 * depth for indentation and a flag for the last sibling (tree glyphs).
 */
export interface HistoryRow<T> {
  node: DesignNode<T>;
  depth: number;
  isLastSibling: boolean;
  isBranchPoint: boolean;
}

export function flatten<T>(history: DesignHistory<T>): HistoryRow<T>[] {
  const rows: HistoryRow<T>[] = [];

  const walk = (parentId: string | null, depth: number) => {
    const children = childrenOf(history, parentId);
    children.forEach((node, index) => {
      rows.push({
        node,
        depth,
        isLastSibling: index === children.length - 1,
        isBranchPoint: isBranchPoint(history, node.id),
      });
      walk(node.id, depth + 1);
    });
  };

  walk(null, 0);
  return rows;
}
