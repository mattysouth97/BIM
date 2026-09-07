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

// ingestDrawingSet has no throw path of its own, and one test needs the
// ingestion to fail. Everything else keeps the real implementation.
vi.mock("@/lib/energy-diagnostics/ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/energy-diagnostics/ingestion")>();
  return { ...actual, ingestDrawingSet: vi.fn(actual.ingestDrawingSet) };
});

import { ingestDrawingSet } from "@/lib/energy-diagnostics/ingestion";
import { EnergyDiagnosisWorkspace } from "../energy-diagnosis-workspace";
import { diagnosisCopy } from "../copy";
import {
  NAVIGATION_LABEL,
  NAVIGATION_STAGES,
  STAGE_LABEL,
  operationLabel,
} from "../diagnosis-stage";
import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
  runImprovementScenario,
} from "../model-operations";
import {
  saveEnergyDiagnosticsBundle,
  saveEnergyDiagnosticsProject,
} from "@/lib/energy-diagnostics/storage";
import { representativeOfficeDrawingSetInputs } from "@/lib/energy-diagnostics/reference-office-sources";
import { validateCanonicalEnergyModel } from "@/lib/energy-diagnostics/validation";

beforeEach(() => diagnosticsDatabase.clear());
afterEach(() => {
  cleanup();
  // Drops any queued once-rejection so a failed test cannot leak it forward;
  // on a vi.fn(impl) this restores the real implementation.
  vi.mocked(ingestDrawingSet).mockReset();
});

/** A drag that carries files, as the browser reports it before the drop lands. */
const FILE_DRAG = { dataTransfer: { types: ["Files"] } };
/** A drag of selected text: dragenter fires for it too, but the card must not answer. */
const TEXT_DRAG = { dataTransfer: { types: ["text/plain"] } };
function fileDrop(...files: File[]) {
  return { dataTransfer: { types: ["Files"], files } };
}

/** The representative office floor plan as a browser File (a real DXF). */
function representativeDxfFile(): File {
  const source = representativeOfficeDrawingSetInputs()[0];
  if (!source.fileName.toLowerCase().endsWith(".dxf")) {
    throw new Error(`expected a DXF fixture, got ${source.fileName}`);
  }
  const content =
    typeof source.content === "string"
      ? source.content
      : source.content instanceof ArrayBuffer
        ? source.content.slice(0)
        : Uint8Array.from(source.content).buffer;
  return new File([content], source.fileName, { type: source.mimeType });
}

/**
 * Records every distinct text the feedback strip shows, in order. happy-dom
 * delivers MutationObserver callbacks as microtasks, and the workspace yields
 * a macrotask between its operation phases, so no phase is skipped.
 */
function recordFeedbackStrip(root: HTMLElement) {
  const labels: string[] = [];
  const record = () => {
    const text = root
      .querySelector('[data-testid="diagnosis-feedback"]')
      ?.textContent?.trim();
    if (text && labels.at(-1) !== text) labels.push(text);
  };
  const observer = new MutationObserver(record);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return {
    labels,
    record,
    stop: () => {
      record();
      observer.disconnect();
    },
  };
}

