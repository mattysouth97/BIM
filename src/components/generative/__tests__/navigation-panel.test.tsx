/* @vitest-environment happy-dom */
//
// NavigationPanel — semantic navigation + locking (brief §16, §17, §41, §54).
//
// What these tests defend, in the component's own words: the model is browsed by
// what things ARE, selecting a node scopes the next instruction, and locking
// lives on the same rows without hijacking that scope. So the assertions are
// about the two promises a user relies on:
//
//   - a click on a node hands back THAT node's scope (a level carries exactly
//     its own floorNo, never the whole building);
//   - a click on a lock protects something WITHOUT re-scoping the next edit.
//
// The fixture is a real heuristic-provider design, not hand-written mock data,
// so the tree under test is the one the studio actually renders.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import { NavigationPanel } from "../navigation-panel";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import { buildDesign } from "@/lib/generative/build";
import { buildNavigationTree, type NavNode } from "@/lib/generative/session/navigation";

const PROMPT =
  "Create a five-story office building, approximately 6,000 m², with a central core.";

let tree: NavNode;

beforeAll(async () => {
  const { data: spec } = await new HeuristicReasoningProvider().generateBuilding({
    prompt: PROMPT,
    seed: 4242,
  });
  const built = buildDesign({ spec, buildingPk: "generated", generationId: "GEN-0001" });
  tree = buildNavigationTree(built.snapshot);
});

type PanelProps = React.ComponentProps<typeof NavigationPanel>;

const handlers = {
  onSelect: vi.fn(),
  onToggleLock: vi.fn(),
  onClearLocks: vi.fn(),
  onIsolateChange: vi.fn(),
};

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    tree,
    selectedId: null,
    locks: [],
    isolate: false,
    canIsolate: false,
    ...handlers,
    ...overrides,
  };
  return render(<NavigationPanel {...props} />);
}

/**
 * The row a user sees as one line: the label button plus the lock button beside
 * it. Scoping by row is how a person locks "the Core" rather than "the third
 * lock button" — there are a dozen identical `lock` controls on screen.
 */
function rowFor(name: RegExp | string): HTMLElement {
  // Scoped to the tree itself: the lock summary at the bottom repeats system
  // names as chips, and "Core" the branch is not "Core ×" the released lock.
  const treeList = screen
    .getByRole("button", { name: /^Whole building/ })
    .closest("ul") as HTMLElement;
  return within(treeList).getByRole("button", { name }).closest("div") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("NavigationPanel — the tree a user browses", () => {
  it("opens on the root and both semantic groups, so nothing needs hunting for", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /^Whole building/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Systems" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Levels" })).toBeTruthy();
  });

  it("shows the systems and levels the model actually contains", () => {
    renderPanel();

    // Systems the emitter tagged elements for.
    expect(screen.getByRole("button", { name: /^Structure\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Core\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Envelope\b/ })).toBeTruthy();

    // Five storeys, listed top-down the way a level list reads in a BIM tool.
    const levels = screen
      .getAllByRole("button", { name: /^L0\d\s/ })
      .map((button) => button.textContent?.slice(0, 3));
    expect(levels).toEqual(["L05", "L04", "L03", "L02", "L01"]);
  });

  it("expanding a system reveals its categories; they are hidden until then", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: "Structural Framing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Structural Columns" })).toBeNull();

    fireEvent.click(within(rowFor(/^Structure\b/)).getByRole("button", { name: "Expand" }));

    expect(screen.getByRole("button", { name: "Structural Framing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Structural Columns" })).toBeTruthy();
  });
});

describe("NavigationPanel — selecting scopes the next instruction", () => {
  it("hands back the system node, scoped to that system", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /^Structure\b/ }));

    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
    const node = handlers.onSelect.mock.calls[0][0] as NavNode;
    expect(node.id).toBe("system:structure");
    expect(node.kind).toBe("system");
    expect(node.scope.kind).toBe("system");
  });

  it("hands back a level node carrying exactly that level, not every level", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /^L03\b/ }));

    const node = handlers.onSelect.mock.calls[0][0] as NavNode;
    expect(node.id).toBe("level:3");
    expect(node.kind).toBe("level");
    // The whole point of §54: "restudy THIS level" must not silently mean all of them.
    expect(node.scope.floorNos).toEqual([3]);

    // Contrast: the Levels group really does mean every storey.
    handlers.onSelect.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Levels" }));
    const group = handlers.onSelect.mock.calls[0][0] as NavNode;
    expect(group.scope.floorNos).toEqual([1, 2, 3, 4, 5]);
  });

  it("hands back a category node once its system is expanded", () => {
    renderPanel();
    fireEvent.click(within(rowFor(/^Core\b/)).getByRole("button", { name: "Expand" }));

    fireEvent.click(screen.getByRole("button", { name: "Stairs" }));

    const node = handlers.onSelect.mock.calls[0][0] as NavNode;
    expect(node.id).toBe("system:core/category:Stairs");
    expect(node.kind).toBe("category");
    expect(node.scope.kind).toBe("selection");
    expect(node.scope.elementIds?.length).toBeGreaterThan(0);
  });
});

