"use client";

import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { formatArea } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { useAuthoringStore, type AnnotationMode } from "@/store/authoring-store";
import { usePlanStore } from "@/store/plan-store";
import { useOpeningPreset } from "@/components/viewer/opening-drawer";
import { DOOR_PRESETS, WINDOW_PRESETS } from "@/lib/components/component-types";
import { TOOLBAR_CONFIGS, GLOBAL_ITEMS } from "@/lib/workflow/toolbar-configs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, ArrowUp, ArrowRight, ArrowDown, Maximize2,
  Settings, Upload, ToggleLeft, ToggleRight, Layers,
  Pencil, PencilOff, Move, RotateCcw as RotateIcon, Scaling,
  Ruler, Square, AlignHorizontalDistributeCenter, Scissors, Trash2,
  Grid3x3, PenTool, Copy, DoorOpen, MousePointer,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContextualToolbarProps {
  /** View change handler — passed from building-scene parent */
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  /** Panel toggle handlers — will be wired in Plan 02 */
  onToggleConfigPanel?: () => void;
  configPanelOpen?: boolean;
  onToggleLayerPanel?: () => void;
  layerPanelOpen?: boolean;
  /** Model source controls */
  modelSource?: "parametric" | "uploaded";
  hasUploadedModel?: boolean;
  onToggleModelSource?: () => void;
  onUploadClick?: () => void;
  /** Building info for badges */
  buildingName?: string;
  era?: BuildingEra;
  /** Selected floor info */
  selectedFloor?: FloorGeometry | null;
}

// ---------------------------------------------------------------------------
// ModeIndicatorBadge — D-03: always-visible tool name indicator
// ---------------------------------------------------------------------------

