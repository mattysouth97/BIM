// src/components/workspace/__tests__/properties-panel-provenance.test.tsx
// P2-27 RTL test at the REAL call site: PropertiesPanel derives InputProvenance
// from its footprintSource/ledgerHeit/measuredHeightM props and threads it to
// FidelityBadge. These tests mount PropertiesPanel itself, so they FAIL if the
// `provenance={inputProvenance}` prop threading inside the panel is removed
// (verified once during development by commenting the prop out — the tooltip
// then renders no "Input provenance" section and getByText("Footprint") throws).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertiesPanel } from "../properties-panel";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useAppStore } from "@/store/app-store";
import type { MaterialProperties } from "@/lib/material-types";

// EquipmentInfoPanel is incidental to provenance wiring (it renders the MEP
// object story) — stub it so this test doesn't depend on the retrofit engine.
vi.mock("../equipment-info-panel", () => ({
  EquipmentInfoPanel: () => null,
}));

const PK = "TEST-PK-PROVENANCE";

function renderPanel(
  props: Partial<React.ComponentProps<typeof PropertiesPanel>>,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PropertiesPanel {...props} />
    </QueryClientProvider>,
  );
}

function seedStores() {
  useActiveBuildingStore.getState().setActiveBuilding(PK);
  // Minimal materials object — enough to pass the `!materials` guard; every
  // deeper consumer (metrics/certification) is null-guarded on the recipe.
  useMaterialStore.setState({
    properties: { [PK]: {} as unknown as MaterialProperties },
  });
  // Pin English so the /L1/ and "Twin Fidelity" matchers stay valid.
  useAppStore.setState({ language: "en" });
}

function resetStores() {
  useActiveBuildingStore.getState().clearActiveBuilding();
  useMaterialStore.setState({ properties: {} });
}

/** Hover the top-level FidelityBadge (first L1 badge in the fidelity section). */
function openBadgeTooltip() {
  const badges = screen.getAllByText(/L1/);
  fireEvent.mouseEnter(badges[0]);
}

describe("PropertiesPanel provenance wiring (P2-27)", () => {
  beforeEach(seedStores);
  afterEach(() => {
    cleanup();
    resetStores();
  });

  it("source='building' + ledgerHeit>0 → badge tooltip shows measured footprint and heights", () => {
    renderPanel({ footprintSource: "building", ledgerHeit: 18 });
    openBadgeTooltip();

    // Provenance section exists only if PropertiesPanel threads the prop.
    expect(screen.getByText("Input provenance")).toBeTruthy();
    expect(screen.getByText("Footprint")).toBeTruthy();
    // footprint=measured, heights=measured, facade=estimated (no calibration for TEST-PK)
    expect(screen.getAllByText("measured").length).toBe(2);
    expect(screen.getAllByText("estimated").length).toBe(1);
  });

  it("source='parcel' with no height data → all three inputs estimated (AFF-6)", () => {
    renderPanel({ footprintSource: "parcel", ledgerHeit: 0, measuredHeightM: null });
    openBadgeTooltip();

    expect(screen.getByText("Input provenance")).toBeTruthy();
    expect(screen.getAllByText("estimated").length).toBe(3);
    expect(screen.queryAllByText("measured").length).toBe(0);
  });

  it("VWorld-height-only (heit=0, measuredHeightM>0) → heights measured", () => {
    renderPanel({ footprintSource: "building", ledgerHeit: 0, measuredHeightM: 12.5 });
    openBadgeTooltip();

    expect(screen.getByText("Heights")).toBeTruthy();
    // footprint + heights measured, facade estimated
    expect(screen.getAllByText("measured").length).toBe(2);
  });

  it("no props (default) → provenance still rendered, all estimated (era box)", () => {
    renderPanel({});
    openBadgeTooltip();

    expect(screen.getByText("Input provenance")).toBeTruthy();
    expect(screen.getAllByText("estimated").length).toBe(3);
  });
});
