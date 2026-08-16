// src/components/twin/__tests__/fidelity-badge-provenance.test.tsx
// TDD tests for P2-12: per-input provenance in the fidelity badge.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FidelityBadge } from "../fidelity-badge";
import type { InputProvenance } from "../fidelity-badge";

afterEach(cleanup);

describe("FidelityBadge per-input provenance", () => {
  const measuredProvenance: InputProvenance = {
    footprint: "measured",
    heights: "measured",
    facade: "estimated",
  };

  it("renders badge label when provenance is provided", () => {
    render(<FidelityBadge level={2} provenance={measuredProvenance} />);
    // getByText returns the element or throws — use truthy check
    expect(screen.getByText(/L2/)).toBeTruthy();
  });

  it("shows Footprint label in tooltip on hover", () => {
    render(<FidelityBadge level={2} provenance={measuredProvenance} />);
    fireEvent.mouseEnter(screen.getByText(/L2/));
    expect(screen.getByText("Footprint")).toBeTruthy();
    // At least one "measured" value rendered
    expect(screen.getAllByText("measured").length).toBeGreaterThan(0);
  });

  it("shows Facade=estimated in tooltip on hover", () => {
    render(<FidelityBadge level={2} provenance={measuredProvenance} />);
    fireEvent.mouseEnter(screen.getByText(/L2/));
    expect(screen.getByText("Facade")).toBeTruthy();
    expect(screen.getByText("estimated")).toBeTruthy();
  });

  it("shows Heights label in tooltip on hover", () => {
    render(<FidelityBadge level={2} provenance={measuredProvenance} />);
    fireEvent.mouseEnter(screen.getByText(/L2/));
    expect(screen.getByText("Heights")).toBeTruthy();
  });

  it("shows all-estimated provenance correctly", () => {
    const allEstimated: InputProvenance = {
      footprint: "estimated",
      heights: "estimated",
      facade: "estimated",
    };
    render(<FidelityBadge level={1} provenance={allEstimated} />);
    fireEvent.mouseEnter(screen.getByText(/L1/));
    // All three inputs are estimated → 3 "estimated" labels
    expect(screen.getAllByText("estimated").length).toBe(3);
    // No "measured" labels
    expect(screen.queryAllByText("measured").length).toBe(0);
  });

  it("hides tooltip on mouse leave", () => {
    render(<FidelityBadge level={2} provenance={measuredProvenance} />);
    fireEvent.mouseEnter(screen.getByText(/L2/));
    expect(screen.getByText("Input provenance")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByText(/L2/));
    expect(screen.queryByText("Input provenance")).toBeNull();
  });

  it("renders without provenance prop (backwards-compatible)", () => {
    render(<FidelityBadge level={1} />);
    expect(screen.getByText(/L1/)).toBeTruthy();
    fireEvent.mouseEnter(screen.getByText(/L1/));
    expect(screen.queryByText("Input provenance")).toBeNull();
  });

  it("completeness percentage is still shown when provided", () => {
    render(
      <FidelityBadge level={2} completeness={0.67} provenance={measuredProvenance} />,
    );
    expect(screen.getByText(/67%/)).toBeTruthy();
  });
});
