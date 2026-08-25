"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileBox, AlertCircle, ArrowLeft, ArrowRight, Eye, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { classifyPlanPolylines, serviceCoreFromPlan } from "@/lib/cad/doc/classify-plan";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import {
  parseDxfText,
  type FootprintCandidate,
  type Polygon2D,
} from "@/lib/cad/dxf-parser";
import { parseDwgFile } from "@/lib/cad/dwg-parser";
import {
  CAD_CLIENT_MAX_FILE_BYTES,
  formatFileSizeMiB,
} from "@/lib/cad/import-limits";
import { mapDxfTextToDoc } from "@/lib/cad/doc/map-dxf-to-doc";
import type { CadDocument } from "@/lib/cad/doc/types";
import { useCadViewerStore } from "@/store/cad-viewer-store";
import { useCadDraftStore } from "@/store/cad-draft-store";
import { CadViewer } from "@/components/cad-viewer/cad-viewer";
import { getWorkflowMode } from "@/lib/workflow/cad-draft";
import { FootprintPreview } from "./footprint-preview";
import { LayerPicker } from "./layer-picker";
import { PdfTracer } from "./pdf-tracer";

const ACCEPTED_EXTENSIONS = [".dxf", ".dwg", ".pdf"];

type UploadStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "needs-pick"; candidates: FootprintCandidate[]; warnings: string[] }
  | { kind: "pdf-tracing"; pdfBytes: ArrayBuffer }
  | { kind: "ready"; polygon: Polygon2D; layer: string; areaSqm: number; warnings: string[] }
  | { kind: "error"; message: string };

