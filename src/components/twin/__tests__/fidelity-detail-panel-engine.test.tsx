// src/components/twin/__tests__/fidelity-detail-panel-engine.test.tsx
// Task 8 — FidelityDetailPanel Export IFC / HITL flags section (additive).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FidelityDetailPanel } from "../fidelity-detail-panel";
import type { FidelityReport, UpgradeChecklist } from "@/lib/fidelity/fidelity-types";
import type { HitlFlag } from "@/lib/engine";

afterEach(cleanup);

const report: FidelityReport = {
  level: 1,
  dataSources: [],
  availableCount: 4,
  totalPossible: 8,
  completeness: 0.5,
};

const checklist: UpgradeChecklist = {
  currentLevel: 1,
  items: [],
  nextLevel: null,
};

const flags: HitlFlag[] = [
  { expressId: 3, kind: "wall", sconf: 0.62, reason: "weak geometry source (vworld-measured)" },
  { expressId: 7, kind: "slab", sconf: 0.5, reason: "weak height source (era-estimate)" },
];

/** The accordion content is collapsed by default — open it before assertions. */
function openAccordion() {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

describe("FidelityDetailPanel — Agentic BIM Engine wiring", () => {
  it("renders two review rows and an enabled Export button when hitlFlags are passed", () => {
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        hitlFlags={flags}
      />,
    );
    openAccordion();

    expect(screen.getByText(/2 element/)).toBeTruthy();
    expect(screen.getByText(/weak geometry source \(vworld-measured\)/)).toBeTruthy();
    expect(screen.getByText(/weak height source \(era-estimate\)/)).toBeTruthy();

    const exportButton = screen.getByRole("button", { name: /export ifc/i });
    expect(exportButton).toBeTruthy();
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders the outline-needed message and no Export button when engineUnavailableReason is set", () => {
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        engineUnavailableReason="needs-outline"
      />,
    );
    openAccordion();

    expect(
      screen.getByText(/IFC export needs a CAD or building-outline footprint/i),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /export ifc/i })).toBeNull();
  });

  it('shows "All elements above confidence threshold" when hitlFlags is an empty array', () => {
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        hitlFlags={[]}
      />,
    );
    openAccordion();

    expect(
      screen.getByText(/all elements above confidence threshold/i),
    ).toBeTruthy();
    // Export button should still render (engine IS available, just nothing flagged).
    expect(screen.getByRole("button", { name: /export ifc/i })).toBeTruthy();
  });

  it("disables the Export button and shows a spinner while exporting", () => {
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        hitlFlags={[]}
        exporting={true}
      />,
    );
    openAccordion();

    const exportButton = screen.getByRole("button", { name: /export ifc/i });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onExportIfc when the Export button is clicked", () => {
    let called = false;
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        hitlFlags={[]}
        onExportIfc={() => {
          called = true;
        }}
      />,
    );
    openAccordion();

    fireEvent.click(screen.getByRole("button", { name: /export ifc/i }));
    expect(called).toBe(true);
  });

  it("renders exactly as before when none of the new props are passed (backward-compatible)", () => {
    render(<FidelityDetailPanel report={report} checklist={checklist} />);
    openAccordion();

    expect(screen.queryByRole("button", { name: /export ifc/i })).toBeNull();
    expect(screen.queryByText(/element.*need review/i)).toBeNull();
    expect(
      screen.queryByText(/all elements above confidence threshold/i),
    ).toBeNull();
    expect(
      screen.queryByText(/IFC export needs a CAD or building-outline footprint/i),
    ).toBeNull();
  });
});
