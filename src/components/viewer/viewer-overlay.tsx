"use client";

import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { formatArea } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, ArrowUp, ArrowRight, ArrowDown, Maximize2,
  Settings, Upload, ToggleLeft, ToggleRight, Layers,
  Pencil, PencilOff, Move, RotateCcw as RotateIcon, Scaling,
  Ruler, Square, AlignHorizontalDistributeCenter, Scissors, Trash2,
  Grid3x3, PenTool,
} from "lucide-react";
import { useAuthoringStore, type AnnotationMode } from "@/store/authoring-store";
import { usePlanStore } from "@/store/plan-store";

interface ViewerOverlayProps {
  selectedFloor: FloorGeometry | null;
  buildingName: string;
  era: BuildingEra;
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  onToggleConfigPanel: () => void;
  configPanelOpen: boolean;
  onToggleLayerPanel: () => void;
  layerPanelOpen: boolean;
  modelSource: "parametric" | "uploaded";
  hasUploadedModel: boolean;
  onToggleModelSource: () => void;
  onUploadClick: () => void;
}

export function ViewerOverlay({
  selectedFloor, buildingName, era, onViewChange,
  onToggleConfigPanel, configPanelOpen,
  onToggleLayerPanel, layerPanelOpen,
  modelSource, hasUploadedModel, onToggleModelSource, onUploadClick,
}: ViewerOverlayProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
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
  const setViewMode = usePlanStore((s) => s.setViewMode);
  const activeFloor = usePlanStore((s) => s.activeFloor);
  const setActiveFloor = usePlanStore((s) => s.setActiveFloor);
  const gridSize = usePlanStore((s) => s.gridSize);
  const setGridSize = usePlanStore((s) => s.setGridSize);
  const drawingWall = usePlanStore((s) => s.drawingWall);

  const toggleAnnotation = (mode: AnnotationMode) => {
    setAnnotationMode(annotationMode === mode ? "none" : mode);
  };

  const gridSizeOptions = [0.1, 0.5, 1.0];

  return (
    <>
      {/* Top right: controls */}
      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
        {/* Plan view toggle */}
        <Button
          variant={viewMode === "plan" ? "default" : "secondary"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setViewMode(viewMode === "plan" ? "3d" : "plan")}
          title={viewMode === "plan"
            ? (isKo ? "3D 뷰로 전환" : "Switch to 3D View")
            : (isKo ? "평면도 뷰" : "Plan View")}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px bg-border" />

        {/* Edit mode toggle */}
        <Button
          variant={isAuthoring ? "default" : "secondary"}
          size="icon"
          className="h-8 w-8"
          onClick={toggleAuthoring}
          title={isAuthoring ? (isKo ? "편집 모드 종료" : "Exit Edit Mode") : (isKo ? "편집 모드" : "Edit Mode")}
        >
          {isAuthoring ? <PencilOff className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </Button>

        {/* Transform mode buttons (visible in edit mode) */}
        {isAuthoring && (
          <>
            <div className="w-px bg-border" />
            <Button
              variant={transformMode === "translate" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setTransformMode("translate")}
              title={`${isKo ? "이동" : "Move"} (G)`}
            >
              <Move className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={transformMode === "rotate" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setTransformMode("rotate")}
              title={`${isKo ? "회전" : "Rotate"} (R)`}
            >
              <RotateIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={transformMode === "scale" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setTransformMode("scale")}
              title={`${isKo ? "크기" : "Scale"} (S)`}
            >
              <Scaling className="h-3.5 w-3.5" />
            </Button>

            <div className="w-px bg-border" />

            {/* Annotation tool buttons */}
            <Button
              variant={annotationMode === "dimension" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleAnnotation("dimension")}
              title={isKo ? "치수선" : "Dimension"}
            >
              <Ruler className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={annotationMode === "area" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleAnnotation("area")}
              title={isKo ? "면적 레이블" : "Area Label"}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={annotationMode === "level" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleAnnotation("level")}
              title={isKo ? "층고 마커" : "Level Markers"}
            >
              <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={annotationMode === "section" ? "default" : "secondary"}
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleAnnotation("section")}
              title={isKo ? "단면 절단" : "Section Cut"}
            >
              <Scissors className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={clearAnnotations}
              title={isKo ? "주석 지우기" : "Clear Annotations"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <div className="w-px bg-border" />

        {/* Upload model */}
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={onUploadClick}
          title={isKo ? "3D 모델 업로드" : "Upload 3D Model"}
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>

        {/* Model toggle (only when uploaded model exists) */}
        {hasUploadedModel && (
          <Button
            variant={modelSource === "uploaded" ? "default" : "secondary"}
            size="icon"
            className="h-8 w-8"
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

        {/* Configuration panel */}
        <Button
          variant={configPanelOpen ? "default" : "secondary"}
          size="icon"
          className="h-8 w-8"
          onClick={onToggleConfigPanel}
          title={isKo ? "설정" : "Configuration"}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>

        {/* Layer panel */}
        <Button
          variant={layerPanelOpen ? "default" : "secondary"}
          size="icon"
          className="h-8 w-8"
          onClick={onToggleLayerPanel}
          title={isKo ? "건물 시스템 레이어" : "Building Layers"}
        >
          <Layers className="h-3.5 w-3.5" />
        </Button>

        <div className="w-px bg-border" />

        {/* View presets */}
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("front")} title="Front">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("side")} title="Side">
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("top")} title="Top">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("iso")} title="Isometric">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onViewChange("iso")} title="Reset">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Top left: building info badges */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-xs">
          {buildingName || (isKo ? "건물 모델" : "Building Model")}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {era === "pre-1970" ? "~1970" : era}
        </Badge>
        <Badge
          variant={modelSource === "uploaded" ? "default" : "outline"}
          className="text-[10px] text-muted-foreground"
        >
          {modelSource === "uploaded"
            ? (isKo ? "건축 모델" : "Architectural Model")
            : (isKo ? "추정 형상" : "Estimated Geometry")}
        </Badge>
      </div>

      {/* Bottom left: floor info */}
      {selectedFloor && (
        <div className="absolute bottom-3 left-3 z-10 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg max-w-xs">
          <p className="text-sm font-semibold">
            {selectedFloor.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({selectedFloor.type === "below" ? (isKo ? "지하" : "Underground") : (isKo ? "지상" : "Above ground")})
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

      {/* Section cut slider (visible when section mode active in edit mode) */}
      {isAuthoring && annotationMode === "section" && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 rounded-lg border bg-card/95 backdrop-blur p-3 shadow-lg flex items-center gap-3">
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

      {/* Plan view controls — floor selector + grid size */}
      {viewMode === "plan" && (
        <div className="absolute top-14 right-3 z-10 flex flex-col gap-1.5">
          {/* Active floor selector */}
          <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg">
            <span className="text-[10px] font-medium text-muted-foreground block mb-1">
              {isKo ? "활성 층" : "Active Floor"}
            </span>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((fl) => (
                <button
                  key={fl}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    activeFloor === fl
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setActiveFloor(fl)}
                >
                  {fl === 0 ? (isKo ? "1F" : "1F") : `${fl + 1}F`}
                </button>
              ))}
            </div>
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

          {/* Wall draw indicator */}
          {isAuthoring && (
            <div className="rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg flex items-center gap-1.5">
              <PenTool className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-medium">
                {drawingWall
                  ? (isKo ? "두 번째 점 클릭" : "Click second point")
                  : (isKo ? "벽 그리기: 시작점 클릭" : "Draw Wall: click start")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bottom right: instructions */}
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground/60">
        {viewMode === "plan"
          ? (isKo ? "클릭: 벽 그리기 · 스크롤: 줌 · ESC: 취소" : "Click: draw wall · Scroll: zoom · ESC: cancel")
          : (isKo ? "클릭: 층 선택 · 드래그: 회전 · 스크롤: 줌" : "Click: select floor · Drag: rotate · Scroll: zoom")}
      </div>
    </>
  );
}
