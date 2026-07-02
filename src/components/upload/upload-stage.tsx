"use client";

import { useCallback, useState } from "react";
import { Upload, FileBox, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import {
  parseDxfText,
  type FootprintCandidate,
  type Polygon2D,
} from "@/lib/cad/dxf-parser";
import { parseDwgFile } from "@/lib/cad/dwg-parser";
import { FootprintPreview } from "./footprint-preview";
import { LayerPicker } from "./layer-picker";
import { PdfTracer } from "./pdf-tracer";

const ACCEPTED_EXTENSIONS = [".dxf", ".dwg", ".pdf"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type UploadStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "needs-pick"; candidates: FootprintCandidate[]; warnings: string[] }
  | { kind: "pdf-tracing"; pdfBytes: ArrayBuffer }
  | { kind: "ready"; polygon: Polygon2D; layer: string; areaSqm: number; warnings: string[] }
  | { kind: "error"; message: string };

function t(ko: string, en: string, isKo: boolean): string {
  return isKo ? ko : en;
}

export function UploadStage() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const [pendingLayer, setPendingLayer] = useState<string | null>(null);

  const buildingPk = useActiveBuildingPk();
  const setOverride = useRecipeStore((s) => s.setOverride);
  const advance = useWorkflowStore((s) => s.advance);
  const retreat = useWorkflowStore((s) => s.retreat);

  const ingestDxf = useCallback(
    (text: string) => {
      const parsed = parseDxfText(text);
      if (parsed.candidates.length === 0) {
        setStatus({
          kind: "error",
          message: t(
            "DXF 파일에서 닫힌 외곽 폴리라인을 찾지 못했습니다. 외곽선을 닫힌 폴리라인(LWPOLYLINE)으로 내보냈는지 확인하세요.",
            "No closed outline polyline found in the DXF. Ensure the building outline is exported as a closed LWPOLYLINE.",
            isKo
          ),
        });
        return;
      }
      if (parsed.candidates.length === 1) {
        const c = parsed.candidates[0];
        setStatus({
          kind: "ready",
          polygon: c.polygon,
          layer: c.layer,
          areaSqm: c.areaSqm,
          warnings: parsed.warnings,
        });
      } else {
        setStatus({
          kind: "needs-pick",
          candidates: parsed.candidates,
          warnings: parsed.warnings,
        });
      }
    },
    [isKo]
  );

  const processFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf("."));

      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setStatus({
          kind: "error",
          message: t(
            `지원하지 않는 파일 형식: ${ext}`,
            `Unsupported file type: ${ext}`,
            isKo
          ),
        });
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setStatus({
          kind: "error",
          message: t(
            "파일 크기가 50MB를 초과합니다",
            "File exceeds 50 MB limit",
            isKo
          ),
        });
        return;
      }

      setStatus({ kind: "parsing" });

      try {
        if (ext === ".dxf") {
          const text = await file.text();
          ingestDxf(text);
        } else if (ext === ".pdf") {
          // Rendering and tracing happen in <PdfTracer>; we only ferry the bytes.
          const buf = await file.arrayBuffer();
          setStatus({ kind: "pdf-tracing", pdfBytes: buf });
        } else {
          // .dwg — validate header client-side, then round-trip through server.
          const parsed = await parseDwgFile(file);
          if (parsed.candidates.length === 0) {
            setStatus({
              kind: "error",
              message:
                parsed.warnings[parsed.warnings.length - 1] ??
                t(
                  "DWG 변환에 실패했습니다. .dxf로 내보내어 다시 업로드하세요.",
                  "DWG conversion failed. Export as .dxf and upload again.",
                  isKo,
                ),
            });
            return;
          }
          if (parsed.candidates.length === 1) {
            const c = parsed.candidates[0];
            setStatus({
              kind: "ready",
              polygon: c.polygon,
              layer: c.layer,
              areaSqm: c.areaSqm,
              warnings: parsed.warnings,
            });
          } else {
            setStatus({
              kind: "needs-pick",
              candidates: parsed.candidates,
              warnings: parsed.warnings,
            });
          }
        }
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [ingestDxf, isKo]
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
          isKo
        ),
      });
      return;
    }
    // Store as GeoJSON-style rings ([outer, ...holes]).
    const rings: [number, number][][] = [status.polygon];
    setOverride(buildingPk, "footprintPolygon", rings);
    advance({ footprintPolygon: rings });
  }, [status, buildingPk, setOverride, advance, isKo]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-start overflow-auto bg-background p-8">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileBox className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {t("도면 업로드", "Upload CAD Floor Plan", isKo)}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "선택한 건물의 CAD 외곽 도면을 업로드하세요. 업로드한 외곽선이 디지털 트윈의 바닥 폴리곤으로 사용됩니다.",
              "Upload the CAD outline for the selected building. The uploaded footprint will drive the digital twin geometry.",
              isKo
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
              {t("파일을 끌어다 놓거나", "Drag and drop a file, or", isKo)}
            </p>
            <label className="cursor-pointer">
              <span className="text-sm text-primary underline">
                {t("파일 선택", "browse", isKo)}
              </span>
              <input
                type="file"
                className="hidden"
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

        {/* Status — parsing */}
        {status.kind === "parsing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t("도면 처리 중…", "Processing drawing…", isKo)}
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

        {/* Status — needs layer pick */}
        {status.kind === "needs-pick" && (
          <LayerPicker
            candidates={status.candidates}
            selectedLayer={pendingLayer}
            onPreview={handleLayerPreview}
            onConfirm={handleLayerConfirm}
            lang={isKo ? "ko" : "en"}
          />
        )}

        {/* Status — PDF tracing */}
        {status.kind === "pdf-tracing" && (
          <PdfTracer
            pdfBytes={status.pdfBytes}
            onConfirm={handlePdfConfirm}
            lang={isKo ? "ko" : "en"}
          />
        )}

        {/* Status — ready */}
        {status.kind === "ready" && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {t("외곽선 준비 완료", "Footprint ready", isKo)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("레이어", "Layer", isKo)}: <code>{status.layer}</code>
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

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => retreat()}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("검색으로 돌아가기", "Back to search", isKo)}
          </Button>
          <Button
            type="button"
            disabled={status.kind !== "ready" || !buildingPk}
            onClick={commitAndAdvance}
            data-testid="upload-continue"
          >
            {t("트윈으로 계속", "Continue to Twin", isKo)}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
