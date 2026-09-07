// src/components/cad-viewer/viewer-toolbar.tsx
"use client";

import { useState, type ReactNode } from "react";
import {
  Hand, MousePointer, Ruler, StickyNote, MoveUpRight, Cloud, Camera, Trash2,
  Slash, Waypoints, Square, Circle as CircleIcon, Undo2, Redo2, Grid3x3,
  Combine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCadMarkupStore, type CadTool } from "@/store/cad-markup-store";

interface ToolDef { tool: CadTool; icon: typeof Hand; ko: string; en: string }

const NAV_TOOLS: ToolDef[] = [
  { tool: "pan", icon: Hand, ko: "이동", en: "Pan" },
  { tool: "select", icon: MousePointer, ko: "선택", en: "Select" },
  { tool: "measure", icon: Ruler, ko: "측정", en: "Measure" },
  { tool: "note", icon: StickyNote, ko: "메모", en: "Note" },
  { tool: "leader", icon: MoveUpRight, ko: "지시선", en: "Leader" },
  { tool: "cloud", icon: Cloud, ko: "구름", en: "Cloud" },
];

const DRAW_TOOLS: ToolDef[] = [
  { tool: "draw-line", icon: Slash, ko: "선", en: "Line" },
  { tool: "draw-polyline", icon: Waypoints, ko: "폴리선", en: "Polyline" },
  { tool: "draw-rect", icon: Square, ko: "사각형", en: "Rectangle" },
  { tool: "draw-circle", icon: CircleIcon, ko: "원", en: "Circle" },
];

export interface ViewerToolbarProps {
  isKo: boolean;
  /**
   * True only while the draft store is editing the open document — the one
   * state in which the four draw tools and the snap grid do anything
   * (cad-viewer.tsx nulls the draw reducer and hides the grid otherwise), so
   * until then they are disabled and say so.
   */
  drawEnabled: boolean;
  onSnapshot: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Whether the snap grid is drawn right now. cad-viewer.tsx draws it only
   * inside a draft, so the toolbar never reports it pressed while
   * `drawEnabled` is false, whatever the caller passes.
   */
  gridOn: boolean;
  onToggleGrid: () => void;
  onJoin?: () => void;
  canJoin?: boolean;
}

/**
 * A disabled shadcn Button is `disabled:pointer-events-none`, so its own
 * title can never surface as a tooltip. The pointer lands on this wrapper
 * instead, and the wrapper carries the same title — a greyed control still
 * tells a mouse user why it is greyed, while its clicks stay inert and no
 * hover style lights it up.
 */
function GateTip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <span title={title} className="inline-flex">
      {children}
    </span>
  );
}