export function UploadStage() {
  const { t, lang } = useT();
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const [pendingLayer, setPendingLayer] = useState<string | null>(null);
  const [cadDoc, setCadDoc] = useState<CadDocument | null>(null);
  const importGenerationRef = useRef(0);
  const activeImportRef = useRef<{
    generation: number;
    controller: AbortController;
  } | null>(null);
  const openViewer = useCadViewerStore((s) => s.openViewer);
  const closeViewer = useCadViewerStore((s) => s.closeViewer);
  const startDraft = useCadDraftStore((s) => s.startDraft);
  const newDrawing = useCadDraftStore((s) => s.newDrawing);
  const loadDraft = useCadDraftStore((s) => s.loadDraft);
  const [savedDraft, setSavedDraft] = useState<CadDocument | null>(null);

  const buildingPk = useActiveBuildingPk();
  // P2-24 — cad-first drafts have no ledger: no search stage behind us, and
  // no "continue without CAD" escape hatch (the drawing IS the entry point).
  const mode = getWorkflowMode(buildingPk);
  const isCadFirst = mode === "cad-first";
  const setOverride = useRecipeStore((s) => s.setOverride);
  const patchProvenance = useTwinProvenanceStore((s) => s.patch);
  const advance = useWorkflowStore((s) => s.advance);
  const retreat = useWorkflowStore((s) => s.retreat);
  const skipCad = useWorkflowStore((s) => s.skipCad);

  // useActiveBuildingPk returns "" (not undefined) before the material store
  // hydrates — || catches both. The effect re-runs when the pk arrives, so
  // the button flips to "continue drawing" once the real key is known.
  const draftPk = buildingPk || "anon";
  const draftKey = `cad-draft:${draftPk}`;

  const invalidatePendingImport = useCallback(() => {
    importGenerationRef.current += 1;
    activeImportRef.current?.controller.abort();
    activeImportRef.current = null;
  }, []);

  const beginImport = useCallback(() => {
    activeImportRef.current?.controller.abort();
    const generation = importGenerationRef.current + 1;
    importGenerationRef.current = generation;
    const controller = new AbortController();
    activeImportRef.current = { generation, controller };

    return {
      generation,
      controller,
      isCurrent: () =>
        importGenerationRef.current === generation &&
        !controller.signal.aborted,
    };
  }, []);

  const finishImport = useCallback((generation: number) => {
    if (activeImportRef.current?.generation === generation) {
      activeImportRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      // File and WASM readers are not universally interruptible, so changing
      // the generation is the final guard against an unmounted late result.
      invalidatePendingImport();
    },
    [invalidatePendingImport],
  );

  useEffect(() => {
    let alive = true;
    void loadDraft(draftKey).then((d) => { if (alive) setSavedDraft(d); });
    return () => { alive = false; };
  }, [draftKey, loadDraft]);

  const openDraft = useCallback(() => {
    // Drawing from scratch replaces any file import that is still resolving.
    invalidatePendingImport();
    setPendingLayer(null);
    setCadDoc(null);
    setStatus({ kind: "idle" });
    if (savedDraft) startDraft(savedDraft, draftKey);
    else newDrawing(`draft-${draftPk}`, draftKey);
    const doc = useCadDraftStore.getState().doc;
    if (doc) openViewer(doc);
  }, [
    savedDraft,
    draftKey,
    draftPk,
    startDraft,
    newDrawing,
    openViewer,
    invalidatePendingImport,
  ]);

  const ingestDxf = useCallback(
    (text: string, fileName: string, isCurrent: () => boolean) => {
      if (!isCurrent()) return;
      const parsed = parseDxfText(text);
      if (!isCurrent()) return;
      // Full-drawing document for the viewer — independent of footprint
      // candidate extraction, so it exists even when no outline is found.
      const nextCadDoc = mapDxfTextToDoc(text, fileName);
      if (!isCurrent()) return;
      setCadDoc(nextCadDoc);
      if (parsed.candidates.length === 0) {
        if (!isCurrent()) return;
        setStatus({
          kind: "error",
          message: t(
            "닫힌 외곽 폴리라인을 찾지 못했습니다. 뷰어에서 열어 선을 결합(Join)하면 바닥 외곽선이 됩니다.",
            "No closed outline polyline found. Open the drawing and Join touching lines to make a floor outline.",
          ),
        });
        return;
      }
      if (parsed.candidates.length === 1) {
        const c = parsed.candidates[0];
        if (!isCurrent()) return;
        setStatus({
          kind: "ready",
          polygon: c.polygon,
          layer: c.layer,
          areaSqm: c.areaSqm,
          warnings: parsed.warnings,
        });
      } else {
        if (!isCurrent()) return;
        setStatus({
          kind: "needs-pick",
          candidates: parsed.candidates,
          warnings: parsed.warnings,
        });
      }
    },
    [t]
  );

  const loadSampleDrawing = useCallback(async () => {
    const { generation, controller, isCurrent } = beginImport();
    if (!isCurrent()) return;
    setPendingLayer(null);
    setCadDoc(null);
    setStatus({ kind: "parsing" });
    try {
      const res = await fetch("/samples/sample-footprint.dxf", {
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      if (!isCurrent()) return;
      ingestDxf(text, "sample-footprint.dxf", isCurrent);
    } catch {
      if (!isCurrent()) return;
      setStatus({
        kind: "error",
        message: t(
          "샘플 도면을 불러오지 못했습니다. 다시 시도하거나 파일을 직접 올리세요.",
          "Could not load the sample drawing. Try again or upload your own file.",
        ),
      });
    } finally {
      finishImport(generation);
    }
  }, [beginImport, finishImport, ingestDxf, t]);

  const processFile = useCallback(
    async (file: File) => {
      // The newest selection owns all future import output. Abort interrupts
      // fetch-backed DWG conversion; the generation also covers File/WASM
      // work that the browser cannot cancel once it has started.
      const { generation, controller, isCurrent } = beginImport();
      const name = file.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf("."));

      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        if (!isCurrent()) return;
        setPendingLayer(null);
        setCadDoc(null);
        setStatus({
          kind: "error",
          message: t(
            `지원하지 않는 파일 형식: ${ext}`,
            `Unsupported file type: ${ext}`,
          ),
        });
        finishImport(generation);
        return;
      }

      if (file.size > CAD_CLIENT_MAX_FILE_BYTES) {
        if (!isCurrent()) return;
        setPendingLayer(null);
        setCadDoc(null);
        setStatus({
          kind: "error",
          message: t(
            `파일 크기가 ${formatFileSizeMiB(CAD_CLIENT_MAX_FILE_BYTES)} 제한을 초과합니다`,
            `File exceeds the ${formatFileSizeMiB(CAD_CLIENT_MAX_FILE_BYTES)} browser import limit`,
          ),
        });
        finishImport(generation);
        return;
      }

      if (!isCurrent()) return;
      setPendingLayer(null);
      setCadDoc(null);
      setStatus({ kind: "parsing" });

      try {
        if (ext === ".dxf") {
          const text = await file.text();
          if (!isCurrent()) return;
          ingestDxf(text, file.name, isCurrent);
        } else if (ext === ".pdf") {
          // Rendering and tracing happen in <PdfTracer>; we only ferry the bytes.
          // PDFs are raster sources — no CadDocument, no viewer.
          const buf = await file.arrayBuffer();
          if (!isCurrent()) return;
          setStatus({ kind: "pdf-tracing", pdfBytes: buf });
        } else {
          // .dwg — validate header, then LibreDWG / server round-trip.
          const parsed = await parseDwgFile(file, {
            signal: controller.signal,
          });
          if (!isCurrent()) return;
          const nextCadDoc = parsed.dxfText
            ? mapDxfTextToDoc(parsed.dxfText, file.name)
            : null;
          if (!isCurrent()) return;
          setCadDoc(nextCadDoc);
          if (parsed.candidates.length === 0) {
            if (!isCurrent()) return;
            setStatus({
              kind: "error",
              message:
                parsed.warnings[parsed.warnings.length - 1] ??
                t(
                  "DWG 변환에 실패했습니다. .dxf로 내보내어 다시 업로드하세요.",
                  "DWG conversion failed. Export as .dxf and upload again.",
                ),
            });
            return;
          }
          if (parsed.candidates.length === 1) {
            const c = parsed.candidates[0];
            if (!isCurrent()) return;
            setStatus({
              kind: "ready",
              polygon: c.polygon,
              layer: c.layer,
              areaSqm: c.areaSqm,
              warnings: parsed.warnings,
            });
          } else {
            if (!isCurrent()) return;
            setStatus({
              kind: "needs-pick",
              candidates: parsed.candidates,
              warnings: parsed.warnings,
            });
          }
        }
      } catch (err) {
        if (!isCurrent()) return;
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        finishImport(generation);
      }
    },
    [beginImport, finishImport, ingestDxf, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const handleLayerPreview = useCallback((candidate: FootprintCandidate) => {
    setPendingLayer(candidate.layer);
  }, []);

  const handlePdfConfirm = useCallback(
    (polygon: Polygon2D, areaSqm: number) => {
      setStatus({
        kind: "ready",
        polygon,
        layer: "pdf-trace",
        areaSqm,
        warnings: [],
      });
    },
    []
  );

  const handleLayerConfirm = useCallback(
    (candidate: FootprintCandidate) => {
      setPendingLayer(null);
      setStatus((prev) => ({
        kind: "ready",
        polygon: candidate.polygon,
        layer: candidate.layer,
        areaSqm: candidate.areaSqm,
        warnings: prev.kind === "needs-pick" ? prev.warnings : [],
      }));
    },
    []
  );

  const commitAndAdvance = useCallback(() => {
    if (status.kind !== "ready") return;
    if (!buildingPk) {
      setStatus({
        kind: "error",
        message: t(
          "활성 건물이 없습니다. 검색 단계로 돌아가 건물을 선택하세요.",
          "No active building. Return to search and pick a building first.",
        ),
      });
      return;
    }
    // Store as GeoJSON-style rings ([outer, ...holes]).
    const rings: [number, number][][] = [status.polygon];
    setOverride(buildingPk, "footprintPolygon", rings);
    let hasCadPlan = false;
    if (cadDoc) {
      const classified = classifyPlanPolylines(cadDoc);
      const core = serviceCoreFromPlan(classified);
      if (core) {
        setOverride(buildingPk, "serviceCore", core);
        hasCadPlan = true;
      } else if (classified.some((c) => c.role === "room")) {
        hasCadPlan = true;
      }
    }
    patchProvenance(buildingPk, {
      hasCadFootprint: true,
      hasCadPlan,
    });
    advance({ mode, footprintPolygon: rings });
  }, [status, buildingPk, setOverride, advance, mode, t, cadDoc, patchProvenance]);

  // P2-17 — proceed without a CAD drawing: the twin falls back to the
  // public-data (ledger/VWorld) footprint the viewer already uses when no
  // override exists. No footprint override is written.
  const skipAndAdvance = useCallback(() => {
    if (!buildingPk) {
      setStatus({
        kind: "error",
        message: t(
          "활성 건물이 없습니다. 검색 단계로 돌아가 건물을 선택하세요.",
          "No active building. Return to search and pick a building first.",
        ),
      });
      return;
    }
    skipCad(buildingPk);
    advance({ cadSkipped: true });
  }, [buildingPk, skipCad, advance, t]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-start overflow-auto bg-background p-8">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileBox className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {t("도면 업로드", "Upload CAD Floor Plan")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "선택한 건물의 CAD 외곽 도면을 업로드하세요. 업로드한 외곽선이 디지털 트윈의 바닥 폴리곤으로 사용됩니다.",
              "Upload the CAD outline for the selected building. The uploaded footprint will drive the digital twin geometry.",
            )}
          </p>
        </div>

        {/* Dropzone */}
        <div
          data-testid="upload-dropzone"
          className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload
            className={`h-10 w-10 ${
              dragOver ? "text-primary" : "text-muted-foreground/50"
            }`}
          />
          <div className="text-center">
            <p className="text-sm font-medium">
              {t("파일을 끌어다 놓거나", "Drag and drop a file, or")}
            </p>
            <label className="cursor-pointer">
              <span className="text-sm text-primary underline">
                {t("파일 선택", "browse")}
              </span>
              <input
                type="file"
                // P1-07 (e): sr-only (not `hidden`) keeps the input in the tab
                // order so the "browse" affordance is keyboard-reachable.
                className="sr-only"
                accept=".dxf,.dwg,.pdf"
                onChange={handleFileInput}
                data-testid="upload-file-input"
              />
            </label>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[10px]">.dxf</Badge>
            <Badge variant="outline" className="text-[10px]">.dwg</Badge>
            <Badge variant="outline" className="text-[10px]">.pdf</Badge>
          </div>
        </div>

        {/* Draw from scratch — no file, no API key needed */}
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="new-drawing"
            onClick={openDraft}
          >
            <PencilRuler className="mr-1.5 h-4 w-4" />
            {savedDraft
              ? t("도면 계속 그리기", "Continue drawing")
              : t("새 도면 그리기", "Draw new plan")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="upload-sample-dxf"
            onClick={() => void loadSampleDrawing()}
          >
            {t("샘플 도면으로 시작", "Start with a sample plan")}
          </Button>
        </div>

        {/* Status — parsing */}
        {status.kind === "parsing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("도면 처리 중…", "Processing drawing…")}
          </div>
        )}

        {/* Status — error */}
        {status.kind === "error" && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="flex-1">{status.message}</span>
          </div>
        )}

        {/* Open full drawing in the CAD viewer */}
        {cadDoc && (status.kind === "ready" || status.kind === "needs-pick" || status.kind === "error") && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              data-testid="open-cad-viewer"
              onClick={() => {
                openViewer(cadDoc);
                // Uploaded drawings are draft-editable too (edits persist
                // under an upload-scoped key, separate from blank drafts).
                startDraft(cadDoc, `cad-draft:upload:${draftPk}:${cadDoc.id}`);
              }}
            >
              <Eye className="mr-1.5 h-4 w-4" />
              {t("뷰어에서 열기", "Open in viewer")}
            </Button>
          </div>
        )}

        {/* Status — needs layer pick */}
        {status.kind === "needs-pick" && (
          <LayerPicker
            candidates={status.candidates}
            selectedLayer={pendingLayer}
            onPreview={handleLayerPreview}
            onConfirm={handleLayerConfirm}
            lang={lang}
          />
        )}

        {/* Status — PDF tracing */}
        {status.kind === "pdf-tracing" && (
          <PdfTracer
            pdfBytes={status.pdfBytes}
            onConfirm={handlePdfConfirm}
            lang={lang}
          />
        )}

        {/* Status — ready */}
        {status.kind === "ready" && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {t("외곽선 준비 완료", "Footprint ready")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("레이어", "Layer")}: <code>{status.layer}</code>
                  {" · "}
                  {status.areaSqm.toFixed(0)} m²
                </div>
              </div>
            </div>
            <div className="flex justify-center text-primary">
              <FootprintPreview polygon={status.polygon} size={260} />
            </div>
            {status.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {status.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Navigation — cad-first drafts have no search stage and no skip path */}
        <div className="flex items-center justify-between pt-2">
          {isCadFirst ? (
            <span />
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => retreat()}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t("검색으로 돌아가기", "Back to search")}
            </Button>
          )}
          <div className="flex items-center gap-2">
            {!isCadFirst && (
              <Button
                type="button"
                variant="outline"
                onClick={skipAndAdvance}
                data-testid="upload-skip"
              >
                {t("CAD 없이 계속", "Continue without CAD")}
              </Button>
            )}
            <Button
              type="button"
              disabled={status.kind !== "ready" || !buildingPk}
              onClick={commitAndAdvance}
              data-testid="upload-continue"
            >
              {isCadFirst
                ? t("정보 입력으로 계속", "Continue to Building Info")
                : t("트윈으로 계속", "Continue to Twin")}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
        {!isCadFirst && (
          <p className="text-right text-xs text-muted-foreground">
            {t(
              "도면이 없어도 진행할 수 있습니다 — 트윈은 공공데이터(건축물대장) 외곽선으로 생성되며, 정밀도가 낮을 수 있습니다.",
              "No drawing? You can continue — the twin will use the public-data (building ledger) footprint, which may be less precise.",
            )}
          </p>
        )}
      </div>

      {/* Full-screen CAD viewer (renders only while a doc is open) */}
      <CadViewer
        onUseFootprint={(polygon, areaSqm, layer) => {
          setStatus({ kind: "ready", polygon, layer, areaSqm, warnings: [] });
          closeViewer();
        }}
        onUseCore={(slot) => {
          if (buildingPk) {
            setOverride(buildingPk, "serviceCore", slot);
            patchProvenance(buildingPk, { hasCadPlan: true, hasCadFootprint: true });
          }
          closeViewer();
        }}
      />
    </div>
  );
}
