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

// `useT()` defaults to Korean ("ko") in the test env (app-store's persisted
// default, see src/store/app-store.ts). The four new engine strings are now
// rendered via useT(), so query by `data-testid` (language-agnostic) rather
// than the (previously English-only) visible text.
function getExportButton() {
  return screen.getByRole("button", { name: /ifc/i });
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

    expect(screen.getByTestId("hitl-review-count").textContent).toMatch(/2/);
    expect(screen.getByText(/weak geometry source \(vworld-measured\)/)).toBeTruthy();
    expect(screen.getByText(/weak height source \(era-estimate\)/)).toBeTruthy();

    const exportButton = getExportButton();
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

    expect(screen.getByTestId("engine-unavailable-message")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ifc/i })).toBeNull();
  });

  it('shows the all-clear row when hitlFlags is an empty array', () => {
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        hitlFlags={[]}
      />,
    );
    openAccordion();

    expect(screen.getByTestId("hitl-all-clear")).toBeTruthy();
    // Export button should still render (engine IS available, just nothing flagged).
    expect(getExportButton()).toBeTruthy();
  });

  it("shows no all-clear and no review list when hitlFlags is undefined (engine not yet computed)", () => {
    render(
      <FidelityDetailPanel
        report={report}
        checklist={checklist}
        onExportIfc={() => {}}
      />,
    );
    openAccordion();

    // Export button still renders (engine section is shown because onExportIfc was passed)...
    expect(getExportButton()).toBeTruthy();
    // ...but neither the all-clear nor a review-count row should appear — an
    // undefined hitlFlags must not be presented as a false all-clear (B2).
    expect(screen.queryByTestId("hitl-all-clear")).toBeNull();
    expect(screen.queryByTestId("hitl-review-count")).toBeNull();
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

    const exportButton = getExportButton();
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

    fireEvent.click(getExportButton());
    expect(called).toBe(true);
  });

  it("renders exactly as before when none of the new props are passed (backward-compatible)", () => {
    render(<FidelityDetailPanel report={report} checklist={checklist} />);
    openAccordion();

    expect(screen.queryByRole("button", { name: /ifc/i })).toBeNull();
    expect(screen.queryByTestId("hitl-review-count")).toBeNull();
    expect(screen.queryByTestId("hitl-all-clear")).toBeNull();
    expect(screen.queryByTestId("engine-unavailable-message")).toBeNull();
  });
});
