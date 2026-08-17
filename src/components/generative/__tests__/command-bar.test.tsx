/* @vitest-environment happy-dom */
//
// The command surface (src/components/generative/command-bar.tsx).
//
// The component's contract is that ONE input serves two grammars: prose goes to
// the reasoning layer, a leading slash is a direct action. These tests defend
// that split from the user's side of the glass — what gets submitted, what only
// gets completed, what the bar says while it is working — rather than the JSX.
//
// The suggestion highlight has no accessible expression of its own, so it is
// observed through its consequence: what Tab completes to and what Enter runs.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { ComponentProps } from "react";

import { CommandBar } from "../command-bar";
import type { StageEvent } from "@/lib/generative/client";

type BarProps = ComponentProps<typeof CommandBar>;

function setup(overrides: Partial<BarProps> = {}) {
  const props: BarProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    busy: false,
    stage: null,
    scope: null,
    onClearScope: vi.fn(),
    lockCount: 0,
    ruleCount: 0,
    notice: null,
    onDismissNotice: vi.fn(),
    ...overrides,
  };
  const view = render(<CommandBar {...props} />);
  const input = screen.getByLabelText(/describe a change/i) as HTMLInputElement;
  return { ...view, props, input };
}

/** What a user typing into the bar looks like to a controlled input. */
function type(input: HTMLInputElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

const MASSING_STAGE: StageEvent = {
  stage: "massing",
  label: "Massing",
  index: 1,
  total: 5,
  detail: "core placed",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─── Prose: the reasoning half of the grammar ────────────────────────────────

describe("CommandBar — plain-language instructions", () => {
  it("submits the trimmed instruction on Enter and empties the bar", () => {
    const { props, input } = setup();

    type(input, "   Make the top two floors residential   ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith("Make the top two floors residential");
    expect(input.value).toBe("");
  });

  it("ignores Enter on a blank bar", () => {
    const { props, input } = setup();

    fireEvent.keyDown(input, { key: "Enter" });
    type(input, "    ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("runs the instruction from the Run button as well as the keyboard", () => {
    const { props, input } = setup();

    const run = screen.getByRole("button", { name: "Run" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);

    type(input, "Widen the atrium");
    expect((screen.getByRole("button", { name: "Run" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(props.onSubmit).toHaveBeenCalledWith("Widen the atrium");
    expect(input.value).toBe("");
  });
});

// ─── Slash: the deterministic half of the grammar ────────────────────────────

describe("CommandBar — command suggestions", () => {
  it("opens the command list on a bare slash and closes it again for prose", () => {
    const { input } = setup();

    expect(screen.queryByRole("listbox")).toBeNull();

    type(input, "/");
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(1);
    expect(within(list).getByText("/repair [CODE …]")).toBeTruthy();
    expect(within(list).getByText("/undo")).toBeTruthy();

    type(input, "make it taller");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("narrows the list as the command word is typed", () => {
    const { input } = setup();

    type(input, "/re");
    const list = screen.getByRole("listbox");
    const shown = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent ?? "");

    expect(shown).toHaveLength(2);
    expect(shown.some((text) => text.includes("/repair"))).toBe(true);
    expect(shown.some((text) => text.includes("/redo"))).toBe(true);
    expect(shown.some((text) => text.includes("/explain"))).toBe(false);
  });

  it("clicking a suggestion drops it into the bar without running it", () => {
    const { props, input } = setup();

    type(input, "/re");
    const list = screen.getByRole("listbox");
    fireEvent.click(within(list).getByText("/redo").closest("button")!);

    expect(input.value).toBe("/redo ");
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});

describe("CommandBar — moving the highlight", () => {
  // "/un" matches unlock, unlock-all, undo — three entries, so a wrap in either
  // direction lands somewhere distinguishable.
  it("ArrowDown steps down the list", () => {
    const { input } = setup();

    type(input, "/un");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input.value).toBe("/unlock-all ");
  });

  it("ArrowDown past the end wraps back to the first command", () => {
    const { input } = setup();

    type(input, "/un");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input.value).toBe("/unlock ");
  });

  it("ArrowUp from the first command wraps to the last", () => {
    const { input } = setup();

    type(input, "/un");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input.value).toBe("/undo ");
  });

  it("Tab completes the highlighted command instead of running it", () => {
    const { props, input } = setup();

    type(input, "/re");
    fireEvent.keyDown(input, { key: "Tab" });

    expect(input.value).toBe("/repair ");
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});

describe("CommandBar — Enter on a highlighted command", () => {
  it("runs a command that needs no argument", () => {
    const { props, input } = setup();

    type(input, "/explain");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSubmit).toHaveBeenCalledWith("/explain");
    expect(input.value).toBe("");
  });

  it("runs a command whose argument is optional", () => {
    // "/repair [CODE …]" — square brackets, not angle brackets: it is runnable
    // bare, so Enter must send it rather than sit waiting for an argument.
    const { props, input } = setup();

    type(input, "/repair");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSubmit).toHaveBeenCalledWith("/repair");
    expect(input.value).toBe("");
  });

  it("runs the highlighted command, not the typed prefix", () => {
    const { props, input } = setup();

    type(input, "/un");
    fireEvent.keyDown(input, { key: "ArrowUp" }); // wraps to /undo
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSubmit).toHaveBeenCalledWith("/undo");
  });

  it("only completes /lock, because it cannot run without a system", () => {
    const { props, input } = setup();

    type(input, "/lock");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("/lock ");
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("only completes /rule, because it cannot run without rule text", () => {
    const { props, input } = setup();

    type(input, "/rule");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("/rule ");
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("runs an argument-taking command once the argument is there", () => {
    const { props, input } = setup();

    type(input, "/lock");
    fireEvent.keyDown(input, { key: "Enter" }); // completes to "/lock "
    type(input, "/lock envelope");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith("/lock envelope");
    expect(input.value).toBe("");
  });
});

// ─── Escape: clear, then cancel ──────────────────────────────────────────────

describe("CommandBar — Escape", () => {
  it("clears a non-empty bar without submitting or cancelling", () => {
    const { props, input } = setup({ busy: false });

    type(input, "Make the roof green");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("");
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("cancels work in flight when the bar is already empty", () => {
    const { props, input } = setup({ busy: true, stage: MASSING_STAGE });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not cancel from an empty bar when nothing is in flight", () => {
    const { props, input } = setup({ busy: false });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onCancel).not.toHaveBeenCalled();
  });
});

// ─── Scope, locks and rules: the standing state of the edit ──────────────────

describe("CommandBar — scope chip", () => {
  it("shows what is selected and releases it when clicked", () => {
    const { props } = setup({
      scope: { kind: "level", label: "Level 3", floorNos: [3] },
    });

    const chip = screen.getByText(/Level 3/).closest("button");
    expect(chip).toBeTruthy();
    fireEvent.click(chip!);

    expect(props.onClearScope).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Whole building")).toBeNull();
  });

  it("reads 'Whole building' — and is not clickable — when nothing is selected", () => {
    setup({ scope: null });

    expect(screen.getByText("Whole building")).toBeTruthy();
    expect(screen.getByText("Whole building").closest("button")).toBeNull();
  });

  it("reads 'Whole building' for a building-wide scope", () => {
    setup({ scope: { kind: "building", label: "Everything" } });

    expect(screen.getByText("Whole building")).toBeTruthy();
    expect(screen.queryByText(/Everything/)).toBeNull();
  });
});

describe("CommandBar — lock and rule counts", () => {
  it("stays quiet when there is nothing locked and no rules", () => {
    setup({ lockCount: 0, ruleCount: 0 });

    expect(screen.queryByText(/\d+ locked/)).toBeNull();
    expect(screen.queryByText(/\d+ rules?/)).toBeNull();
  });

  it("counts locks and rules, pluralising rules", () => {
    const { rerender, props } = setup({ lockCount: 2, ruleCount: 1 });

    expect(screen.getByText("2 locked")).toBeTruthy();
    expect(screen.getByText("1 rule")).toBeTruthy();

    rerender(<CommandBar {...props} lockCount={2} ruleCount={3} />);
    expect(screen.getByText("3 rules")).toBeTruthy();
  });
});

// ─── Working: progress is named, and interruptible ───────────────────────────

describe("CommandBar — while busy", () => {
  it("locks the input and announces the named stage with its position", () => {
    const { input } = setup({ busy: true, stage: MASSING_STAGE });

    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe("Working…");

    const announcement = screen.getByText(/Massing/);
    expect(announcement.getAttribute("aria-live")).toBe("polite");
    expect(announcement.textContent).toContain("core placed");
    expect(announcement.textContent).toContain("(2/5)");
  });

  it("announces 'Starting…' before the first stage arrives", () => {
    setup({ busy: true, stage: null });

    const announcement = screen.getByText("Starting…");
    expect(announcement.getAttribute("aria-live")).toBe("polite");
  });

  it("offers Cancel instead of Run, and Cancel calls back", () => {
    const { props } = setup({ busy: true, stage: MASSING_STAGE });

    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

// ─── Notices: transient feedback about the last command ──────────────────────

describe("CommandBar — notices", () => {
  it("raises an error notice as an alert", () => {
    setup({ notice: { tone: "error", text: 'Unknown command "/frobnicate".' } });

    expect(screen.getByRole("alert").textContent).toContain('Unknown command "/frobnicate".');
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports an info notice as a status, not an alert", () => {
    setup({ notice: { tone: "info", text: "Envelope locked." } });

    expect(screen.getByRole("status").textContent).toContain("Envelope locked.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows no notice region at all when there is nothing to say", () => {
    setup({ notice: null });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Dismiss hands the dismissal back to the studio", () => {
    const { props } = setup({ notice: { tone: "info", text: "Undid revision 3." } });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(props.onDismissNotice).toHaveBeenCalledTimes(1);
  });
});

// ─── ⌘K: reachable from anywhere, including the 3D canvas ────────────────────

describe("CommandBar — ⌘K / Ctrl-K", () => {
  it("focuses the bar from a window-level keypress", () => {
    const { input } = setup();

    expect(document.activeElement).not.toBe(input);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    expect(document.activeElement).toBe(input);

    input.blur();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    expect(document.activeElement).toBe(input);
  });

  it("leaves an unmodified 'k' alone so typing elsewhere is not hijacked", () => {
    const { input } = setup();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));

    expect(document.activeElement).not.toBe(input);
  });

  it("removes the window listener on unmount rather than leaking it", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = setup();

    const added = addSpy.mock.calls.filter(([kind]) => kind === "keydown");
    expect(added).toHaveLength(1);

    unmount();

    const removed = removeSpy.mock.calls.filter(([kind]) => kind === "keydown");
    expect(removed).toHaveLength(1);
    // Same function object — a mismatched reference would silently leave the
    // original handler bound for the life of the page.
    expect(removed[0][1]).toBe(added[0][1]);

    // And the orphaned handler really is gone: a Ctrl-K after unmount neither
    // throws nor steals focus from whatever the user is now typing into.
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    expect(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })),
    ).not.toThrow();
    expect(document.activeElement).toBe(elsewhere);

    elsewhere.remove();
  });
});