describe("NavigationPanel — locking on the same rows", () => {
  it("locks the system by its token and leaves the current scope alone", () => {
    renderPanel();

    fireEvent.click(within(rowFor(/^Structure\b/)).getByRole("button", { name: "lock" }));

    expect(handlers.onToggleLock).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleLock).toHaveBeenCalledWith("system:structure");
    // Locking must not re-scope the next edit — the click stops at the lock.
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("locks a level by its own token, not the building", () => {
    renderPanel();

    fireEvent.click(within(rowFor(/^L02\b/)).getByRole("button", { name: "lock" }));

    expect(handlers.onToggleLock).toHaveBeenCalledWith("level:2");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("announces the locked state to assistive tech and offers release", () => {
    renderPanel({ locks: ["system:core"] });

    const coreLock = within(rowFor(/^Core\b/)).getByRole("button", { pressed: true });
    expect(coreLock.textContent).toBe("LOCKED");
    expect(coreLock.getAttribute("title")).toMatch(/release/i);

    // Only the locked row reads as pressed.
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(
      within(rowFor(/^Structure\b/)).getByRole("button", { pressed: false }).textContent,
    ).toBe("lock");

    // Clicking the locked control releases the same token it locked.
    fireEvent.click(coreLock);
    expect(handlers.onToggleLock).toHaveBeenCalledWith("system:core");
  });

  it("counts the active locks and names each one", () => {
    renderPanel({ locks: ["system:core", "level:3"] });

    expect(screen.getByText("Locks (2)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Core ×" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Level 3 ×" })).toBeTruthy();
  });
});

describe("NavigationPanel — systems with nothing to browse", () => {
  /** The "Also lockable" block and the chips inside it. */
  function alsoLockable(): HTMLElement {
    return screen.getByText("Also lockable").parentElement as HTMLElement;
  }

  it("still offers the systems the model has no elements for", () => {
    renderPanel();

    const chips = within(alsoLockable())
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(chips).toEqual(["Massing", "MEP"]);

    // Systems the tree can show are not duplicated down here.
    expect(within(alsoLockable()).queryByRole("button", { name: "Structure" })).toBeNull();
    expect(within(alsoLockable()).queryByRole("button", { name: "Core" })).toBeNull();
    expect(within(alsoLockable()).queryByRole("button", { name: "Roof" })).toBeNull();
  });

  it("explains why a chip has no branch in the tree", () => {
    renderPanel();
    expect(within(alsoLockable()).getByText(/no elements in the model to browse/i)).toBeTruthy();
  });

  it("a chip toggles its own system token", () => {
    renderPanel();

    fireEvent.click(within(alsoLockable()).getByRole("button", { name: "MEP" }));
    expect(handlers.onToggleLock).toHaveBeenCalledWith("system:mep");

    fireEvent.click(within(alsoLockable()).getByRole("button", { name: "Massing" }));
    expect(handlers.onToggleLock).toHaveBeenLastCalledWith("system:massing");
  });

  it("marks a chip that is already locked and releases the same token", () => {
    renderPanel({ locks: ["system:mep"] });

    const chip = within(alsoLockable()).getByRole("button", { name: "MEP ✓" });
    fireEvent.click(chip);
    expect(handlers.onToggleLock).toHaveBeenCalledWith("system:mep");
  });
});

describe("NavigationPanel — isolate and release-all", () => {
  it("disables Isolate until the selection is something that can be isolated", () => {
    renderPanel({ canIsolate: false });
    const checkbox = screen.getByRole("checkbox", { name: "Isolate" }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
  });

  it("enables Isolate and reports the change when the selection covers levels", () => {
    renderPanel({ canIsolate: true });
    const checkbox = screen.getByRole("checkbox", { name: "Isolate" }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);

    fireEvent.click(checkbox);
    expect(handlers.onIsolateChange).toHaveBeenCalledWith(true);
  });

  it("reflects an already-isolated view", () => {
    renderPanel({ canIsolate: true, isolate: true });
    expect((screen.getByRole("checkbox", { name: "Isolate" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("offers no Release all when nothing is locked, and says so plainly", () => {
    renderPanel({ locks: [] });

    expect(screen.queryByRole("button", { name: "Release all" })).toBeNull();
    expect(screen.getByText("Locks (0)")).toBeTruthy();
    expect(screen.getByText(/Nothing is locked/i)).toBeTruthy();
  });

  it("offers Release all once something is locked, and clears on click", () => {
    renderPanel({ locks: ["system:core"] });

    expect(screen.queryByText(/Nothing is locked/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Release all" }));

    expect(handlers.onClearLocks).toHaveBeenCalledTimes(1);
    // Releasing everything is not a selection change.
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });
});
