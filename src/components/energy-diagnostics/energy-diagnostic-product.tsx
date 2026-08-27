"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileUp,
  FlaskConical,
  PencilRuler,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SchematicEditor } from "@/components/generative/schematic/schematic-editor";
import type { BlueprintSpec } from "@/lib/generative/blueprint";
import { diagnosticSourceFromBlueprint } from "@/lib/energy-diagnostics/blueprint-source";
import type { DrawingSourceInput } from "@/lib/energy-diagnostics/ingestion";
import {
  listEnergyDiagnosticsProjects,
  type StoredEnergyDiagnosticsProjectSummary,
} from "@/lib/energy-diagnostics/storage";
import { useAppStore } from "@/store/app-store";
import { useBlueprintStore } from "@/store/blueprint-store";

import { EnergyDiagnosisScene } from "./energy-diagnosis-scene";
import { EnergyDiagnosisWorkspace } from "./energy-diagnosis-workspace";
import {
  LedgerBaselineStatus,
  useLedgerBaseline,
  type LedgerRecord,
} from "./ledger-baseline-loader";
import { LedgerLookup } from "./ledger-lookup";
import { useLedgerRecord } from "./use-ledger-record";
import type { EnergyDiagnosisSceneContext } from "./types";

export type DiagnosticEntryMethod =
  | "ledger"
  | "upload"
  | "create"
  | "sample"
  | "resume";

const METHOD_LABEL: Record<DiagnosticEntryMethod, { en: string; ko: string }> = {
  ledger: { en: "Building register", ko: "건축물대장" },
  upload: { en: "Upload drawing", ko: "도면 업로드" },
  create: { en: "Create building", ko: "건물 만들기" },
  sample: { en: "Sample diagnostic", ko: "샘플 진단" },
  resume: { en: "Saved diagnostic", ko: "저장된 진단" },
};

function renderScene(context: EnergyDiagnosisSceneContext) {
  return <EnergyDiagnosisScene context={context} />;
}

