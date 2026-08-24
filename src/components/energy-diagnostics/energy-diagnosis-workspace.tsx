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
} from "@/lib/energy-diagnostics/tier-one-model";
import type {
  CanonicalEnergyModel,
  DrawingDocumentType,
  EnergyFact,
  ReadinessCategory,
} from "@/lib/energy-diagnostics/types";
import {
  validateCanonicalEnergyModel,
  type CanonicalModelValidation,
} from "@/lib/energy-diagnostics/validation";

import { diagnosisCopy } from "./copy";
import { EvidenceInspector } from "./evidence-inspector";
import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
  runWindowScenario,
  spatialResultsForRun,
} from "./model-operations";
import { ReadinessStrip } from "./readiness-strip";
import {
  ResultComparison,
  type ResultMetric,
} from "./result-comparison";
import { SourceReviewCanvas } from "./source-review-canvas";
import type {
  DiagnosisLocale,
  DiagnosisSelection,
  EnergyDiagnosisWorkspaceProps,
} from "./types";

type WorkflowStage =
  | "drawings"
  | "classification"
  | "review"
  | "zones"
  | "envelope"
  | "systems"
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

const STAGES: readonly WorkflowStage[] = [
  "drawings",
  "classification",
  "review",
  "zones",
  "envelope",
  "systems",
  "assumptions",
  "preflight",
  "simulation",
  "compare",
];

