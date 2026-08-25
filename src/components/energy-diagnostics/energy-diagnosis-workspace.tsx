"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  CircleDotDashed,
  FileCheck2,
  FileStack,
  FolderOpen,
  Gauge,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  ScanSearch,
  Sparkles,
  Upload,
  Wind,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DegreeDaySimulationRun } from "@/lib/energy-diagnostics/adapter";
import {
  ingestDrawingSet,
  type DrawingSetIngestionResult,
  type DrawingSourceInput,
} from "@/lib/energy-diagnostics/ingestion";
import {
  listEnergyDiagnosticsProjects,
  loadEnergyDiagnosticsBundle,
  saveEnergyDiagnosticsBundle,
  type StoredEnergyDiagnosticsProjectSummary,
} from "@/lib/energy-diagnostics/storage";
import {
  acceptTierOneScreeningAssumption,
  buildTierOneCanonicalModel,
  isTierOneAssumptionPending,
  TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
  TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1,
  TIER_ONE_SCREENING_ASSUMPTION_ID,
  TIER_ONE_SCREENING_ENGINE_PATHS,
  type TierOneModelBuildOutcome,
} from "@/lib/energy-diagnostics/tier-one-model";
import type {
  CanonicalEnergyModel,
  DrawingDocumentType,
  EnergyFact,
  EnergyScenario,
  ReadinessCategory,
} from "@/lib/energy-diagnostics/types";
import {
  validateCanonicalEnergyModel,
  type CanonicalModelValidation,
} from "@/lib/energy-diagnostics/validation";

import {
  generateDiagnosticFindings,
  type DiagnosticFinding,
} from "@/lib/energy-diagnostics/findings";
import {
  analyzeRetrofitEconomics,
  type DiagnosticsRetrofitAnalysis,
  type ProgramTrack,
} from "@/lib/energy-diagnostics/retrofit-bridge";

import { diagnosisCopy } from "./copy";
import { EvidenceInspector } from "./evidence-inspector";
import { factKeyLabel, factStatusLabel } from "./fact-label";
import { FindingsPanel } from "./findings-panel";
import {
  applyInfiltrationAssumption,
  assignDocumentClassification,
  loadRepresentativeCase,
  mergeModelZones,
  resolveVisibleConflict,
  runBaselineModel,
  runImprovementScenario,
  spatialResultsForRun,
  splitModelZoneBySpace,
  type ImprovementScenarioValues,
} from "./model-operations";
import { tierOneGuidance } from "./tier-one-guidance";
import { ReadinessStrip } from "./readiness-strip";
import { RetrofitEconomicsPanel } from "./retrofit-economics-panel";
import {
  ResultComparison,
  type ResultMetric,
} from "./result-comparison";
import { ResultsAtAGlance } from "./results-at-a-glance";
import { SourceReviewCanvas } from "./source-review-canvas";
import type {
  DiagnosisLocale,
  DiagnosisSelection,
  EnergyDiagnosisWorkspaceProps,
} from "./types";

type WorkflowStage =
  | "drawings"
  | "review"
  | "model"
  | "assumptions"
  | "preflight"
  | "simulation"
  | "compare";

type Operation =
  | "reference"
  | "upload"
  | "baseline"
  | "scenario"
  | "save"
  | "reload"
  | null;

type ImprovementScenarioDraft = Readonly<{
  windowUValueWPerM2K: number | "";
  infiltrationAch: number | "";
  heatingCop: number | "";
  windowShgc: number | "";
  openingAreaScale: number | "";
}>;

const EMPTY_IMPROVEMENT_SCENARIO_DRAFT: ImprovementScenarioDraft = {
  windowUValueWPerM2K: "",
  infiltrationAch: "",
  heatingCop: "",
  windowShgc: "",
  openingAreaScale: "",
};

