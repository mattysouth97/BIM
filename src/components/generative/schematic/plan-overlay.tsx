"use client";

// src/components/generative/schematic/plan-overlay.tsx
//
// The plan view: the solved rooms, finally visible.
//
// The 3D viewport shows the massing shell. Everything the solver decided —
// which rooms, how big, where the corridor runs, which wall bounds which space
// — has until now existed only as data in the snapshot. This draws it, per
// level, straight from the emitted BIM elements: room rects from the Rooms
// category, walls from their start/end parameters, columns from their
// placement. Nothing is recomputed here, so a room drawn here IS the room the
// validator checked.
//
// The BLUEPRINT / BIM / OVERLAY switch is the proof step. Aligned through
// `alignment.ts` — the compiler re-origins the design, so drawing the schematic
// at its authored coordinates would slander a generator that obeyed it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type {
  BlueprintFidelityReport,
  BlueprintSpec,
} from "@/lib/generative/blueprint";
import type { BuildingSpec } from "@/lib/generative/spec/building-spec";
import { cn } from "@/lib/utils";

import { blueprintShiftMm } from "./alignment";
import { BAND_TEXT, bandForDeviation, formatRatioPercent } from "./fidelity-report";
import { readLevelPlan } from "./plan-model";
import { PlanSymbolsLayer } from "./plan-symbols-layer";
import { pathOf, schematicShapes } from "./schematic-geometry";
import {
  boundsOfPoints,
  fitTransform,
  mergeBounds,
  panBy,
  toScreen,
  zoomAt,
  type ViewTransform,
} from "./view-transform";

export type PlanLayerMode = "blueprint" | "bim" | "overlay";

const SPACE_FILL: Record<string, string> = {
  "office-open": "#60a5fa",
  "office-cellular": "#38bdf8",
  meeting: "#a78bfa",
  lobby: "#fbbf24",
  reception: "#fcd34d",
  corridor: "#f97316",
  circulation: "#f97316",
  restroom: "#22d3ee",
  pantry: "#fca5a5",
  storage: "#94a3b8",
  mechanical: "#a3a3a3",
  electrical: "#a3a3a3",
  laboratory: "#34d399",
  classroom: "#4ade80",
  retail: "#f472b6",
  "residential-unit": "#fb923c",
  atrium: "#93c5fd",
  service: "#cbd5e1",
};

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

interface Props {
  spec: BuildingSpec;
  snapshot: BimModelSnapshot;
  /** The schematic this building came from, when it came from one. */
  blueprint: BlueprintSpec | null;
  /**
   * The measured report for THIS design, bound by generation id upstream. The
   * badge is the headline the overlay can honestly show; the full per-dimension
   * breakdown lives in the schematic inspector.
   */
  fidelity?: BlueprintFidelityReport | null;
  /**
   * Reveal the inspector's fidelity section. Without it the badge renders as
   * plain text rather than a button that does nothing.
   */
  onFocusFidelity?: () => void;
  className?: string;
}

