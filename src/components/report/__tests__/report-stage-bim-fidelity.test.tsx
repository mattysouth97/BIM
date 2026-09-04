// src/components/report/__tests__/report-stage-bim-fidelity.test.tsx
//
// RTL test at the report-stage call site: ReportStage derives a
// BimFidelitySummary from useEngineResult's pure (counting-session) result
// and renders the additive "BIM Fidelity / IFC" section + Export IFC action.
//
// `useEngineResult` is mocked here (same call-site-boundary approach as
// fidelity-detail-panel-engine.test.tsx) so this test exercises ONLY
// report-stage's own wiring — not the engine internals (unit-tested in
// src/lib/engine/__tests__) or the hook internals (src/hooks) — and never
// touches the real WASM IFC write session.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ReportStage } from "../report-stage";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useAppStore } from "@/store/app-store";
import { makeMaterials, makeRecipe } from "@/hooks/__tests__/test-fixtures";
import type { BimEngineResult } from "@/lib/engine";
import type { UseEngineResultReturn } from "@/hooks/use-engine-result";

const PK = "TEST-PK-BIM-FIDELITY";

const useEngineResultMock = vi.fn<() => UseEngineResultReturn>();

vi.mock("@/hooks/use-engine-result", () => ({
  useEngineResult: (...args: unknown[]) => useEngineResultMock(...(args as [])),
}));

function makeEngineResult(): BimEngineResult {
  return {
    ifcBytes: new Uint8Array(),
    model: {
      pk: PK,
      title: "Test Building",
      footprint: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      footprintSource: "vworld-measured",
      floors: 10,
      floorsSource: "vworld-measured",
      storeyHeightM: 3.3,
      totalHeightM: 33,
      heightSource: "vworld-measured",
      wallThicknessM: 0.3,
      facade: null,
      facadeSource: "era-estimate",
    },
    // avg sconf = (0.95 + 0.5 + 1.0 + 0.5 + 0.5) / 5 = 0.69 -> "69.0%"
    elements: [
      { expressId: 1, kind: "wall", sconf: 0.95, geomScore: 0.95, heightScore: 0.95, topologyPenalty: 0 },
      { expressId: 2, kind: "wall", sconf: 0.5, geomScore: 0.5, heightScore: 0.5, topologyPenalty: 0 },
      { expressId: 3, kind: "slab", sconf: 1.0, geomScore: 1.0, heightScore: 1.0, topologyPenalty: 0 },
      { expressId: 4, kind: "window", sconf: 0.5, geomScore: 0.5, heightScore: 0.5, topologyPenalty: 0 },
      { expressId: 5, kind: "door", sconf: 0.5, geomScore: 0.5, heightScore: 0.5, topologyPenalty: 0 },
    ],
    hitlFlags: [
      { expressId: 2, kind: "wall", sconf: 0.5, reason: "test" },
      { expressId: 4, kind: "window", sconf: 0.5, reason: "test" },
      { expressId: 5, kind: "door", sconf: 0.5, reason: "test" },
    ],
    conflicts: [],
    validation: { checks: [], passed: true },
  };
}

function renderReportStage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportStage footprintSource="building" ledgerHeit={15} />
    </QueryClientProvider>,
  );
}

function seedStores() {
  useActiveBuildingStore.getState().setActiveBuilding(PK);
  useMaterialStore.setState({ properties: { [PK]: makeMaterials() } });
  useRecipeStore.setState({ baseRecipes: { [PK]: makeRecipe() }, overrides: {} });
  useAppStore.setState({ language: "en" });
}

function resetStores() {
  useActiveBuildingStore.getState().clearActiveBuilding();
  useMaterialStore.setState({ properties: {} });
  useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
}

describe("ReportStage — BIM Fidelity / IFC section (additive)", () => {
  beforeEach(() => {
    seedStores();
    useEngineResultMock.mockReset();
  });
  afterEach(() => {
    cleanup();
    resetStores();
  });

  it("renders the honest 'unavailable' message and a disabled Export IFC button when the engine is unavailable", () => {
    const exportIfc = vi.fn();
    useEngineResultMock.mockReturnValue({
      available: false,
      result: null,
      exporting: false,
      exportIfc,
      unavailableReason: "needs-outline",
    });

    renderReportStage();

    expect(screen.getByTestId("bim-fidelity-section")).toBeTruthy();
    expect(screen.getByText(/IFC\/BIM export is unavailable/i)).toBeTruthy();
    const exportButton = screen.getByRole("button", { name: /export ifc/i });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the overall fidelity, HITL count, and per-category breakdown when the engine has a result", () => {
    const exportIfc = vi.fn();
    useEngineResultMock.mockReturnValue({
      available: true,
      result: makeEngineResult(),
      exporting: false,
      exportIfc,
      unavailableReason: null,
    });

    renderReportStage();

    // Scope all queries to the BIM Fidelity card — "Walls"/"Windows" also
    // appear in the (unrelated) Energy Audit heat-loss breakdown section.
    const section = within(screen.getByTestId("bim-fidelity-section"));

    expect(section.getByText("69.0%")).toBeTruthy(); // overall fidelity
    expect(section.getByText("HITL-Flagged Elements")).toBeTruthy();

    // Category table: Walls 1 measured / 1 estimated / 2 total.
    const wallRow = section.getByText("Walls").closest("tr");
    expect(wallRow).not.toBeNull();
    const wallCells = Array.from(wallRow!.querySelectorAll("td")).map(
      (td) => td.textContent,
    );
    expect(wallCells).toEqual(["Walls", "1", "1", "2"]);

    // Windows are always estimated per the engine's facade invariant:
    // 0 measured / 1 estimated / 1 total.
    const windowRow = section.getByText("Windows").closest("tr");
    expect(windowRow).not.toBeNull();
    const windowCells = Array.from(windowRow!.querySelectorAll("td")).map(
      (td) => td.textContent,
    );
    expect(windowCells).toEqual(["Windows", "0", "1", "1"]);

    const exportButton = section.getByRole("button", { name: /export ifc/i });
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls the hook's exportIfc when the Export IFC button is clicked", () => {
    const exportIfc = vi.fn();
    useEngineResultMock.mockReturnValue({
      available: true,
      result: makeEngineResult(),
      exporting: false,
      exportIfc,
      unavailableReason: null,
    });

    renderReportStage();

    fireEvent.click(screen.getByRole("button", { name: /export ifc/i }));
    expect(exportIfc).toHaveBeenCalledTimes(1);
  });

  it("disables the Export IFC button and shows a spinner while exporting", () => {
    useEngineResultMock.mockReturnValue({
      available: true,
      result: makeEngineResult(),
      exporting: true,
      exportIfc: vi.fn(),
      unavailableReason: null,
    });

    renderReportStage();

    const exportButton = screen.getByRole("button", { name: /export ifc/i });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);
  });
});
