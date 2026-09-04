"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PencilRuler } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SchematicEditor } from "@/components/generative/schematic/schematic-editor";
import type { BlueprintSpec } from "@/lib/generative/blueprint";
import { diagnosticSourceFromBlueprint } from "@/lib/energy-diagnostics/blueprint-source";
import type { DrawingSourceInput } from "@/lib/energy-diagnostics/ingestion";
import { useAppStore } from "@/store/app-store";
import { useBlueprintStore } from "@/store/blueprint-store";

import { EnergyDiagnosisScene } from "./energy-diagnosis-scene";
import { EnergyDiagnosisWorkspace } from "./energy-diagnosis-workspace";
import {
  LedgerBaselineStatus,
  useLedgerBaseline,
  type LedgerRecord,
} from "./ledger-baseline-loader";
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
  /** Always present: the route redirects to the landing page without one. */
  initialMethod: DiagnosticEntryMethod;
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
  const ledgerRecordState = useLedgerRecord(initialBuildingId, locale);
  const ledgerRecord = useMemo<LedgerRecord | null>(() => {
    if (initialMethod !== "ledger") return null;
    return ledgerRecordState.phase === "ready" ? ledgerRecordState.record : null;
  }, [initialMethod, ledgerRecordState]);
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
      // `method=ledger` without a building redirects to the landing page, so
      // dropping the building here would make the first autosave navigate the
      // user's session away ~1.5s after it opened. Keep the building id.
      const building = initialBuildingId
        ? `&building=${encodeURIComponent(initialBuildingId)}`
        : "";
      router.replace(
        `/diagnostics/new?method=${initialMethod}${building}&project=${encodeURIComponent(projectId)}`,
        { scroll: false },
      );
    },
    [initialBuildingId, initialMethod, router],
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
              {/* "Start over" means start the workflow again, so it goes to
                  step 1. `/` is the model gallery now and would strand the
                  user on a page with nothing to restart. */}
              <Link href="/diagnostics/new?method=ledger">
                <ArrowLeft className="size-4" />
                {locale === "ko" ? "처음으로" : "Start over"}
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
          <Link href="/diagnostics/new?method=ledger">
            <ArrowLeft className="size-4" />
            {locale === "ko" ? "처음으로" : "Start over"}
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
