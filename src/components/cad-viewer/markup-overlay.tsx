// src/components/cad-viewer/markup-overlay.tsx
// Screen-space SVG overlay: markups, measure, selection, and the drafting
// tools' click surface + live preview. Renders from the same ViewState as
// the camera, so it can never drift from the drawing.
// Alt+click a markup glyph to delete it.

"use client";

import { useCallback, useState } from "react";
import type { CadDocument, Vec2 } from "@/lib/cad/doc/types";
import type { SnapIndex } from "@/lib/cad/doc/snap";
import { findSnap } from "@/lib/cad/doc/snap";
import { screenToWorld, worldToScreen, type ViewState } from "@/lib/cad/doc/viewport";
import { findClosedPolylineAt, findEntityAt } from "@/lib/cad/doc/hit-test";
import { polylineToFootprint } from "@/lib/cad/doc/to-footprint";
import { snapToGrid, applyOrtho } from "@/lib/cad/doc/grid";
import {
  previewChains, type DrawEvent, type DrawState,
} from "@/lib/cad/doc/draw-tools";
import { useCadMarkupStore, type CadMarkup } from "@/store/cad-markup-store";
import type { Polygon2D } from "@/lib/cad/dxf-parser";

const SNAP_PX = 12;
const HIT_PX = 8;
export const GRID_STEP_M = 0.5;

export interface FootprintPick {
  polygon: Polygon2D; areaSqm: number; layer: string;
}

export function MarkupOverlay({
  doc, view, size, snapIndex, isKo, onFootprintPick,
  drawState, onDrawEvent, gridOn, selectedChains, onSelectEntity,
}: {
  doc: CadDocument;
  view: ViewState;
  size: { w: number; h: number };
  snapIndex: SnapIndex;
  isKo: boolean;
  onFootprintPick: (pick: FootprintPick) => void;
  drawState: DrawState | null;
  onDrawEvent: (ev: DrawEvent) => void;
  gridOn: boolean;
  selectedChains: Vec2[][];
  onSelectEntity: (id: string | null) => void;
}) {
  const tool = useCadMarkupStore((s) => s.tool);
  const markups = useCadMarkupStore((s) => s.markups);
  const addMarkup = useCadMarkupStore((s) => s.addMarkup);
  const removeMarkup = useCadMarkupStore((s) => s.removeMarkup);
  const [pending, setPending] = useState<Vec2 | null>(null); // first click of 2-click markup tools
  const [hover, setHover] = useState<Vec2 | null>(null);

  const toWorld = useCallback((e: React.MouseEvent<SVGSVGElement>): Vec2 => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = { x: e.clientX - r.left, y: e.clientY - r.top };
    let w = screenToWorld(px, view, size.w, size.h);
    const snap = findSnap(snapIndex, w, SNAP_PX * view.scale);
    if (snap) return snap.point;
    if (drawState) {
      const anchor = drawState.points[drawState.points.length - 1];
      if (e.shiftKey && anchor) w = applyOrtho(anchor, w);
      if (gridOn) w = snapToGrid(w, GRID_STEP_M);
    }
    return w;
  }, [view, size.w, size.h, snapIndex, drawState, gridOn]);

  const S = useCallback(
    (p: Vec2) => worldToScreen(p, view, size.w, size.h),
    [view, size.w, size.h],
  );

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "pan") return; // transparent to pan (pointer-events off)
    if (e.altKey) return;       // alt+click is reserved for glyph deletion
    e.stopPropagation();
    const w = toWorld(e);
    const id = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

    if (drawState) {
      onDrawEvent({ type: "click", point: w });
      return;
    }
    if (tool === "select") {
      const entity = findEntityAt(doc, w, HIT_PX * view.scale);
      onSelectEntity(entity?.id ?? null);
      const hitPl = entity?.kind === "polyline" && entity.closed
        ? entity
        : findClosedPolylineAt(doc, w, HIT_PX * view.scale);
      if (hitPl) {
        const fp = polylineToFootprint(hitPl);
        if (fp) onFootprintPick({ ...fp, layer: hitPl.layer });
      }
      return;
    }
    if (tool === "note") {
      const text = window.prompt(isKo ? "메모 내용:" : "Note text:");
      if (text) addMarkup({ id, kind: "note", position: w, text });
      return;
    }
    if (tool === "measure" || tool === "leader" || tool === "cloud") {
      if (!pending) { setPending(w); return; }
      if (tool === "measure") addMarkup({ id, kind: "measure", a: pending, b: w });
      if (tool === "cloud") addMarkup({
        id, kind: "cloud",
        min: { x: Math.min(pending.x, w.x), y: Math.min(pending.y, w.y) },
        max: { x: Math.max(pending.x, w.x), y: Math.max(pending.y, w.y) },
      });
      if (tool === "leader") {
        const text = window.prompt(isKo ? "지시선 내용:" : "Leader text:");
        if (text) addMarkup({ id, kind: "leader", from: pending, to: w, text });
      }
      setPending(null);
    }
  }, [
    tool, toWorld, pending, doc, view.scale, addMarkup,
    onFootprintPick, isKo, drawState, onDrawEvent, onSelectEntity,
  ]);

  const chainToPath = (chain: Vec2[]) =>
    chain.map((p, i) => `${i === 0 ? "M" : "L"}${S(p).x.toFixed(1)},${S(p).y.toFixed(1)}`).join(" ");

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: tool === "pan" ? "none" : "auto" }}
      onClick={handleClick}
      onMouseMove={(e) => setHover(toWorld(e))}
      data-testid="cad-markup-overlay"
    >
      {/* selection highlight */}
      {selectedChains.map((chain, i) => (
        <path key={`sel${i}`} d={chainToPath(chain)} fill="none"
          stroke="#f97316" strokeWidth={2.5} opacity={0.9} />
      ))}
      {/* draw preview */}
      {drawState && hover &&
        previewChains(drawState, hover).map((chain, i) => (
          <path key={`pv${i}`} d={chainToPath(chain)} fill="none"
            stroke="#16a34a" strokeWidth={1.5} strokeDasharray="5 4" />
        ))}
      {markups.map((m) => (
        <MarkupGlyph key={m.id} m={m} S={S} onDelete={() => removeMarkup(m.id)} />
      ))}
      {/* live preview for 2-click markup tools */}
      {pending && hover && (
        <line
          x1={S(pending).x} y1={S(pending).y} x2={S(hover).x} y2={S(hover).y}
          stroke="#f59e0b" strokeDasharray="4 3"
        />
      )}
      {/* cursor/snap indicator */}
      {hover && tool !== "pan" && (
        <circle cx={S(hover).x} cy={S(hover).y} r={4} fill="none"
          stroke={drawState ? "#16a34a" : "#f59e0b"} />
      )}
    </svg>
  );
}