function numericReplacement(
  scenario: EnergyScenario,
  path: string,
): number | "" {
  const value = scenario.deltas.find((delta) => delta.path === path)
    ?.replacement.value;
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function improvementDraftForScenario(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario,
): ImprovementScenarioDraft {
  const windowIndex = model.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  const openingAreaDeltas = scenario.deltas.filter((delta) =>
    /^geometry\.openings\.\d+\.areaSqm$/.test(delta.path),
  );
  const openingAreaScales = openingAreaDeltas.flatMap((delta) => {
    const baselineValue = model.geometry.openings
      .map((opening) => opening.areaSqm)
      .find((fact) => fact.id === delta.baselineFactId)?.value;
    const replacementValue = delta.replacement.value;
    return typeof baselineValue === "number" &&
      Number.isFinite(baselineValue) &&
      baselineValue > 0 &&
      typeof replacementValue === "number" &&
      Number.isFinite(replacementValue)
      ? [replacementValue / baselineValue]
      : [];
  });
  const firstAreaScale = openingAreaScales[0];
  const areaScaleIsConsistent =
    openingAreaDeltas.length > 0 &&
    openingAreaScales.length === openingAreaDeltas.length &&
    firstAreaScale != null &&
    openingAreaScales.every(
      (candidate) =>
        Math.abs(candidate - firstAreaScale) <=
        Math.max(1, Math.abs(firstAreaScale)) * 1e-9,
    );

  return {
    windowUValueWPerM2K:
      windowIndex < 0
        ? ""
        : numericReplacement(
            scenario,
            `envelope.constructions.${windowIndex}.uValueWPerM2K`,
          ),
    infiltrationAch: numericReplacement(
      scenario,
      "envelope.infiltrationAirChangesPerHour",
    ),
    heatingCop: numericReplacement(
      scenario,
      "systems.hvac.0.heatingEfficiency",
    ),
    windowShgc:
      windowIndex < 0
        ? ""
        : numericReplacement(
            scenario,
            `envelope.constructions.${windowIndex}.shgc`,
          ),
    openingAreaScale: areaScaleIsConsistent ? firstAreaScale : "",
  };
}

function initialImprovementScenarioDraft(
  model: CanonicalEnergyModel | null,
): ImprovementScenarioDraft {
  if (!model) return EMPTY_IMPROVEMENT_SCENARIO_DRAFT;
  const run = model.simulationRuns.findLast(
    (candidate) =>
      candidate.scenarioId !== "baseline" && candidate.status === "succeeded",
  );
  const scenario = run
    ? model.scenarios.find((candidate) => candidate.id === run.scenarioId)
    : undefined;
  return scenario
    ? improvementDraftForScenario(model, scenario)
    : EMPTY_IMPROVEMENT_SCENARIO_DRAFT;
}

function finiteDraftValue(value: number | ""): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function expectedScenarioReplacements(
  model: CanonicalEnergyModel,
  draft: ImprovementScenarioDraft,
): ReadonlyMap<string, number> | null {
  const replacements = new Map<string, number>();
  const windowIndex = model.envelope.constructions.findIndex(
    (construction) => construction.kind === "window",
  );
  if (finiteDraftValue(draft.windowUValueWPerM2K)) {
    if (windowIndex < 0) return null;
    replacements.set(
      `envelope.constructions.${windowIndex}.uValueWPerM2K`,
      draft.windowUValueWPerM2K,
    );
  } else if (draft.windowUValueWPerM2K !== "") {
    return null;
  }
  if (finiteDraftValue(draft.windowShgc)) {
    if (windowIndex < 0) return null;
    replacements.set(
      `envelope.constructions.${windowIndex}.shgc`,
      draft.windowShgc,
    );
  } else if (draft.windowShgc !== "") {
    return null;
  }
  if (finiteDraftValue(draft.infiltrationAch)) {
    replacements.set(
      "envelope.infiltrationAirChangesPerHour",
      draft.infiltrationAch,
    );
  } else if (draft.infiltrationAch !== "") {
    return null;
  }
  if (finiteDraftValue(draft.heatingCop)) {
    replacements.set("systems.hvac.0.heatingEfficiency", draft.heatingCop);
  } else if (draft.heatingCop !== "") {
    return null;
  }
  const openingAreaScale = draft.openingAreaScale;
  if (finiteDraftValue(openingAreaScale)) {
    model.geometry.openings.forEach((opening, index) => {
      const baselineValue = opening.areaSqm.value;
      if (typeof baselineValue !== "number" || !Number.isFinite(baselineValue)) {
        return;
      }
      replacements.set(
        `geometry.openings.${index}.areaSqm`,
        baselineValue * openingAreaScale,
      );
    });
  } else if (openingAreaScale !== "") {
    return null;
  }
  return replacements;
}

function scenarioMatchesImprovementDraft(
  model: CanonicalEnergyModel,
  scenario: EnergyScenario,
  draft: ImprovementScenarioDraft,
): boolean {
  const expected = expectedScenarioReplacements(model, draft);
  if (!expected || expected.size !== scenario.deltas.length) return false;
  return scenario.deltas.every((delta) => {
    const expectedValue = expected.get(delta.path);
    const evaluatedValue = delta.replacement.value;
    return (
      expectedValue != null &&
      typeof evaluatedValue === "number" &&
      Number.isFinite(evaluatedValue) &&
      Math.abs(expectedValue - evaluatedValue) <=
        Math.max(1, Math.abs(evaluatedValue)) * 1e-9
    );
  });
}

const NAVIGATION_STAGES = [
  "drawings",
  "model",
  "preflight",
  "simulation",
  "compare",
] as const satisfies readonly WorkflowStage[];

const NAVIGATION_LABEL: Record<
  DiagnosisLocale,
  Record<(typeof NAVIGATION_STAGES)[number], string>
> = {
  ko: {
    drawings: "건물 입력",
    model: "건물 모델",
    preflight: "검증",
    simulation: "진단 실행",
    compare: "결과",
  },
  en: {
    drawings: "Building input",
    model: "Building model",
    preflight: "Validate",
    simulation: "Run diagnostic",
    compare: "Results",
  },
};

function navigationStage(stage: WorkflowStage): (typeof NAVIGATION_STAGES)[number] {
  if (stage === "review") return "drawings";
  if (stage === "assumptions") return "preflight";
  return stage;
}

const STAGE_LABEL: Record<DiagnosisLocale, Record<WorkflowStage, string>> = {
  ko: {
    drawings: "도면 세트",
    review: "추출 검토",
    model: "건물 모델",
    assumptions: "가정 및 누락값",
    preflight: "모델 검사",
    simulation: "시뮬레이션",
    compare: "진단 결과",
  },
  en: {
    drawings: "Drawing set",
    review: "Extraction review",
    model: "Building model",
    assumptions: "Assumptions",
    preflight: "Preflight",
    simulation: "Run diagnostic",
    compare: "Diagnostic results",
  },
};

const DOCUMENT_LABEL: Record<DiagnosisLocale, Partial<Record<DrawingDocumentType, string>>> = {
  ko: {
    site_plan: "배치도",
    floor_plan: "평면도",
    elevation: "입면도",
    section: "단면도",
    window_schedule: "창호 일람표",
    wall_detail: "외벽 상세",
    hvac_equipment_schedule: "공조 장비 일람표",
    lighting_plan: "조명 평면도",
    material_schedule: "재료 일람표",
    unknown: "미분류",
  },
  en: {
    site_plan: "Site plan",
    floor_plan: "Floor plan",
    elevation: "Elevation",
    section: "Section",
    window_schedule: "Window schedule",
    wall_detail: "Wall detail",
    hvac_equipment_schedule: "HVAC schedule",
    lighting_plan: "Lighting plan",
    material_schedule: "Material schedule",
    unknown: "Unclassified",
  },
};

function documentTypeLabel(type: DrawingDocumentType, locale: DiagnosisLocale): string {
  return DOCUMENT_LABEL[locale][type] ?? type.replaceAll("_", " ");
}

function factValue(fact: EnergyFact<unknown>): string {
  if (fact.value == null) return "—";
  if (typeof fact.value === "number") {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(fact.value)}${fact.unit ? ` ${fact.unit}` : ""}`;
  }
  if (Array.isArray(fact.value)) return `${fact.value.length} items`;
  return String(fact.value);
}

function operationLabel(operation: Exclude<Operation, null>, locale: DiagnosisLocale): string {
  const copy = diagnosisCopy(locale);
  if (operation === "reference") return copy.loadingReference;
  if (operation === "upload") return copy.readingFiles;
  if (operation === "baseline" || operation === "scenario") return copy.running;
  if (operation === "save") return locale === "ko" ? "프로젝트를 저장하는 중…" : "Saving project…";
  return locale === "ko" ? "저장본을 여는 중…" : "Loading saved project…";
}

function sceneObjectIds(model: CanonicalEnergyModel, canonicalId: string): readonly string[] {
  const mapped = model.mappings.find(
    (mapping) => mapping.canonicalObjectId === canonicalId,
  )?.threeObjectIds ?? [];
  if (mapped.length > 0) return mapped;
  const surface = model.geometry.surfaces.find(
    (candidate) => candidate.id === canonicalId,
  );
  if (surface?.threeObjectId) return [surface.threeObjectId];
  const opening = model.geometry.openings.find(
    (candidate) => candidate.id === canonicalId,
  );
  return opening?.threeObjectId ? [opening.threeObjectId] : [];
}

function diagnosticOverlayObjectIds(
  model: CanonicalEnergyModel,
  canonicalIds: readonly string[],
): readonly string[] {
  const ids = new Set<string>();
  for (const canonicalId of canonicalIds) {
    if (canonicalId === model.building.id) {
      ids.add("envelope-shell:Walls");
      ids.add("envelope-shell:Windows");
      ids.add("envelope-shell:Roof");
      ids.add("envelope-shell:Ground Floor");
      continue;
    }
    const surface = model.geometry.surfaces.find(
      (candidate) => candidate.id === canonicalId,
    );
    if (surface) {
      if (sceneObjectIds(model, surface.id).length > 0) continue;
      if (surface.type === "exterior_wall") ids.add("envelope-shell:Walls");
      if (surface.type === "roof") ids.add("envelope-shell:Roof");
      if (surface.type === "ground_floor") {
        ids.add("envelope-shell:Ground Floor");
      }
      continue;
    }
    const opening = model.geometry.openings.find(
      (candidate) => candidate.id === canonicalId,
    );
    if (opening) {
      const hostIds = sceneObjectIds(model, opening.hostSurfaceId);
      if (hostIds.length > 0) {
        for (const hostId of hostIds) ids.add(hostId);
      } else {
        ids.add("envelope-shell:Windows");
      }
    }
  }
  return [...ids];
}

function mappingsForSourceIds(
  model: CanonicalEnergyModel,
  sourceIds: readonly string[],
) {
  const ids = new Set(sourceIds);
  return model.mappings.filter((mapping) =>
    mapping.sourceEntityRefs.some((source) => ids.has(source.id)),
  );
}

function stageComplete(
  stage: WorkflowStage,
  model: CanonicalEnergyModel | null,
  ingestion: DrawingSetIngestionResult | null,
  validation: CanonicalModelValidation | null,
  baselineRun: DegreeDaySimulationRun | null,
): boolean {
  if (stage === "drawings") {
    return Boolean(
      (ingestion || model?.drawingSet.documents.length) &&
        model?.drawingSet.documents.every(
          (document) => document.classification.documentType !== "unknown",
        ),
    );
  }
  if (stage === "review") return Boolean(model && model.conflicts.every((conflict) => conflict.resolutionStatus !== "unresolved"));
  if (stage === "model") {
    return Boolean(
      model &&
        model.geometry.thermalZones.length > 0 &&
        model.envelope.constructions.length > 0 &&
        model.envelope.infiltrationAirChangesPerHour.value != null &&
        model.systems.hvac.length > 0,
    );
  }
  if (stage === "assumptions") return Boolean(model && model.missingValues.every((missing) => !missing.blocking));
  if (stage === "preflight") return validation?.validForSimulation ?? false;
  if (stage === "simulation") return baselineRun?.status === "succeeded";
  return baselineRun?.status === "succeeded";
}

async function nextPaint(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function IngestionOnlyReview({
  ingestion,
  locale,
}: Readonly<{ ingestion: DrawingSetIngestionResult; locale: DiagnosisLocale }>) {
  const boundary = ingestion.extractedBoundaries[0]?.polygon.value;
  return (
    <div className="grid min-h-[430px] place-items-center bg-[#071a29] p-6 text-slate-100" data-testid="ingestion-only-review">
      <div className="w-full max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">
          {locale === "ko" ? "분류·추출 완료 / 모델 생성 대기" : "CLASSIFIED & EXTRACTED / MODEL GENERATION PENDING"}
        </p>
        <h3 className="mt-2 text-xl font-semibold">{ingestion.drawingSet.name}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {locale === "ko"
            ? "도면 원본과 추출 결과는 보존되었습니다. 이 파일 세트에는 아직 검토된 정규 에너지 모델이 없으므로 시뮬레이션 수치는 표시하지 않습니다."
            : "The sources and extraction are preserved. This set does not yet have a reviewed canonical energy model, so no simulation values are shown."}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [locale === "ko" ? "허용 도면" : "Accepted", ingestion.drawingSet.documents.length],
            [locale === "ko" ? "경계" : "Boundaries", ingestion.extractedBoundaries.length],
            [locale === "ko" ? "추출값" : "Facts", ingestion.extractedFacts.length],
            [locale === "ko" ? "충돌" : "Conflicts", ingestion.conflicts.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="border border-slate-600 bg-slate-900/50 p-3">
              <p className="font-mono text-2xl font-semibold text-white">{value}</p>
              <p className="mt-1 text-[10px] text-slate-400">{label}</p>
            </div>
          ))}
        </div>
        {boundary && (
          <p className="mt-4 border-l-2 border-cyan-400 pl-3 font-mono text-[10px] text-slate-300">
            {locale === "ko" ? "실제 벡터 경계" : "Real vector boundary"}: {boundary.length} pts
          </p>
        )}
      </div>
    </div>
  );
}

export function EnergyDiagnosisWorkspace({
  className,
  locale: localeProp,
  initialModel = null,
  autoLoadSample = false,
  restoreProjectId,
  initialDrawingSources = [],
  showSampleOption = true,
  renderScene,
  onModelChange,
  onDrawingSetIngested,
  onSelectionChange,
  onSimulationRun,
  onProjectSaved,
}: EnergyDiagnosisWorkspaceProps) {
  const locale = localeProp ?? initialModel?.project.locale ?? "ko";
  const copy = diagnosisCopy(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const automaticEntryStartedRef = useRef(false);
  const lastInitialModelPropRef = useRef(initialModel);
  const priorModelReviewRef = useRef<Readonly<{
    ingestion: DrawingSetIngestionResult | null;
    sources: readonly DrawingSourceInput[];
    selectedDocumentId: string | null;
    selectedFact: EnergyFact<unknown> | null;
  }> | null>(null);
  const simulationInFlightRef = useRef(false);
  const initialScenarioDraftRef = useRef<ImprovementScenarioDraft | null>(null);
  if (initialScenarioDraftRef.current == null) {
    initialScenarioDraftRef.current = initialImprovementScenarioDraft(initialModel);
  }
  const initialScenarioDraft = initialScenarioDraftRef.current;
  const [model, setModel] = useState<CanonicalEnergyModel | null>(initialModel);
  const [ingestion, setIngestion] = useState<DrawingSetIngestionResult | null>(null);
  const [sources, setSources] = useState<readonly DrawingSourceInput[]>([]);
  const [activeStage, setActiveStage] = useState<WorkflowStage>(initialModel ? "review" : "drawings");
  const [activeView, setActiveView] = useState<"source" | "model">("source");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    initialModel?.drawingSet.documents[0]?.id ?? null,
  );
  const [selectedFact, setSelectedFact] = useState<EnergyFact<unknown> | null>(null);
  const [selection, setSelection] = useState<DiagnosisSelection | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioUValue, setScenarioUValue] = useState<number | "">(
    initialScenarioDraft.windowUValueWPerM2K,
  );
  const [scenarioAch, setScenarioAch] = useState<number | "">(
    initialScenarioDraft.infiltrationAch,
  );
  const [scenarioCop, setScenarioCop] = useState<number | "">(
    initialScenarioDraft.heatingCop,
  );
  const [scenarioShgc, setScenarioShgc] = useState<number | "">(
    initialScenarioDraft.windowShgc,
  );
  const [scenarioAreaScale, setScenarioAreaScale] = useState<number | "">(
    initialScenarioDraft.openingAreaScale,
  );
  const [tierOneOutcome, setTierOneOutcome] =
    useState<TierOneModelBuildOutcome | null>(null);
  const [zoneSelection, setZoneSelection] = useState<readonly string[]>([]);
  const [programTrack, setProgramTrack] = useState<ProgramTrack>("none");
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [improvementEditorOpen, setImprovementEditorOpen] = useState(false);
  const [recentSavedProject, setRecentSavedProject] =
    useState<StoredEnergyDiagnosticsProjectSummary | null>(null);

  useEffect(() => {
    if (initialModel === lastInitialModelPropRef.current) return;
    lastInitialModelPropRef.current = initialModel;
    if (
      !initialModel ||
      (initialModel === model) ||
      (initialModel.id === model?.id &&
        initialModel.modelVersion === model.modelVersion &&
        initialModel.updatedAt === model.updatedAt)
    ) {
      return;
    }
    setModel(initialModel);
    setSelectedDocumentId(initialModel.drawingSet.documents[0]?.id ?? null);
  }, [initialModel, model]);

  useEffect(() => {
    if (model) return;
    let cancelled = false;
    void listEnergyDiagnosticsProjects()
      .then((projects) => {
        if (!cancelled) setRecentSavedProject(projects[0] ?? null);
      })
      .catch(() => {
        // Project discovery is a convenience path. A storage error is surfaced
        // if the user explicitly asks to save/reload, not as an empty-state
        // error before they have taken an action.
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  const validation = useMemo(
    () => (model ? validateCanonicalEnergyModel(model) : null),
    [model],
  );
  const baselineRun = useMemo(
    () =>
      (model?.simulationRuns.findLast((run) => run.scenarioId === "baseline") as
        | DegreeDaySimulationRun
        | undefined) ?? null,
    [model],
  );
  const scenarioRun = useMemo(
    () =>
      (model?.simulationRuns.findLast((run) => run.scenarioId !== "baseline") as
        | DegreeDaySimulationRun
        | undefined) ?? null,
    [model],
  );
  const explicitlySelectedRun = model?.simulationRuns.find(
    (run) => run.id === selectedRunId && run.status === "succeeded",
  ) as DegreeDaySimulationRun | undefined;
  const selectedSuccessfulRun = explicitlySelectedRun ??
    (scenarioRun?.status === "succeeded"
      ? scenarioRun
      : baselineRun?.status === "succeeded"
        ? baselineRun
        : null);
  const spatialResults = useMemo(
    () => spatialResultsForRun(selectedSuccessfulRun),
    [selectedSuccessfulRun],
  );

  const emitModel = useCallback(
    (next: CanonicalEnergyModel) => {
      setModel(next);
      setSelectedRunId((current) =>
        current && next.simulationRuns.some((run) => run.id === current)
          ? current
          : null,
      );
      setSelectedFindingId(null);
      setSelection(null);
      onSelectionChange?.(null);
      onModelChange?.(next);
    },
    [onModelChange, onSelectionChange],
  );

  const emitSelection = useCallback(
    (next: DiagnosisSelection | null) => {
      setSelection(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const selectDocument = useCallback(
    (documentId: string) => {
      setSelectedFindingId(null);
      setSelectedDocumentId(documentId);
      setActiveView("source");
      if (!model) return;
      emitSelection({
        kind: "document",
        id: documentId,
        documentId,
        canonicalObjectIds: [],
        threeObjectIds: [],
      });
    },
    [emitSelection, model],
  );

  const selectFact = useCallback(
    (fact: EnergyFact<unknown>) => {
      setSelectedFindingId(null);
      setSelectedFact(fact);
      const source = fact.sourceRefs[0];
      if (source) setSelectedDocumentId(source.documentId);
      const mappings = model
        ? mappingsForSourceIds(
            model,
            fact.sourceRefs.map((candidate) => candidate.id),
          )
        : [];
      emitSelection({
        kind: "energy_fact",
        id: fact.id,
        documentId: source?.documentId ?? null,
        fact,
        canonicalObjectIds: mappings.map((mapping) => mapping.canonicalObjectId),
        threeObjectIds: [
          ...new Set([
            ...mappings.flatMap((mapping) => mapping.threeObjectIds),
            ...(source?.linked3dObjectId ? [source.linked3dObjectId] : []),
          ]),
        ],
      });
    },
    [emitSelection, model],
  );

  const selectSourceReference = useCallback(
    (sourceReference: EnergyFact<unknown>["sourceRefs"][number]) => {
      if (!model) return;
      setSelectedFindingId(null);
      setSelectedDocumentId(sourceReference.documentId);
      setActiveView("source");
      const mappings = mappingsForSourceIds(model, [sourceReference.id]);
      emitSelection({
        kind: "source_reference",
        id: sourceReference.id,
        documentId: sourceReference.documentId,
        sourceReference,
        canonicalObjectIds: mappings.map((mapping) => mapping.canonicalObjectId),
        threeObjectIds: [
          ...new Set([
            ...mappings.flatMap((mapping) => mapping.threeObjectIds),
            ...(sourceReference.linked3dObjectId
              ? [sourceReference.linked3dObjectId]
              : []),
          ]),
        ],
      });
    },
    [emitSelection, model],
  );

  const selectZone = useCallback(
    (zoneId: string) => {
      if (!model) return;
      setSelectedFindingId(null);
      const mapping = model.mappings.find(
        (candidate) => candidate.canonicalObjectId === zoneId,
      );
      const sourceIds = new Set(
        mapping?.sourceEntityRefs.map((source) => source.id) ?? [],
      );
      const supportingFact = model.facts.find((fact) =>
        fact.sourceRefs.some((source) => sourceIds.has(source.id)),
      );
      const sourceDocument =
        supportingFact?.sourceRefs[0]?.documentId ??
        mapping?.sourceEntityRefs[0]?.documentId;
      if (supportingFact) setSelectedFact(supportingFact);
      if (sourceDocument) setSelectedDocumentId(sourceDocument);
      emitSelection({
        kind: "thermal_zone",
        id: zoneId,
        documentId: sourceDocument ?? null,
        canonicalObjectIds: [zoneId],
        threeObjectIds: sceneObjectIds(model, zoneId),
      });
    },
    [emitSelection, model],
  );

  const selectFinding = useCallback(
    (finding: DiagnosticFinding) => {
      if (!model) return;
      const supportingFact = finding.relatedFactIds
        .map((id) => model.facts.find((fact) => fact.id === id))
        .find((fact) => fact != null);
      const sourceReference =
        supportingFact?.sourceRefs[0] ?? finding.relatedSourceRefs[0];
      if (supportingFact) setSelectedFact(supportingFact);
      if (sourceReference) setSelectedDocumentId(sourceReference.documentId);

      const canonicalObjectIds = [...new Set(finding.affectedObjectIds)];
      const threeObjectIds = [
        ...new Set(
          [
            ...canonicalObjectIds.flatMap((canonicalId) =>
              sceneObjectIds(model, canonicalId),
            ),
            ...diagnosticOverlayObjectIds(model, canonicalObjectIds),
          ],
        ),
      ];
      setSelectedFindingId(finding.id);
      setActiveView("model");
      emitSelection({
        kind: "diagnostic_finding",
        id: finding.id,
        documentId: sourceReference?.documentId ?? null,
        canonicalObjectIds,
        threeObjectIds,
      });
    },
    [emitSelection, model],
  );

  const canEvaluateFinding = useCallback(
    (finding: DiagnosticFinding) => {
      if (!model || !finding.impactSimulated) return false;
      if (finding.id === "finding:infiltration-share") return true;
      const openingIds = new Set(
        model.geometry.openings.map((opening) => opening.id),
      );
      return finding.affectedObjectIds.some((id) => openingIds.has(id));
    },
    [model],
  );
  const evaluatedScenario = useMemo(
    () =>
      scenarioRun
        ? model?.scenarios.find(
            (candidate) => candidate.id === scenarioRun.scenarioId,
          ) ?? null
        : null,
    [model, scenarioRun],
  );
  const scenarioDraft = useMemo<ImprovementScenarioDraft>(
    () => ({
      windowUValueWPerM2K: scenarioUValue,
      infiltrationAch: scenarioAch,
      heatingCop: scenarioCop,
      windowShgc: scenarioShgc,
      openingAreaScale: scenarioAreaScale,
    }),
    [
      scenarioAch,
      scenarioAreaScale,
      scenarioCop,
      scenarioShgc,
      scenarioUValue,
    ],
  );
  const scenarioComparisonIsPrior = Boolean(
    scenarioRun?.status === "succeeded" &&
      scenarioRun.result != null &&
      (!model ||
        !evaluatedScenario ||
        !scenarioMatchesImprovementDraft(
          model,
          evaluatedScenario,
          scenarioDraft,
        )),
  );

  const evaluateFinding = useCallback(
    (finding: DiagnosticFinding) => {
      if (!model || !canEvaluateFinding(finding)) return;
      selectFinding(finding);
      setScenarioUValue("");
      setScenarioAch("");
      setScenarioCop("");
      setScenarioShgc("");
      setScenarioAreaScale("");
      setActiveStage("compare");
      setImprovementEditorOpen(true);
      setNotice(
        finding.id === "finding:infiltration-share"
          ? locale === "ko"
            ? "대안 침기율을 입력하세요. 값을 입력하기 전에는 어떤 개선 효과도 계산하지 않습니다."
            : "Enter a proposed infiltration rate. No improvement effect is calculated until you provide a value and run the alternative."
          : locale === "ko"
            ? "대안 창호 U값, SHGC 또는 면적 비율을 입력하세요. 값을 입력하기 전에는 어떤 개선 효과도 계산하지 않습니다."
            : "Enter a proposed window U-value, SHGC, or glazing-area scale. No improvement effect is calculated until you provide a value and run the alternative.",
      );
    },
    [canEvaluateFinding, locale, model, selectFinding],
  );

  const selectBaselineFinding = useCallback(
    (finding: DiagnosticFinding) => {
      if (baselineRun?.status !== "succeeded") return;
      setSelectedRunId(baselineRun.id);
      selectFinding(finding);
    },
    [baselineRun, selectFinding],
  );

  const evaluateBaselineFinding = useCallback(
    (finding: DiagnosticFinding) => {
      if (baselineRun?.status !== "succeeded") return;
      setSelectedRunId(baselineRun.id);
      evaluateFinding(finding);
    },
    [baselineRun, evaluateFinding],
  );

  const loadReference = useCallback(async () => {
    setOperation("reference");
    setError(null);
    setNotice(null);
    await nextPaint();
    try {
      const reference = await loadRepresentativeCase();
      setIngestion(reference.ingestion);
      setSources(reference.sources);
      priorModelReviewRef.current = null;
      emitModel(reference.model);
      onDrawingSetIngested?.(reference.ingestion, reference.sources);
      const firstPlan = reference.ingestion.drawingSet.documents.find(
        (document) => document.classification.documentType === "floor_plan",
      );
      setSelectedDocumentId(firstPlan?.id ?? reference.model.drawingSet.documents[0]?.id ?? null);
      const firstConflict = reference.model.conflicts[0];
      const conflictFact = firstConflict?.candidates.find(
        (candidate) => candidate.fact.id === firstConflict.selectedFactId,
      )?.fact;
      if (conflictFact) setSelectedFact(conflictFact);
      setActiveStage("review");
      setActiveView("source");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reference case could not be loaded.");
    } finally {
      setOperation(null);
    }
  }, [emitModel, onDrawingSetIngested]);

  const ingestSources = useCallback(
    async (
      uploadedSources: readonly DrawingSourceInput[],
      setName: string,
    ) => {
      if (uploadedSources.length === 0) return;
      setOperation("upload");
      setError(null);
      setNotice(null);
      await nextPaint();
      try {
        const result = await ingestDrawingSet(uploadedSources, {
          setName,
          ingestedAt: new Date().toISOString(),
        });
        const uploadOutcome = buildTierOneCanonicalModel(result, locale);
        const tierOneModel =
          !model && uploadOutcome.status === "created" ? uploadOutcome.model : null;
        setTierOneOutcome(uploadOutcome);
        if (model && (!ingestion || ingestion.drawingSet.id === model.drawingSet.id)) {
          priorModelReviewRef.current = {
            ingestion,
            sources,
            selectedDocumentId,
            selectedFact,
          };
        }
        setIngestion(result);
        setSources(uploadedSources);
        onDrawingSetIngested?.(result, uploadedSources);
        setSelectedDocumentId(result.drawingSet.documents[0]?.id ?? null);
        setSelectedFact(
          tierOneModel?.geometry.floorPlates[0]?.boundary ??
            result.extractedFacts[0] ??
            null,
        );
        if (tierOneModel) {
          emitModel(tierOneModel);
          setActiveStage("assumptions");
          setNotice(
            locale === "ko"
              ? "벡터 경계로 Tier 1 추정 모델을 만들었습니다. 모든 비도면 입력은 화면에 표시된 스크리닝 가정입니다."
              : "Created a Tier-1 estimate from the vector boundary. Every non-drawing input is a visible screening assumption.",
          );
        } else {
          setActiveStage("drawings");
        }
        setActiveView("source");
        if (model) {
          setNotice(
            locale === "ko"
              ? "새 도면은 검토용으로 분리했습니다. 현재 모델과 실행 결과는 변경되지 않았습니다."
              : "The new drawings are staged for review. The current model and runs are unchanged.",
          );
        } else if (uploadOutcome.status === "extraction_only") {
          setNotice(tierOneGuidance(uploadOutcome.reason, locale).what);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Drawing ingestion failed.");
      } finally {
        setOperation(null);
      }
    },
    [emitModel, ingestion, locale, model, onDrawingSetIngested, selectedDocumentId, selectedFact, sources],
  );

  const handleFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;
      const uploadedSources: DrawingSourceInput[] = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          content: await file.arrayBuffer(),
        })),
      );
      await ingestSources(
        uploadedSources,
        files.length === 1
          ? files[0].name
          : `${files[0].name} +${files.length - 1}`,
      );
    },
    [ingestSources],
  );

  const returnToCurrentModel = useCallback(() => {
    if (!model) return;
    const previous = priorModelReviewRef.current;
    setIngestion(previous?.ingestion ?? null);
    setSources(previous?.sources ?? []);
    setSelectedDocumentId(
      previous?.selectedDocumentId ?? model.drawingSet.documents[0]?.id ?? null,
    );
    setSelectedFact(previous?.selectedFact ?? null);
    setActiveStage("review");
    setActiveView("source");
    setNotice(
      locale === "ko"
        ? "현재 정규 모델로 돌아왔습니다. 검토 중이던 새 파일은 모델에 적용되지 않았습니다."
        : "Returned to the current canonical model. The staged files were not applied.",
    );
    priorModelReviewRef.current = null;
  }, [locale, model]);

  const assignDocumentType = useCallback(
    (documentId: string, documentType: DrawingDocumentType) => {
      if (!ingestion) return;
      const updated = assignDocumentClassification(ingestion, documentId, documentType);
      setIngestion(updated);
      const outcome = buildTierOneCanonicalModel(updated, locale);
      setTierOneOutcome(outcome);
      if (outcome.status === "created" && !model) {
        priorModelReviewRef.current = null;
        emitModel(outcome.model);
        setSelectedFact(outcome.model.geometry.floorPlates[0]?.boundary ?? null);
        setActiveStage("assumptions");
        setNotice(
          locale === "ko"
            ? "도면 유형을 확인했습니다. 추출된 외곽선으로 Tier-1 추정 모델을 만들었습니다. 모든 비도면 입력은 화면에 표시된 스크리닝 가정입니다."
            : "Document type confirmed. A Tier-1 estimate was built from the extracted boundary; every non-drawing input is a visible screening assumption.",
        );
        return;
      }
      if (outcome.status === "extraction_only") {
        const guidance = tierOneGuidance(outcome.reason, locale);
        setNotice(`${guidance.what} ${guidance.fix}`);
        return;
      }
      setNotice(
        locale === "ko"
          ? "도면 유형을 기록했습니다. ‘이 도면으로 새 진단 시작’을 누르면 현재 모델을 대체합니다."
          : "Document type recorded. Use “Start a new diagnosis from this drawing” to replace the current model.",
      );
    },
    [emitModel, ingestion, locale, model],
  );

  const adoptStagedTierOneModel = useCallback(() => {
    if (!ingestion) return;
    const outcome = buildTierOneCanonicalModel(ingestion, locale);
    setTierOneOutcome(outcome);
    if (outcome.status !== "created") {
      const guidance = tierOneGuidance(outcome.reason, locale);
      setError(`${guidance.what} ${guidance.fix}`);
      return;
    }
    priorModelReviewRef.current = null;
    emitModel(outcome.model);
    setSelectedFact(outcome.model.geometry.floorPlates[0]?.boundary ?? null);
    setActiveStage("assumptions");
    setNotice(
      locale === "ko"
        ? "새 도면 세트로 Tier-1 진단을 시작했습니다. 이전 모델은 저장본에서 다시 열 수 있습니다."
        : "Started a Tier-1 diagnosis from the new drawing set. The previous model remains available from its saved copy.",
    );
  }, [emitModel, ingestion, locale]);

  const toggleZoneSelection = useCallback((zoneId: string) => {
    setZoneSelection((current) =>
      current.includes(zoneId)
        ? current.filter((id) => id !== zoneId)
        : [...current, zoneId],
    );
  }, []);

  const mergeSelectedZones = useCallback(() => {
    if (!model || zoneSelection.length < 2) return;
    try {
      const names = model.geometry.thermalZones
        .filter((zone) => zoneSelection.includes(zone.id))
        .map((zone) => zone.name.value ?? zone.stableKey);
      const next = mergeModelZones(
        model,
        zoneSelection,
        locale === "ko"
          ? `병합 구역 (${names.join(" + ")})`
          : `Merged zone (${names.join(" + ")})`,
      );
      emitModel(next);
      setZoneSelection([]);
      setNotice(
        locale === "ko"
          ? "열구역을 병합했습니다. 구역별 결과를 보려면 기준안을 다시 실행하세요."
          : "Zones merged. Re-run the baseline to refresh zone-level results.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Zone merge failed.");
    }
  }, [emitModel, locale, model, zoneSelection]);

  const splitZone = useCallback(
    (zoneId: string) => {
      if (!model) return;
      try {
        const next = splitModelZoneBySpace(model, zoneId);
        emitModel(next);
        setZoneSelection([]);
        setNotice(
          locale === "ko"
            ? "열구역을 공간별로 분리했습니다. 구역별 결과를 보려면 기준안을 다시 실행하세요."
            : "Zone split by space. Re-run the baseline to refresh zone-level results.",
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Zone split failed.");
      }
    },
    [emitModel, locale, model],
  );

  const applyAssumption = useCallback(() => {
    if (!model) return;
    const tierOnePending = isTierOneAssumptionPending(model);
    const next = tierOnePending
      ? acceptTierOneScreeningAssumption(model)
      : applyInfiltrationAssumption(model);
    emitModel(next);
    setSelectedFact(
      tierOnePending
        ? next.facts.find(
            (fact) => fact.assumptionId === TIER_ONE_SCREENING_ASSUMPTION_ID,
          ) ?? null
        : next.envelope.infiltrationAirChangesPerHour,
    );
    setNotice(locale === "ko" ? "가정이 입력 근거와 함께 기록되었습니다." : "The assumption and its origin were recorded.");
  }, [emitModel, locale, model]);

  const resolveConflict = useCallback(
    (conflictId: string, factId: string) => {
      if (!model) return;
      const next = resolveVisibleConflict(model, conflictId, factId);
      emitModel(next);
      setSelectedFact(next.facts.find((fact) => fact.id === factId) ?? null);
      setNotice(locale === "ko" ? "충돌 선택과 검토자가 기록되었습니다." : "Conflict selection and review were recorded.");
    },
    [emitModel, locale, model],
  );

  const runBaseline = useCallback(async () => {
    if (!model || simulationInFlightRef.current) return;
    simulationInFlightRef.current = true;
    setOperation("baseline");
    setError(null);
    setNotice(null);
    await nextPaint();
    try {
      const completed = runBaselineModel(model);
      emitModel(completed.model);
      onSimulationRun?.(completed.run);
      if (completed.run.status !== "succeeded") {
        setError(completed.run.error?.message ?? copy.simulationFailed);
      } else {
        setSelectedRunId(completed.run.id);
        setActiveStage("compare");
        setActiveView("model");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.simulationFailed);
    } finally {
      simulationInFlightRef.current = false;
      setOperation(null);
    }
  }, [copy.simulationFailed, emitModel, model, onSimulationRun]);

  const runScenario = useCallback(async () => {
    if (!model || simulationInFlightRef.current) return;
    simulationInFlightRef.current = true;
    setOperation("scenario");
    setError(null);
    setNotice(null);
    await nextPaint();
    try {
      const values: ImprovementScenarioValues = {
        ...(scenarioUValue === ""
          ? {}
          : { windowUValueWPerM2K: scenarioUValue }),
        ...(scenarioAch === "" ? {} : { infiltrationAch: scenarioAch }),
        ...(scenarioCop === "" ? {} : { heatingCop: scenarioCop }),
        ...(scenarioShgc === "" ? {} : { windowShgc: scenarioShgc }),
        ...(scenarioAreaScale === "" ? {} : { openingAreaScale: scenarioAreaScale }),
      };
      const completed = runImprovementScenario(model, values);
      emitModel(completed.model);
      onSimulationRun?.(completed.run);
      if (completed.run.status !== "succeeded") {
        setError(completed.run.error?.message ?? copy.simulationFailed);
      } else {
        setSelectedRunId(completed.run.id);
        setActiveStage("compare");
        setActiveView("model");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.simulationFailed);
    } finally {
      simulationInFlightRef.current = false;
      setOperation(null);
    }
  }, [copy.simulationFailed, emitModel, model, onSimulationRun, scenarioAch, scenarioAreaScale, scenarioCop, scenarioShgc, scenarioUValue]);

  const saveProject = useCallback(async () => {
    if (!model) return;
    setOperation("save");
    setError(null);
    try {
      const saved = await saveEnergyDiagnosticsBundle(model, sources);
      setRecentSavedProject({
        projectId: saved.projectId,
        projectName: saved.model.project.name,
        modelId: saved.modelId,
        savedAtIso: saved.savedAtIso,
      });
      onProjectSaved?.(saved.projectId);
      setNotice(copy.saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project save failed.");
    } finally {
      setOperation(null);
    }
  }, [copy.saved, model, onProjectSaved, sources]);

  const restoreProject = useCallback(async (projectId: string) => {
    setOperation("reload");
    setError(null);
    setNotice(null);
    try {
      const loadedBundle = await loadEnergyDiagnosticsBundle(projectId);
      if (!loadedBundle) {
        setNotice(copy.noSaved);
        return false;
      } else {
        const { model: loaded, sources: restoredSources } = loadedBundle;
        setIngestion(null);
        setSources(restoredSources);
        priorModelReviewRef.current = null;
        emitModel(loaded);
        setSelectedDocumentId(loaded.drawingSet.documents[0]?.id ?? null);
        setSelectedFact(null);
        const restoredScenario = loaded.simulationRuns.findLast(
          (run) => run.scenarioId !== "baseline" && run.status === "succeeded",
        );
        const restoredBaseline = loaded.simulationRuns.findLast(
          (run) => run.scenarioId === "baseline" && run.status === "succeeded",
        );
        const restoredScenarioDefinition = restoredScenario
          ? loaded.scenarios.find(
              (candidate) => candidate.id === restoredScenario.scenarioId,
            )
          : undefined;
        const restoredDraft = restoredScenarioDefinition
          ? improvementDraftForScenario(loaded, restoredScenarioDefinition)
          : EMPTY_IMPROVEMENT_SCENARIO_DRAFT;
        setScenarioUValue(restoredDraft.windowUValueWPerM2K);
        setScenarioAch(restoredDraft.infiltrationAch);
        setScenarioCop(restoredDraft.heatingCop);
        setScenarioShgc(restoredDraft.windowShgc);
        setScenarioAreaScale(restoredDraft.openingAreaScale);
        setActiveStage(
          restoredBaseline ? "compare" : "review",
        );
        setSelectedRunId(restoredScenario?.id ?? restoredBaseline?.id ?? null);
        setActiveView(restoredBaseline ? "model" : "source");
        setNotice(copy.reloaded);
        return true;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project reload failed.");
      return false;
    } finally {
      setOperation(null);
    }
  }, [copy.noSaved, copy.reloaded, emitModel]);

  useEffect(() => {
    if (automaticEntryStartedRef.current || model || ingestion) return;
    automaticEntryStartedRef.current = true;
    if (restoreProjectId) {
      void restoreProject(restoreProjectId).then((restored) => {
        if (!restored && autoLoadSample) void loadReference();
      });
      return;
    }
    if (autoLoadSample) {
      void loadReference();
      return;
    }
    if (initialDrawingSources.length > 0) {
      const firstName = initialDrawingSources[0]?.fileName ?? "Created building";
      const setName =
        initialDrawingSources.length === 1
          ? firstName
          : `${firstName} +${initialDrawingSources.length - 1}`;
      void ingestSources(initialDrawingSources, setName);
    }
  }, [
    autoLoadSample,
    ingestion,
    ingestSources,
    initialDrawingSources,
    loadReference,
    model,
    restoreProject,
    restoreProjectId,
  ]);

  const reloadProject = useCallback(async () => {
    if (!model) return;
    await restoreProject(model.project.id);
  }, [model, restoreProject]);

  const detachedIngestion = Boolean(
    ingestion && (!model || model.drawingSet.id !== ingestion.drawingSet.id),
  );
  const allDocuments = detachedIngestion
    ? ingestion?.drawingSet.documents ?? []
    : model?.drawingSet.documents ?? ingestion?.drawingSet.documents ?? [];
  const selectedDocumentFacts = useMemo(() => {
    if (!selectedDocumentId) return [];
    const candidates = [
      ...(ingestion?.extractedFacts ?? []),
      ...(model?.facts ?? []),
    ].filter((fact) =>
      fact.sourceRefs.some((source) => source.documentId === selectedDocumentId),
    );
    return [...new Map(candidates.map((fact) => [fact.id, fact])).values()];
  }, [ingestion, model?.facts, selectedDocumentId]);

  const selectSimulationResult = useCallback(
    (runId: string, metric: ResultMetric) => {
      if (!model) return;
      setSelectedFindingId(null);
      const run = model.simulationRuns.find(
        (candidate) => candidate.id === runId,
      ) as DegreeDaySimulationRun | undefined;
      if (!run || run.status !== "succeeded") return;
      const mapped = spatialResultsForRun(run);
      const sourceFactIds = new Set(
        mapped?.zones.flatMap((result) => result.sourceFactIds) ?? [],
      );
      const supportingFact = model.facts.find((fact) =>
        sourceFactIds.has(fact.id),
      );
      const sourceDocumentId = supportingFact?.sourceRefs[0]?.documentId ?? null;
      if (supportingFact) setSelectedFact(supportingFact);
      if (sourceDocumentId) setSelectedDocumentId(sourceDocumentId);
      setSelectedRunId(run.id);
      setActiveView("model");
      emitSelection({
        kind: "simulation_result",
        id: `simulation-result:${run.id}:${metric}`,
        documentId: sourceDocumentId,
        runId: run.id,
        canonicalObjectIds:
          mapped?.zones.map((result) => result.canonicalObjectId) ?? [],
        threeObjectIds: [
          ...new Set(
            mapped?.zones.flatMap((result) => result.threeObjectIds) ?? [],
          ),
        ],
      });
    },
    [emitSelection, model],
  );

  // Best-effort autosave: the canonical bundle is idempotent per project id, so
  // a debounced overwrite after each model change means a reload never loses
  // reviewed evidence or runs. Manual save stays as the explicit, surfaced path.
  useEffect(() => {
    if (!model || operation != null || typeof window === "undefined") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void saveEnergyDiagnosticsBundle(model, sources)
        .then((saved) => {
          if (cancelled) return;
          setRecentSavedProject({
            projectId: saved.projectId,
            projectName: saved.model.project.name,
            modelId: saved.modelId,
            savedAtIso: saved.savedAtIso,
          });
          setAutosavedAt(saved.savedAtIso);
          onProjectSaved?.(saved.projectId);
        })
        .catch((cause) => {
          if (cancelled) return;
          setError(
            cause instanceof Error
              ? `${locale === "ko" ? "자동 저장 실패" : "Automatic save failed"}: ${cause.message}`
              : locale === "ko"
                ? "자동 저장에 실패했습니다. 현재 작업은 메모리에 남아 있습니다."
                : "Automatic save failed. Your current work remains in memory.",
          );
        });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locale, model, onProjectSaved, operation, sources]);

  const findings = useMemo(() => {
    if (!model || !validation) return [];
    const run = selectedSuccessfulRun ?? baselineRun ?? undefined;
    if (!run) return [];
    return generateDiagnosticFindings({
      model,
      validation,
      run,
      baselineRun: baselineRun ?? undefined,
      locale,
    });
  }, [baselineRun, locale, model, selectedSuccessfulRun, validation]);

  const baselineFindings = useMemo(() => {
    if (
      !model ||
      !validation ||
      baselineRun?.status !== "succeeded" ||
      baselineRun.result == null
    ) {
      return [];
    }
    return generateDiagnosticFindings({
      model,
      validation,
      run: baselineRun,
      baselineRun,
      locale,
    });
  }, [baselineRun, locale, model, validation]);

  const retrofitAnalysis = useMemo(
    () =>
      baselineRun != null
        ? analyzeRetrofitEconomics(baselineRun, programTrack)
        : null,
    [baselineRun, programTrack],
  );

  const sceneContext = model
    ? {
        locale,
        model,
        selected: selection,
        baselineRun,
        scenarioRun,
        activeRun: selectedSuccessfulRun,
        spatialResults,
        onSelectZone: selectZone,
        onSelectObject: (canonicalObjectId: string) => {
          const zone = model.geometry.thermalZones.find((candidate) => candidate.id === canonicalObjectId);
          if (zone) selectZone(zone.id);
        },
      }
    : null;

  const categoryToStage: Record<ReadinessCategory["category"], WorkflowStage> = {
    geometry: "model",
    envelope: "model",
    usage: "assumptions",
    systems: "model",
    simulation: "preflight",
  };

  const nextAction = useMemo(() => {
    if (detachedIngestion) {
      if (model && tierOneOutcome?.status === "created") {
        return {
          label:
            locale === "ko"
              ? "이 도면으로 새 진단 시작"
              : "Start a new diagnosis from this drawing",
          run: adoptStagedTierOneModel,
          stage: "drawings" as WorkflowStage,
        };
      }
      return {
        label: locale === "ko" ? "새 도면 추출 검토" : "Review new extraction",
        run: () => setActiveStage("drawings"),
        stage: "drawings" as WorkflowStage,
      };
    }
    if (!model) return { label: copy.referenceCase, run: loadReference, stage: "drawings" as WorkflowStage };
    if (isTierOneAssumptionPending(model)) {
      return {
        label:
          locale === "ko"
            ? "건물 외곽선 및 Tier-1 가정 확인"
            : "Confirm footprint & Tier-1 assumptions",
        run: applyAssumption,
        stage: "assumptions" as WorkflowStage,
      };
    }
    const blockingMissing = model.missingValues.find((missing) => missing.blocking);
    if (blockingMissing) return { label: copy.applyAssumption, run: applyAssumption, stage: "assumptions" as WorkflowStage };
    const unresolved = model.conflicts.find((conflict) => conflict.resolutionStatus !== "user_resolved");
    if (unresolved?.selectedFactId) {
      return {
        label: copy.confirmValue,
        run: () => resolveConflict(unresolved.id, unresolved.selectedFactId!),
        stage: "review" as WorkflowStage,
      };
    }
    if (!validation?.validForSimulation) return { label: copy.preflight, run: () => setActiveStage("preflight"), stage: "preflight" as WorkflowStage };
    if (baselineRun?.status !== "succeeded") return { label: copy.runBaseline, run: runBaseline, stage: "simulation" as WorkflowStage };
    return { label: copy.save, run: saveProject, stage: "compare" as WorkflowStage };
  }, [adoptStagedTierOneModel, applyAssumption, baselineRun?.status, copy, detachedIngestion, loadReference, locale, model, resolveConflict, runBaseline, saveProject, tierOneOutcome?.status, validation?.validForSimulation]);

  const stagePanel = detachedIngestion && ingestion
    ? renderDetachedIngestionPanel({
        ingestion,
        locale,
        selectedDocumentFacts,
        onSelectFact: selectFact,
        tierOneOutcome,
        hasModel: Boolean(model),
        onAssignDocumentType: assignDocumentType,
        onAdopt: adoptStagedTierOneModel,
      })
    : model
    ? renderStagePanel({
        stage: activeStage,
        model,
        ingestion,
        validation: validation!,
        locale,
        selectedDocumentFacts,
        baselineRun,
        scenarioRun,
        evaluatedScenario,
        scenarioComparisonIsPrior,
        scenarioUValue,
        onScenarioUValue: setScenarioUValue,
        scenarioAch,
        onScenarioAch: setScenarioAch,
        scenarioCop,
        onScenarioCop: setScenarioCop,
        scenarioShgc,
        onScenarioShgc: setScenarioShgc,
        scenarioAreaScale,
        onScenarioAreaScale: setScenarioAreaScale,
        operation,
        improvementEditorOpen,
        onImprovementEditorOpen: setImprovementEditorOpen,
        findings,
        retrofitAnalysis,
        programTrack,
        onProgramTrack: setProgramTrack,
        zoneSelection,
        onToggleZoneSelection: toggleZoneSelection,
        onMergeZones: mergeSelectedZones,
        onSplitZone: splitZone,
        onSelectFact: selectFact,
        selectedFindingId,
        onSelectFinding: selectFinding,
        canEvaluateFinding,
        onEvaluateFinding: evaluateFinding,
        onSelectZone: selectZone,
        onApplyAssumption: applyAssumption,
        onRunBaseline: runBaseline,
        onRunScenario: runScenario,
        onSelectResult: selectSimulationResult,
      })
    : null;

  return (
    <section className={cn("flex min-h-[760px] flex-col overflow-hidden border bg-background text-foreground", className)} data-testid="energy-diagnosis-workspace">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".dxf"
        className="sr-only"
        aria-label={copy.upload}
        onChange={handleFiles}
        data-testid="drawing-set-input"
      />

      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-cyan-950 text-cyan-200 dark:bg-cyan-200 dark:text-cyan-950">
              <ScanSearch className="size-4" aria-hidden="true" />
            </span>
            <h1 className="truncate text-sm font-semibold tracking-tight">{copy.title}</h1>
            {model && (
              <Badge variant="outline" className="hidden font-mono text-[9px] sm:inline-flex">
                CEM {model.schemaVersion}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{model?.project.name ?? copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {model && !detachedIngestion && autosavedAt && (
            <span className="hidden font-mono text-[9px] text-muted-foreground md:inline" data-testid="autosave-indicator">
              {locale === "ko" ? "자동 저장됨" : "Autosaved"}{" "}
              {new Date(autosavedAt).toLocaleTimeString(locale === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {model && !detachedIngestion && (
            <>
              <Button type="button" variant="ghost" size="xs" onClick={saveProject} disabled={operation != null}>
                <Save className="size-3" /> <span className="hidden sm:inline">{copy.save}</span>
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={reloadProject} disabled={operation != null}>
                <RefreshCw className="size-3" /> <span className="hidden sm:inline">{copy.reload}</span>
              </Button>
            </>
          )}
          {detachedIngestion && (
            <Button type="button" variant="secondary" size="xs" onClick={returnToCurrentModel} disabled={operation != null}>
              <RefreshCw className="size-3" />
              {locale === "ko" ? "현재 모델로 돌아가기" : "Return to current model"}
            </Button>
          )}
          <Button type="button" variant="outline" size="xs" onClick={() => fileInputRef.current?.click()} disabled={operation != null}>
            <Upload className="size-3" /> {model || ingestion ? copy.replaceUpload : copy.upload}
          </Button>
        </div>
      </header>

      <nav aria-label={locale === "ko" ? "에너지 진단 단계" : "Energy diagnosis stages"} className="flex overflow-x-auto border-b bg-muted/20" data-testid="diagnosis-stage-nav">
        {NAVIGATION_STAGES.map((stage, index) => {
          const complete = stageComplete(
            stage,
            detachedIngestion ? null : model,
            ingestion,
            detachedIngestion ? null : validation,
            detachedIngestion ? null : baselineRun,
          );
          const active = stage === navigationStage(activeStage);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => {
                if (stage === "drawings" && model) {
                  setActiveStage("review");
                  return;
                }
                setActiveStage(stage);
              }}
              aria-current={active ? "step" : undefined}
              className={cn(
                "group relative flex h-11 shrink-0 items-center gap-1.5 border-r px-3 text-[10px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active && "bg-background text-foreground",
              )}
              data-testid={`diagnosis-stage-${stage}`}
            >
              <span className={cn("grid size-4 place-items-center rounded-full border font-mono text-[8px]", complete && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", active && !complete && "border-cyan-500/50 text-cyan-600")}>
                {complete ? <Check className="size-2.5" /> : index + 1}
              </span>
              {NAVIGATION_LABEL[locale][stage]}
            </button>
          );
        })}
      </nav>

      {validation && !detachedIngestion && (
        <ReadinessStrip
          validation={validation}
          locale={locale}
          onCategorySelect={(category) => setActiveStage(categoryToStage[category])}
        />
      )}

      {model &&
        !detachedIngestion &&
        model.assumptions.some(
          (assumption) =>
            assumption.id === TIER_ONE_SCREENING_ASSUMPTION_ID,
        ) && (
          <div
            className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/[0.08] px-4 py-2.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-100"
            data-testid="tier-one-uncertainty-banner"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {locale === "ko"
                ? "가정 비중이 높은 Tier-1 스크리닝 추정치입니다. 측정값 또는 법규 적합성 결과가 아닙니다."
                : "Assumption-heavy Tier-1 screening estimate; not measured data or a compliance result."}
            </span>
          </div>
        )}

      {(operation || notice || error) && (
        <div
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 border-b px-4 py-2 text-xs",
            operation && "bg-cyan-500/[0.07] text-cyan-800 dark:text-cyan-200",
            notice && "bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200",
            error && "bg-rose-500/[0.08] text-rose-800 dark:text-rose-200",
          )}
          data-testid="diagnosis-feedback"
        >
          {operation ? <LoaderCircle className="size-3.5 animate-spin" /> : error ? <AlertCircle className="size-3.5" /> : <FileCheck2 className="size-3.5" />}
          <span className="flex-1">{operation ? operationLabel(operation, locale) : error ?? notice}</span>
          {!operation && (
            <button type="button" onClick={() => { setNotice(null); setError(null); }} className="rounded p-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={locale === "ko" ? "알림 닫기" : "Dismiss message"}>
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {!model && !ingestion ? (
        <div className="grid flex-1 place-items-center bg-[radial-gradient(circle_at_50%_0%,rgba(8,145,178,0.08),transparent_42%)] p-5 sm:p-10">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-[0_22px_70px_rgba(15,23,42,0.12)]">
            <div className="grid gap-8 p-6 sm:grid-cols-[1.2fr_0.8fr] sm:p-9">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">DRAWING → EVIDENCE → ENGINE</p>
                <h2 className="mt-3 max-w-lg text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">{copy.emptyTitle}</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{copy.emptyBody}</p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  {showSampleOption && (
                    <Button type="button" onClick={loadReference} disabled={operation != null}>
                      <Sparkles className="size-4" /> {copy.referenceCase}
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={operation != null}>
                    <FolderOpen className="size-4" /> {copy.upload}
                  </Button>
                </div>
                {recentSavedProject && (
                  <div className="mt-4 rounded-lg border bg-muted/25 p-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {copy.recentSaved}
                    </p>
                    <p className="mt-1 truncate text-xs font-medium">
                      {recentSavedProject.projectName}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => void restoreProject(recentSavedProject.projectId)}
                      disabled={operation != null}
                    >
                      <RefreshCw className="size-3.5" /> {copy.openRecent}
                    </Button>
                  </div>
                )}
              </div>
              <div className="relative min-h-52 overflow-hidden rounded-lg border bg-[#071a29] p-4 text-slate-100">
                <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(#6ba9c622 1px,transparent 1px),linear-gradient(90deg,#6ba9c622 1px,transparent 1px)", backgroundSize: "18px 18px" }} />
                <svg viewBox="0 0 220 170" className="relative h-full w-full" aria-hidden="true">
                  <path d="M25 25 H195 V145 H25 Z M85 25 V145 M135 25 V145 M25 82 H195" fill="none" stroke="#5dc6ee" strokeWidth="2" />
                  <path d="M25 62 H15 M25 112 H15 M195 46 H207 M195 125 H207" stroke="#f0b54d" strokeWidth="4" />
                  <circle cx="85" cy="82" r="7" fill="#0d2f41" stroke="#7fdefd" />
                  <path d="M92 82 H218" stroke="#f0b54d" strokeDasharray="5 4" />
                </svg>
                <p className="absolute bottom-3 left-4 font-mono text-[9px] uppercase tracking-wider text-cyan-200">Evidence tether · source synchronized</p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t bg-muted/20 text-center text-[10px] text-muted-foreground">
              <div className="border-r p-3"><span className="block font-mono text-sm font-semibold text-foreground">Tier 1</span>{locale === "ko" ? "초기 진단 시작" : "Start early"}</div>
              <div className="border-r p-3"><span className="block font-mono text-sm font-semibold text-foreground">SHA-256</span>{locale === "ko" ? "출처 재현" : "Reproducible source"}</div>
              <div className="p-3"><span className="block font-mono text-sm font-semibold text-foreground">REAL</span>{locale === "ko" ? "기존 엔진 실행" : "Existing engine"}</div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_320px]"
          data-testid="diagnosis-workspace-layout"
        >
          <aside className="border-b bg-card lg:border-b-0 lg:border-r" aria-label={locale === "ko" ? "등록 도면 목록" : "Registered drawings"}>
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{copy.sourceDrawing}</span>
              <Badge variant="outline" className="font-mono text-[9px]">{allDocuments.length}</Badge>
            </div>
            <div className="flex max-h-40 gap-1 overflow-x-auto p-2 lg:max-h-[650px] lg:flex-col lg:overflow-y-auto">
              {allDocuments.map((document) => {
                const selected = selectedDocumentId === document.id;
                const internalFixture = document.id.startsWith("document-fixture-");
                return (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => selectDocument(document.id)}
                    className={cn(
                      "flex min-w-48 items-start gap-2 rounded-md border border-transparent px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0",
                      selected && "border-cyan-500/25 bg-cyan-500/[0.07]",
                    )}
                    data-testid={`drawing-document-${document.id}`}
                  >
                    <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded border bg-background text-muted-foreground", selected && "border-cyan-500/40 text-cyan-700 dark:text-cyan-300")}>
                      {internalFixture ? <Box className="size-3" /> : <FileStack className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">{document.fileName}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                        {documentTypeLabel(document.classification.documentType, locale)}
                        <span>·</span>
                        {Math.round(document.classification.confidence * 100)}%
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {ingestion?.rejectedFiles.length ? (
              <div className="m-2 rounded-md border border-rose-500/30 bg-rose-500/[0.05] p-2 text-[10px] text-rose-700 dark:text-rose-300">
                {ingestion.rejectedFiles.length} {locale === "ko" ? "개 파일 거부" : "files rejected"}
              </div>
            ) : null}
          </aside>

          <main className="min-w-0 bg-muted/10">
            <div className="flex items-center justify-between border-b bg-card px-3 py-2">
              <div className="flex rounded-md border bg-muted/30 p-0.5" role="tablist" aria-label={locale === "ko" ? "도면과 3D 보기" : "Drawing and 3D view"}>
                <button type="button" role="tab" id="energy-diagnosis-source-tab" aria-controls="energy-diagnosis-source-panel" aria-selected={activeView === "source"} onClick={() => setActiveView("source")} className={cn("rounded px-2.5 py-1 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", activeView === "source" && "bg-background shadow-sm")}>
                  <ScanSearch className="mr-1 inline size-3" /> {copy.sourceDrawing}
                </button>
                <button type="button" role="tab" id="energy-diagnosis-model-tab" aria-controls="energy-diagnosis-model-panel" aria-selected={activeView === "model"} onClick={() => setActiveView("model")} disabled={!model} className={cn("rounded px-2.5 py-1 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40", activeView === "model" && "bg-background shadow-sm")}>
                  <Box className="mr-1 inline size-3" /> {copy.modelView}
                </button>
              </div>
              <span className="hidden font-mono text-[9px] text-muted-foreground sm:inline">
                {model ? (model.drawingSet.tier > 1 ? copy.tierDetailed : copy.tierEarly) : copy.tierEarly}
              </span>
            </div>

            {activeStage === "compare" && baselineRun ? (
              <ResultsAtAGlance
                baselineRun={baselineRun}
                scenarioRun={scenarioRun}
                evaluatedScenario={evaluatedScenario}
                scenarioIsPrior={scenarioComparisonIsPrior}
                findings={baselineFindings}
                selectedFindingId={
                  selectedSuccessfulRun?.id === baselineRun.id
                    ? selectedFindingId
                    : null
                }
                locale={locale}
                onSelectFinding={selectBaselineFinding}
                canEvaluateFinding={canEvaluateFinding}
                onEvaluateFinding={evaluateBaselineFinding}
              />
            ) : null}

            <div
              className="border-b"
              role="tabpanel"
              id={`energy-diagnosis-${activeView}-panel`}
              aria-labelledby={`energy-diagnosis-${activeView}-tab`}
            >
              {model && activeView === "source" && selectedDocumentId && model.drawingSet.documents.some((document) => document.id === selectedDocumentId) ? (
                <SourceReviewCanvas
                  model={model}
                  ingestion={ingestion}
                  source={sources.find((candidate) => candidate.fileName === model.drawingSet.documents.find((document) => document.id === selectedDocumentId)?.fileName)}
                  documentId={selectedDocumentId}
                  selectedFactId={selectedFact?.id ?? null}
                  locale={locale}
                  onSelectFact={selectFact}
                  onSelectZone={selectZone}
                />
              ) : model && activeView === "model" && sceneContext ? (
                <div className="min-h-[430px] bg-slate-950" data-testid="energy-scene-slot">
                  {renderScene ? renderScene(sceneContext) : (
                    <div className="grid min-h-[430px] place-items-center p-8 text-center text-slate-300">
                      <div>
                        <Layers3 className="mx-auto size-7 text-cyan-300" />
                        <p className="mt-3 text-sm font-semibold text-white">{copy.noScene}</p>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{copy.noSceneBody}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : ingestion ? (
                <IngestionOnlyReview ingestion={ingestion} locale={locale} />
              ) : null}
            </div>

            <div className="p-3 sm:p-4" data-testid={`stage-panel-${activeStage}`}>
              {stagePanel ?? (
                <div className="rounded-lg border border-dashed p-5 text-xs text-muted-foreground">
                  {locale === "ko" ? "대표 세트를 열어 정규 모델 검토를 계속하세요." : "Open the reference set to continue canonical model review."}
                </div>
              )}
            </div>
          </main>

          {model && !detachedIngestion ? (
            <EvidenceInspector
              model={model}
              fact={selectedFact}
              locale={locale}
              onSelectDocument={selectDocument}
              onSelectSourceReference={selectSourceReference}
              onResolveConflict={resolveConflict}
            />
          ) : detachedIngestion && ingestion ? (
            <aside className="border-l bg-card p-4" data-testid="pending-ingestion-evidence">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{copy.exactSource}</p>
              <p className="mt-2 text-xs font-semibold">{locale === "ko" ? "새 도면은 기존 모델과 분리되어 안전하게 보관됩니다." : "New drawings remain safely separate from the existing model."}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{locale === "ko" ? "추출 검토가 끝나고 상위 모델 생성기가 새 정규 모델을 제공하기 전까지 기존 시뮬레이션 입력은 바뀌지 않습니다." : "Existing simulation inputs do not change until review finishes and the parent model generator supplies a new canonical model."}</p>
              {selectedFact && <div className="mt-4 rounded-lg border bg-muted/20 p-3"><p className="font-mono text-[9px] text-muted-foreground">{selectedFact.key}</p><p className="mt-1 font-mono text-xs font-semibold">{factValue(selectedFact)}</p><p className="mt-2 text-[10px] text-muted-foreground">{selectedFact.sourceRefs[0]?.originalText ?? copy.sourceMissing}</p></div>}
            </aside>
          ) : (
            <aside className="border-l bg-card p-4">
              <p className="text-xs font-semibold">{copy.exactSource}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.selectEvidence}</p>
            </aside>
          )}
        </div>
      )}

      {(model || ingestion) && (
        <footer className="flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3" data-testid="next-action-bar">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{copy.nextAction}</p>
            <p className="mt-0.5 truncate text-xs font-medium">{nextAction.label}</p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setActiveStage(nextAction.stage);
              void nextAction.run();
            }}
            disabled={operation != null}
            data-testid="next-diagnosis-action"
          >
            {operation ? <LoaderCircle className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}
            {nextAction.label}
          </Button>
        </footer>
      )}
    </section>
  );
}

function PanelHeading({ eyebrow, title, action }: Readonly<{ eyebrow: string; title: string; action?: ReactNode }>) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-sm font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const ASSIGNABLE_DOCUMENT_TYPES: readonly DrawingDocumentType[] = [
  "floor_plan",
  "site_plan",
  "elevation",
  "section",
  "window_schedule",
  "wall_detail",
  "hvac_equipment_schedule",
  "lighting_plan",
  "material_schedule",
  "unknown",
];

function renderDetachedIngestionPanel({
  ingestion,
  locale,
  selectedDocumentFacts,
  onSelectFact,
  tierOneOutcome,
  hasModel,
  onAssignDocumentType,
  onAdopt,
}: Readonly<{
  ingestion: DrawingSetIngestionResult;
  locale: DiagnosisLocale;
  selectedDocumentFacts: readonly EnergyFact<unknown>[];
  onSelectFact: (fact: EnergyFact<unknown>) => void;
  tierOneOutcome: TierOneModelBuildOutcome | null;
  hasModel: boolean;
  onAssignDocumentType: (documentId: string, documentType: DrawingDocumentType) => void;
  onAdopt: () => void;
}>): ReactNode {
  const guidance =
    tierOneOutcome?.status === "extraction_only"
      ? tierOneGuidance(tierOneOutcome.reason, locale)
      : null;
  const readyToAdopt = hasModel && tierOneOutcome?.status === "created";
  return (
    <section data-testid="detached-ingestion-panel">
      <PanelHeading
        eyebrow={locale === "ko" ? "새 도면 세트 · 모델 적용 전" : "NEW DRAWING SET · NOT YET APPLIED"}
        title={ingestion.drawingSet.name}
        action={<Badge variant="outline" className="font-mono text-[9px]">{ingestion.drawingSet.documents.length}{locale === "ko" ? "개 도면" : " docs"}</Badge>}
      />
      {guidance && (
        <div
          className="rounded-lg border border-amber-500/35 bg-amber-500/[0.06] p-3"
          data-testid="tier-one-guidance"
        >
          <p className="text-xs font-semibold">{guidance.what}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {locale === "ko" ? "해결 방법: " : "How to fix: "}
            </span>
            {guidance.fix}
          </p>
        </div>
      )}
      {readyToAdopt && (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/[0.05] p-3">
          <p className="text-xs font-semibold">
            {locale === "ko"
              ? "이 도면에서 새 Tier-1 모델을 만들 수 있습니다."
              : "A new Tier-1 model can be built from this drawing."}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {locale === "ko"
              ? "현재 모델과 실행 결과는 마지막 저장본으로 남습니다."
              : "The current model and runs remain available from their last saved copy."}
          </p>
          <Button type="button" size="sm" className="mt-2.5" onClick={onAdopt} data-testid="adopt-staged-drawing">
            {locale === "ko" ? "이 도면으로 새 진단 시작" : "Start a new diagnosis from this drawing"}
          </Button>
        </div>
      )}
      {!guidance && !readyToAdopt && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
          {locale === "ko"
            ? "기존 모델과 실행 결과는 변경되지 않았습니다. 아래에서 도면 유형을 확인하면 다음 단계를 안내합니다."
            : "The existing model and runs are unchanged. Confirm the document types below to continue."}
        </div>
      )}
      <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[540px] text-left text-[10px]">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{locale === "ko" ? "도면" : "Drawing"}</th>
              <th className="px-3 py-2 font-medium">{locale === "ko" ? "자동 분류" : "Auto classification"}</th>
              <th className="px-3 py-2 font-medium">{locale === "ko" ? "도면 유형 지정" : "Assign type"}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ingestion.drawingSet.documents.map((document) => (
              <tr key={document.id}>
                <td className="max-w-64 truncate px-3 py-2.5 font-medium">{document.fileName}</td>
                <td className="px-3 py-2.5">
                  {documentTypeLabel(document.classification.documentType, locale)}
                  <span className="ml-1.5 font-mono text-muted-foreground">
                    {document.classification.method === "user_assignment"
                      ? locale === "ko" ? "사용자 지정" : "user-assigned"
                      : `${Math.round(document.classification.confidence * 100)}%`}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={document.classification.documentType}
                    onChange={(event) =>
                      onAssignDocumentType(document.id, event.target.value as DrawingDocumentType)
                    }
                    className="h-7 rounded-md border bg-background px-2 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={
                      locale === "ko"
                        ? `${document.fileName} 도면 유형 지정`
                        : `Assign document type for ${document.fileName}`
                    }
                    data-testid={`assign-document-type-${document.id}`}
                  >
                    {ASSIGNABLE_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {documentTypeLabel(type, locale)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {selectedDocumentFacts.length ? selectedDocumentFacts.slice(0, 12).map((fact) => (
          <button
            key={fact.id}
            type="button"
            onClick={() => onSelectFact(fact)}
            className="rounded-lg border bg-card p-3 text-left hover:border-cyan-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block truncate text-[10px] font-medium">{factKeyLabel(fact.key, locale)}</span>
            <span className="mt-1 block font-mono text-xs font-semibold">{factValue(fact)}</span>
          </button>
        )) : (
          <p className="col-span-full rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            {locale === "ko" ? "이 도면에서 에너지 입력값은 아직 추출되지 않았습니다." : "No energy input facts were extracted from this drawing yet."}
          </p>
        )}
      </div>
    </section>
  );
}

function renderStagePanel({
  stage,
  model,
  ingestion,
  validation,
  locale,
  selectedDocumentFacts,
  baselineRun,
  scenarioRun,
  evaluatedScenario,
  scenarioComparisonIsPrior,
  scenarioUValue,
  onScenarioUValue,
  scenarioAch,
  onScenarioAch,
  scenarioCop,
  onScenarioCop,
  scenarioShgc,
  onScenarioShgc,
  scenarioAreaScale,
  onScenarioAreaScale,
  operation,
  improvementEditorOpen,
  onImprovementEditorOpen,
  findings,
  retrofitAnalysis,
  programTrack,
  onProgramTrack,
  zoneSelection,
  onToggleZoneSelection,
  onMergeZones,
  onSplitZone,
  onSelectFact,
  selectedFindingId,
  onSelectFinding,
  canEvaluateFinding,
  onEvaluateFinding,
  onSelectZone,
  onApplyAssumption,
  onRunBaseline,
  onRunScenario,
  onSelectResult,
}: Readonly<{
  stage: WorkflowStage;
  model: CanonicalEnergyModel;
  ingestion: DrawingSetIngestionResult | null;
  validation: CanonicalModelValidation;
  locale: DiagnosisLocale;
  selectedDocumentFacts: readonly EnergyFact<unknown>[];
  baselineRun: DegreeDaySimulationRun | null;
  scenarioRun: DegreeDaySimulationRun | null;
  evaluatedScenario: EnergyScenario | null;
  scenarioComparisonIsPrior: boolean;
  scenarioUValue: number | "";
  onScenarioUValue: (value: number | "") => void;
  scenarioAch: number | "";
  onScenarioAch: (value: number | "") => void;
  scenarioCop: number | "";
  onScenarioCop: (value: number | "") => void;
  scenarioShgc: number | "";
  onScenarioShgc: (value: number | "") => void;
  scenarioAreaScale: number | "";
  onScenarioAreaScale: (value: number | "") => void;
  operation: Operation;
  improvementEditorOpen: boolean;
  onImprovementEditorOpen: (open: boolean) => void;
  findings: readonly import("@/lib/energy-diagnostics/findings").DiagnosticFinding[];
  retrofitAnalysis: DiagnosticsRetrofitAnalysis | null;
  programTrack: ProgramTrack;
  onProgramTrack: (track: ProgramTrack) => void;
  zoneSelection: readonly string[];
  onToggleZoneSelection: (zoneId: string) => void;
  onMergeZones: () => void;
  onSplitZone: (zoneId: string) => void;
  onSelectFact: (fact: EnergyFact<unknown>) => void;
  selectedFindingId: string | null;
  onSelectFinding: (finding: DiagnosticFinding) => void;
  canEvaluateFinding: (finding: DiagnosticFinding) => boolean;
  onEvaluateFinding: (finding: DiagnosticFinding) => void;
  onSelectZone: (zoneId: string) => void;
  onApplyAssumption: () => void;
  onRunBaseline: () => void;
  onRunScenario: () => void;
  onSelectResult: (runId: string, metric: ResultMetric) => void;
}>) {
  const copy = diagnosisCopy(locale);
  if (stage === "drawings") {
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale][stage]} title={model.drawingSet.name} action={<Badge variant="outline" className="font-mono text-[9px]">Tier {model.drawingSet.tier}</Badge>} />
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[620px] text-left text-[10px]">
            <thead className="border-b bg-muted/30 text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{locale === "ko" ? "도면" : "Drawing"}</th><th className="px-3 py-2 font-medium">{locale === "ko" ? "자동 분류" : "Classification"}</th><th className="px-3 py-2 font-medium">{copy.confidence}</th><th className="px-3 py-2 font-medium">{copy.revision}</th><th className="px-3 py-2 font-medium">{locale === "ko" ? "상태" : "State"}</th></tr></thead>
            <tbody className="divide-y">
              {model.drawingSet.documents.map((document) => (
                <tr key={document.id}>
                  <td className="max-w-64 truncate px-3 py-2.5 font-medium">{document.fileName}</td>
                  <td className="px-3 py-2.5">{documentTypeLabel(document.classification.documentType, locale)}</td>
                  <td className="px-3 py-2.5 font-mono">{Math.round(document.classification.confidence * 100)}%</td>
                  <td className="px-3 py-2.5 font-mono">{document.revision}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className={cn("text-[9px]", document.validationStatus === "accepted" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 text-amber-700 dark:text-amber-300")}>{document.validationStatus}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ingestion?.rejectedFiles.length ? <p className="mt-3 text-xs text-rose-700">{copy.fileRejected}</p> : null}
      </section>
    );
  }

  if (stage === "review") {
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale].review} title={locale === "ko" ? "선택 도면의 에너지 관련 추출값" : "Energy-relevant facts on the selected drawing"} action={<Badge variant="outline" className="font-mono text-[9px]">{selectedDocumentFacts.length}{locale === "ko" ? "개 추출값" : " facts"}</Badge>} />
        {selectedDocumentFacts.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {selectedDocumentFacts.slice(0, 12).map((fact) => (
              <button key={fact.id} type="button" onClick={() => onSelectFact(fact)} className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-cyan-500/35 hover:bg-cyan-500/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block truncate text-[10px] font-medium">{factKeyLabel(fact.key, locale)}</span>
                <span className="mt-1 block truncate font-mono text-xs font-semibold">{factValue(fact)}</span>
                <span className="mt-2 block text-[9px] text-muted-foreground">{factStatusLabel(fact.status, locale)} · {fact.confidence == null ? "—" : `${Math.round(fact.confidence * 100)}%`}</span>
              </button>
            ))}
          </div>
        ) : <div className="rounded-lg border border-dashed p-5 text-xs text-muted-foreground">{copy.selectEvidence}</div>}
      </section>
    );
  }

  if (stage === "model") {
    return (
      <section className="space-y-6">
        <section>
        <PanelHeading eyebrow={locale === "ko" ? "공간 및 열구역" : "Spaces & zones"} title={`${model.geometry.thermalZones.length} ${locale === "ko" ? "개 검토 가능 열구역" : "reviewable thermal zones"}`} />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {model.geometry.thermalZones.map((zone) => (
            <div key={zone.id} className={cn("flex items-center gap-2 rounded-lg border bg-card p-3 transition-colors", zoneSelection.includes(zone.id) && "border-cyan-500/45 bg-cyan-500/[0.05]")} data-testid={`thermal-zone-${zone.id}`}>
              <input
                type="checkbox"
                checked={zoneSelection.includes(zone.id)}
                onChange={() => onToggleZoneSelection(zone.id)}
                className="size-3.5 shrink-0 accent-cyan-600"
                aria-label={locale === "ko" ? `${zone.name.value ?? zone.stableKey} 병합 선택` : `Select ${zone.name.value ?? zone.stableKey} for merge`}
                data-testid={`zone-merge-select-${zone.id}`}
              />
              <button type="button" onClick={() => onSelectZone(zone.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded border font-mono text-[9px]", zone.conditioned.value ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "border-dashed bg-muted text-muted-foreground")}><CircleDotDashed className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{zone.name.value ?? zone.stableKey}</span><span className="mt-1 block font-mono text-[9px] text-muted-foreground">{factValue(zone.floorAreaSqm)} · {factValue(zone.volumeM3)} · {zone.sourceSpaceIds.length}{locale === "ko" ? "개 공간" : " spaces"}</span></span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              </button>
              {zone.sourceSpaceIds.length >= 2 && (
                <Button type="button" variant="outline" size="xs" onClick={() => onSplitZone(zone.id)} data-testid={`zone-split-${zone.id}`}>
                  {locale === "ko" ? "공간별 분리" : "Split by space"}
                </Button>
              )}
            </div>
          ))}
        </div>
        {zoneSelection.length >= 2 && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-cyan-500/35 bg-cyan-500/[0.05] p-2.5" data-testid="zone-merge-bar">
            <p className="text-[10px]">
              {locale === "ko"
                ? `${zoneSelection.length}개 열구역 선택됨 — 하나의 검토 구역으로 병합합니다.`
                : `${zoneSelection.length} zones selected — merge into one reviewed zone.`}
            </p>
            <Button type="button" size="xs" onClick={onMergeZones} data-testid="zone-merge-action">
              {locale === "ko" ? "선택 구역 병합" : "Merge selected zones"}
            </Button>
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">{locale === "ko" ? "용도·외주부 방향·코어·공조 서비스가 같은 공간만 결정론적으로 묶었습니다. 병합·분리는 사용자 확인 구역으로 기록됩니다." : "Spaces are grouped deterministically only when usage, perimeter orientation, core status, and HVAC service agree. Merges and splits are recorded as user-confirmed zones."}</p>
        </section>
        <section>
        <PanelHeading eyebrow={locale === "ko" ? "외피 성능" : "Envelope"} title={locale === "ko" ? "외피 입력과 근거 상태" : "Envelope inputs and evidence"} />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {model.envelope.constructions.map((construction) => (
            <button key={construction.id} type="button" onClick={() => onSelectFact(construction.uValueWPerM2K)} className="rounded-lg border bg-card p-3 text-left hover:border-cyan-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{construction.kind}</span>
              <span className="mt-1 block truncate text-xs font-semibold">{construction.name.value}</span>
              <span className="mt-3 block font-mono text-sm font-semibold">U {factValue(construction.uValueWPerM2K)}</span>
              {construction.kind === "window" && <span className="mt-1 block font-mono text-[10px] text-muted-foreground">SHGC {factValue(construction.shgc)}</span>}
            </button>
          ))}
          <button type="button" onClick={() => onSelectFact(model.envelope.infiltrationAirChangesPerHour)} className={cn("rounded-lg border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", model.envelope.infiltrationAirChangesPerHour.value == null && "border-rose-500/35 bg-rose-500/[0.04]")}>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">INFILTRATION</span>
            <span className="mt-1 block text-xs font-semibold">{locale === "ko" ? "침기" : "Air infiltration"}</span>
            <span className="mt-3 block font-mono text-sm font-semibold">{factValue(model.envelope.infiltrationAirChangesPerHour)}</span>
          </button>
        </div>
        </section>
        <section>
        <PanelHeading eyebrow={locale === "ko" ? "설비 시스템" : "Systems"} title={locale === "ko" ? "열구역에 연결된 설비" : "Systems linked to thermal zones"} />
        <div className="grid gap-3 lg:grid-cols-2">
          {model.systems.hvac.map((system) => (
            <article key={system.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{system.name.value}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{system.systemType.value}</p></div><Badge variant="outline" className="font-mono text-[9px]">{system.servedZoneIds.value?.length ?? 0} zones</Badge></div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[[system.capacityKw, locale === "ko" ? "용량" : "Capacity"], [system.heatingEfficiency, locale === "ko" ? "난방 효율" : "Heating"], [system.coolingCop, "Cooling COP"]].map(([fact, label]) => (
                  <button key={(fact as EnergyFact<unknown>).id} type="button" onClick={() => onSelectFact(fact as EnergyFact<unknown>)} className="rounded-md border bg-muted/20 p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block text-[9px] text-muted-foreground">{String(label)}</span><span className="mt-1 block font-mono text-[10px] font-semibold">{factValue(fact as EnergyFact<unknown>)}</span></button>
                ))}
              </div>
            </article>
          ))}
        </div>
        </section>
      </section>
    );
  }

  if (stage === "assumptions") {
    const infiltrationMissing = model.missingValues.some((missing) => missing.key === model.envelope.infiltrationAirChangesPerHour.key);
    const tierOneAssumption = model.assumptions.find(
      (assumption) => assumption.id === TIER_ONE_SCREENING_ASSUMPTION_ID,
    );
    const tierOnePending = model.missingValues.some(
      (missing) => missing.key === TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
    );
    const tierOneTemplate = TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1;
    const tierOneBoundary = model.geometry.floorPlates[0];
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale].assumptions} title={locale === "ko" ? "숨기지 않은 가정과 누락값" : "Visible assumptions and missing values"} />
        <div className="grid gap-3 lg:grid-cols-2">
          {tierOneAssumption && (
            <article
              className="rounded-lg border border-amber-500/35 bg-amber-500/[0.05] p-4 lg:col-span-2"
              data-testid="tier-one-assumption-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">
                    {tierOneAssumption.title}
                  </p>
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {tierOneAssumption.id} · {tierOneTemplate.version}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[9px]",
                    tierOnePending
                      ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                      : "border-emerald-500/35 text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {tierOnePending ? "acceptance required" : "accepted"}
                </Badge>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                {tierOneAssumption.explanation}
              </p>
              <dl className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Selected footprint</dt>
                  <dd className="mt-1 font-mono">
                    {factValue(tierOneBoundary.areaSqm)} · {tierOneBoundary.boundary.value?.length ?? 0} vertices · confirm as building perimeter
                  </dd>
                </div>
                <div className="rounded-md border bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Geometry</dt>
                  <dd className="mt-1 font-mono">
                    1 storey · {tierOneTemplate.geometry.floorToFloorHeightM} m · conditioned office
                  </dd>
                </div>
                <div className="rounded-md border bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Climate</dt>
                  <dd className="mt-1 font-mono">
                    {tierOneTemplate.site.location} · {tierOneTemplate.site.weatherSource}
                  </dd>
                </div>
                <div className="rounded-md border bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Envelope</dt>
                  <dd className="mt-1 font-mono">
                    U {tierOneTemplate.envelope.wallUValueWPerM2K}/{tierOneTemplate.envelope.roofUValueWPerM2K}/{tierOneTemplate.envelope.groundUValueWPerM2K}/{tierOneTemplate.envelope.windowUValueWPerM2K} · WWR {Math.round(tierOneTemplate.envelope.windowToWallRatio * 100)}% · SHGC {tierOneTemplate.envelope.windowShgc} · {tierOneTemplate.envelope.infiltrationAirChangesPerHour} ACH
                  </dd>
                </div>
                <div className="rounded-md border bg-background/60 p-2.5 sm:col-span-2 xl:col-span-4">
                  <dt className="text-muted-foreground">Use &amp; system</dt>
                  <dd className="mt-1 font-mono">
                    {tierOneTemplate.usage.heatingSetpointC}/{tierOneTemplate.usage.coolingSetpointC} °C · occupancy {tierOneTemplate.usage.occupancyDensityPeoplePerSqm} people/m² · LPD {tierOneTemplate.usage.lightingPowerDensityWPerSqm} W/m² · equipment {tierOneTemplate.usage.equipmentPowerDensityWPerSqm} W/m² · ventilation {tierOneTemplate.usage.ventilationLpsPerPerson} L/s-person · capacity {tierOneTemplate.hvac.capacityKwPerSqm} kW/m² · heat recovery {Math.round(tierOneTemplate.hvac.heatRecoveryEfficiency * 100)}% · COP {tierOneTemplate.hvac.heatingEfficiencyCop}/{tierOneTemplate.hvac.coolingCop} · {tierOneTemplate.usage.operatingHours}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200">
                Acceptance confirms the selected polygon as the building footprint and the values above as an assumption-heavy screening estimate; this is not measured data or a compliance prediction.
              </p>
              <p className="mt-2 font-mono text-[9px] leading-relaxed text-muted-foreground">
                Engine paths: {TIER_ONE_SCREENING_ENGINE_PATHS.join(", ")}
              </p>
              {tierOnePending && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-4 w-full sm:w-auto"
                  onClick={onApplyAssumption}
                  data-testid="accept-tier-one-assumptions"
                >
                  {locale === "ko"
                    ? "건물 외곽선 및 Tier-1 가정 확인"
                    : "Confirm footprint & Tier-1 assumptions"}
                </Button>
              )}
            </article>
          )}
          <article className={cn("rounded-lg border p-4", infiltrationMissing ? "border-rose-500/35 bg-rose-500/[0.04]" : "border-emerald-500/25 bg-emerald-500/[0.04]")} data-testid="infiltration-assumption-card">
            <div className="flex items-start gap-3"><span className={cn("grid size-8 shrink-0 place-items-center rounded-full border", infiltrationMissing ? "border-rose-500/30 text-rose-600" : "border-emerald-500/30 text-emerald-600")}><Wind className="size-4" /></span><div className="min-w-0"><p className="text-xs font-semibold">{locale === "ko" ? "침기율 근거" : "Infiltration evidence"}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{copy.assumptionExplanation}</p><p className="mt-2 font-mono text-xs font-semibold">{factValue(model.envelope.infiltrationAirChangesPerHour)}</p></div></div>
            {infiltrationMissing && <Button type="button" size="sm" className="mt-4 w-full" onClick={onApplyAssumption}>{copy.applyAssumption}</Button>}
          </article>
          <article className="rounded-lg border bg-card p-4">
            <p className="text-xs font-semibold">{locale === "ko" ? "충돌 기록" : "Conflict records"}</p>
            <div className="mt-3 space-y-2">{model.conflicts.length ? model.conflicts.map((conflict) => <div key={conflict.id} className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" /><div><p className="font-mono text-[10px] font-semibold">{conflict.key}</p><p className="mt-1 text-[9px] text-muted-foreground">{conflict.resolutionStatus} · {conflict.candidates.length} values</p></div></div>) : <p className="text-xs text-muted-foreground">{locale === "ko" ? "충돌 없음" : "No conflicts"}</p>}</div>
          </article>
        </div>
      </section>
    );
  }

  if (stage === "preflight") {
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale].preflight} title={validation.validForSimulation ? copy.readyToRun : copy.resolveBeforeRun} action={<Badge variant="outline" className={cn("font-mono text-[9px]", validation.validForSimulation ? "border-emerald-500/30 text-emerald-700" : "border-rose-500/30 text-rose-700")}>{validation.blockingIssueIds.length} blocking</Badge>} />
        <div className="space-y-2">
          {validation.issues.length ? validation.issues.map((issue) => (
            <article
              key={issue.id}
              className={cn("flex items-start gap-3 rounded-lg border bg-card p-3", issue.severity === "error" && "border-rose-500/30", issue.severity === "warning" && "border-amber-500/30")}
              data-testid="preflight-issue"
            >
              {issue.severity === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{issue.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{issue.correctiveAction}</p>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">{issue.code} · {issue.category}</p>
                {(issue.factIds.length > 0 || issue.affectedObjectIds.length > 0) && (
                  <dl className="mt-2 grid gap-1.5 border-t pt-2 text-[9px] sm:grid-cols-2">
                    {issue.factIds.length > 0 && (
                      <div className="min-w-0">
                        <dt className="font-medium text-muted-foreground">{copy.affectedFacts}</dt>
                        <dd className="mt-0.5 space-y-0.5 font-mono text-foreground">
                          {issue.factIds.map((factId) => (
                            <code key={factId} className="block break-all font-mono">{factId}</code>
                          ))}
                        </dd>
                      </div>
                    )}
                    {issue.affectedObjectIds.length > 0 && (
                      <div className="min-w-0">
                        <dt className="font-medium text-muted-foreground">{copy.affectedObjects}</dt>
                        <dd className="mt-0.5 space-y-0.5 font-mono text-foreground">
                          {issue.affectedObjectIds.map((objectId) => (
                            <code key={objectId} className="block break-all font-mono">{objectId}</code>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </article>
          )) : <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4"><span className="grid size-8 place-items-center rounded-full bg-emerald-500/10 text-emerald-700"><Check className="size-4" /></span><div><p className="text-xs font-semibold">{copy.readyToRun}</p><p className="mt-1 text-[10px] text-muted-foreground">{locale === "ko" ? "단위·형상·인접성·열구역·설비 연결을 확인했습니다." : "Units, geometry, adjacency, zones, and system links were checked."}</p></div></div>}
        </div>
      </section>
    );
  }

  if (stage === "simulation") {
    return (
      <section>
        <PanelHeading
          eyebrow={STAGE_LABEL[locale].simulation}
          title={locale === "ko" ? "검증된 모델로 진단 실행" : "Run the validated diagnostic model"}
          action={
            <Button
              type="button"
              size="sm"
              onClick={onRunBaseline}
              disabled={!validation.validForSimulation || operation != null}
            >
              <Play className="size-3.5" /> {copy.runBaseline}
            </Button>
          }
        />
        <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.04] p-4">
          <p className="text-xs font-semibold">
            {locale === "ko"
              ? "실행이 완료되면 에너지 진단 결과로 이동합니다."
              : "When the run completes, BIMFIT will open Energy Diagnostic Results."}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {locale === "ko"
              ? "현재 검증된 모델과 표시된 가정을 사용합니다. 중복 제출은 방지되며 기준 모델은 변경하지 않습니다."
              : "The run uses the validated model and visible assumptions. Duplicate submissions are prevented, and the baseline model is not modified."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <PanelHeading
        eyebrow={STAGE_LABEL[locale].compare}
        title={locale === "ko" ? "에너지 진단 결과" : "Energy Diagnostic Results"}
        action={baselineRun?.result ? (
          <Badge variant="outline" className="border-emerald-500/35 font-mono text-[9px] text-emerald-700 dark:text-emerald-300">
            {locale === "ko" ? "실제 엔진 결과" : "Real engine result"}
          </Badge>
        ) : undefined}
      />
      <ResultComparison
        baseline={baselineRun?.result ?? null}
        scenario={scenarioRun?.result ?? null}
        evaluatedScenario={evaluatedScenario}
        scenarioIsPrior={scenarioComparisonIsPrior}
        locale={locale}
        baselineRunId={baselineRun?.id}
        scenarioRunId={scenarioRun?.id}
        onSelectResult={onSelectResult}
      />
      <FindingsPanel
        findings={findings}
        model={model}
        locale={locale}
        onSelectFact={onSelectFact}
        selectedFindingId={selectedFindingId ?? undefined}
        onSelectFinding={onSelectFinding}
        canEvaluateFinding={canEvaluateFinding}
        onEvaluateFinding={onEvaluateFinding}
      />
      <details
        className="mt-4 rounded-lg border bg-card"
        data-testid="improvement-scenario-controls"
        open={improvementEditorOpen}
        onToggle={(event) => onImprovementEditorOpen(event.currentTarget.open)}
      >
        <summary
          className="cursor-pointer px-3 py-3 text-xs font-semibold"
          data-testid="toggle-improvement-editor"
        >
          {locale === "ko"
            ? "개선 대안 평가"
            : "Evaluate an improvement alternative"}
        </summary>
        <div className="border-t p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-[10px] font-medium text-muted-foreground">
            {copy.scenarioValue}
            <Input
              type="number"
              min="0.5"
              max="5"
              step="0.1"
              value={scenarioUValue}
              placeholder={String(
                model.envelope.constructions.find(
                  (construction) => construction.kind === "window",
                )?.uValueWPerM2K.value ?? "",
              )}
              onChange={(event) =>
                onScenarioUValue(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
              className="mt-1.5 h-8 font-mono text-xs"
              data-testid="scenario-window-u-value"
            />
          </label>
          <span className="pb-2 font-mono text-[10px] text-muted-foreground">W/(m²·K)</span>
          <label className="min-w-40 flex-1 text-[10px] font-medium text-muted-foreground">
            {locale === "ko" ? "대안 침기율 (비우면 유지)" : "Alternative infiltration (blank keeps baseline)"}
            <Input
              type="number"
              min="0"
              max="3"
              step="0.05"
              value={scenarioAch}
              placeholder={factValue(model.envelope.infiltrationAirChangesPerHour)}
              onChange={(event) =>
                onScenarioAch(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="mt-1.5 h-8 font-mono text-xs"
              aria-label={locale === "ko" ? "대안 침기율" : "Alternative infiltration rate"}
            />
          </label>
          <span className="pb-2 font-mono text-[10px] text-muted-foreground">ACH</span>
          <label className="min-w-40 flex-1 text-[10px] font-medium text-muted-foreground">
            {locale === "ko" ? "대안 난방 COP (비우면 유지)" : "Alternative heating COP (blank keeps baseline)"}
            <Input
              type="number"
              min="0.5"
              max="8"
              step="0.1"
              value={scenarioCop}
              placeholder={model.systems.hvac[0] ? factValue(model.systems.hvac[0].heatingEfficiency) : ""}
              onChange={(event) =>
                onScenarioCop(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="mt-1.5 h-8 font-mono text-xs"
              aria-label={locale === "ko" ? "대안 난방 COP" : "Alternative heating COP"}
            />
          </label>
          <Button
            type="button"
            size="sm"
            onClick={onRunScenario}
            data-testid="run-improvement-scenario"
            disabled={
              operation != null ||
              !baselineRun?.result ||
              ![
                scenarioUValue,
                scenarioAch,
                scenarioCop,
                scenarioShgc,
                scenarioAreaScale,
              ].some((value) => value !== "") ||
              (scenarioUValue !== "" &&
                (!Number.isFinite(scenarioUValue) || scenarioUValue <= 0))
            }
          >
            <Gauge className="size-3.5" /> {copy.runScenario}
          </Button>
        </div>
        <details className="mt-2 border-t pt-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">
            {locale === "ko" ? "고급 대안 값 (SHGC · 창 면적)" : "Advanced alternative values (SHGC · glazing area)"}
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 text-[10px] font-medium text-muted-foreground">
              {locale === "ko" ? "대안 창호 SHGC (비우면 유지)" : "Alternative window SHGC (blank keeps baseline)"}
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={scenarioShgc}
                onChange={(event) =>
                  onScenarioShgc(event.target.value === "" ? "" : Number(event.target.value))
                }
                className="mt-1.5 h-8 font-mono text-xs"
                aria-label={locale === "ko" ? "대안 창호 SHGC" : "Alternative window SHGC"}
              />
            </label>
            <label className="min-w-40 flex-1 text-[10px] font-medium text-muted-foreground">
              {locale === "ko" ? "창 면적 배율 (예: 0.8 = 20% 축소)" : "Glazing-area scale (e.g. 0.8 = 20% smaller)"}
              <Input
                type="number"
                min="0.1"
                max="3"
                step="0.05"
                value={scenarioAreaScale}
                onChange={(event) =>
                  onScenarioAreaScale(event.target.value === "" ? "" : Number(event.target.value))
                }
                className="mt-1.5 h-8 font-mono text-xs"
                aria-label={locale === "ko" ? "창 면적 배율" : "Glazing-area scale"}
              />
            </label>
          </div>
        </details>
        <p className="mt-2 w-full text-[10px] text-muted-foreground">
          {locale === "ko"
            ? "선택한 값만 변경한 비파괴 대안입니다. 기준 모델의 도면 근거는 바뀌지 않으며, 비워 둔 항목은 기준값을 유지합니다."
            : "A non-destructive alternative changing only the values you set. Baseline drawing evidence is untouched; blank fields keep their baseline values."}
        </p>
        </div>
      </details>
      {baselineRun && (
        <details className="mt-3 rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-[10px] font-semibold">
            {locale === "ko" ? "엔진 로그 및 근사" : "Engine logs and approximations"}
          </summary>
          <div className="mt-2 space-y-1 font-mono text-[9px] leading-relaxed text-muted-foreground">
            {baselineRun.logs.map((log) => <p key={log}>{log}</p>)}
            {baselineRun.warnings.map((warning) => (
              <p key={warning} className="text-amber-700 dark:text-amber-300">
                WARN · {warning}
              </p>
            ))}
          </div>
        </details>
      )}
      <RetrofitEconomicsPanel
        analysis={retrofitAnalysis}
        locale={locale}
        programTrack={programTrack}
        onProgramTrack={onProgramTrack}
      />
    </section>
  );
}
