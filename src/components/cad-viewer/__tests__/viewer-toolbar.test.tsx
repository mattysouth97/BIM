/* @vitest-environment happy-dom */
// src/components/cad-viewer/__tests__/viewer-toolbar.test.tsx
// The floating CAD toolbar names every tool, mirrors the markup store's active
// tool as aria-pressed, disables the four draw tools and the grid until a
// draft is being edited (cad-viewer.tsx nulls the draw reducer and hides the
// grid otherwise), and takes two presses before it clears every persisted
// markup. The last block mounts the real CadViewer (scene, overlay and panel
// stubbed) to pin the store fallback that keeps a draw tool from rendering
// pressed and disabled at once.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ViewerToolbar, type ViewerToolbarProps } from "../viewer-toolbar";
import { CadViewer } from "../cad-viewer";
import {
  useCadMarkupStore, type CadMarkup, type MarkupStorage,
} from "@/store/cad-markup-store";
import { useCadViewerStore } from "@/store/cad-viewer-store";
import { useCadDraftStore } from "@/store/cad-draft-store";
import type { CadDocument } from "@/lib/cad/doc/types";

// The viewer's WebGL surface and its R3F scene cannot mount under happy-dom;
// the SVG overlay and layer panel are out of scope here. Everything else
// (stores, hooks, toolbar) runs for real.
vi.mock("@react-three/fiber", () => ({ Canvas: () => null }));
vi.mock("../cad-scene", () => ({ CadScene: () => null }));
vi.mock("../markup-overlay", () => ({ MarkupOverlay: () => null }));
vi.mock("../layer-panel", () => ({ LayerPanel: () => null }));

function memoryStorage(): MarkupStorage & { data: Map<string, CadMarkup[]> } {
  const data = new Map<string, CadMarkup[]>();
  return {
    data,
    load: async (id) => data.get(id),
    save: async (id, m) => { data.set(id, m); },
  };
}

const note = (id: string): CadMarkup => ({
  id, kind: "note", position: { x: 1, y: 2 }, text: "hello",
});

const NAV = ["pan", "select", "measure", "note", "leader", "cloud"] as const;
const DRAW = ["draw-line", "draw-polyline", "draw-rect", "draw-circle"] as const;

const KO_NAMES: Record<(typeof NAV)[number] | (typeof DRAW)[number], string> = {
  pan: "이동", select: "선택", measure: "측정", note: "메모", leader: "지시선", cloud: "구름",
  "draw-line": "선", "draw-polyline": "폴리선", "draw-rect": "사각형", "draw-circle": "원",
};

const DRAFT_ONLY_KO = " (초안 편집 중에만)";

const noop = () => {};

function baseProps(overrides: Partial<ViewerToolbarProps> = {}): ViewerToolbarProps {
  return {
    isKo: true,
    drawEnabled: true,
    onSnapshot: noop,
    onUndo: noop,
    onRedo: noop,
    canUndo: false,
    canRedo: false,
    gridOn: false,
    onToggleGrid: noop,
    ...overrides,
  };
}

function renderToolbar(overrides: Partial<ViewerToolbarProps> = {}) {
  const props = baseProps(overrides);
  const utils = render(<ViewerToolbar {...props} />);
  return { ...utils, props };
}

const button = (testId: string) => screen.getByTestId(testId) as HTMLButtonElement;

/** No control may ever read pressed and disabled at the same time. */
function expectNoPressedDisabled() {
  for (const t of [...NAV, ...DRAW]) {
    const b = button(`cad-tool-${t}`);
    expect(b.disabled && b.getAttribute("aria-pressed") === "true").toBe(false);
  }
  const grid = button("cad-grid-toggle");
  expect(grid.disabled && grid.getAttribute("aria-pressed") === "true").toBe(false);
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  useCadMarkupStore.getState()._setStorage(storage);
  useCadMarkupStore.setState({ docId: "doc1", markups: [], tool: "pan" });
});

afterEach(cleanup);

