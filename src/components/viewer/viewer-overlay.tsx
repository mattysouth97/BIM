"use client";

import type { FloorGeometry } from "@/lib/building-geometry";
import type { BuildingEra } from "@/lib/material-types";
import { formatArea } from "@/lib/constants";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, ArrowUp, ArrowRight, ArrowDown, Maximize2,
  Thermometer, Upload, ToggleLeft, ToggleRight, Layers,
} from "lucide-react";

interface ViewerOverlayProps {
  selectedFloor: FloorGeometry | null;
  buildingName: string;
  era: BuildingEra;
  onViewChange: (view: "front" | "side" | "top" | "iso") => void;
  onToggleMaterialPanel: () => void;
  materialPanelOpen: boolean;
  onToggleLayerPanel: () => void;
  layerPanelOpen: boolean;
  modelSource: "parametric" | "uploaded";
  hasUploadedModel: boolean;
  onToggleModelSource: () => void;
  onUploadClick: () => void;
}

export function ViewerOverlay({
  selectedFloor, buildingName, era, onViewChange,
  onToggleMaterialPanel, materialPanelOpen,
  onToggleLayerPanel, layerPanelOpen,
  modelSource, hasUploadedModel, onToggleModelSource, onUploadClick,
}: ViewerOverlayProps) {
  const isKo = useAppStore((s) => s.language) === "ko";

  return (
    <>
      {/* Top right: controls */}
      <div className="absolute top-3 right-3 flex gap-1.5 z-10">
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

        {/* Material panel */}
        <Button
          variant={materialPanelOpen ? "default" : "secondary"}
          size="icon"
          className="h-8 w-8"
          onClick={onToggleMaterialPanel}
          title={isKo ? "재료 속성" : "Material Properties"}
        >
          <Thermometer className="h-3.5 w-3.5" />
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

      {/* Bottom right: instructions */}
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-muted-foreground/60">
        {isKo ? "클릭: 층 선택 · 드래그: 회전 · 스크롤: 줌" : "Click: select floor · Drag: rotate · Scroll: zoom"}
      </div>
    </>
  );
}
