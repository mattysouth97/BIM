// src/components/cad-viewer/cad-viewer.tsx
// Full-screen DWG/DXF viewer: ortho R3F scene + layer panel + markup overlay.
// Everything renders from one ViewState — see use-cad-view.ts.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { X, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { useCadViewerStore } from "@/store/cad-viewer-store";
import { useCadMarkupStore } from "@/store/cad-markup-store";
import { buildLayerGeometries } from "@/lib/cad/doc/build-geometry";
import { buildSnapIndex } from "@/lib/cad/doc/snap";
import { CadScene } from "./cad-scene";
import { LayerPanel } from "./layer-panel";
import { ViewerToolbar } from "./viewer-toolbar";
import { MarkupOverlay, type FootprintPick } from "./markup-overlay";
import { useCadView } from "./use-cad-view";
import type { Polygon2D } from "@/lib/cad/dxf-parser";

export interface CadViewerProps {
  onUseFootprint?: (polygon: Polygon2D, areaSqm: number, layer: string) => void;
}

function t(ko: string, en: string, isKo: boolean): string {
  return isKo ? ko : en;
}

export function CadViewer({ onUseFootprint }: CadViewerProps) {
  const doc = useCadViewerStore((s) => s.doc);
  if (!doc) return null;
  return <CadViewerInner key={doc.id} onUseFootprint={onUseFootprint} />;
}

function CadViewerInner({ onUseFootprint }: CadViewerProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const doc = useCadViewerStore((s) => s.doc)!;
  const layerVisibility = useCadViewerStore((s) => s.layerVisibility);
  const toggleLayer = useCadViewerStore((s) => s.toggleLayer);
  const setAllLayers = useCadViewerStore((s) => s.setAllLayers);
  const closeViewer = useCadViewerStore((s) => s.closeViewer);
  const loadMarkups = useCadMarkupStore((s) => s.loadForDocument);
  const tool = useCadMarkupStore((s) => s.tool);

  const { containerRef, view, size, fit, handlers } = useCadView(
    doc.extents,
    tool === "pan",
  );
  const [pick, setPick] = useState<FootprintPick | null>(null);
  const glRef = useRef<HTMLCanvasElement | null>(null);

  const { layers } = useMemo(() => buildLayerGeometries(doc), [doc]);
  const snapIndex = useMemo(
    () =>
      buildSnapIndex(
        layers,
        new Set(
          Object.entries(layerVisibility)
            .filter(([, visible]) => visible)
            .map(([name]) => name),
        ),
      ),
    [layers, layerVisibility],
  );

  useEffect(() => { loadMarkups(doc.id); }, [doc.id, loadMarkups]);

  const snapshot = useCallback(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${doc.id}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }, [doc.id]);

  const skippedTotal = Object.values(doc.stats.skipped).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" data-testid="cad-viewer">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">{doc.id}</span>
          <span className="text-xs text-muted-foreground">
            {doc.stats.mapped} {t("객체", "entities", isKo)}
            {skippedTotal > 0 && ` · ${skippedTotal} ${t("건너뜀", "skipped", isKo)}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={fit} title={t("전체 보기", "Fit to extents", isKo)}>
            <Maximize className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={closeViewer} data-testid="cad-viewer-close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <LayerPanel
          layers={doc.layers}
          visibility={layerVisibility}
          onToggle={toggleLayer}
          onAll={setAllLayers}
          isKo={isKo}
        />
        <div
          ref={containerRef}
          className={`relative min-w-0 flex-1 ${
            tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
          }`}
          {...handlers}
        >
          <Canvas
            orthographic
            frameloop="demand"
            gl={{ preserveDrawingBuffer: true }}
            onCreated={(state) => { glRef.current = state.gl.domElement; }}
          >
            <color attach="background" args={["#fafafa"]} />
            <CadScene doc={doc} layerVisibility={layerVisibility} view={view} />
          </Canvas>
          <MarkupOverlay
            doc={doc}
            view={view}
            size={size}
            snapIndex={snapIndex}
            isKo={isKo}
            onFootprintPick={setPick}
          />
          {/* Floating toolbar */}
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
            <ViewerToolbar isKo={isKo} onSnapshot={snapshot} />
          </div>
          {/* Footprint pick panel */}
          {pick && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-background/95 px-3 py-2 shadow">
              <span className="text-sm">
                {t("레이어", "Layer", isKo)}: <code>{pick.layer}</code>
                {" · "}
                {pick.areaSqm.toFixed(0)} m²
              </span>
              <Button
                type="button"
                size="sm"
                data-testid="cad-use-footprint"
                onClick={() => {
                  onUseFootprint?.(pick.polygon, pick.areaSqm, pick.layer);
                  setPick(null);
                }}
              >
                {t("바닥 외곽선으로 사용", "Use as footprint", isKo)}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPick(null)}>
                ✕
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Warnings strip */}
      {doc.warnings.length > 0 && (
        <div className="border-t px-3 py-1 text-xs text-muted-foreground">
          {doc.warnings.join(" · ")}
        </div>
      )}
    </div>
  );
}