describe("ViewerToolbar — names and roles", () => {
  it("is a toolbar named 도면 도구 holding a navigate/mark-up group and a draw group", () => {
    renderToolbar();
    expect(screen.getByRole("toolbar", { name: "도면 도구" })).toBeTruthy();
    const nav = screen.getByRole("group", { name: "탐색·마크업" });
    const draw = screen.getByRole("group", { name: "그리기" });
    for (const t of NAV) expect(nav.contains(button(`cad-tool-${t}`))).toBe(true);
    for (const t of DRAW) expect(draw.contains(button(`cad-tool-${t}`))).toBe(true);
  });

  it("keeps every pinned data-testid on a button and names each tool by its own name", () => {
    renderToolbar();
    for (const t of [...NAV, ...DRAW]) {
      const b = button(`cad-tool-${t}`);
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("aria-label")).toBe(KO_NAMES[t]);
      expect(b.title).toBe(KO_NAMES[t]);
    }
    for (const id of ["cad-undo", "cad-redo", "cad-join", "cad-grid-toggle", "cad-clear-markups"]) {
      expect(button(id).tagName).toBe("BUTTON");
    }
    expect(button("cad-join").textContent).toContain("결합");
  });

  it("gives Undo, Redo, Join and Save PNG accessible names equal to their titles", () => {
    renderToolbar();
    for (const id of ["cad-undo", "cad-redo", "cad-join"]) {
      const b = button(id);
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.getAttribute("aria-label")).toBe(b.title);
    }
    const png = screen.getByRole("button", { name: "PNG 저장" }) as HTMLButtonElement;
    expect(png.title).toBe("PNG 저장");
  });

  it("uses English names when isKo is false", () => {
    renderToolbar({ isKo: false });
    expect(screen.getByRole("toolbar", { name: "Drawing tools" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Navigate and mark up" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Draw" })).toBeTruthy();
    expect(button("cad-tool-measure").getAttribute("aria-label")).toBe("Measure");
    expect(button("cad-tool-pan").textContent).toBe("Pan");
    expect(button("cad-grid-toggle").getAttribute("aria-label")).toBe("Grid");
    expect(button("cad-join").textContent).toContain("Join");
    expect(screen.getByRole("button", { name: "Save PNG" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear markups" })).toBeTruthy();
  });
});

describe("ViewerToolbar — pressed state", () => {
  it("aria-pressed mirrors the store's active tool and only the active tool shows its name", () => {
    renderToolbar();
    const pan = button("cad-tool-pan");
    const measure = button("cad-tool-measure");
    expect(pan.getAttribute("aria-pressed")).toBe("true");
    expect(pan.textContent).toBe("이동");
    expect(measure.getAttribute("aria-pressed")).toBe("false");
    expect(measure.textContent).toBe("");

    act(() => { useCadMarkupStore.setState({ tool: "measure" }); });

    expect(pan.getAttribute("aria-pressed")).toBe("false");
    expect(pan.textContent).toBe("");
    expect(measure.getAttribute("aria-pressed")).toBe("true");
    expect(measure.textContent).toBe("측정");

    // Exactly one tool is pressed and exactly one carries the label slot, so
    // the centred toolbar keeps a constant width across switches.
    const all = [...NAV, ...DRAW].map((t) => button(`cad-tool-${t}`));
    expect(all.filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(all.filter((b) => b.textContent !== "")).toHaveLength(1);
  });

  it("renders the revealed name as sans HTML text with a reduced-motion-safe settle", () => {
    renderToolbar();
    const label = button("cad-tool-pan").querySelector("span");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("이동");
    expect(label!.getAttribute("aria-hidden")).toBe("true");
    expect(label!.className).toContain("animate-settle");
    expect(label!.className).toContain("motion-reduce:animate-none");
    expect(label!.className).not.toContain("font-mono");
  });

  it("clicking selects a tool; re-clicking the active tool is a no-op that never nulls it", () => {
    renderToolbar();
    fireEvent.click(button("cad-tool-note"));
    expect(useCadMarkupStore.getState().tool).toBe("note");
    expect(button("cad-tool-note").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("cad-tool-note"));
    expect(useCadMarkupStore.getState().tool).toBe("note");
    expect(button("cad-tool-note").getAttribute("aria-pressed")).toBe("true");
  });

  it("the grid toggle reports its pressed state while a draft is being edited", () => {
    const { rerender, props } = renderToolbar({ gridOn: false });
    const grid = button("cad-grid-toggle");
    expect(grid.disabled).toBe(false);
    expect(grid.getAttribute("aria-pressed")).toBe("false");
    expect(grid.getAttribute("aria-label")).toBe("그리드");
    expect(grid.title).toBe("그리드");
    rerender(<ViewerToolbar {...props} gridOn />);
    expect(button("cad-grid-toggle").getAttribute("aria-pressed")).toBe("true");
    expect(button("cad-grid-toggle").title).toBe("그리드");
  });

  it("outside a draft the grid is disabled, states the condition and never reads pressed", () => {
    // cad-viewer.tsx draws the grid only inside a draft, so a caller's stale
    // `gridOn: true` must not surface as a pressed grid that nobody can see.
    renderToolbar({ drawEnabled: false, gridOn: true });
    const grid = button("cad-grid-toggle");
    expect(grid.disabled).toBe(true);
    expect(grid.getAttribute("aria-pressed")).toBe("false");
    expect(grid.getAttribute("aria-label")).toBe("그리드");
    expect(grid.title).toBe(`그리드${DRAFT_ONLY_KO}`);
    expect(grid.dataset.variant).toBe("ghost");
    expectNoPressedDisabled();
  });
});

describe("ViewerToolbar — draw gate", () => {
  it("disables the four draw tools without a draft and the title states the condition", () => {
    renderToolbar({ drawEnabled: false });
    for (const t of DRAW) {
      const b = button(`cad-tool-${t}`);
      expect(b.disabled).toBe(true);
      expect(b.title).toBe(`${KO_NAMES[t]}${DRAFT_ONLY_KO}`);
    }
    for (const t of NAV) {
      const b = button(`cad-tool-${t}`);
      expect(b.disabled).toBe(false);
      expect(b.title).toBe(KO_NAMES[t]);
    }
  });

  it("exposes the reason on the element the pointer actually hits, not only on the inert button", () => {
    renderToolbar({ drawEnabled: false });
    for (const t of DRAW) {
      const b = button(`cad-tool-${t}`);
      const reason = `${KO_NAMES[t]}${DRAFT_ONLY_KO}`;
      // The shadcn base makes a disabled button pointer-events-none, so its
      // own title can never show as a tooltip…
      expect(b.className).toContain("disabled:pointer-events-none");
      // …hence the wrapper that receives the hover carries the same reason.
      const wrap = b.parentElement!;
      expect(wrap.tagName).toBe("SPAN");
      expect(wrap.title).toBe(reason);
      expect(wrap.className).not.toContain("pointer-events-none");
    }
    // The grid is gated by the same condition through the same mechanism.
    const grid = button("cad-grid-toggle");
    expect(grid.parentElement!.tagName).toBe("SPAN");
    expect(grid.parentElement!.title).toBe(`그리드${DRAFT_ONLY_KO}`);
  });

  it("a disabled draw tool does not change the store when clicked", () => {
    renderToolbar({ drawEnabled: false });
    fireEvent.click(button("cad-tool-draw-line"));
    expect(useCadMarkupStore.getState().tool).toBe("pan");
    expect(button("cad-tool-draw-line").getAttribute("aria-pressed")).toBe("false");
  });

  it("enables the draw tools while a draft is active and drops the qualifier everywhere", () => {
    renderToolbar({ drawEnabled: true });
    for (const t of DRAW) {
      const b = button(`cad-tool-${t}`);
      expect(b.disabled).toBe(false);
      expect(b.title).toBe(KO_NAMES[t]);
      expect(b.parentElement!.title).toBe(KO_NAMES[t]);
    }
    fireEvent.click(button("cad-tool-draw-rect"));
    expect(useCadMarkupStore.getState().tool).toBe("draw-rect");
    expect(button("cad-tool-draw-rect").textContent).toBe("사각형");
  });

  it("states the condition in English too", () => {
    renderToolbar({ isKo: false, drawEnabled: false });
    const line = button("cad-tool-draw-line");
    expect(line.title).toBe("Line (only while editing a draft)");
    expect(line.parentElement!.title).toBe("Line (only while editing a draft)");
    expect(button("cad-grid-toggle").title).toBe("Grid (only while editing a draft)");
  });
});

describe("ViewerToolbar — clear markups", () => {
  it("is disabled when there is nothing to clear", () => {
    renderToolbar();
    const clear = button("cad-clear-markups");
    expect(clear.disabled).toBe(true);
    expect(clear.getAttribute("aria-label")).toBe("마크업 지우기");
    expect(clear.title).toBe("마크업 지우기");
  });

  it("needs two presses: the first arms and keeps every markup, the second clears", async () => {
    useCadMarkupStore.setState({ markups: [note("m1"), note("m2")] });
    renderToolbar();
    const clear = button("cad-clear-markups");
    expect(clear.disabled).toBe(false);
    expect(clear.getAttribute("aria-label")).toBe("마크업 지우기");
    expect(clear.textContent).toBe("");
    expect(clear.dataset.variant).toBe("ghost");

    fireEvent.click(clear);
    expect(useCadMarkupStore.getState().markups).toHaveLength(2);
    expect(clear.getAttribute("aria-label")).toBe("마크업 모두 지우기 — 다시 누르면 지웁니다");
    expect(clear.textContent).toBe("다시 눌러 지우기");
    expect(clear.dataset.variant).toBe("destructive");

    fireEvent.click(clear);
    expect(useCadMarkupStore.getState().markups).toHaveLength(0);
    await Promise.resolve(); // let the store's async save flush
    expect(storage.data.get("doc1")).toEqual([]);
    expect(clear.disabled).toBe(true);
    expect(clear.textContent).toBe("");
    expect(clear.dataset.variant).toBe("ghost");
  });

  it("the armed label hangs under the button instead of widening the centred bar", () => {
    useCadMarkupStore.setState({ markups: [note("m1")] });
    renderToolbar();
    const clear = button("cad-clear-markups");
    // The button is the positioning context…
    expect(clear.className).toContain("relative");
    fireEvent.click(clear);
    // …and the label is taken out of the flow, so the toolbar's own width —
    // and therefore its translate-centred position — does not move on arm.
    const callout = clear.querySelector("span")!;
    expect(callout.textContent).toBe("다시 눌러 지우기");
    expect(callout.className).toContain("absolute");
    expect(callout.className).toContain("animate-settle");
    expect(callout.className).toContain("motion-reduce:animate-none");
    expect(callout.className).not.toContain("font-mono");
  });

  it("switching tool between the two presses disarms", () => {
    useCadMarkupStore.setState({ markups: [note("m1"), note("m2")] });
    renderToolbar();
    const clear = button("cad-clear-markups");
    fireEvent.click(clear);
    expect(clear.textContent).toBe("다시 눌러 지우기");

    act(() => { useCadMarkupStore.getState().setTool("measure"); });
    expect(clear.textContent).toBe("");
    expect(clear.getAttribute("aria-label")).toBe("마크업 지우기");

    // The next press re-arms rather than clearing.
    fireEvent.click(clear);
    expect(useCadMarkupStore.getState().markups).toHaveLength(2);
    expect(clear.textContent).toBe("다시 눌러 지우기");
  });

  it("Escape or leaving the button disarms", () => {
    useCadMarkupStore.setState({ markups: [note("m1")] });
    renderToolbar();
    const clear = button("cad-clear-markups");

    fireEvent.click(clear);
    expect(clear.textContent).toBe("다시 눌러 지우기");
    fireEvent.keyDown(clear, { key: "Escape" });
    expect(clear.textContent).toBe("");

    fireEvent.click(clear);
    expect(clear.textContent).toBe("다시 눌러 지우기");
    fireEvent.blur(clear);
    expect(clear.textContent).toBe("");
    expect(useCadMarkupStore.getState().markups).toHaveLength(1);
  });

  it("nothing fires on a timer: an armed button stays armed until a press, a switch, Escape or blur", async () => {
    useCadMarkupStore.setState({ markups: [note("m1")] });
    renderToolbar();
    const clear = button("cad-clear-markups");
    fireEvent.click(clear);
    await new Promise((r) => setTimeout(r, 30));
    expect(clear.textContent).toBe("다시 눌러 지우기");
    expect(useCadMarkupStore.getState().markups).toHaveLength(1);
  });
});

describe("CadViewer — a stale draw tool never renders pressed and disabled", () => {
  const blankDoc = (id: string): CadDocument => ({
    id,
    layers: [{ name: "0", colorIndex: 7, visible: true }],
    entities: [],
    unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
    warnings: [],
    stats: { totalParsed: 0, mapped: 0, skipped: {} },
  });

  const resetStores = () => {
    act(() => {
      useCadDraftStore.getState().endDraft();
      useCadViewerStore.getState().closeViewer();
    });
  };

  beforeEach(resetStores);
  afterEach(resetStores);

  it("mounting without a draft while a draw tool is active falls back to pan", () => {
    // The markup store is module-level: a draw tool picked in an earlier
    // draft is still the active tool when a draft-less viewer mounts.
    useCadMarkupStore.setState({ tool: "draw-line" });
    useCadViewerStore.getState().openViewer(blankDoc("plan"));
    render(<CadViewer />);

    expect(useCadMarkupStore.getState().tool).toBe("pan");
    expect(button("cad-tool-pan").getAttribute("aria-pressed")).toBe("true");
    const line = button("cad-tool-draw-line");
    expect(line.disabled).toBe(true);
    expect(line.getAttribute("aria-pressed")).toBe("false");
    expect(line.title).toBe(`선${DRAFT_ONLY_KO}`);
    // The grid state defaults on, but no grid is drawn outside a draft.
    const grid = button("cad-grid-toggle");
    expect(grid.disabled).toBe(true);
    expect(grid.getAttribute("aria-pressed")).toBe("false");
    expectNoPressedDisabled();
    expect(screen.getByRole("button", { name: "뷰어 닫기" })).toBe(button("cad-viewer-close"));
  });

  it("keeps a draw tool while a draft edits the open document, and drops to pan when the draft ends", () => {
    // newDrawing also pushes its blank document into the viewer store.
    useCadDraftStore.getState().newDrawing("draft-1", "cad-draft:test");
    useCadMarkupStore.setState({ tool: "draw-rect" });
    render(<CadViewer />);

    expect(useCadMarkupStore.getState().tool).toBe("draw-rect");
    const rect = button("cad-tool-draw-rect");
    expect(rect.disabled).toBe(false);
    expect(rect.getAttribute("aria-pressed")).toBe("true");
    const grid = button("cad-grid-toggle");
    expect(grid.disabled).toBe(false);
    expect(grid.getAttribute("aria-pressed")).toBe("true");
    expectNoPressedDisabled();

    act(() => { useCadDraftStore.getState().endDraft(); });

    expect(useCadMarkupStore.getState().tool).toBe("pan");
    expect(button("cad-tool-draw-rect").disabled).toBe(true);
    expect(button("cad-tool-pan").getAttribute("aria-pressed")).toBe("true");
    expect(button("cad-grid-toggle").getAttribute("aria-pressed")).toBe("false");
    expectNoPressedDisabled();
  });
});