function ModeIndicatorBadge({ isKo }: { isKo: boolean }) {
  const drawingMode = usePlanStore((s) => s.drawingMode);
  const annotationMode = useAuthoringStore((s) => s.annotationMode);
  const transformMode = useAuthoringStore((s) => s.transformMode);
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);

  if (drawingMode === "wall") {
    return (
      <Badge className="h-6 gap-1 text-[10px] bg-blue-600 text-white border-blue-700 hover:bg-blue-600">
        <PenTool className="h-3 w-3" />
        {isKo ? "벽 그리기" : "Draw Wall"}
      </Badge>
    );
  }
  if (drawingMode === "opening") {
    return (
      <Badge className="h-6 gap-1 text-[10px] bg-green-600 text-white border-green-700 hover:bg-green-600">
        <DoorOpen className="h-3 w-3" />
        {isKo ? "개구부 배치" : "Place Opening"}
      </Badge>
    );
  }
  if (annotationMode !== "none") {
    const annotationLabels: Record<string, { en: string; ko: string }> = {
      dimension: { en: "Dimension", ko: "치수선" },
      area:      { en: "Area Label", ko: "면적 레이블" },
      level:     { en: "Level Markers", ko: "층고 마커" },
      section:   { en: "Section Cut", ko: "단면 절단" },
    };
    const label = annotationLabels[annotationMode] ?? { en: annotationMode, ko: annotationMode };
    const AnnotationIcon =
      annotationMode === "dimension" ? Ruler :
      annotationMode === "area" ? Square :
      annotationMode === "level" ? AlignHorizontalDistributeCenter :
      Scissors;
    return (
      <Badge className="h-6 gap-1 text-[10px] bg-purple-600 text-white border-purple-700 hover:bg-purple-600">
        <AnnotationIcon className="h-3 w-3" />
        {isKo ? label.ko : label.en}
      </Badge>
    );
  }
  if (isAuthoring) {
    const transformLabels: Record<string, { en: string; ko: string }> = {
      translate: { en: "Move", ko: "이동" },
      rotate:    { en: "Rotate", ko: "회전" },
      scale:     { en: "Scale", ko: "크기" },
    };
    const label = transformLabels[transformMode] ?? { en: "Edit", ko: "편집" };
    const TransformIcon = transformMode === "translate" ? Move : transformMode === "rotate" ? RotateIcon : Scaling;
    return (
      <Badge className="h-6 gap-1 text-[10px] bg-amber-600 text-white border-amber-700 hover:bg-amber-600">
        <TransformIcon className="h-3 w-3" />
        {isKo ? label.ko : label.en}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="h-6 gap-1 text-[10px]">
      <MousePointer className="h-3 w-3" />
      {isKo ? "선택" : "Select"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// VerticalDivider — compact separator between toolbar groups
// ---------------------------------------------------------------------------

function VerticalDivider() {
  return <div className="w-px h-5 bg-border shrink-0" />;
}

// ---------------------------------------------------------------------------
// GlobalToolbarSection — always-visible view presets + plan/3D toggle
// ---------------------------------------------------------------------------

function GlobalToolbarSection({
  onViewChange,
  isKo,
}: {
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  isKo: boolean;
}) {
  const viewMode = usePlanStore((s) => s.viewMode);
  const setViewMode = usePlanStore((s) => s.setViewMode);

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {/* Plan/3D toggle */}
      <Button
        variant={viewMode === "plan" ? "default" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={() => setViewMode(viewMode === "plan" ? "3d" : "plan")}
        title={viewMode === "plan"
          ? (isKo ? "3D 뷰로 전환" : "Switch to 3D View")
          : (isKo ? "평면도 뷰" : "Plan View")}
      >
        <Grid3x3 className="h-3.5 w-3.5" />
      </Button>

      <VerticalDivider />

      {/* View presets */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("front")} title={isKo ? "앞면" : "Front"}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("side")} title={isKo ? "측면" : "Side"}>
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("top")} title={isKo ? "위" : "Top"}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("iso")} title={isKo ? "등각" : "Isometric"}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewChange("iso")} title={isKo ? "뷰 초기화" : "Reset View"}>
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssembleToolbar — all authoring controls for the assemble stage
// ---------------------------------------------------------------------------

function AssembleToolbar({
  isKo,
  modelSource,
  hasUploadedModel,
  onToggleModelSource,
  onUploadClick,
}: {
  isKo: boolean;
  modelSource?: "parametric" | "uploaded";
  hasUploadedModel?: boolean;
  onToggleModelSource?: () => void;
  onUploadClick?: () => void;
}) {
  const isAuthoring = useAuthoringStore((s) => s.isAuthoring);
  const toggleAuthoring = useAuthoringStore((s) => s.toggleAuthoring);
  const transformMode = useAuthoringStore((s) => s.transformMode);
  const setTransformMode = useAuthoringStore((s) => s.setTransformMode);
  const annotationMode = useAuthoringStore((s) => s.annotationMode);
  const setAnnotationMode = useAuthoringStore((s) => s.setAnnotationMode);
  const clearAnnotations = useAuthoringStore((s) => s.clearAnnotations);
  const sectionPosition = useAuthoringStore((s) => s.sectionPosition);
  const setSectionPosition = useAuthoringStore((s) => s.setSectionPosition);
  const sectionAxis = useAuthoringStore((s) => s.sectionAxis);
  const setSectionAxis = useAuthoringStore((s) => s.setSectionAxis);

  const viewMode = usePlanStore((s) => s.viewMode);
  const activeFloor = usePlanStore((s) => s.activeFloor);
  const setActiveFloor = usePlanStore((s) => s.setActiveFloor);
  const gridSize = usePlanStore((s) => s.gridSize);
  const setGridSize = usePlanStore((s) => s.setGridSize);
  const drawingWall = usePlanStore((s) => s.drawingWall);
  const floorCount = usePlanStore((s) => s.floorCount);
  const setFloorCount = usePlanStore((s) => s.setFloorCount);
  const floorHeights = usePlanStore((s) => s.floorHeights);
  const setFloorHeight = usePlanStore((s) => s.setFloorHeight);
  const copyFloor = usePlanStore((s) => s.copyFloor);
  const drawingMode = usePlanStore((s) => s.drawingMode);
  const setDrawingMode = usePlanStore((s) => s.setDrawingMode);
  const snapEnabled = usePlanStore((s) => s.snapEnabled);
  const setSnapEnabled = usePlanStore((s) => s.setSnapEnabled);
  const gridSnapEnabled = usePlanStore((s) => s.gridSnapEnabled);
  const setGridSnapEnabled = usePlanStore((s) => s.setGridSnapEnabled);
  const vertexSnapEnabled = usePlanStore((s) => s.vertexSnapEnabled);
  const setVertexSnapEnabled = usePlanStore((s) => s.setVertexSnapEnabled);
  const edgeSnapEnabled = usePlanStore((s) => s.edgeSnapEnabled);
  const setEdgeSnapEnabled = usePlanStore((s) => s.setEdgeSnapEnabled);

  const selectedPresetId = useOpeningPreset((s) => s.presetId);
  const setSelectedPresetId = useOpeningPreset((s) => s.setPresetId);

  const gridSizeOptions = [0.1, 0.5, 1.0];

  const toggleAnnotation = (mode: AnnotationMode) => {
    setAnnotationMode(annotationMode === mode ? "none" : mode);
  };

  return (
    <>
      {/* Edit mode toggle */}
      <Button
        variant={isAuthoring ? "default" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={toggleAuthoring}
        title={isAuthoring ? (isKo ? "편집 모드 종료" : "Exit Edit Mode") : (isKo ? "편집 모드" : "Edit Mode")}
      >
        {isAuthoring ? <PencilOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
      </Button>

      {/* Transform & annotation tools — only when authoring */}
      {isAuthoring && (
        <>
          <VerticalDivider />

          {/* Transform mode */}
          <Button
            variant={transformMode === "translate" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setTransformMode("translate")}
            title={`${isKo ? "이동" : "Move"} (G)`}
          >
            <Move className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={transformMode === "rotate" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setTransformMode("rotate")}
            title={`${isKo ? "회전" : "Rotate"} (R)`}
          >
            <RotateIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={transformMode === "scale" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setTransformMode("scale")}
            title={`${isKo ? "크기" : "Scale"} (S)`}
          >
            <Scaling className="h-3.5 w-3.5" />
          </Button>

          <VerticalDivider />

          {/* Annotation tools */}
          <Button
            variant={annotationMode === "dimension" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => toggleAnnotation("dimension")}
            title={isKo ? "치수선" : "Dimension"}
          >
            <Ruler className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={annotationMode === "area" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => toggleAnnotation("area")}
            title={isKo ? "면적 레이블" : "Area Label"}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={annotationMode === "level" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => toggleAnnotation("level")}
            title={isKo ? "층고 마커" : "Level Markers"}
          >
            <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={annotationMode === "section" ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => toggleAnnotation("section")}
            title={isKo ? "단면 절단" : "Section Cut"}
          >
            <Scissors className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clearAnnotations}
            title={isKo ? "주석 지우기" : "Clear Annotations"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}

      {/* Model upload + toggle */}
      <VerticalDivider />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onUploadClick}
        title={isKo ? "3D 모델 업로드" : "Upload 3D Model"}
      >
        <Upload className="h-3.5 w-3.5" />
      </Button>
      {hasUploadedModel && (
        <Button
          variant={modelSource === "uploaded" ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleModelSource}
          title={modelSource === "uploaded"
            ? (isKo ? "추정 모델로 전환" : "Switch to Parametric")
            : (isKo ? "업로드 모델로 전환" : "Switch to Uploaded")}
        >
          {modelSource === "uploaded"
            ? <ToggleRight className="h-3.5 w-3.5" />
            : <ToggleLeft className="h-3.5 w-3.5" />}
        </Button>
      )}

      {/* --- Plan-view popover sub-panels (rendered as overlay panels) --- */}

      {/* Section cut slider — appears as bottom overlay when section mode active */}
      {isAuthoring && annotationMode === "section" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg flex items-center gap-3">
          <span className="text-xs font-medium whitespace-nowrap">
            {isKo ? "단면 위치" : "Section Position"}
          </span>
          <div className="flex items-center gap-2">
            <button
              className={`text-[10px] px-1.5 py-0.5 rounded ${sectionAxis === "x" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setSectionAxis("x")}
            >
              X
            </button>
            <button
              className={`text-[10px] px-1.5 py-0.5 rounded ${sectionAxis === "z" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setSectionAxis("z")}
            >
              Z
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sectionPosition * 100)}
            onChange={(e) => setSectionPosition(Number(e.target.value) / 100)}
            className="w-48 h-1.5 accent-primary"
          />
          <span className="text-[10px] text-muted-foreground w-8">
            {Math.round(sectionPosition * 100)}%
          </span>
        </div>
      )}

      {/* Plan view sub-panel: floor selector + grid size + snap controls + drawing mode + opening presets */}
      {viewMode === "plan" && (
        <div className="absolute top-10 right-3 z-20 flex flex-col gap-1.5">
          {/* Active floor selector */}
          <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
            <span className="text-[10px] font-medium text-muted-foreground block mb-1">
              {isKo ? "활성 층" : "Active Floor"}
            </span>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: floorCount }, (_, i) => i).map((fl) => (
                <button
                  key={fl}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    activeFloor === fl
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setActiveFloor(fl)}
                >
                  {`${fl + 1}F`}
                </button>
              ))}
            </div>

            {/* Per-floor height input */}
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[10px] text-muted-foreground">
                {isKo ? "층고" : "Height"}
              </span>
              <input
                type="number"
                min={2.0}
                max={6.0}
                step={0.1}
                value={floorHeights[activeFloor] ?? 3.0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    setFloorHeight(activeFloor, Math.min(6.0, Math.max(2.0, val)));
                  }
                }}
                className="w-14 text-[10px] px-1 py-0.5 rounded border bg-background"
              />
              <span className="text-[10px] text-muted-foreground">m</span>
            </div>

            {/* Copy Floor button */}
            <button
              className="mt-1.5 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 w-full"
              onClick={() => {
                copyFloor(activeFloor, floorCount);
                setFloorCount(floorCount + 1);
                setActiveFloor(floorCount);
              }}
              title={isKo ? "현재 층 복사" : "Copy Current Floor"}
            >
              <Copy className="h-3 w-3" />
              {isKo ? "층 복사" : "Copy Floor"}
            </button>
          </div>

          {/* Grid size toggle */}
          <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
            <span className="text-[10px] font-medium text-muted-foreground block mb-1">
              {isKo ? "격자 크기" : "Grid Size"}
            </span>
            <div className="flex gap-1">
              {gridSizeOptions.map((gs) => (
                <button
                  key={gs}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    gridSize === gs
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setGridSize(gs)}
                >
                  {gs}m
                </button>
              ))}
            </div>
          </div>

          {/* Snap controls */}
          <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                {isKo ? "스냅" : "Snap"} (S)
              </span>
              <button
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  snapEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
                onClick={() => setSnapEnabled(!snapEnabled)}
              >
                {snapEnabled ? "ON" : "OFF"}
              </button>
            </div>
            {snapEnabled && (
              <div className="flex flex-col gap-0.5 mt-1">
                <label className="flex items-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    checked={gridSnapEnabled}
                    onChange={(e) => setGridSnapEnabled(e.target.checked)}
                    className="w-3 h-3"
                  />
                  {isKo ? "격자" : "Grid"}
                </label>
                <label className="flex items-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    checked={vertexSnapEnabled}
                    onChange={(e) => setVertexSnapEnabled(e.target.checked)}
                    className="w-3 h-3"
                  />
                  {isKo ? "꼭짓점" : "Vertex"}
                </label>
                <label className="flex items-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    checked={edgeSnapEnabled}
                    onChange={(e) => setEdgeSnapEnabled(e.target.checked)}
                    className="w-3 h-3"
                  />
                  {isKo ? "모서리" : "Edge"}
                </label>
              </div>
            )}
          </div>

          {/* Drawing mode toggle — only when authoring */}
          {isAuthoring && (
            <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
              <span className="text-[10px] font-medium text-muted-foreground block mb-1">
                {isKo ? "그리기 모드" : "Drawing Mode"}
              </span>
              <div className="flex gap-1">
                <button
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                    drawingMode === "wall"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setDrawingMode(drawingMode === "wall" ? null : "wall")}
                  title={isKo ? "벽 그리기" : "Draw Wall"}
                >
                  <PenTool className="h-3 w-3" />
                  {isKo ? "벽" : "Wall"}
                </button>
                <button
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                    drawingMode === "opening"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setDrawingMode(drawingMode === "opening" ? null : "opening")}
                  title={isKo ? "개구부 배치" : "Place Opening"}
                >
                  <DoorOpen className="h-3 w-3" />
                  {isKo ? "개구부" : "Opening"}
                </button>
              </div>
            </div>
          )}

          {/* Wall draw status indicator */}
          {isAuthoring && drawingMode === "wall" && (
            <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg flex items-center gap-1.5">
              <PenTool className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-medium">
                {drawingWall
                  ? (isKo ? "두 번째 점 클릭" : "Click second point")
                  : (isKo ? "벽 그리기: 시작점 클릭" : "Draw Wall: click start")}
              </span>
            </div>
          )}

          {/* Axis lock info — visible during wall drawing mode */}
          {isAuthoring && drawingMode === "wall" && (
            <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
              <span className="text-[10px] font-medium text-muted-foreground block mb-1">
                {isKo ? "축 제한" : "Axis Lock"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isKo ? "Shift: 자동 · X/Y: 축 고정" : "Shift: auto · X/Y: lock axis"}
              </span>
            </div>
          )}

          {/* Opening preset selector — visible when drawingMode === "opening" */}
          {isAuthoring && drawingMode === "opening" && (
            <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
              <span className="text-[10px] font-medium text-muted-foreground block mb-1">
                {isKo ? "문/창 프리셋" : "Door/Window Preset"}
              </span>
              <div className="flex flex-col gap-0.5">
                {DOOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-left ${
                      selectedPresetId === preset.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                    onClick={() => setSelectedPresetId(preset.id)}
                    title={preset.name}
                  >
                    <DoorOpen className="h-3 w-3 shrink-0" />
                    {isKo ? preset.nameKo : preset.name}
                    <span className="ml-auto text-[9px] opacity-70">{preset.width}m</span>
                  </button>
                ))}
                {WINDOW_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-left ${
                      selectedPresetId === preset.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                    onClick={() => setSelectedPresetId(preset.id)}
                    title={preset.name}
                  >
                    <Square className="h-3 w-3 shrink-0" />
                    {isKo ? preset.nameKo : preset.name}
                    <span className="ml-auto text-[9px] opacity-70">{preset.width}m</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Opening placement status indicator */}
          {isAuthoring && drawingMode === "opening" && (
            <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg flex items-center gap-1.5">
              <DoorOpen className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-medium">
                {isKo ? "벽 근처 클릭 — 개구부 배치" : "Click near a wall to place opening"}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ConfigureToolbar
// ---------------------------------------------------------------------------

function ConfigureToolbar({
  isKo,
  onToggleConfigPanel,
  configPanelOpen,
  onToggleLayerPanel,
  layerPanelOpen,
  modelSource,
  hasUploadedModel,
  onToggleModelSource,
  onUploadClick,
}: {
  isKo: boolean;
  onToggleConfigPanel?: () => void;
  configPanelOpen?: boolean;
  onToggleLayerPanel?: () => void;
  layerPanelOpen?: boolean;
  modelSource?: "parametric" | "uploaded";
  hasUploadedModel?: boolean;
  onToggleModelSource?: () => void;
  onUploadClick?: () => void;
}) {
  return (
    <>
      <Button
        variant={configPanelOpen ? "default" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={onToggleConfigPanel}
        title={isKo ? "설정" : "Configuration"}
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={layerPanelOpen ? "default" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={onToggleLayerPanel}
        title={isKo ? "건물 시스템 레이어" : "Building Layers"}
      >
        <Layers className="h-3.5 w-3.5" />
      </Button>

      <VerticalDivider />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onUploadClick}
        title={isKo ? "3D 모델 업로드" : "Upload 3D Model"}
      >
        <Upload className="h-3.5 w-3.5" />
      </Button>
      {hasUploadedModel && (
        <Button
          variant={modelSource === "uploaded" ? "default" : "ghost"}
          size="icon"
          className="h-7 w-7"
          onClick={onToggleModelSource}
          title={modelSource === "uploaded"
            ? (isKo ? "추정 모델로 전환" : "Switch to Parametric")
            : (isKo ? "업로드 모델로 전환" : "Switch to Uploaded")}
        >
          {modelSource === "uploaded"
            ? <ToggleRight className="h-3.5 w-3.5" />
            : <ToggleLeft className="h-3.5 w-3.5" />}
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// AnalyzeToolbar
// ---------------------------------------------------------------------------

function AnalyzeToolbar({
  isKo,
  onToggleLayerPanel,
  layerPanelOpen,
}: {
  isKo: boolean;
  onToggleLayerPanel?: () => void;
  layerPanelOpen?: boolean;
}) {
  return (
    <Button
      variant={layerPanelOpen ? "default" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={onToggleLayerPanel}
      title={isKo ? "건물 시스템 레이어" : "Building Layers"}
    >
      <Layers className="h-3.5 w-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// ContextualToolbar — main export
// ---------------------------------------------------------------------------

export function ContextualToolbar({
  onViewChange,
  onToggleConfigPanel,
  configPanelOpen,
  onToggleLayerPanel,
  layerPanelOpen,
  modelSource,
  hasUploadedModel,
  onToggleModelSource,
  onUploadClick,
  buildingName,
  era,
  selectedFloor,
}: ContextualToolbarProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const stage = useWorkflowStore((s) => s.stage);

  // Suppress TypeScript unused warning for TOOLBAR_CONFIGS — imported for its
  // stage-keyed structure; stage-specific rendering is done inline below.
  void TOOLBAR_CONFIGS;
  void GLOBAL_ITEMS;

  return (
    // Relative positioning container so plan-view sub-panels can use absolute positioning
    <div className="relative">
      {/* Fixed-height toolbar strip — h-10 (40px) */}
      <div className="h-10 shrink-0 border-b bg-background/95 backdrop-blur flex items-center px-2 gap-1 z-20">

        {/* Left: mode indicator badge (D-03) */}
        <ModeIndicatorBadge isKo={isKo} />

        {/* Building info badges — always visible when building loaded */}
        {buildingName && (
          <>
            <VerticalDivider />
            <Badge variant="secondary" className="text-xs h-6">
              {buildingName}
            </Badge>
            {era && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground h-6">
                {era === "pre-1970" ? "~1970" : era}
              </Badge>
            )}
            {/* Model source display badge (viewer-overlay lines 280-287) */}
            {modelSource && (
              <Badge
                variant={modelSource === "uploaded" ? "default" : "outline"}
                className="text-[10px] text-muted-foreground h-6"
              >
                {modelSource === "uploaded"
                  ? (isKo ? "건축 모델" : "Architectural Model")
                  : (isKo ? "추정 형상" : "Estimated Geometry")}
              </Badge>
            )}
          </>
        )}

        <VerticalDivider />

        {/* Center: Stage-specific toolbar groups */}
        {stage === "assemble" && (
          <AssembleToolbar
            isKo={isKo}
            modelSource={modelSource}
            hasUploadedModel={hasUploadedModel}
            onToggleModelSource={onToggleModelSource}
            onUploadClick={onUploadClick}
          />
        )}

        {stage === "configure" && (
          <ConfigureToolbar
            isKo={isKo}
            onToggleConfigPanel={onToggleConfigPanel}
            configPanelOpen={configPanelOpen}
            onToggleLayerPanel={onToggleLayerPanel}
            layerPanelOpen={layerPanelOpen}
            modelSource={modelSource}
            hasUploadedModel={hasUploadedModel}
            onToggleModelSource={onToggleModelSource}
            onUploadClick={onUploadClick}
          />
        )}

        {stage === "analyze" && (
          <AnalyzeToolbar
            isKo={isKo}
            onToggleLayerPanel={onToggleLayerPanel}
            layerPanelOpen={layerPanelOpen}
          />
        )}

        {/* stage === "select" and stage === "export" — global only, no extra tools */}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Global controls — always visible (D-04) */}
        <GlobalToolbarSection onViewChange={onViewChange} isKo={isKo} />
      </div>

      {/* Bottom left: floor info card — absolute within viewport */}
      {selectedFloor && (
        <div className="absolute top-10 left-3 z-20 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg max-w-xs">
          <p className="text-sm font-semibold">
            {selectedFloor.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({selectedFloor.type === "below"
                ? (isKo ? "지하" : "Underground")
                : (isKo ? "지상" : "Above ground")})
            </span>
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{isKo ? "면적" : "Area"}</span>
            <span className="font-medium text-foreground">{formatArea(selectedFloor.area)}</span>
            <span>{isKo ? "용도" : "Use"}</span>
            <span className="font-medium text-foreground">{selectedFloor.use || "-"}</span>
            <span>{isKo ? "구조" : "Structure"}</span>
            <span className="font-medium text-foreground">{selectedFloor.structure || "-"}</span>
          </div>
        </div>
      )}

      {/* Bottom right: instructions text overlay */}
      {/* Note: This renders below the toolbar strip via absolute positioning.
          The parent container must have position:relative and sufficient height. */}
    </div>
  );
}