function MarkupGlyph({
  m, S, onDelete,
}: { m: CadMarkup; S: (p: Vec2) => Vec2; onDelete: () => void }) {
  const del = (e: React.MouseEvent) => {
    if (e.altKey) { e.stopPropagation(); onDelete(); }
  };
  switch (m.kind) {
    case "note": {
      const p = S(m.position);
      return (
        <g onClick={del}>
          <rect x={p.x} y={p.y - 18} width={Math.max(40, m.text.length * 7.5)} height={18}
            rx={3} fill="#fef3c7" stroke="#f59e0b" />
          <text x={p.x + 4} y={p.y - 5} fontSize={12} fill="#78350f">{m.text}</text>
        </g>
      );
    }
    case "measure": {
      const a = S(m.a), b = S(m.b);
      const dist = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return (
        <g onClick={del}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2563eb" strokeWidth={1.5} />
          <circle cx={a.x} cy={a.y} r={3} fill="#2563eb" />
          <circle cx={b.x} cy={b.y} r={3} fill="#2563eb" />
          <text x={mid.x + 5} y={mid.y - 5} fontSize={12} fill="#1e40af" fontWeight={600}>
            {dist < 1 ? `${(dist * 100).toFixed(1)} cm` : `${dist.toFixed(2)} m`}
          </text>
        </g>
      );
    }
    case "leader": {
      const f = S(m.from), t = S(m.to);
      return (
        <g onClick={del}>
          <defs>
            <marker id="cad-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
            </marker>
          </defs>
          <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#dc2626" strokeWidth={1.5}
            markerEnd="url(#cad-arrow)" />
          <text x={t.x + 5} y={t.y - 3} fontSize={12} fill="#991b1b">{m.text}</text>
        </g>
      );
    }
    case "cloud": {
      const a = S({ x: m.min.x, y: m.max.y }); // top-left on screen
      const b = S({ x: m.max.x, y: m.min.y });
      return (
        <rect onClick={del} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y}
          rx={10} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="1 6"
          strokeLinecap="round" />
      );
    }
  }
}
