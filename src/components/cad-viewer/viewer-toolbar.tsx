// src/components/cad-viewer/viewer-toolbar.tsx
"use client";

import {
  Hand, MousePointer, Ruler, StickyNote, MoveUpRight, Cloud, Camera, Trash2,
  Slash, Waypoints, Square, Circle as CircleIcon, Undo2, Redo2, Grid3x3,
  Combine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCadMarkupStore, type CadTool } from "@/store/cad-markup-store";

const NAV_TOOLS: { tool: CadTool; icon: typeof Hand; ko: string; en: string }[] = [
  { tool: "pan", icon: Hand, ko: "이동", en: "Pan" },
  { tool: "select", icon: MousePointer, ko: "선택", en: "Select" },
  { tool: "measure", icon: Ruler, ko: "측정", en: "Measure" },
  { tool: "note", icon: StickyNote, ko: "메모", en: "Note" },
  { tool: "leader", icon: MoveUpRight, ko: "지시선", en: "Leader" },
  { tool: "cloud", icon: Cloud, ko: "구름", en: "Cloud" },
];

const DRAW_TOOLS: { tool: CadTool; icon: typeof Hand; ko: string; en: string }[] = [
  { tool: "draw-line", icon: Slash, ko: "선", en: "Line" },
  { tool: "draw-polyline", icon: Waypoints, ko: "폴리선", en: "Polyline" },
  { tool: "draw-rect", icon: Square, ko: "사각형", en: "Rectangle" },
  { tool: "draw-circle", icon: CircleIcon, ko: "원", en: "Circle" },
];

export interface ViewerToolbarProps {
  isKo: boolean;
  onSnapshot: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  gridOn: boolean;
  onToggleGrid: () => void;
  onJoin?: () => void;
  canJoin?: boolean;
}

export function ViewerToolbar({
  isKo, onSnapshot, onUndo, onRedo, canUndo, canRedo, gridOn, onToggleGrid,
  onJoin, canJoin = false,
}: ViewerToolbarProps) {
  const tool = useCadMarkupStore((s) => s.tool);
  const setTool = useCadMarkupStore((s) => s.setTool);
  const clearAll = useCadMarkupStore((s) => s.clearAll);

  const toolButton = ({ tool: t, icon: Icon, ko, en }: (typeof NAV_TOOLS)[number]) => (
    <Button
      key={t}
      type="button"
      size="sm"
      variant={tool === t ? "secondary" : "ghost"}
      onClick={() => setTool(t)}
      title={isKo ? ko : en}
      data-testid={`cad-tool-${t}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-background/95 p-1 shadow-sm">
      {NAV_TOOLS.map(toolButton)}
      <div className="mx-1 h-5 w-px bg-border" />
      {DRAW_TOOLS.map(toolButton)}
      <div className="mx-1 h-5 w-px bg-border" />
      <Button type="button" size="sm" variant="ghost" disabled={!canUndo}
        onClick={onUndo} title={isKo ? "실행 취소" : "Undo"} data-testid="cad-undo">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={!canRedo}
        onClick={onRedo} title={isKo ? "다시 실행" : "Redo"} data-testid="cad-redo">
        <Redo2 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!canJoin}
        onClick={onJoin}
        title={isKo ? "결합 (끝점이 맞는 선을 하나의 닫힌 외곽선으로)" : "Join (weld touching lines into one outline)"}
        data-testid="cad-join"
      >
        <Combine className="h-4 w-4" />
        <span className="ml-1 hidden text-xs sm:inline">{isKo ? "결합" : "Join"}</span>
      </Button>
      <Button type="button" size="sm" variant={gridOn ? "secondary" : "ghost"}
        onClick={onToggleGrid} title={isKo ? "그리드" : "Grid"} data-testid="cad-grid-toggle">
        <Grid3x3 className="h-4 w-4" />
      </Button>
      <div className="mx-1 h-5 w-px bg-border" />
      <Button type="button" size="sm" variant="ghost" onClick={onSnapshot} title={isKo ? "PNG 저장" : "Save PNG"}>
        <Camera className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={clearAll} title={isKo ? "마크업 지우기" : "Clear markups"}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