describe("EnergyDiagnosisWorkspace", () => {
  it("names the byte-read phase as its own operation label", () => {
    expect(operationLabel("read", "ko")).toBe("파일을 읽는 중…");
    expect(operationLabel("read", "en")).toBe("Reading files…");
    expect(operationLabel("read", "ko")).not.toBe(operationLabel("upload", "ko"));
  });

  it("reads dropped DXF files under a named byte-read phase, then ingests them", async () => {
    const onModelChange = vi.fn();
    const onDrawingSetIngested = vi.fn();
    const { container } = render(
      <EnergyDiagnosisWorkspace
        onModelChange={onModelChange}
        onDrawingSetIngested={onDrawingSetIngested}
      />,
    );
    const card = screen.getByTestId("drawing-drop-target");
    expect(card.getAttribute("data-drop-active")).toBeNull();
    expect(within(card).getByText(diagnosisCopy("ko").dropHint)).toBeTruthy();
    // The hero heading and the sr-only input stay where the pinned tests find them.
    expect(within(card).getByRole("heading", { name: "도면에서 진단까지, 한 흐름으로 시작하세요" })).toBeTruthy();
    expect(screen.getByTestId("drawing-set-input").getAttribute("accept")).toBe(".dxf");

    // A text drag crosses the card too, but the card is no target for it.
    fireEvent.dragEnter(card, TEXT_DRAG);
    expect(card.getAttribute("data-drop-active")).toBeNull();
    expect(card.className).not.toContain("border-ring");
    fireEvent.dragLeave(card, TEXT_DRAG);

    // Drag wash follows the pointer: on for the whole subtree, off on leave.
    fireEvent.dragEnter(card, FILE_DRAG);
    expect(card.getAttribute("data-drop-active")).toBe("true");
    expect(card.className).toContain("border-ring");
    const heading = within(card).getByRole("heading", { name: "도면에서 진단까지, 한 흐름으로 시작하세요" });
    fireEvent.dragEnter(heading, FILE_DRAG);
    fireEvent.dragLeave(heading, FILE_DRAG);
    expect(card.getAttribute("data-drop-active")).toBe("true");
    fireEvent.dragLeave(card, FILE_DRAG);
    expect(card.getAttribute("data-drop-active")).toBeNull();
    expect(card.className).not.toContain("border-ring");

    const strip = recordFeedbackStrip(container);
    fireEvent.dragEnter(card, FILE_DRAG);
    fireEvent.drop(
      card,
      fileDrop(representativeDxfFile(), new File(["notes"], "notes.pdf", { type: "application/pdf" })),
    );
    strip.record();
    // Synchronously after the drop the strip names the byte reads, not the ingestion.
    expect(card.getAttribute("data-drop-active")).toBeNull();
    const feedback = screen.getByTestId("diagnosis-feedback");
    expect(feedback.getAttribute("role")).toBe("status");
    expect(feedback.textContent).toContain("파일을 읽는 중…");
    expect(feedback.textContent).not.toContain("파일을 검증하고");

    await waitFor(() => expect(onModelChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("stage-panel-assumptions")).toBeTruthy());
    strip.stop();
    expect(onDrawingSetIngested).toHaveBeenCalledTimes(1);
    const [ingested] = onDrawingSetIngested.mock.calls[0];
    expect(ingested.drawingSet.documents.map((d: { fileName: string }) => d.fileName)).toEqual([
      "A101-office-floor-plan-rev-A.dxf",
    ]);

    // Phase order as shown: bytes read, then validation/assembly, then the outcome.
    const readIndex = strip.labels.indexOf("파일을 읽는 중…");
    const uploadIndex = strip.labels.indexOf("파일을 검증하고 도면 세트를 구성하는 중…");
    expect(readIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(readIndex);
    // The refused file is named beside the outcome instead of being dropped silently.
    // The sentence is scoped to the drop: the picker input takes SVG and PDF
    // sources (tests below push them through it), so "only DXF" would be false
    // of the workspace as a whole.
    const outcome = screen.getByTestId("diagnosis-feedback").textContent ?? "";
    expect(outcome).toContain("Tier 1 추정 모델을 만들었습니다");
    expect(outcome).toContain("notes.pdf: 끌어다 놓기는 DXF 파일만 받습니다");
    expect(screen.getByTestId("diagnosis-feedback").getAttribute("role")).toBe("status");
  }, 20_000);

  it("names a dropped non-DXF file in an alert instead of ingesting it", async () => {
    const onDrawingSetIngested = vi.fn();
    render(<EnergyDiagnosisWorkspace onDrawingSetIngested={onDrawingSetIngested} />);
    const card = screen.getByTestId("drawing-drop-target");
    fireEvent.drop(card, fileDrop(new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" })));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("x.pdf: 끌어다 놓기는 DXF 파일만 받습니다");
    expect(alert.getAttribute("data-testid")).toBe("diagnosis-feedback");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDrawingSetIngested).not.toHaveBeenCalled();
    expect(screen.queryByTestId("stage-panel-assumptions")).toBeNull();
    expect(screen.getByTestId("drawing-drop-target")).toBeTruthy();
  });

  it("keeps the refused file's name on the alert when the ingestion itself fails", async () => {
    render(<EnergyDiagnosisWorkspace />);
    const card = screen.getByTestId("drawing-drop-target");
    vi.mocked(ingestDrawingSet).mockRejectedValueOnce(new Error("Ingestion exploded"));
    fireEvent.drop(
      card,
      fileDrop(representativeDxfFile(), new File(["notes"], "notes.pdf", { type: "application/pdf" })),
    );
    // Both the failure and the refused name land on the one text the strip
    // shows (error wins over notice), so neither is lost behind the other.
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Ingestion exploded");
      expect(alert.textContent).toContain("notes.pdf: 끌어다 놓기는 DXF 파일만 받습니다");
    });
    expect(screen.getByTestId("diagnosis-feedback").getAttribute("role")).toBe("alert");
    expect(screen.queryByTestId("stage-panel-assumptions")).toBeNull();
    expect(screen.getByTestId("drawing-drop-target")).toBeTruthy();
  }, 20_000);

  it("shows no drop wash and takes no drop while an operation is running", async () => {
    const onDrawingSetIngested = vi.fn();
    render(<EnergyDiagnosisWorkspace onDrawingSetIngested={onDrawingSetIngested} />);
    const card = screen.getByTestId("drawing-drop-target");
    fireEvent.click(screen.getByRole("button", { name: "샘플 진단 시작" }));
    expect(screen.getByTestId("diagnosis-feedback").textContent).toContain(
      diagnosisCopy("ko").loadingReference,
    );

    // The card would refuse the drop, so it must not claim it.
    fireEvent.dragEnter(card, FILE_DRAG);
    expect(card.getAttribute("data-drop-active")).toBeNull();
    expect(card.className).not.toContain("border-ring");
    fireEvent.drop(card, fileDrop(representativeDxfFile()));
    expect(screen.getByTestId("diagnosis-feedback").textContent).toContain(
      diagnosisCopy("ko").loadingReference,
    );

    await waitFor(() => expect(screen.getByTestId("stage-panel-review")).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Only the sample's own drawing set reached the callback; a lone DXF drop
    // could never have produced its window schedule.
    expect(onDrawingSetIngested).toHaveBeenCalledTimes(1);
    const [ingested] = onDrawingSetIngested.mock.calls[0];
    expect(ingested.drawingSet.documents.map((d: { fileName: string }) => d.fileName)).toContain(
      "A601-window-schedule-rev-A.svg",
    );
  }, 20_000);

  it("gives each stage one name across the nav and its panel eyebrow", async () => {
    for (const locale of ["ko", "en"] as const) {
      expect(NAVIGATION_LABEL[locale].preflight).toBe(STAGE_LABEL[locale].preflight);
      expect(NAVIGATION_LABEL[locale].simulation).toBe(STAGE_LABEL[locale].simulation);
    }
    expect(NAVIGATION_STAGES.map((stage) => NAVIGATION_LABEL.ko[stage])).toEqual([
      "건물 입력",
      "건물 모델",
      "모델 검사",
      "시뮬레이션",
      "결과",
    ]);
    expect(NAVIGATION_LABEL.en.preflight).toBe("Preflight");

    const reference = await loadRepresentativeCase();
    render(<EnergyDiagnosisWorkspace initialModel={reference.model} />);
    const nav = screen.getByTestId("diagnosis-stage-nav");
    expect(nav.querySelectorAll('[data-testid^="diagnosis-stage-"]').length).toBe(5);
    for (const stage of ["preflight", "simulation"] as const) {
      const button = screen.getByTestId(`diagnosis-stage-${stage}`);
      expect(button.textContent?.endsWith(NAVIGATION_LABEL.ko[stage])).toBe(true);
      fireEvent.click(button);
      expect(button.getAttribute("aria-current")).toBe("step");
      const panel = screen.getByTestId(`stage-panel-${stage}`);
      expect(within(panel).getAllByText(STAGE_LABEL.ko[stage]).length).toBeGreaterThan(0);
    }
  });

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
    fireEvent.click(screen.getByRole("button", { name: "샘플 진단 시작" }));

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

    await waitFor(() =>
      expect(screen.getByTestId("stage-panel-compare")).toBeTruthy(),
    );
    expect(screen.getByTestId("next-diagnosis-action").textContent).toContain("프로젝트 저장");
    fireEvent.click(screen.getByTestId("toggle-improvement-editor"));
    fireEvent.change(screen.getByTestId("scenario-window-u-value"), {
      target: { value: "1.1" },
    });
    fireEvent.click(screen.getByTestId("run-improvement-scenario"));
    await waitFor(() => expect(onSimulationRun).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("stage-panel-compare")).toBeTruthy();
    expect(screen.getAllByText("개선 대안").length).toBeGreaterThan(0);
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
    expect(screen.getByRole("button", { name: "Start sample diagnostic" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Upload DXF drawing" }).length).toBeGreaterThan(0);
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
    const alternative = runImprovementScenario(completed.model, {
      windowUValueWPerM2K: 1.3,
    });
    const onSelectionChange = vi.fn();

    render(
      <EnergyDiagnosisWorkspace
        locale="en"
        initialModel={alternative.model}
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

    fireEvent.click(screen.getByTestId("diagnosis-stage-compare"));

    const resultSummary = screen.getByTestId("results-at-a-glance");
    const summaryFinding = within(resultSummary).getAllByTestId(
      /^results-glance-finding-/,
    )[0];
    fireEvent.click(summaryFinding);
    await waitFor(() => {
      const selection = onSelectionChange.mock.calls.at(-1)?.[0];
      expect(selection).toMatchObject({ kind: "diagnostic_finding" });
      expect(selection.canonicalObjectIds.length).toBeGreaterThan(0);
      expect(
        screen.getByTestId("selected-result-scene").getAttribute("data-run-id"),
      ).toBe(completed.run.id);
      expect(
        screen
          .getByTestId("selected-result-scene")
          .getAttribute("data-selection-kind"),
      ).toBe("diagnostic_finding");
    });

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

  it("marks a completed comparison as prior when the alternative draft changes", async () => {
    const reference = await loadRepresentativeCase();
    let ready = applyInfiltrationAssumption(reference.model);
    const conflict = ready.conflicts[0];
    if (!conflict.selectedFactId) {
      throw new Error("reference conflict has no visible selection");
    }
    ready = resolveVisibleConflict(ready, conflict.id, conflict.selectedFactId);
    const completed = runBaselineModel(ready);
    const alternative = runImprovementScenario(completed.model, {
      windowUValueWPerM2K: 1.3,
    });

    render(
      <EnergyDiagnosisWorkspace locale="en" initialModel={alternative.model} />,
    );
    fireEvent.click(screen.getByTestId("diagnosis-stage-compare"));

    expect(screen.getByTestId("comparison-scenario-current")).toBeTruthy();
    expect(screen.queryByTestId("results-glance-scenario-prior")).toBeNull();
    expect(
      screen.getAllByText(alternative.scenario.name, { exact: false }).length,
    ).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByTestId("toggle-improvement-editor"));
    const windowUValue = screen.getByTestId(
      "scenario-window-u-value",
    ) as HTMLInputElement;
    expect(windowUValue.value).toBe("1.3");

    fireEvent.change(windowUValue, { target: { value: "1.1" } });
    expect(screen.getByTestId("results-glance-scenario-prior")).toBeTruthy();
    expect(screen.getByTestId("comparison-scenario-prior")).toBeTruthy();
    expect(
      screen.getByTestId("comparison-evaluated-scenario").textContent,
    ).toContain(alternative.scenario.name);

    fireEvent.change(windowUValue, { target: { value: "1.3" } });
    expect(screen.queryByTestId("results-glance-scenario-prior")).toBeNull();
    expect(screen.queryByTestId("comparison-scenario-prior")).toBeNull();
    expect(screen.getByTestId("comparison-scenario-current")).toBeTruthy();
  });

  it("clears values absent from a restored scenario instead of retaining another draft", async () => {
    const reference = await loadRepresentativeCase();
    let ready = applyInfiltrationAssumption(reference.model);
    const conflict = ready.conflicts[0];
    if (!conflict.selectedFactId) {
      throw new Error("reference conflict has no visible selection");
    }
    ready = resolveVisibleConflict(ready, conflict.id, conflict.selectedFactId);
    const completed = runBaselineModel(ready);
    const windowAlternative = runImprovementScenario(completed.model, {
      windowUValueWPerM2K: 1.3,
    });
    const infiltrationAlternative = runImprovementScenario(completed.model, {
      infiltrationAch: 0.25,
    });
    await saveEnergyDiagnosticsBundle(
      infiltrationAlternative.model,
      reference.sources,
    );

    render(
      <EnergyDiagnosisWorkspace
        locale="en"
        initialModel={windowAlternative.model}
      />,
    );
    fireEvent.click(screen.getByTestId("diagnosis-stage-compare"));
    fireEvent.click(screen.getByTestId("toggle-improvement-editor"));
    expect(
      (screen.getByTestId("scenario-window-u-value") as HTMLInputElement)
        .value,
    ).toBe("1.3");

    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved project" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("diagnosis-feedback").textContent).toContain(
        "Restored the saved model",
      ),
    );
    expect(
      (screen.getByTestId("scenario-window-u-value") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Alternative infiltration rate",
        }) as HTMLInputElement
      ).value,
    ).toBe("0.25");
    expect(screen.queryByTestId("comparison-scenario-prior")).toBeNull();
    expect(screen.getByTestId("comparison-scenario-current")).toBeTruthy();
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
    const guidance = screen.getByTestId("tier-one-guidance");
    expect(guidance.textContent).toContain("How to fix:");
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
      screen.getByRole("button", { name: "Start sample diagnostic" }),
    ).toBeTruthy();
  });
});