export function ViewerToolbar({
  isKo, drawEnabled, onSnapshot, onUndo, onRedo, canUndo, canRedo, gridOn,
  onToggleGrid, onJoin, canJoin = false,
}: ViewerToolbarProps) {
  const tool = useCadMarkupStore((s) => s.tool);
  const setTool = useCadMarkupStore((s) => s.setTool);
  const clearAll = useCadMarkupStore((s) => s.clearAll);
  const markups = useCadMarkupStore((s) => s.markups);

  // Clearing every persisted markup takes two presses: the first arms, the
  // second clears. A tool switch in between disarms (adjust-during-render,
  // the same pattern cad-viewer.tsx uses for its draw points).
  const [armed, setArmed] = useState(false);
  const [lastTool, setLastTool] = useState(tool);
  if (tool !== lastTool) {
    setLastTool(tool);
    setArmed(false);
  }
  const isArmed = armed && markups.length > 0;
  const clearLabel = isKo ? "마크업 지우기" : "Clear markups";

  // The one condition that gates the draw tools and the grid alike.
  const draftOnly = isKo ? " (초안 편집 중에만)" : " (only while editing a draft)";

  // Pattern: Kokonut UI "toolbar" (kokonutui.com) — the active tool reveals its
  // name beside its icon, rebuilt on shadcn Button + aria-pressed.
  const toolButton = ({ tool: t, icon: Icon, ko, en }: ToolDef, draftGated: boolean) => {
    const active = tool === t;
    const disabled = draftGated && !drawEnabled;
    const label = isKo ? ko : en;
    const title = disabled ? `${label}${draftOnly}` : label;
    const btn = (
      <Button
        key={t}
        type="button"
        size="sm"
        variant={active ? "secondary" : "ghost"}
        onClick={() => setTool(t)}
        aria-pressed={active}
        aria-label={label}
        title={title}
        disabled={disabled}
        data-testid={`cad-tool-${t}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {active ? (
          <span
            aria-hidden="true"
            className="ml-1 w-16 truncate text-left text-xs animate-settle motion-reduce:animate-none"
          >
            {label}
          </span>
        ) : null}
      </Button>
    );
    if (!draftGated) return btn;
    return (
      <GateTip key={t} title={title}>
        {btn}
      </GateTip>
    );
  };

  const gridLabel = isKo ? "그리드" : "Grid";
  const gridDisabled = !drawEnabled;
  const gridShown = drawEnabled && gridOn;
  const gridTitle = gridDisabled ? `${gridLabel}${draftOnly}` : gridLabel;

  return (
    <div
      role="toolbar"
      aria-label={isKo ? "도면 도구" : "Drawing tools"}
      className="flex items-center gap-0.5 rounded-md border bg-background/95 p-1 shadow-sm"
    >
      <div
        role="group"
        aria-label={isKo ? "탐색·마크업" : "Navigate and mark up"}
        className="flex items-center gap-0.5"
      >
        {NAV_TOOLS.map((t) => toolButton(t, false))}
      </div>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <div role="group" aria-label={isKo ? "그리기" : "Draw"} className="flex items-center gap-0.5">
        {DRAW_TOOLS.map((t) => toolButton(t, true))}
      </div>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!canUndo}
        onClick={onUndo}
        aria-label={isKo ? "실행 취소" : "Undo"}
        title={isKo ? "실행 취소" : "Undo"}
        data-testid="cad-undo"
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!canRedo}
        onClick={onRedo}
        aria-label={isKo ? "다시 실행" : "Redo"}
        title={isKo ? "다시 실행" : "Redo"}
        data-testid="cad-redo"
      >
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!canJoin}
        onClick={onJoin}
        aria-label={isKo ? "결합 (끝점이 맞는 선을 하나의 닫힌 외곽선으로)" : "Join (weld touching lines into one outline)"}
        title={isKo ? "결합 (끝점이 맞는 선을 하나의 닫힌 외곽선으로)" : "Join (weld touching lines into one outline)"}
        data-testid="cad-join"
      >
        <Combine className="h-4 w-4" aria-hidden="true" />
        <span className="ml-1 hidden text-xs sm:inline">{isKo ? "결합" : "Join"}</span>
      </Button>
      <GateTip title={gridTitle}>
        <Button
          type="button"
          size="sm"
          variant={gridShown ? "secondary" : "ghost"}
          disabled={gridDisabled}
          onClick={onToggleGrid}
          aria-pressed={gridShown}
          aria-label={gridLabel}
          title={gridTitle}
          data-testid="cad-grid-toggle"
        >
          <Grid3x3 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </GateTip>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onSnapshot}
        aria-label={isKo ? "PNG 저장" : "Save PNG"}
        title={isKo ? "PNG 저장" : "Save PNG"}
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={isArmed ? "destructive" : "ghost"}
        // Positioning context for the armed callout below.
        className="relative"
        disabled={markups.length === 0}
        onClick={() => {
          if (!isArmed) {
            setArmed(true);
            return;
          }
          clearAll();
          setArmed(false);
        }}
        onBlur={() => setArmed(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setArmed(false);
        }}
        title={clearLabel}
        aria-label={
          isArmed
            ? (isKo ? "마크업 모두 지우기 — 다시 누르면 지웁니다" : "Clear all markups — press again to confirm")
            : clearLabel
        }
        data-testid="cad-clear-markups"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {isArmed ? (
          // Out of the flow on purpose: the bar is centred with a translate,
          // so an in-flow label would shift the whole toolbar by half its own
          // width on the first press. The callout hangs under the button and
          // inherits the destructive variant's text colour.
          <span className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-destructive px-2 py-1 text-xs shadow-sm animate-settle motion-reduce:animate-none">
            {isKo ? "다시 눌러 지우기" : "Press again to clear"}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
