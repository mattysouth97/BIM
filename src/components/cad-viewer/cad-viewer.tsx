// src/components/cad-viewer/cad-viewer.tsx
// Full-screen DWG/DXF viewer + 2D drafting: ortho R3F scene, layer panel,
// SVG markup/draw overlay. Everything renders from one ViewState — see
// use-cad-view.ts. Drafting state lives in cad-draft-store; this component
// hosts the draw-tool reducer state and keyboard shortcuts.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useHotkeys } from "react-hotkeys-hook";
import { X, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { useCadViewerStore } from "@/store/cad-viewer-store";
import { useCadMarkupStore } from "@/store/cad-markup-store";
import { useCadDraftStore } from "@/store/cad-draft-store";
import { buildLayerGeometries } from "@/lib/cad/doc/build-geometry";
import { buildSnapIndex } from "@/lib/cad/doc/snap";
import { entityToChains } from "@/lib/cad/doc/entity-geometry";
import {
  reduceDraw, type DrawEvent, type DrawState, type DrawToolKind,
} from "@/lib/cad/doc/draw-tools";
import type { CadPolyline, Vec2 } from "@/lib/cad/doc/types";
import { polylineToFootprint } from "@/lib/cad/doc/to-footprint";
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

const DRAW_TOOL_SET = new Set(["draw-line", "draw-polyline", "draw-rect", "draw-circle"]);
const isDrawTool = (v: string): v is DrawToolKind => DRAW_TOOL_SET.has(v);

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

  // Drafting state — active when the draft store is editing this document.
  const draftDocId = useCadDraftStore((s) => s.doc?.id);
  const draftActive = draftDocId === doc.id;
  const selectedEntityId = useCadDraftStore((s) => s.selectedEntityId);
  const activeLayer = useCadDraftStore((s) => s.activeLayer);
  const canUndo = useCadDraftStore((s) => s.past.length > 0);
  const canRedo = useCadDraftStore((s) => s.future.length > 0);
  const addEntity = useCadDraftStore((s) => s.addEntity);
  const deleteEntity = useCadDraftStore((s) => s.deleteEntity);
  const selectEntity = useCadDraftStore((s) => s.selectEntity);
  const addLayer = useCadDraftStore((s) => s.addLayer);
  const setActiveLayer = useCadDraftStore((s) => s.setActiveLayer);
  const undo = useCadDraftStore((s) => s.undo);
  const redo = useCadDraftStore((s) => s.redo);

  const { containerRef, view, size, fit, handlers } = useCadView(
    doc.extents,
    tool === "pan",
  );
  const [pick, setPick] = useState<FootprintPick | null>(null);
  const [gridOn, setGridOn] = useState(true);
  const glRef = useRef<HTMLCanvasElement | null>(null);

  // Draw-tool reducer state; reset when the active tool changes
  // (adjust-during-render pattern — no effect needed).
  const [drawPoints, setDrawPoints] = useState<Vec2[]>([]);
  const [lastTool, setLastTool] = useState(tool);
  if (tool !== lastTool) {
    setLastTool(tool);
    setDrawPoints([]);
  }
  const drawState: DrawState | null =
    draftActive && isDrawTool(tool) ? { tool, points: drawPoints } : null;

  const dispatchDraw = useCallback(
    (ev: DrawEvent) => {
      if (!drawState) return;
      const r = reduceDraw(drawState, ev);
      setDrawPoints(r.state.points);
      if (r.created) {
        addEntity(r.created);
        if (r.created.kind === "polyline" && r.created.closed) {
          const fp = polylineToFootprint({
            ...r.created,
            id: "draft-new",
            layer: activeLayer,
          } satisfies CadPolyline);
          if (fp) setPick({ ...fp, layer: activeLayer });
        }
      }
    },
    [drawState, addEntity, activeLayer],
  );

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

  const selectedChains = useMemo(() => {
    if (!selectedEntityId) return [];
    const e = doc.entities.find((x) => x.id === selectedEntityId);
    return e ? entityToChains(e) : [];
  }, [doc, selectedEntityId]);

  useEffect(() => { loadMarkups(doc.id); }, [doc.id, loadMarkups]);

  // Keyboard shortcuts.
  useHotkeys("escape", () => {
    if (drawState && drawState.points.length > 0) dispatchDraw({ type: "cancel" });
    else { selectEntity(null); setPick(null); }
  }, [drawState, dispatchDraw, selectEntity]);
  useHotkeys("enter", () => dispatchDraw({ type: "finish" }), [dispatchDraw]);
  useHotkeys("c", () => dispatchDraw({ type: "close" }), [dispatchDraw]);
  useHotkeys(["delete", "backspace"], () => {
    if (draftActive && selectedEntityId) deleteEntity(selectedEntityId);
  }, [draftActive, selectedEntityId, deleteEntity]);
  useHotkeys(["ctrl+z", "meta+z"], (e) => { e.preventDefault(); undo(); }, [undo]);
  useHotkeys(["ctrl+y", "ctrl+shift+z", "meta+shift+z"], (e) => {
    e.preventDefault(); redo();
  }, [redo]);

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
            {draftActive && ` · ${t("작성 레이어", "drawing on", isKo)}: ${activeLayer}`}
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
          activeLayer={draftActive ? activeLayer : undefined}
          onSetActive={draftActive ? setActiveLayer : undefined}
          onAddLayer={draftActive ? addLayer : undefined}
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
            <CadScene
              doc={doc}
              layerVisibility={layerVisibility}
              view={view}
              gridOn={draftActive && gridOn}
            />
          </Canvas>
          <MarkupOverlay
            doc={doc}
            view={view}
            size={size}
            snapIndex={snapIndex}
            isKo={isKo}
            onFootprintPick={setPick}
            drawState={drawState}
            onDrawEvent={dispatchDraw}
            gridOn={gridOn}
            selectedChains={selectedChains}
            onSelectEntity={selectEntity}
          />
          {/* Floating toolbar */}
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
            <ViewerToolbar
              isKo={isKo}
              onSnapshot={snapshot}
              onUndo={undo}
              onRedo={redo}
              canUndo={draftActive && canUndo}
              canRedo={draftActive && canRedo}
              gridOn={gridOn}
              onToggleGrid={() => setGridOn((g) => !g)}
            />
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
