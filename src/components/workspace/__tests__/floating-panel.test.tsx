// src/components/workspace/__tests__/floating-panel.test.tsx
// P1-07 (c) — a dragged panel must stay reachable: position clamped on drag
// and on mount (handles persisted off-screen positions).

import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FloatingPanel } from "../floating-panel";

beforeAll(() => {
  // jsdom/happy-dom default innerWidth/Height can be 0/1024; pin them.
  Object.defineProperty(window, "innerWidth", { value: 1000, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
});

afterEach(cleanup);

function renderPanel(defaultX: number, defaultY: number) {
  render(
    <FloatingPanel
      title="Test Panel"
      visible
      onClose={() => {}}
      defaultX={defaultX}
      defaultY={defaultY}
      defaultWidth={300}
      defaultHeight={200}
    >
      <div>content</div>
    </FloatingPanel>
  );
  // The panel is the ancestor with the resize class.
  return document.querySelector(".resize") as HTMLElement;
}

function stylePx(el: HTMLElement, prop: "left" | "top"): number {
  return parseFloat(el.style[prop] || "0");
}

describe("FloatingPanel viewport clamping (P1-07 c)", () => {
  it("clamps an off-screen mount position back into view", () => {
    const panel = renderPanel(5000, 5000);
    // Must be within the viewport (header stays reachable).
    expect(stylePx(panel, "left")).toBeLessThan(window.innerWidth);
    expect(stylePx(panel, "top")).toBeLessThan(window.innerHeight);
    expect(stylePx(panel, "left")).toBeGreaterThanOrEqual(0);
    expect(stylePx(panel, "top")).toBeGreaterThanOrEqual(0);
  });

  it("clamps a drag beyond the viewport edge", () => {
    const panel = renderPanel(100, 100);
    const header = screen.getByText("Test Panel").closest("div")!.parentElement!;

    fireEvent.pointerDown(header, { clientX: 150, clientY: 120, pointerId: 1 });
    // Drag far past the bottom-right corner.
    fireEvent.pointerMove(header, { clientX: 9000, clientY: 9000, pointerId: 1 });

    expect(stylePx(panel, "left")).toBeLessThan(window.innerWidth);
    expect(stylePx(panel, "top")).toBeLessThan(window.innerHeight);
  });
});
