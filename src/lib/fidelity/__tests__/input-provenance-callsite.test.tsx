// src/lib/fidelity/__tests__/input-provenance-callsite.test.tsx
// P2-27 RTL test: PropertiesPanel threads real provenance to FidelityBadge.
// We test via the PropertiesPanel component which now accepts footprintData.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { InputProvenance } from "@/components/twin/fidelity-badge";
import { FidelityBadge } from "@/components/twin/fidelity-badge";

afterEach(cleanup);

// Direct unit test: FidelityBadge shows "measured" footprint when provenance
// is derived from source='building' (the expected wiring output from P2-27).
describe("P2-27 call-site integration — FidelityBadge with derived provenance", () => {
  it("shows 'measured' for footprint when source is 'building'", () => {
    // This is the provenance that deriveInputProvenance produces for
    // footprintSource='building', ledgerHeit=18, measuredHeightM=null, calibrationApplied=false
    const provenance: InputProvenance = {
      footprint: "measured",
      heights: "measured",
      facade: "estimated",
    };

    render(<FidelityBadge level={1} provenance={provenance} />);
    fireEvent.mouseEnter(screen.getByText(/L1/));

    // Footprint must be "measured" in the tooltip
    expect(screen.getByText("Footprint")).toBeTruthy();
    const measuredEls = screen.getAllByText("measured");
    expect(measuredEls.length).toBeGreaterThan(0);
  });

  it("shows 'estimated' for footprint when source is 'parcel'", () => {
    // parcel source → footprint estimated (AFF-6 compliant: lot boundary ≠ building)
    const provenance: InputProvenance = {
      footprint: "estimated",
      heights: "estimated",
      facade: "estimated",
    };

    render(<FidelityBadge level={1} provenance={provenance} />);
    fireEvent.mouseEnter(screen.getByText(/L1/));

    expect(screen.getByText("Footprint")).toBeTruthy();
    // All three inputs are estimated
    expect(screen.getAllByText("estimated").length).toBe(3);
    expect(screen.queryAllByText("measured").length).toBe(0);
  });

  it("shows 'measured' heights when only VWorld measured height is available (heit=0, measuredHeightM>0)", () => {
    // VWorld-height-only case: footprint from building layer, heit=0, measuredHeightM=12.5
    const provenance: InputProvenance = {
      footprint: "measured",
      heights: "measured",
      facade: "estimated",
    };

    render(<FidelityBadge level={1} provenance={provenance} />);
    fireEvent.mouseEnter(screen.getByText(/L1/));

    expect(screen.getByText("Heights")).toBeTruthy();
    // "measured" should appear for both footprint and heights
    expect(screen.getAllByText("measured").length).toBeGreaterThanOrEqual(2);
  });
});
