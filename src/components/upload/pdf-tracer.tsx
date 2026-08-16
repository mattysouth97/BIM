"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Undo2, RotateCcw, Check } from "lucide-react";
import type { PixelPoint } from "@/lib/cad/pdf-to-polygon";
import { pdfToPolygon } from "@/lib/cad/pdf-to-polygon";
import type { Polygon2D } from "@/lib/cad/dxf-parser";
import { pick } from "@/lib/i18n";

interface PdfTracerProps {
  /** Raw PDF file bytes (ArrayBuffer). */
  pdfBytes: ArrayBuffer;
  /** Target render width in CSS pixels. Height is aspect-scaled. */
  targetWidth?: number;
  /** Called once the user confirms a valid traced polygon. */
  onConfirm: (polygon: Polygon2D, areaSqm: number) => void;
  lang?: "ko" | "en";
}

/**
 * Renders a PDF page to a canvas, lets the user click vertices to trace a
 * building outline, and converts the pixel-space polygon into meters using a
 * real-world-width calibration input.
 *
 * pdfjs-dist is loaded lazily on the client so SSR and test environments
 * without a DOM never pull in the full PDF stack.
 */
export function PdfTracer({
  pdfBytes,
  targetWidth = 720,
  onConfirm,
  lang = "en",
}: PdfTracerProps) {
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [renderState, setRenderState] = useState<
    { kind: "loading" }
    | { kind: "ready"; widthPx: number; heightPx: number }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  const [points, setPoints] = useState<PixelPoint[]>([]);
  const [widthMeters, setWidthMeters] = useState<string>("");

  // Render PDF page 1 to the canvas on mount / when bytes change.
  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Bundler resolves the worker URL at build time.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const dataCopy = pdfBytes.slice(0);
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(dataCopy) });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = renderCanvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas context unavailable");

        // pdfjs-dist 5.x moved the render signature slightly; stick to the
        // stable { canvasContext, viewport } form which works in both 4.x and 5.x.
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        // Match overlay canvas size.
        const overlay = overlayCanvasRef.current;
        if (overlay) {
          overlay.width = canvas.width;
          overlay.height = canvas.height;
        }

        if (!cancelled) {
          setRenderState({
            kind: "ready",
            widthPx: canvas.width,
            heightPx: canvas.height,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setRenderState({
          kind: "error",
          message:
            err instanceof Error ? err.message : String(err),
        });
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, targetWidth]);

  // Redraw overlay whenever points change.
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || renderState.kind !== "ready") return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (points.length === 0) return;

    // Polygon path.
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (points.length >= 3) {
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 130, 246, 0.18)"; // blue-500 @ 18%
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(37, 99, 235)"; // blue-600
    ctx.stroke();

    // Vertex dots.
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(37, 99, 235)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "white";
      ctx.stroke();
    }
  }, [points, renderState]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (renderState.kind !== "ready") return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Account for canvas intrinsic vs. displayed size.
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      setPoints((prev) => [...prev, { x, y }]);
    },
    [renderState]
  );

  const handleUndo = useCallback(() => {
    setPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPoints([]);
  }, []);

  const widthMetersNum = Number(widthMeters);
  const canConfirm =
    points.length >= 3 && Number.isFinite(widthMetersNum) && widthMetersNum > 0;

  const handleConfirm = useCallback(() => {
    const result = pdfToPolygon({
      points,
      realWorldWidthMeters: widthMetersNum,
    });
    if (!result) return;
    onConfirm(result.polygon, result.areaSqm);
  }, [onConfirm, points, widthMetersNum]);

  return (
    <div className="flex flex-col gap-3">
      {/* Instructions */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">
          {pick(lang, "외곽선 추적", "Trace the footprint")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {pick(
            lang,
            "건물 외곽선의 각 꼭짓점을 순서대로 클릭하세요. 세 점 이상이면 닫힌 다각형이 됩니다.",
            "Click each corner of the building outline in order. After 3+ points the polygon closes automatically.",
          )}
        </p>
      </div>

      {/* Canvas stack */}
      {renderState.kind === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {pick(lang, "PDF 렌더링 중…", "Rendering PDF…")}
        </div>
      )}
      {renderState.kind === "error" && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <span>
            {pick(lang, "PDF를 읽을 수 없습니다: ", "Could not read PDF: ")}
            {renderState.message}
          </span>
        </div>
      )}
      <div className="relative inline-block" style={{ maxWidth: targetWidth }}>
        <canvas
          ref={renderCanvasRef}
          className="block rounded border bg-white"
          style={{ width: "100%", height: "auto" }}
        />
        <canvas
          ref={overlayCanvasRef}
          data-testid="pdf-tracer-overlay"
          onClick={handleClick}
          className="absolute inset-0 block cursor-crosshair"
          style={{ width: "100%", height: "auto" }}
        />
      </div>

      {/* Vertex + tool controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {points.length} {pick(lang, "정점", "vertices")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleUndo}
          disabled={points.length === 0}
        >
          <Undo2 className="mr-1 h-4 w-4" />
          {pick(lang, "되돌리기", "Undo")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleClear}
          disabled={points.length === 0}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          {pick(lang, "초기화", "Clear")}
        </Button>
      </div>

      {/* Scale calibration */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pdf-width-meters" className="text-xs">
          {pick(lang, "건물 대략 폭 (미터)", "Approximate building width (meters)")}
        </Label>
        <Input
          id="pdf-width-meters"
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          placeholder={pick(lang, "예: 25", "e.g. 25")}
          value={widthMeters}
          onChange={(e) => setWidthMeters(e.target.value)}
          className="max-w-[200px]"
          data-testid="pdf-width-meters"
        />
        <p className="text-[11px] text-muted-foreground">
          {pick(
            lang,
            "추적한 외곽선의 가로 길이에 해당하는 실제 미터값을 입력하세요. 축척 보정에 사용됩니다.",
            "Enter the real-world width in meters of the horizontal extent of your traced outline. Used for scale calibration.",
          )}
        </p>
      </div>

      {/* Confirm */}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!canConfirm}
          onClick={handleConfirm}
          data-testid="pdf-tracer-confirm"
        >
          <Check className="mr-1 h-4 w-4" />
          {pick(lang, "외곽선 확정", "Confirm footprint")}
        </Button>
      </div>
    </div>
  );
}