const STAGE_LABEL: Record<DiagnosisLocale, Record<WorkflowStage, string>> = {
  ko: {
    drawings: "도면 세트",
    classification: "도면 분류",
    review: "추출 검토",
    zones: "공간 및 열구역",
    envelope: "외피 성능",
    systems: "설비 시스템",
    assumptions: "가정 및 누락값",
    preflight: "모델 검사",
    simulation: "시뮬레이션",
    compare: "결과 비교",
  },
  en: {
    drawings: "Drawing set",
    classification: "Classification",
    review: "Extraction review",
    zones: "Spaces & zones",
    envelope: "Envelope",
    systems: "Systems",
    assumptions: "Assumptions",
    preflight: "Preflight",
    simulation: "Simulation",
    compare: "Comparison",
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
  return model.mappings.find((mapping) => mapping.canonicalObjectId === canonicalId)?.threeObjectIds ?? [];
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
  scenarioRun: DegreeDaySimulationRun | null,
): boolean {
  if (stage === "drawings") return Boolean(ingestion || model?.drawingSet.documents.length);
  if (stage === "classification") return Boolean(model?.drawingSet.documents.every((document) => document.classification.documentType !== "unknown"));
  if (stage === "review") return Boolean(model && model.conflicts.every((conflict) => conflict.resolutionStatus !== "unresolved"));
  if (stage === "zones") return Boolean(model?.geometry.thermalZones.length);
  if (stage === "envelope") return Boolean(model && model.envelope.constructions.length > 0 && model.envelope.infiltrationAirChangesPerHour.value != null);
  if (stage === "systems") return Boolean(model?.systems.hvac.length);
  if (stage === "assumptions") return Boolean(model && model.missingValues.every((missing) => !missing.blocking));
  if (stage === "preflight") return validation?.validForSimulation ?? false;
  if (stage === "simulation") return baselineRun?.status === "succeeded";
  return scenarioRun?.status === "succeeded";
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
  renderScene,
  onModelChange,
  onDrawingSetIngested,
  onSelectionChange,
  onSimulationRun,
}: EnergyDiagnosisWorkspaceProps) {
  const locale = localeProp ?? initialModel?.project.locale ?? "ko";
  const copy = diagnosisCopy(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priorModelReviewRef = useRef<Readonly<{
    ingestion: DrawingSetIngestionResult | null;
    sources: readonly DrawingSourceInput[];
    selectedDocumentId: string | null;
    selectedFact: EnergyFact<unknown> | null;
  }> | null>(null);
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
  const [scenarioUValue, setScenarioUValue] = useState(1.1);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [recentSavedProject, setRecentSavedProject] =
    useState<StoredEnergyDiagnosticsProjectSummary | null>(null);

  useEffect(() => {
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
      onModelChange?.(next);
    },
    [onModelChange],
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

  const handleFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;
      setOperation("upload");
      setError(null);
      setNotice(null);
      await nextPaint();
      try {
        const uploadedSources: DrawingSourceInput[] = await Promise.all(
          files.map(async (file) => ({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            content: await file.arrayBuffer(),
          })),
        );
        const result = await ingestDrawingSet(uploadedSources, {
          setName: files.length === 1 ? files[0].name : `${files[0].name} +${files.length - 1}`,
          ingestedAt: new Date().toISOString(),
        });
        const tierOneOutcome = model
          ? null
          : buildTierOneCanonicalModel(result, locale);
        const tierOneModel =
          tierOneOutcome?.status === "created" ? tierOneOutcome.model : null;
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
          setActiveStage("classification");
        }
        setActiveView("source");
        if (model) {
          setNotice(
            locale === "ko"
              ? "새 도면은 검토용으로 분리했습니다. 현재 모델과 실행 결과는 변경되지 않았습니다."
              : "The new drawings are staged for review. The current model and runs are unchanged.",
          );
        } else if (tierOneOutcome?.status === "extraction_only") {
          setNotice(tierOneOutcome.message);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Drawing ingestion failed.");
      } finally {
        setOperation(null);
      }
    },
    [emitModel, ingestion, locale, model, onDrawingSetIngested, selectedDocumentId, selectedFact, sources],
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
    if (!model) return;
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
        setActiveStage("simulation");
        setActiveView("model");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.simulationFailed);
    } finally {
      setOperation(null);
    }
  }, [copy.simulationFailed, emitModel, model, onSimulationRun]);

  const runScenario = useCallback(async () => {
    if (!model) return;
    setOperation("scenario");
    setError(null);
    setNotice(null);
    await nextPaint();
    try {
      const completed = runWindowScenario(model, scenarioUValue);
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
      setOperation(null);
    }
  }, [copy.simulationFailed, emitModel, model, onSimulationRun, scenarioUValue]);

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
      setNotice(copy.saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project save failed.");
    } finally {
      setOperation(null);
    }
  }, [copy.saved, model, sources]);

  const restoreProject = useCallback(async (projectId: string) => {
    setOperation("reload");
    setError(null);
    setNotice(null);
    try {
      const loadedBundle = await loadEnergyDiagnosticsBundle(projectId);
      if (!loadedBundle) {
        setNotice(copy.noSaved);
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
        if (restoredScenario) {
          const scenario = loaded.scenarios.find(
            (candidate) => candidate.id === restoredScenario.scenarioId,
          );
          const restoredWindowU = scenario?.deltas.find((delta) =>
            delta.path.endsWith(".uValueWPerM2K"),
          )?.replacement.value;
          if (
            typeof restoredWindowU === "number" &&
            Number.isFinite(restoredWindowU)
          ) {
            setScenarioUValue(restoredWindowU);
          }
        }
        setActiveStage(
          restoredScenario ? "compare" : restoredBaseline ? "simulation" : "review",
        );
        setSelectedRunId(restoredScenario?.id ?? restoredBaseline?.id ?? null);
        setActiveView(restoredBaseline ? "model" : "source");
        setNotice(copy.reloaded);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project reload failed.");
    } finally {
      setOperation(null);
    }
  }, [copy.noSaved, copy.reloaded, emitModel]);

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
    geometry: "zones",
    envelope: "envelope",
    usage: "assumptions",
    systems: "systems",
    simulation: "preflight",
  };

  const nextAction = useMemo(() => {
    if (detachedIngestion) {
      return {
        label: locale === "ko" ? "새 도면 추출 검토" : "Review new extraction",
        run: () => setActiveStage("review"),
        stage: "review" as WorkflowStage,
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
    if (scenarioRun?.status !== "succeeded") return { label: copy.runScenario, run: runScenario, stage: "compare" as WorkflowStage };
    return { label: copy.save, run: saveProject, stage: "compare" as WorkflowStage };
  }, [applyAssumption, baselineRun?.status, copy, detachedIngestion, loadReference, locale, model, resolveConflict, runBaseline, runScenario, saveProject, scenarioRun?.status, validation?.validForSimulation]);

  const stagePanel = detachedIngestion && ingestion
    ? renderDetachedIngestionPanel(ingestion, locale, selectedDocumentFacts, selectFact)
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
        scenarioUValue,
        onScenarioUValue: setScenarioUValue,
        onSelectFact: selectFact,
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
        accept=".dwg,.dxf,.svg,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bimfit-schematic.json,.bimfit-model.json"
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
        {STAGES.map((stage, index) => {
          const complete = stageComplete(
            stage,
            detachedIngestion ? null : model,
            ingestion,
            detachedIngestion ? null : validation,
            detachedIngestion ? null : baselineRun,
            detachedIngestion ? null : scenarioRun,
          );
          const active = stage === activeStage;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setActiveStage(stage)}
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
              {STAGE_LABEL[locale][stage]}
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
                  <Button type="button" onClick={loadReference} disabled={operation != null}>
                    <Sparkles className="size-4" /> {copy.referenceCase}
                  </Button>
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
        <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
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

function renderDetachedIngestionPanel(
  ingestion: DrawingSetIngestionResult,
  locale: DiagnosisLocale,
  selectedDocumentFacts: readonly EnergyFact<unknown>[],
  onSelectFact: (fact: EnergyFact<unknown>) => void,
): ReactNode {
  return (
    <section data-testid="detached-ingestion-panel">
      <PanelHeading
        eyebrow={locale === "ko" ? "새 도면 세트 · 모델 적용 전" : "NEW DRAWING SET · NOT YET APPLIED"}
        title={ingestion.drawingSet.name}
        action={<Badge variant="outline" className="font-mono text-[9px]">{ingestion.drawingSet.documents.length} docs</Badge>}
      />
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
        {locale === "ko"
          ? "기존 모델과 실행 결과는 변경되지 않았습니다. 분류·추출 결과를 검토한 뒤 상위 모델 생성 단계에서 새 리비전을 적용하세요."
          : "The existing model and runs are unchanged. Review classification and extraction before the parent model-generation step applies a new revision."}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {selectedDocumentFacts.length ? selectedDocumentFacts.slice(0, 12).map((fact) => (
          <button
            key={fact.id}
            type="button"
            onClick={() => onSelectFact(fact)}
            className="rounded-lg border bg-card p-3 text-left hover:border-cyan-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block truncate font-mono text-[9px] text-muted-foreground">{fact.key}</span>
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
  scenarioUValue,
  onScenarioUValue,
  onSelectFact,
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
  scenarioUValue: number;
  onScenarioUValue: (value: number) => void;
  onSelectFact: (fact: EnergyFact<unknown>) => void;
  onSelectZone: (zoneId: string) => void;
  onApplyAssumption: () => void;
  onRunBaseline: () => void;
  onRunScenario: () => void;
  onSelectResult: (runId: string, metric: ResultMetric) => void;
}>) {
  const copy = diagnosisCopy(locale);
  if (stage === "drawings" || stage === "classification") {
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
        <PanelHeading eyebrow={STAGE_LABEL[locale].review} title={locale === "ko" ? "선택 도면의 에너지 관련 추출값" : "Energy-relevant facts on the selected drawing"} action={<Badge variant="outline" className="font-mono text-[9px]">{selectedDocumentFacts.length} facts</Badge>} />
        {selectedDocumentFacts.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {selectedDocumentFacts.slice(0, 12).map((fact) => (
              <button key={fact.id} type="button" onClick={() => onSelectFact(fact)} className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-cyan-500/35 hover:bg-cyan-500/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block truncate font-mono text-[9px] text-muted-foreground">{fact.key}</span>
                <span className="mt-1 block truncate font-mono text-xs font-semibold">{factValue(fact)}</span>
                <span className="mt-2 block text-[9px] text-muted-foreground">{fact.status} · {fact.confidence == null ? "—" : `${Math.round(fact.confidence * 100)}%`}</span>
              </button>
            ))}
          </div>
        ) : <div className="rounded-lg border border-dashed p-5 text-xs text-muted-foreground">{copy.selectEvidence}</div>}
      </section>
    );
  }

  if (stage === "zones") {
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale].zones} title={`${model.geometry.thermalZones.length} ${locale === "ko" ? "개 검토 가능 열구역" : "reviewable thermal zones"}`} />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {model.geometry.thermalZones.map((zone) => (
            <button key={zone.id} type="button" onClick={() => onSelectZone(zone.id)} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-cyan-500/35 hover:bg-cyan-500/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`thermal-zone-${zone.id}`}>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded border font-mono text-[9px]", zone.conditioned.value ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "border-dashed bg-muted text-muted-foreground")}><CircleDotDashed className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{zone.name.value ?? zone.stableKey}</span><span className="mt-1 block font-mono text-[9px] text-muted-foreground">{factValue(zone.floorAreaSqm)} · {factValue(zone.volumeM3)}</span></span>
              <ArrowRight className="size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">{locale === "ko" ? "용도·외주부 방향·코어·공조 서비스가 같은 공간만 결정론적으로 묶었습니다." : "Spaces are grouped deterministically only when usage, perimeter orientation, core status, and HVAC service agree."}</p>
      </section>
    );
  }

  if (stage === "envelope") {
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale].envelope} title={locale === "ko" ? "외피 입력과 근거 상태" : "Envelope inputs and evidence"} />
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
    );
  }

  if (stage === "systems") {
    return (
      <section>
        <PanelHeading eyebrow={STAGE_LABEL[locale].systems} title={locale === "ko" ? "열구역에 연결된 설비" : "Systems linked to thermal zones"} />
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
        <PanelHeading eyebrow={STAGE_LABEL[locale].simulation} title={baselineRun?.status === "succeeded" ? copy.readyToRun : copy.runBaseline} action={<Button type="button" size="sm" onClick={onRunBaseline} disabled={!validation.validForSimulation}><Play className="size-3.5" /> {copy.runBaseline}</Button>} />
        <ResultComparison
          baseline={baselineRun?.result ?? null}
          scenario={null}
          locale={locale}
          baselineRunId={baselineRun?.id}
          onSelectResult={onSelectResult}
        />
        {baselineRun && <details className="mt-3 rounded-lg border bg-card p-3"><summary className="cursor-pointer text-[10px] font-semibold">{locale === "ko" ? "엔진 로그 및 근사" : "Engine logs and approximations"}</summary><div className="mt-2 space-y-1 font-mono text-[9px] leading-relaxed text-muted-foreground">{baselineRun.logs.map((log) => <p key={log}>{log}</p>)}{baselineRun.warnings.map((warning) => <p key={warning} className="text-amber-700 dark:text-amber-300">WARN · {warning}</p>)}</div></details>}
      </section>
    );
  }

  return (
    <section>
      <PanelHeading eyebrow={STAGE_LABEL[locale].compare} title={locale === "ko" ? "기준안과 비파괴 대안 비교" : "Baseline vs non-destructive alternative"} />
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <label className="min-w-48 flex-1 text-[10px] font-medium text-muted-foreground">{copy.scenarioValue}<Input type="number" min="0.5" max="5" step="0.1" value={scenarioUValue} onChange={(event) => onScenarioUValue(Number(event.target.value))} className="mt-1.5 h-8 font-mono text-xs" /></label>
        <span className="pb-2 font-mono text-[10px] text-muted-foreground">W/(m²·K)</span>
        <Button type="button" size="sm" onClick={onRunScenario} disabled={!baselineRun?.result || !Number.isFinite(scenarioUValue) || scenarioUValue <= 0}><Gauge className="size-3.5" /> {copy.runScenario}</Button>
        <p className="w-full text-[10px] text-muted-foreground">{copy.scenarioHelp}</p>
      </div>
      <ResultComparison
        baseline={baselineRun?.result ?? null}
        scenario={scenarioRun?.result ?? null}
        locale={locale}
        baselineRunId={baselineRun?.id}
        scenarioRunId={scenarioRun?.id}
        onSelectResult={onSelectResult}
      />
    </section>
  );
}
