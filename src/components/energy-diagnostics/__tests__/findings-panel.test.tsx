/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticFinding } from "@/lib/energy-diagnostics/findings";
import { getEnergyDiagnosticFixture } from "@/lib/energy-diagnostics/fixtures";

import { FindingsPanel } from "../findings-panel";

afterEach(cleanup);

describe("FindingsPanel selection", () => {
  it("selects the whole finding without double-triggering from evidence controls", () => {
    const model = getEnergyDiagnosticFixture("fixture-a").model;
    const fact = model.facts[0];
    if (!fact) throw new Error("Fixture has no fact");
    const finding: DiagnosticFinding = {
      id: "finding:test-envelope",
      title: "East glazing drives heat loss",
      severity: "high",
      affectedObjectIds: [model.building.id],
      evidence: [{
        label: "Envelope U-value",
        value: 2.4,
        unit: "W/(m²·K)",
        sourceFactIds: [fact.id],
      }],
      relatedSourceRefs: fact.sourceRefs,
      relatedFactIds: [fact.id],
      relatedSimulationPaths: ["engineOutput.heatLoss"],
      explanation: "The selected run attributes the largest envelope loss to this glazing.",
      confidence: 0.9,
      recommendedDesignAction: "Evaluate improved glazing.",
      impactSimulated: true,
    };
    const onSelectFinding = vi.fn();
    const onSelectFact = vi.fn();
    const onEvaluateFinding = vi.fn();

    render(
      <FindingsPanel
        findings={[finding]}
        model={model}
        locale="en"
        selectedFindingId={finding.id}
        onSelectFinding={onSelectFinding}
        onSelectFact={onSelectFact}
        canEvaluateFinding={() => true}
        onEvaluateFinding={onEvaluateFinding}
      />,
    );

    const card = screen.getByTestId(`finding-${finding.id}`);
    expect(card.getAttribute("data-selected")).toBe("true");
    expect(within(card).getByText("Selected")).toBeTruthy();

    const findingButton = within(card).getByRole("button", {
      name: finding.title,
    });
    expect(findingButton.tagName).toBe("BUTTON");
    expect(findingButton.getAttribute("aria-pressed")).toBe("true");
    findingButton.focus();
    expect(document.activeElement).toBe(findingButton);
    fireEvent.click(findingButton);
    expect(onSelectFinding).toHaveBeenCalledWith(finding);

    onSelectFinding.mockClear();
    fireEvent.click(
      within(card).getByRole("button", { name: /Envelope U-value/ }),
    );
    expect(onSelectFact).toHaveBeenCalledWith(fact);
    expect(onSelectFinding).not.toHaveBeenCalled();

    fireEvent.click(
      within(card).getByRole("button", { name: "Evaluate this improvement" }),
    );
    expect(onEvaluateFinding).toHaveBeenCalledWith(finding);
    expect(onSelectFinding).not.toHaveBeenCalled();
  });
});