export function EnergyDiagnosticProduct({
  initialMethod,
  initialProjectId,
  initialBuildingId,
}: Readonly<{
  initialMethod?: DiagnosticEntryMethod;
  initialProjectId?: string;
  /**
   * A 건축물대장 building id for `method=ledger`. "demo" selects the bundled
   * sample register so the whole path runs offline with no API key.
   */
  initialBuildingId?: string;
}>) {
  const router = useRouter();
  const language = useAppStore((state) => state.language);
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [recentProject, setRecentProject] =
    useState<StoredEnergyDiagnosticsProjectSummary | null>(null);
  const locale = language === "ko" ? "ko" : "en";
  const [createdSources, setCreatedSources] = useState<
    readonly DrawingSourceInput[]
  >([]);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [editingGeometry, setEditingGeometry] = useState(
    initialMethod === "create" && !initialProjectId,
  );
  const routedProjectIdRef = useRef(initialProjectId);

  // Wave 1 resolves the bundled sample register, which needs no API key. The
  // search-driven path supplies a fetched record through the same seam.
  // `method=ledger` with no building shows the register lookup; with one, the
  // record is resolved (bundled sample offline, or fetched from 건축물대장)
  // and turned straight into a running baseline.
  const showLedgerLookup =
    initialMethod === "ledger" && !initialBuildingId;
  const ledgerRecordState = useLedgerRecord(initialBuildingId, locale);
  const ledgerRecord = useMemo<LedgerRecord | null>(() => {
    if (initialMethod !== "ledger" || showLedgerLookup) return null;
    return ledgerRecordState.phase === "ready" ? ledgerRecordState.record : null;
  }, [initialMethod, showLedgerLookup, ledgerRecordState]);
  const ledgerBaseline = useLedgerBaseline(ledgerRecord, locale);

  useEffect(() => {
    let cancelled = false;
    const markHydrated = () => {
      if (!cancelled) setStoreHydrated(true);
    };
    const persistence = useAppStore.persist;
    if (!persistence || persistence.hasHydrated()) queueMicrotask(markHydrated);
    const unsubscribe = persistence?.onFinishHydration(markHydrated);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!storeHydrated || initialMethod) return;
    let cancelled = false;
    void listEnergyDiagnosticsProjects()
      .then((projects) => {
        if (!cancelled) setRecentProject(projects[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecentProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initialMethod, storeHydrated]);

  const acceptBlueprint = useCallback((blueprint: BlueprintSpec) => {
    setCreatedSources([diagnosticSourceFromBlueprint(blueprint)]);
    setGeometryRevision((value) => value + 1);
    setEditingGeometry(false);
  }, []);

  const openReviewedDrawingImport = useCallback(() => {
    // A new Upload-method import must not inherit geometry from a previous
    // editor session. The diagnostic workspace is left untouched until the
    // user explicitly adopts a reviewed drawing.
    useBlueprintStore.getState().reset();
    setEditingGeometry(true);
  }, []);

  const bindSavedProject = useCallback(
    (projectId: string) => {
      if (!initialMethod || routedProjectIdRef.current === projectId) return;
      routedProjectIdRef.current = projectId;
      router.replace(
        `/diagnostics/new?method=${initialMethod}&project=${encodeURIComponent(projectId)}`,
        { scroll: false },
      );
    },
    [initialMethod, router],
  );

  if (!storeHydrated) {
    return (
      <section
        className="grid min-h-[calc(100dvh-var(--header-height,3.5rem))] place-items-center bg-[#07141d] text-sm text-slate-300"
        data-testid="diagnostic-session-loading"
      >
        {language === "ko" ? "진단 세션을 불러오는 중…" : "Loading diagnostic session…"}
      </section>
    );
  }

  if (!initialMethod) {
    return (
      <section
        className="relative isolate min-h-[calc(100dvh-var(--header-height,3.5rem))] overflow-hidden bg-[#07141d] text-slate-100"
        data-testid="diagnostic-start"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,205,229,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(103,205,229,.08) 1px,transparent 1px)",
            backgroundSize: "34px 34px",
            maskImage:
              "linear-gradient(to bottom,black 0%,rgba(0,0,0,.65) 62%,transparent 100%)",
          }}
        />
        <div className="pointer-events-none absolute -right-24 top-8 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative mx-auto flex min-h-[inherit] w-full max-w-6xl flex-col justify-center px-5 py-14 sm:px-8 lg:px-12">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300">
              <span className="h-px w-10 bg-cyan-300/70" />
              BIMFIT / Building energy diagnostic
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl">
              {locale === "ko"
                ? "새 에너지 진단을 시작하세요"
                : "Start a new energy diagnostic"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {locale === "ko"
                ? "도면을 가져오거나 건물 형상을 직접 만드세요. BIMFIT이 해석한 모델을 확인한 뒤 검증하고, 같은 흐름에서 진단 결과까지 이어갑니다."
                : "Bring a drawing or create the building geometry. Review what BIMFIT understood, resolve material assumptions, and run one traceable diagnostic."}
            </p>
          </div>

          <div className="mt-10 grid overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/55 shadow-2xl backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/diagnostics/new?method=ledger"
              className="group min-w-0 border-b border-slate-700/80 p-6 transition-colors hover:bg-cyan-300/[0.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 sm:border-r"
              data-testid="diagnostic-method-ledger"
            >
              <Building2 className="size-6 text-cyan-300" aria-hidden="true" />
              <h2 className="mt-8 text-lg font-semibold text-white">
                {locale === "ko" ? "건축물대장으로 시작" : "Start from the register"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {locale === "ko"
                  ? "건물을 고르면 대장 정보로 기준 모델과 진단 결과가 바로 만들어집니다."
                  : "Pick a building and its register becomes a baseline model and a diagnostic straight away."}
              </p>
              <span className="mt-6 flex items-center gap-2 text-xs font-semibold text-cyan-200">
                {locale === "ko" ? "건물 선택" : "Choose building"}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            <Link
              href="/diagnostics/new?method=upload"
              className="group min-w-0 border-b border-slate-700/80 p-6 transition-colors hover:bg-cyan-300/[0.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 lg:border-r"
              data-testid="diagnostic-method-upload"
            >
              <FileUp className="size-6 text-cyan-300" aria-hidden="true" />
              <h2 className="mt-8 text-lg font-semibold text-white">
                {locale === "ko" ? "건물 도면 업로드" : "Upload a building drawing"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {locale === "ko"
                  ? "DXF는 바로 검증하고, DWG·SVG는 형상과 레이어를 먼저 검토합니다."
                  : "Validate DXF directly, or review DWG and SVG geometry and layers before adoption."}
              </p>
              <span className="mt-6 flex items-center gap-2 text-xs font-semibold text-cyan-200">
                {locale === "ko" ? "도면 선택" : "Choose drawing"}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            <Link
              href="/diagnostics/new?method=create"
              className="group min-w-0 border-b border-slate-700/80 p-6 transition-colors hover:bg-cyan-300/[0.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 sm:border-r lg:border-b-0"
              data-testid="diagnostic-method-create"
            >
              <PencilRuler className="size-6 text-cyan-300" aria-hidden="true" />
              <h2 className="mt-8 text-lg font-semibold text-white">
                {locale === "ko" ? "건물 형상 만들기" : "Create building geometry"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {locale === "ko"
                  ? "도면이 없을 때 경계를 그리고 진단 모델로 검증합니다."
                  : "Draw the boundary when no source drawing is available, then validate it as the diagnostic model."}
              </p>
              <span className="mt-6 flex items-center gap-2 text-xs font-semibold text-cyan-200">
                {locale === "ko" ? "형상 편집" : "Open geometry editor"}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

            <Link
              href="/diagnostics/new?method=sample"
              className="group min-w-0 p-6 transition-colors hover:bg-amber-300/[0.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300 lg:border-b-0"
              data-testid="diagnostic-method-sample"
            >
              <FlaskConical className="size-6 text-amber-300" aria-hidden="true" />
              <h2 className="mt-8 text-lg font-semibold text-white">
                {locale === "ko" ? "샘플 진단 체험" : "Try a sample diagnostic"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {locale === "ko"
                  ? "대표 건물을 실제 검증·시뮬레이션·결과 흐름으로 실행합니다."
                  : "Run a representative building through the same validation, engine, and results path."}
              </p>
              <span className="mt-6 flex items-center gap-2 text-xs font-semibold text-amber-200">
                {locale === "ko" ? "샘플 시작" : "Start sample"}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>

          <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
            <Building2 className="size-3.5" aria-hidden="true" />
            {locale === "ko"
              ? "모든 입력 방식은 하나의 건물 모델, 검증 과정, 진단 결과를 사용합니다."
              : "Every input method produces one building model, one validation path, and one results experience."}
          </p>
          {recentProject ? (
            <Link
              href={`/diagnostics/new?method=resume&project=${encodeURIComponent(recentProject.projectId)}`}
              className="mt-5 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-slate-700/80 bg-slate-950/45 px-4 py-3 text-sm text-slate-200 transition-colors hover:border-cyan-400/50 hover:bg-cyan-300/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              data-testid="resume-recent-diagnostic"
            >
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {locale === "ko" ? "최근 진단" : "Recent diagnostic"}
                </span>
                <span className="mt-0.5 block truncate font-semibold">
                  {recentProject.projectName}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-cyan-200">
                {locale === "ko" ? "계속하기" : "Resume"}
              </span>
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  if (showLedgerLookup) {
    return (
      <section
        className="min-h-[calc(100dvh-var(--header-height,3.5rem))] bg-[#07141d] text-slate-100"
        data-testid="diagnostic-ledger-start"
      >
        <header className="flex min-h-12 flex-wrap items-center gap-3 border-b border-slate-800 px-3 py-2 sm:px-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/diagnostics/new">
              <ArrowLeft className="size-4" />
              {locale === "ko" ? "입력 방식" : "Input methods"}
            </Link>
          </Button>
          <div className="h-5 w-px bg-slate-700" aria-hidden="true" />
          <p className="text-xs font-semibold">
            {locale === "ko" ? "건축물대장으로 시작" : "Start from the register"}
          </p>
        </header>
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
          <LedgerLookup locale={locale} />
          <p className="mt-6 text-xs text-slate-500">
            {locale === "ko" ? "먼저 둘러보시겠습니까? " : "Want to look around first? "}
            <Link
              href="/diagnostics/new?method=ledger&building=demo"
              className="font-semibold text-cyan-300 underline-offset-4 hover:underline"
              data-testid="ledger-try-sample"
            >
              {locale === "ko" ? "샘플 건물로 진단 열기" : "Open the sample building"}
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (initialMethod === "ledger" && ledgerBaseline.phase !== "ready") {
    if (ledgerRecordState.phase === "unavailable") {
      return (
        <LedgerBaselineStatus
          locale={locale}
          state={{
            phase: "insufficient",
            reason: "lookup_unavailable",
            message: ledgerRecordState.message,
          }}
        />
      );
    }
    return <LedgerBaselineStatus state={ledgerBaseline} locale={locale} />;
  }

  const methodLabel = METHOD_LABEL[initialMethod][locale];
  const geometryEditorOpen =
    (initialMethod === "create" || initialMethod === "upload") &&
    editingGeometry;
  const reviewingUploadedDrawing =
    geometryEditorOpen && initialMethod === "upload";

  return (
    <>
      {geometryEditorOpen && (
      <section className="flex h-[calc(100dvh-var(--header-height,3.5rem))] min-h-[680px] flex-col overflow-hidden bg-background">
        <header className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2 sm:px-4">
          {reviewingUploadedDrawing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingGeometry(false)}
              data-testid="back-to-direct-dxf-upload"
            >
              <ArrowLeft className="size-4" />
              {locale === "ko" ? "DXF 직접 업로드" : "Direct DXF upload"}
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/diagnostics/new">
                <ArrowLeft className="size-4" />
                {locale === "ko" ? "입력 방식" : "Input methods"}
              </Link>
            </Button>
          )}
          <div className="h-5 w-px bg-border" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">
              {locale === "ko" ? "새 에너지 진단" : "New Energy Diagnostic"}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {reviewingUploadedDrawing
                ? locale === "ko"
                  ? "진단 준비 · DWG·SVG 형상 및 레이어 검토"
                  : "Model preparation · review DWG or SVG geometry and layers"
                : locale === "ko"
                  ? "진단 준비 · 건물 형상 편집"
                  : "Model preparation · edit building geometry"}
            </p>
          </div>
        </header>
        <div className="min-h-0 flex-1" data-testid="diagnostic-geometry-editor">
          <SchematicEditor
            onBlueprintReady={acceptBlueprint}
            generateLabel={locale === "ko" ? "모델 검토" : "Review building model"}
            generateBusyLabel={locale === "ko" ? "준비 중…" : "Preparing…"}
            initialImportOpen={reviewingUploadedDrawing}
          />
        </div>
      </section>
      )}
      {(!geometryEditorOpen || reviewingUploadedDrawing) && (
        <section
          className="min-h-[calc(100dvh-var(--header-height,3.5rem))] bg-muted/20"
          hidden={reviewingUploadedDrawing}
          aria-hidden={reviewingUploadedDrawing || undefined}
        >
      <header className="flex min-h-12 flex-wrap items-center gap-3 border-b bg-background px-3 py-2 sm:px-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/diagnostics/new">
            <ArrowLeft className="size-4" />
            {locale === "ko" ? "입력 방식" : "Input methods"}
          </Link>
        </Button>
        <div className="h-5 w-px bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">
            {locale === "ko" ? "새 에너지 진단" : "New Energy Diagnostic"}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {methodLabel}
          </p>
        </div>
        {initialMethod === "create" && (
          <Button variant="outline" size="sm" onClick={() => setEditingGeometry(true)}>
            <PencilRuler className="size-3.5" />
            {locale === "ko" ? "형상 편집" : "Edit geometry"}
          </Button>
        )}
        {initialMethod === "upload" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openReviewedDrawingImport}
            data-testid="diagnostic-review-dwg-svg"
          >
            <PencilRuler className="size-3.5" />
            {locale === "ko" ? "DWG·SVG 가져오기" : "Import DWG or SVG"}
          </Button>
        )}
      </header>
      <EnergyDiagnosisWorkspace
        key={`${initialMethod}-${geometryRevision}`}
        className="min-h-[calc(100dvh-var(--header-height,3.5rem)-3rem)] border-x-0 border-b-0"
        locale={locale}
        initialModel={
          ledgerBaseline.phase === "ready" ? ledgerBaseline.model : undefined
        }
        initialModelSources={
          ledgerBaseline.phase === "ready" ? ledgerBaseline.sources : undefined
        }
        // A register model arrives already built AND already simulated, so it
        // opens on its result: choosing a building is the only input the
        // product asks for, and the answer should be on screen when you land.
        initialStage={initialMethod === "ledger" ? "compare" : undefined}
        autoLoadSample={initialMethod === "sample"}
        restoreProjectId={geometryRevision === 0 ? initialProjectId : undefined}
        initialDrawingSources={createdSources}
        showSampleOption={initialMethod === "resume"}
        renderScene={renderScene}
        onProjectSaved={bindSavedProject}
      />
        </section>
      )}
    </>
  );
}
