// src/hooks/__tests__/use-editor-keybinds.test.tsx
// P1-07 (a) — Tab must no longer be hijacked (WCAG 2.1.1/2.1.2). The editor
// mode toggle moves to backquote (`).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useEditorKeybinds } from "../use-editor-keybinds";
import { useEditorModeStore } from "@/store/editor-mode-store";

function Harness() {
  useEditorKeybinds();
  return null;
}

function press(key: string) {
  const e = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true });
  const prevented = !window.dispatchEvent(e);
  return { event: e, prevented };
}

describe("useEditorKeybinds (P1-07 a)", () => {
  beforeEach(() => {
    useEditorModeStore.setState({ currentMode: "navigate", previousMode: null });
    // Ensure focus is on the body, not a text input.
    document.body.focus();
  });
  afterEach(cleanup);

  it("does NOT preventDefault or toggle on Tab", () => {
    render(<Harness />);
    const toggleSpy = vi.spyOn(useEditorModeStore.getState(), "toggleEditMode");

    const { event } = press("Tab");
    expect(event.defaultPrevented).toBe(false);
    expect(toggleSpy).not.toHaveBeenCalled();
    // Mode unchanged.
    expect(useEditorModeStore.getState().currentMode).toBe("navigate");
  });

  it("toggles edit mode on the backquote key", () => {
    render(<Harness />);
    press("`");
    // navigate ↔ toggles to a non-navigate edit mode.
    expect(useEditorModeStore.getState().currentMode).not.toBe("navigate");
  });

  it("Escape still returns to navigate", () => {
    useEditorModeStore.setState({ currentMode: "floor-edit" });
    render(<Harness />);
    press("Escape");
    expect(useEditorModeStore.getState().currentMode).toBe("navigate");
  });

  it("does nothing when focus is in a text input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    render(<Harness />);

    press("`");
    expect(useEditorModeStore.getState().currentMode).toBe("navigate");
    input.remove();
  });
});
