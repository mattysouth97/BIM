/* @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";

const { diagnosticsDatabase } = vi.hoisted(() => ({
  diagnosticsDatabase: new Map<IDBValidKey, unknown>(),
}));

vi.mock("idb-keyval", () => ({
  get: async (key: IDBValidKey) => {
    const value = diagnosticsDatabase.get(key);
    return value === undefined ? undefined : structuredClone(value);
  },
  set: async (key: IDBValidKey, value: unknown) => {
    diagnosticsDatabase.set(key, structuredClone(value));
  },
  keys: async () => [...diagnosticsDatabase.keys()],
}));

import { EnergyDiagnosisWorkspace } from "../energy-diagnosis-workspace";
import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
} from "../model-operations";
import { saveEnergyDiagnosticsProject } from "@/lib/energy-diagnostics/storage";
import { representativeOfficeDrawingSetInputs } from "@/lib/energy-diagnostics/reference-office-sources";
import { validateCanonicalEnergyModel } from "@/lib/energy-diagnostics/validation";

beforeEach(() => diagnosticsDatabase.clear());
afterEach(cleanup);

describe("EnergyDiagnosisWorkspace", () => {
  it("completes the representative drawing-to-comparison workflow with real results", async () => {
    const onModelChange = vi.fn();
    const onSimulationRun = vi.fn();
    render(
      <EnergyDiagnosisWorkspace
        onModelChange={onModelChange}
        onSimulationRun={onSimulationRun}
        renderScene={() => <div data-testid="existing-building-scene">existing scene</div>}
      />,
    );

    expect(screen.getByRole("heading", { name: "도면에서 진단까지, 한 흐름으로 시작하세요" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "대표 오피스 도면 세트 열기" }));

    await waitFor(() => expect(screen.getByTestId("stage-panel-review")).toBeTruthy());
    expect(screen.getByTestId("energy-readiness-strip")).toBeTruthy();
    expect(screen.getByTestId("source-review-canvas")).toBeTruthy();
    expect(within(screen.getByTestId("source-review-canvas")).getByText("LEVEL 1")).toBeTruthy();
    expect(within(screen.getByTestId("source-review-canvas")).queryByText("LEVEL 2")).toBeNull();
    expect(screen.getByTestId("conflict-resolution-panel")).toBeTruthy();
    const scheduleName = screen.getAllByText("A601-window-schedule-rev-A.svg")[0];
    const scheduleButton = scheduleName.closest("button");
    if (!scheduleButton) throw new Error("schedule document has no selection button");
    fireEvent.click(scheduleButton);
    await waitFor(() => expect(screen.getByTestId("source-image-backdrop")).toBeTruthy());
    expect(screen.getByTestId("next-diagnosis-action").textContent).toContain("0.5 ACH 가정 적용");

    fireEvent.click(screen.getByTestId("next-diagnosis-action"));
    await waitFor(() => expect(screen.getByTestId("next-diagnosis-action").textContent).toContain("선택값 확인"));
    fireEvent.click(screen.getByTestId("next-diagnosis-action"));

    await waitFor(() => expect(screen.getByTestId("next-diagnosis-action").textContent).toContain("기준안 시뮬레이션"));
    fireEvent.click(screen.getByTestId("next-diagnosis-action"));

    await waitFor(() => {
      expect(onSimulationRun).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("result-comparison")).toBeTruthy();
    });
    expect(onSimulationRun.mock.calls[0][0].status).toBe("succeeded");
    expect(screen.getByTestId("existing-building-scene")).toBeTruthy();
    expect(screen.getByText(/월별·시간별·냉방피크/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("next-diagnosis-action"));
    await waitFor(() => expect(onSimulationRun).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("stage-panel-compare")).toBeTruthy();
    expect(screen.getAllByText("창호 성능 대안").length).toBeGreaterThan(0);
    expect(onModelChange).toHaveBeenCalled();

    const modelChangeCount = onModelChange.mock.calls.length;
    const staged = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><text>WALL DETAIL REV C</text></svg>'],
      "A701-wall-detail-rev-C.svg",
      { type: "image/svg+xml" },
    );
    fireEvent.change(screen.getByTestId("drawing-set-input"), {
      target: { files: [staged] },
    });
    await waitFor(() => expect(screen.getByTestId("detached-ingestion-panel")).toBeTruthy());
    expect(onModelChange).toHaveBeenCalledTimes(modelChangeCount);
    expect(screen.getByRole("button", { name: "현재 모델로 돌아가기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현재 모델로 돌아가기" }));
    await waitFor(() => expect(screen.queryByTestId("detached-ingestion-panel")).toBeNull());

    fireEvent.click(
      screen.getAllByRole("button", { name: "프로젝트 저장" })[0],
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "브라우저에 저장했습니다",
      ),
    );

    cleanup();
    render(
      <EnergyDiagnosisWorkspace
        renderScene={() => (
          <div data-testid="restored-existing-building-scene">restored scene</div>
        )}
      />,
    );
    const reopen = await screen.findByRole("button", {
      name: "최근 저장 진단 열기",
    });
    fireEvent.click(reopen);

    await waitFor(() => expect(screen.getByTestId("stage-panel-compare")).toBeTruthy());
    expect(screen.getByTestId("result-comparison")).toBeTruthy();
    expect(screen.getByTestId("restored-existing-building-scene")).toBeTruthy();

    const restoredScheduleName = screen.getAllByText(
      "A601-window-schedule-rev-A.svg",
    )[0];
    const restoredScheduleButton = restoredScheduleName.closest("button");
    if (!restoredScheduleButton) {
      throw new Error("restored schedule document has no selection button");
    }
    fireEvent.click(restoredScheduleButton);
    await waitFor(() => expect(screen.getByTestId("source-image-backdrop")).toBeTruthy());
  }, 20_000);

  it("offers the same workflow labels in English", async () => {
    render(<EnergyDiagnosisWorkspace locale="en" />);
    expect(screen.getByRole("heading", { name: "Move from drawings to diagnosis in one workflow" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open representative office set" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Register my drawing set" }).length).toBeGreaterThan(0);
  });

  it("shows the affected fact and object IDs for preflight issues", async () => {
    const reference = await loadRepresentativeCase();
    const validation = validateCanonicalEnergyModel(reference.model);
    const affectedFactIds = [
      ...new Set(validation.issues.flatMap((issue) => issue.factIds)),
    ];
    const affectedObjectIds = [
      ...new Set(
        validation.issues.flatMap((issue) => issue.affectedObjectIds),
      ),
    ];
    expect(affectedFactIds.length).toBeGreaterThan(0);
    expect(affectedObjectIds.length).toBeGreaterThan(0);

    render(
      <EnergyDiagnosisWorkspace locale="en" initialModel={reference.model} />,
    );
    fireEvent.click(screen.getByTestId("diagnosis-stage-preflight"));

    const panel = await screen.findByTestId("stage-panel-preflight");
    expect(within(panel).getAllByTestId("preflight-issue").length).toBe(
      validation.issues.length,
    );
    expect(within(panel).getAllByText("Affected fact IDs").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Affected object IDs").length).toBeGreaterThan(0);

    for (const factId of affectedFactIds) {
      expect(within(panel).getAllByText(factId).length).toBeGreaterThan(0);
    }
    for (const objectId of affectedObjectIds) {
      expect(within(panel).getAllByText(objectId).length).toBeGreaterThan(0);
    }
  });

  it("synchronizes a selected result with its exact run and spatial IDs", async () => {
    const reference = await loadRepresentativeCase();
    let ready = applyInfiltrationAssumption(reference.model);
    const conflict = ready.conflicts[0];
    if (!conflict.selectedFactId) {
      throw new Error("reference conflict has no visible selection");
    }
    ready = resolveVisibleConflict(
      ready,
      conflict.id,
      conflict.selectedFactId,
    );
    const completed = runBaselineModel(ready);
    const onSelectionChange = vi.fn();

    render(
      <EnergyDiagnosisWorkspace
        locale="en"
        initialModel={completed.model}
        onSelectionChange={onSelectionChange}
        renderScene={(context) => (
          <div>
            <div
              data-testid="selected-result-scene"
              data-run-id={context.activeRun?.id ?? ""}
              data-selection-kind={context.selected?.kind ?? ""}
            />
            <button
              type="button"
              data-testid="mock-3d-zone-pick"
              onClick={() =>
                context.onSelectZone(context.model.geometry.thermalZones[0].id)
              }
            >
              Pick first zone
            </button>
          </div>
        )}
      />,
    );

    fireEvent.click(screen.getByTestId("diagnosis-stage-simulation"));
    fireEvent.click(screen.getByTestId("result-annualEnergyKwh-baseline"));

    await waitFor(() => {
      const selection = onSelectionChange.mock.calls.at(-1)?.[0];
      expect(selection).toMatchObject({
        kind: "simulation_result",
        runId: completed.run.id,
      });
      expect(selection.canonicalObjectIds.length).toBeGreaterThan(0);
      expect(selection.threeObjectIds.length).toBeGreaterThan(0);
      expect(
        screen.getByTestId("selected-result-scene").getAttribute("data-run-id"),
      ).toBe(completed.run.id);
      expect(
        screen
          .getByTestId("selected-result-scene")
          .getAttribute("data-selection-kind"),
      ).toBe("simulation_result");
    });

    fireEvent.click(screen.getByTestId("mock-3d-zone-pick"));
    await waitFor(() => {
      const selection = onSelectionChange.mock.calls.at(-1)?.[0];
      expect(selection).toMatchObject({
        kind: "thermal_zone",
        id: completed.model.geometry.thermalZones[0].id,
      });
      expect(selection.documentId).toBeTruthy();
      expect(screen.getByTestId("evidence-inspector")).toBeTruthy();
    });
  });

  it("registers a real safe SVG without pretending a canonical model exists", async () => {
    const onDrawingSetIngested = vi.fn();
    render(
      <EnergyDiagnosisWorkspace
        locale="en"
        onDrawingSetIngested={onDrawingSetIngested}
      />,
    );
    const source = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><text>WINDOW SCHEDULE W01</text></svg>'],
      "A601-window-schedule-rev-B.svg",
      { type: "image/svg+xml" },
    );
    fireEvent.change(screen.getByTestId("drawing-set-input"), {
      target: { files: [source] },
    });

    await waitFor(() => expect(onDrawingSetIngested).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("ingestion-only-review")).toBeTruthy();
    expect(screen.getByText(/parent model-generation step/)).toBeTruthy();
    expect(screen.getByTestId("next-diagnosis-action").textContent).toContain(
      "Review new extraction",
    );
    expect(screen.queryByTestId("result-comparison")).toBeNull();
  });

  it("creates an explicit Tier-1 estimate from a real vector boundary", async () => {
    const onModelChange = vi.fn();
    const source = representativeOfficeDrawingSetInputs()[0];
    render(
      <EnergyDiagnosisWorkspace
        locale="en"
        onModelChange={onModelChange}
      />,
    );
    const fileContent =
      typeof source.content === "string"
        ? source.content
        : source.content instanceof ArrayBuffer
          ? source.content.slice(0)
          : Uint8Array.from(source.content).buffer;
    const file = new File([fileContent], source.fileName, {
      type: source.mimeType,
    });

    fireEvent.change(screen.getByTestId("drawing-set-input"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onModelChange).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("stage-panel-assumptions")).toBeTruthy();
    expect(screen.getByTestId("diagnosis-feedback").textContent).toContain(
      "visible screening assumption",
    );
    expect(onModelChange.mock.calls[0][0].assumptions).toContainEqual(
      expect.objectContaining({
        id: "assumption.tier1-office-screening-template",
      }),
    );
    expect(screen.getByTestId("tier-one-assumption-card").textContent).toContain(
      "Tier-1 office screening template v1",
    );
    expect(screen.getByTestId("tier-one-assumption-card").textContent).toContain(
      "Seoul, KR",
    );
    expect(screen.getByTestId("tier-one-assumption-card").textContent).toContain(
      "not measured data or a compliance prediction",
    );
    expect(screen.getByTestId("tier-one-uncertainty-banner")).toBeTruthy();
    expect(screen.getByTestId("next-diagnosis-action").textContent).toContain(
      "Confirm footprint & Tier-1 assumptions",
    );

    fireEvent.click(screen.getByTestId("accept-tier-one-assumptions"));

    await waitFor(() => expect(onModelChange).toHaveBeenCalledTimes(2));
    expect(
      onModelChange.mock.calls[1][0].facts
        .filter(
          (fact: { assumptionId?: string }) =>
            fact.assumptionId ===
            "assumption.tier1-office-screening-template",
        )
        .every((fact: { reviewedByUser: boolean }) => fact.reviewedByUser),
    ).toBe(true);
    expect(
      onModelChange.mock.calls[1][0].geometry.floorPlates[0].boundary
        .reviewedByUser,
    ).toBe(true);
    expect(
      onModelChange.mock.calls[1][0].geometry.floorPlates[0].areaSqm
        .reviewedByUser,
    ).toBe(true);
    expect(screen.getByTestId("next-diagnosis-action").textContent).toContain(
      "Run baseline simulation",
    );
  });

  it("refuses to report a successful reopen when source bytes are missing", async () => {
    const reference = await loadRepresentativeCase();
    await saveEnergyDiagnosticsProject(reference.model);

    render(<EnergyDiagnosisWorkspace locale="en" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open recent saved diagnosis",
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("diagnosis-feedback").textContent).toContain(
        "source drawing bytes",
      ),
    );
    expect(screen.getByTestId("diagnosis-feedback").textContent).not.toContain(
      "Restored the saved model",
    );
    expect(
      screen.getByRole("button", { name: "Open representative office set" }),
    ).toBeTruthy();
  });
});