export function PlanOverlay({
  spec,
  snapshot,
  blueprint,
  fidelity = null,
  onFocusFidelity,
  className,
}: Props) {
  const levels = useMemo(
    () => [...snapshot.levels].sort((a, b) => a.floorNo - b.floorNo),
    [snapshot.levels],
  );
  const groundIndex = Math.max(
    0,
    levels.findIndex((level) => level.floorNo > 0),
  );

  const [levelId, setLevelId] = useState<string | null>(
    levels[groundIndex]?.id ?? levels[0]?.id ?? null,
  );
  const [mode, setMode] = useState<PlanLayerMode>(blueprint ? "overlay" : "bim");
  const [showLabels, setShowLabels] = useState(true);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<{
    levelId: string;
    transform: ViewTransform;
  } | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);

  const activeLevel = levels.find((level) => level.id === levelId) ?? levels[0] ?? null;
  const plan = useMemo(
    () => (activeLevel ? readLevelPlan(snapshot, activeLevel.id) : null),
    [snapshot, activeLevel],
  );

  const shift = useMemo(
    () => (blueprint ? blueprintShiftMm(blueprint, spec) : null),
    [blueprint, spec],
  );

  /** Blueprint outlines in the MODEL frame, in millimetres. */
  const blueprintLayer = useMemo(() => {
    if (!blueprint || !shift || !activeLevel) return [];
    return schematicShapes(blueprint)
      .filter((shape) => shape.floorNos.includes(activeLevel.floorNo))
      .map((shape) => ({
        ...shape,
        pointsMm: shape.pointsMm.map((point) => ({
          xMm: point.xMm + shift.xMm,
          zMm: point.zMm + shift.zMm,
        })),
      }));
  }, [blueprint, shift, activeLevel]);

  const contentBounds = useMemo(() => {
    let bounds = plan?.bounds ?? null;
    for (const shape of blueprintLayer) {
      bounds = mergeBounds(bounds, boundsOfPoints(shape.pointsMm));
    }
    return bounds;
  }, [plan, blueprintLayer]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () =>
      setSize({ width: host.clientWidth, height: host.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  /**
   * A pan or zoom belongs to the level it was made on: two levels of a stepped
   * building do not share a frame, so switching level falls back to a fresh fit
   * rather than leaving the next plan half out of view. Derived, so no effect
   * has to keep it in step.
   */
  const fallbackView = useMemo(
    () => fitTransform(contentBounds, size.width, size.height, 32),
    [contentBounds, size.width, size.height],
  );
  const activeView =
    view && view.levelId === activeLevel?.id ? view.transform : fallbackView;

  const fit = useCallback(() => setView(null), []);

  const project = useCallback(
    (point: { xMm: number; zMm: number }) => toScreen(activeView, point),
    [activeView],
  );

  const showBim = mode !== "blueprint";
  const showBlueprint = mode !== "bim" && blueprintLayer.length > 0;

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Level
          <select
            value={activeLevel?.id ?? ""}
            onChange={(event) => setLevelId(event.target.value)}
            className="rounded border bg-background px-1 py-0.5 text-[11px]"
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1" role="group" aria-label="Plan layers">
          {(
            [
              ["blueprint", "Blueprint"],
              ["bim", "BIM"],
              ["overlay", "Overlay"],
            ] as Array<[PlanLayerMode, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              disabled={value !== "bim" && !blueprint}
              onClick={() => setMode(value)}
              className={cn(
                "rounded border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40",
                mode === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(event) => setShowLabels(event.target.checked)}
          />
          Room labels
        </label>

        <div className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          {fidelity && (
            <FidelityBadge report={fidelity} onFocus={onFocusFidelity} />
          )}
          <span>{plan?.rooms.length ?? 0} rooms</span>
          <span>{plan?.walls.length ?? 0} walls</span>
          <span>{plan?.columns.length ?? 0} columns</span>
          <span>{plan?.symbols.length ?? 0} symbols</span>
          <button type="button" onClick={fit} className="rounded border px-1.5 py-0.5">
            Fit
          </button>
        </div>
      </div>

      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <svg
          width={size.width}
          height={size.height}
          className="touch-none select-none"
          role="img"
          aria-label={`Plan of ${activeLevel?.name ?? "the building"}`}
          onPointerDown={(event) => {
            panRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event) => {
            if (!panRef.current || !activeLevel) return;
            const dx = event.clientX - panRef.current.x;
            const dy = event.clientY - panRef.current.y;
            panRef.current = { x: event.clientX, y: event.clientY };
            setView({
              levelId: activeLevel.id,
              transform: panBy(activeView, dx, dy),
            });
          }}
          onPointerUp={() => {
            panRef.current = null;
          }}
          onPointerLeave={() => {
            panRef.current = null;
          }}
          onWheel={(event) => {
            const host = hostRef.current;
            if (!host || !activeLevel) return;
            const rect = host.getBoundingClientRect();
            setView({
              levelId: activeLevel.id,
              transform: zoomAt(activeView, event.deltaY < 0 ? 1.15 : 1 / 1.15, {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              }),
            });
          }}
        >
          <defs>
            <pattern
              id="plan-void-hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="1.2" />
            </pattern>
          </defs>

          {showBim && plan && (
            <g>
              {plan.rooms.map((room) => {
                const a = project({ xMm: room.minX, zMm: room.minZ });
                const b = project({ xMm: room.maxX, zMm: room.maxZ });
                const width = b.x - a.x;
                const height = b.y - a.y;
                return (
                  <g key={room.id}>
                    <rect
                      x={a.x}
                      y={a.y}
                      width={width}
                      height={height}
                      fill={SPACE_FILL[room.programKey] ?? "#cbd5e1"}
                      fillOpacity={0.35}
                      stroke="#475569"
                      strokeWidth={0.75}
                    />
                    {showLabels && width > 54 && height > 22 && (
                      <text
                        x={a.x + width / 2}
                        y={a.y + height / 2}
                        textAnchor="middle"
                        style={{ fontSize: 9 }}
                        className="fill-slate-700"
                      >
                        <tspan x={a.x + width / 2} dy="-1">
                          {room.label}
                        </tspan>
                        <tspan x={a.x + width / 2} dy="10" className="fill-slate-500">
                          {room.detail}
                        </tspan>
                      </text>
                    )}
                    <title>{`${room.label} — ${room.detail}`}</title>
                  </g>
                );
              })}

              {plan.coreParts.map((part) => {
                const a = project({ xMm: part.minX, zMm: part.minZ });
                const b = project({ xMm: part.maxX, zMm: part.maxZ });
                return (
                  <rect
                    key={part.id}
                    x={a.x}
                    y={a.y}
                    width={b.x - a.x}
                    height={b.y - a.y}
                    fill="#1e293b"
                    fillOpacity={0.8}
                    stroke="#0f172a"
                    strokeWidth={0.75}
                  />
                );
              })}

              <g strokeLinecap="square">
                {plan.walls.map((wall) => {
                  const a = project({ xMm: wall.x1, zMm: wall.z1 });
                  const b = project({ xMm: wall.x2, zMm: wall.z2 });
                  return (
                    <line
                      key={wall.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={wall.exterior ? "#0f172a" : "#64748b"}
                      strokeWidth={wall.exterior ? 2.5 : 1.25}
                    />
                  );
                })}
              </g>

              {plan.columns.map((column) => {
                const p = project({ xMm: column.x, zMm: column.z });
                return (
                  <circle
                    key={column.id}
                    cx={p.x}
                    cy={p.y}
                    r={2.5}
                    fill="#0f172a"
                    fillOpacity={0.75}
                  />
                );
              })}

              <PlanSymbolsLayer symbols={plan.symbols} view={activeView} />
            </g>
          )}

          {showBlueprint && (
            <g>
              {blueprintLayer.map((shape) => (
                <path
                  key={`bp-${shape.id}`}
                  d={pathOf(shape.pointsMm.map(project))}
                  fill={
                    shape.kind === "void"
                      ? "url(#plan-void-hatch)"
                      : shape.kind === "zone"
                        ? "#2563eb"
                        : "none"
                  }
                  fillOpacity={shape.kind === "zone" ? 0.08 : 0.4}
                  stroke="#2563eb"
                  strokeWidth={shape.kind === "boundary" ? 2 : 1.25}
                  strokeDasharray={shape.kind === "boundary" ? "8 4" : "4 3"}
                />
              ))}
            </g>
          )}
        </svg>

        {plan && plan.rooms.length === 0 && showBim && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs text-muted-foreground">
            No rooms were solved on this level.
          </p>
        )}

        <div className="pointer-events-none absolute bottom-2 left-2 font-mono text-[10px] text-muted-foreground">
          {activeLevel ? `${activeLevel.name} · ` : ""}
          {shift
            ? `schematic aligned by ${shift.method} shift (${Math.round(shift.xMm)}, ${Math.round(shift.zMm)}) mm`
            : "no schematic to align"}
        </div>
      </div>
    </div>
  );
}

/**
 * One number, chosen and named: the WORST symmetric difference between a drawn
 * plate and the plate that got built, across the levels that were comparable.
 * Not a fidelity score — the report has no such thing — and it says which
 * dimension it is so nobody reads it as one. The full breakdown is a click
 * away; without a handler to open it, this is text rather than a dead button.
 */
function FidelityBadge({
  report,
  onFocus,
}: {
  report: BlueprintFidelityReport;
  onFocus?: () => void;
}) {
  const worst = report.boundary.worstSymmetricDifferenceRatio;
  const label = `plate diff ${formatRatioPercent(worst)}`;
  const title =
    worst === null
      ? "No level was drawn and built in common, so the boundary could not be compared."
      : "Worst boundary outline difference across the measured levels — the drawn plate versus the built one.";
  const className = cn(
    "rounded border px-1.5 py-0.5 font-mono text-[10px]",
    BAND_TEXT[bandForDeviation(worst)],
  );

  if (!onFocus) {
    return (
      <span className={className} title={title}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onFocus}
      title={`${title} Opens the measured fidelity report.`}
      className={cn(className, "transition-colors hover:bg-muted")}
    >
      {label}
    </button>
  );
}
