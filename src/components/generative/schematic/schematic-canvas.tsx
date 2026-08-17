"use client";

// src/components/generative/schematic/schematic-canvas.tsx
//
// The drawing surface. An SVG plan of the blueprint in millimetres, with one
// pointer contract per tool.
//
// Every mark made here is SEMANTIC before it is visible: a click does not
// produce a rectangle, it produces a boundary on levels 1–3, or an atrium, or
// an office zone — through the store, which goes through the schema-safe
// builders. There is no path from this file to a raw shape.
//
// The component holds only what is genuinely view state: the pan/zoom
// transform, the live cursor, and the viewport size. Everything else is read
// from the blueprint store, so the drawing logic stays testable without a DOM.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  blueprintPlacements,
  type BlueprintValidationReport,
  type PointMm,
} from "@/lib/generative/blueprint";
import { cn } from "@/lib/utils";
import {
  isPlacementTool,
  useBlueprintStore,
  type SchematicTool,
  type ShapeMode,
} from "@/store/blueprint-store";

import {
  blueprintBounds,
  pathOf,
  schematicShapes,
  ZONE_DEFAULT_FILL,
  ZONE_FILL,
} from "./schematic-geometry";
import type { PlanSymbolInstance } from "./plan-model";
import { PlanSymbolsLayer } from "./plan-symbols-layer";
import {
  fitTransform,
  panBy,
  toScreen,
  toWorld,
  zoomAt,
  type ScreenPoint,
  type ViewTransform,
} from "./view-transform";

/* ------------------------------------------------------------------ */
/* Drawing vocabulary                                                  */
/* ------------------------------------------------------------------ */

/** Which pointer contract a tool uses. Core is always a dragged rectangle. */
function drawModeOf(tool: SchematicTool, shapeMode: ShapeMode): "rect" | "polygon" | "click" | "pan" {
  switch (tool) {
    case "select":
      return "pan";
    case "core":
      return "rect";
    case "entrance":
    case "circulation":
    case "column":
    case "lighting":
    case "furniture":
      return "click";
    case "boundary":
    case "void":
    case "zone":
      return shapeMode;
  }
}

/** Ids named by a P0/P1 issue — drawn in the destructive colour. */
function failingIds(validation: BlueprintValidationReport): Set<string> {
  const out = new Set<string>();
  for (const violation of validation.violations) {
    if (violation.priority !== "P0" && violation.priority !== "P1") continue;
    for (const id of violation.elementIds) out.add(id);
  }
  return out;
}

function nearestPlacement(
  placements: readonly { id: string; positionMm: PointMm }[],
  point: PointMm,
  thresholdMm: number,
): string | null {
  let bestId: string | null = null;
  let best = thresholdMm;
  for (const item of placements) {
    const distance = Math.hypot(
      item.positionMm.xMm - point.xMm,
      item.positionMm.zMm - point.zMm,
    );
    if (distance < best) {
      best = distance;
      bestId = item.id;
    }
  }
  return bestId;
}

function pointInPolygon(point: PointMm, ring: readonly PointMm[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const straddles = a.zMm > point.zMm !== b.zMm > point.zMm;
    if (!straddles) continue;
    const x = ((b.xMm - a.xMm) * (point.zMm - a.zMm)) / (b.zMm - a.zMm) + a.xMm;
    if (point.xMm < x) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export function SchematicCanvas({ className }: { className?: string }) {
  const blueprint = useBlueprintStore((s) => s.blueprint);
  const validation = useBlueprintStore((s) => s.validation);
  const tool = useBlueprintStore((s) => s.tool);
  const shapeMode = useBlueprintStore((s) => s.shapeMode);
  const snapMm = useBlueprintStore((s) => s.snapMm);
  const draft = useBlueprintStore((s) => s.draft);
  const selectedId = useBlueprintStore((s) => s.selectedId);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform | null>(null);
  const [cursor, setCursor] = useState<PointMm | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);

  const shapes = useMemo(() => schematicShapes(blueprint), [blueprint]);
  const failing = useMemo(() => failingIds(validation), [validation]);
  const bounds = useMemo(() => blueprintBounds(blueprint), [blueprint]);
  const mode = drawModeOf(tool, shapeMode);

  /* --- viewport --- */

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

  const fit = useCallback(() => {
    if (size.width === 0) return;
    setView(fitTransform(bounds, size.width, size.height));
  }, [bounds, size.width, size.height]);

  /**
   * The frame follows the drawing until the user takes control of it.
   *
   * Derived rather than stored, so nothing has to synchronise it: while `view`
   * is null the canvas re-frames whatever has been committed, and the first pan,
   * zoom or Fit makes the frame the user's — from then on it never moves on its
   * own. The draft is excluded from `bounds`, so the frame can never shift
   * mid-stroke and land a click somewhere the pointer was not.
   */
  const fallbackView = useMemo(
    () => fitTransform(bounds, size.width, size.height),
    [bounds, size.width, size.height],
  );
  const activeView = view ?? fallbackView;

  const pointerToWorld = useCallback(
    (event: { clientX: number; clientY: number }): PointMm | null => {
      const host = hostRef.current;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      return toWorld(activeView, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [activeView],
  );

  /* --- pointer contracts --- */

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // Keyboard shortcuts (Esc, Enter, Delete) are handled on the host, so it
      // has to hold focus once the user starts drawing.
      hostRef.current?.focus();

      const world = pointerToWorld(event);
      if (!world) return;
      const store = useBlueprintStore.getState();
      (event.target as Element).setPointerCapture?.(event.pointerId);

      // Middle button always pans, whatever tool is in hand.
      if (event.button === 1 || mode === "pan") {
        panRef.current = { x: event.clientX, y: event.clientY };
        if (mode === "pan" && event.button === 0) {
          const placements = blueprintPlacements(store.blueprint);
          const thresholdMm = 14 / Math.max(activeView.scale, 1e-6);
          const nearPlacement = nearestPlacement(placements, world, thresholdMm);
          if (nearPlacement) {
            store.select(nearPlacement);
            return;
          }
          const hit = shapes.find(
            (shape) => shape.pointsMm.length > 2 && pointInPolygon(world, shape.pointsMm),
          );
          store.select(hit?.id ?? null);
        }
        return;
      }

      if (event.button !== 0) return;

      if (mode === "rect") {
        store.startRect(world);
        return;
      }
      if (mode === "polygon") {
        store.addPoint(world, event.shiftKey);
        return;
      }
      if (tool === "entrance") {
        store.placeEntrance(world);
        return;
      }
      if (tool === "circulation") {
        store.placeCirculationNode(world);
        return;
      }
      if (isPlacementTool(tool)) {
        store.placePlacement(world);
      }
    },
    [pointerToWorld, mode, tool, shapes, activeView.scale],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const world = pointerToWorld(event);
      if (world) setCursor(world);
      setShiftHeld(event.shiftKey);

      if (panRef.current) {
        const dx = event.clientX - panRef.current.x;
        const dy = event.clientY - panRef.current.y;
        panRef.current = { x: event.clientX, y: event.clientY };
        setView(panBy(activeView, dx, dy));
        return;
      }

      if (mode === "rect" && world && draft?.kind === "rect") {
        useBlueprintStore.getState().updateRect(world, event.shiftKey);
      }
    },
    [pointerToWorld, activeView, mode, draft],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      (event.target as Element).releasePointerCapture?.(event.pointerId);
      if (panRef.current) {
        panRef.current = null;
        return;
      }
      if (mode === "rect" && draft?.kind === "rect") {
        useBlueprintStore.getState().commitRect();
      }
    },
    [mode, draft],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const anchor: ScreenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      setView(zoomAt(activeView, event.deltaY < 0 ? 1.15 : 1 / 1.15, anchor));
    },
    [activeView],
  );

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const store = useBlueprintStore.getState();
    if (event.key === "Escape") {
      store.cancelDraft();
      return;
    }
    if (event.key === "Enter") {
      store.closePolygon();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (store.selectedId) {
        event.preventDefault();
        store.deleteSelected();
      }
      return;
    }
    if ((event.key === "z" || event.key === "Z") && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
    }
  }, []);

  /* --- projection --- */

  const project = useCallback(
    (point: PointMm) => toScreen(activeView, point),
    [activeView],
  );

  const gridLines = useMemo(() => {
    if (size.width === 0 || snapMm <= 0) return null;
    // Keep grid lines at least 8 px apart; below that a grid is noise.
    let step = snapMm;
    while (step * activeView.scale < 8) step *= 5;
    const topLeft = toWorld(activeView, { x: 0, y: 0 });
    const bottomRight = toWorld(activeView, { x: size.width, y: size.height });
    const xs: number[] = [];
    const zs: number[] = [];
    const startX = Math.ceil(topLeft.xMm / step) * step;
    const startZ = Math.ceil(topLeft.zMm / step) * step;
    for (let x = startX; x <= bottomRight.xMm && xs.length < 400; x += step) xs.push(x);
    for (let z = startZ; z <= bottomRight.zMm && zs.length < 400; z += step) zs.push(z);
    return { xs, zs, step };
  }, [activeView, size.width, size.height, snapMm]);

  const draftPreview = useMemo(() => {
    if (!draft) return null;
    if (draft.kind === "polygon") {
      const points = draft.pointsMm.map(project);
      const live = cursor ? project(cursor) : null;
      return { kind: "polygon" as const, points, live };
    }
    const a = project(draft.startMm);
    const b = project(draft.endMm);
    return {
      kind: "rect" as const,
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
      widthMm: Math.abs(draft.endMm.xMm - draft.startMm.xMm),
      depthMm: Math.abs(draft.endMm.zMm - draft.startMm.zMm),
    };
  }, [draft, project, cursor]);

  const nodeById = useMemo(
    () => new Map(blueprint.circulation.nodes.map((node) => [node.id, node])),
    [blueprint.circulation.nodes],
  );

  const placementSymbols = useMemo((): PlanSymbolInstance[] => {
    return blueprintPlacements(blueprint).map((item) => ({
      id: item.id,
      familyId: item.familyId,
      typeId: item.familyId,
      kind:
        item.tool === "column"
          ? "column"
          : item.tool === "lighting"
            ? "lighting"
            : "furniture",
      xMm: item.positionMm.xMm,
      zMm: item.positionMm.zMm,
      rotationRad: item.rotationRad,
      params: {},
    }));
  }, [blueprint]);

  return (
    <div
      ref={hostRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "relative h-full w-full overflow-hidden bg-background outline-none",
        className,
      )}
    >
      <svg
        width={size.width}
        height={size.height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          panRef.current = null;
          setCursor(null);
        }}
        onDoubleClick={() => useBlueprintStore.getState().closePolygon()}
        onWheel={onWheel}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "touch-none select-none",
          mode === "pan" ? "cursor-grab" : "cursor-crosshair",
        )}
        role="application"
        aria-label="Schematic drawing canvas"
      >
        <defs>
          <pattern
            id="void-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#64748b" strokeWidth="1.5" />
          </pattern>
        </defs>

        {gridLines && (
          <g stroke="#e2e8f0" strokeWidth="1">
            {gridLines.xs.map((x) => {
              const sx = project({ xMm: x, zMm: 0 }).x;
              return <line key={`gx-${x}`} x1={sx} y1={0} x2={sx} y2={size.height} />;
            })}
            {gridLines.zs.map((z) => {
              const sy = project({ xMm: 0, zMm: z }).y;
              return <line key={`gz-${z}`} x1={0} y1={sy} x2={size.width} y2={sy} />;
            })}
          </g>
        )}

        {/* Zones sit under the fabric they are programmed into. */}
        {shapes
          .filter((shape) => shape.kind === "zone")
          .map((shape) => (
            <g key={shape.id}>
              <path
                d={pathOf(shape.pointsMm.map(project))}
                fill={ZONE_FILL[shape.detail ?? ""] ?? ZONE_DEFAULT_FILL}
                fillOpacity={shape.id === selectedId ? 0.42 : 0.22}
                stroke={failing.has(shape.id) ? "#dc2626" : "#475569"}
                strokeWidth={shape.id === selectedId ? 2 : 1}
                strokeDasharray="4 3"
              />
              {shape.pointsMm.length > 2 && (
                <text
                  x={project(shape.pointsMm[0]).x + 6}
                  y={project(shape.pointsMm[0]).y + 14}
                  className="fill-slate-700 text-[10px]"
                  style={{ fontSize: 10 }}
                >
                  {shape.detail}
                </text>
              )}
            </g>
          ))}

        {shapes
          .filter((shape) => shape.kind === "boundary")
          .map((shape) => (
            <path
              key={shape.id}
              d={pathOf(shape.pointsMm.map(project))}
              fill="#0f172a"
              fillOpacity={0.04}
              stroke={
                failing.has(shape.id)
                  ? "#dc2626"
                  : shape.id === selectedId
                    ? "#2563eb"
                    : "#0f172a"
              }
              strokeWidth={shape.id === selectedId ? 3 : 2}
            />
          ))}

        {shapes
          .filter((shape) => shape.kind === "void")
          .map((shape) => (
            <path
              key={shape.id}
              d={pathOf(shape.pointsMm.map(project))}
              fill="url(#void-hatch)"
              fillOpacity={0.5}
              stroke={failing.has(shape.id) ? "#dc2626" : "#475569"}
              strokeWidth={shape.id === selectedId ? 2.5 : 1.5}
            />
          ))}

        {shapes
          .filter((shape) => shape.kind === "core")
          .map((shape) => (
            <path
              key={shape.id}
              d={pathOf(shape.pointsMm.map(project))}
              fill="#1e293b"
              fillOpacity={0.85}
              stroke={
                failing.has(shape.id)
                  ? "#dc2626"
                  : shape.id === selectedId
                    ? "#2563eb"
                    : "#0f172a"
              }
              strokeWidth={shape.id === selectedId ? 2.5 : 1}
            />
          ))}

        {/* Circulation: edges first so nodes cap them. */}
        <g stroke="#f97316" strokeWidth="2.5" strokeLinecap="round">
          {blueprint.circulation.edges.map((edge) => {
            const from = nodeById.get(edge.fromNodeId);
            const to = nodeById.get(edge.toNodeId);
            if (!from || !to) return null;
            const a = project(from.positionMm);
            const b = project(to.positionMm);
            return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>
        {blueprint.circulation.nodes.map((node) => {
          const p = project(node.positionMm);
          return (
            <g key={node.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={node.id === selectedId ? 7 : 5}
                fill="#f97316"
                stroke={failing.has(node.id) ? "#dc2626" : "#ffffff"}
                strokeWidth="2"
              />
              <title>{`${node.kind} · ${node.id}`}</title>
            </g>
          );
        })}

        <PlanSymbolsLayer symbols={placementSymbols} view={activeView} />

        {placementSymbols.map((item) => {
          if (item.id !== selectedId) return null;
          const p = project({ xMm: item.xMm, zMm: item.zMm });
          return (
            <circle
              key={`sel-${item.id}`}
              cx={p.x}
              cy={p.y}
              r="10"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
            />
          );
        })}

        {blueprint.anchors.map((anchor) => {
          const p = project(anchor.positionMm);
          return (
            <g key={anchor.id}>
              <polygon
                points={`${p.x},${p.y - 9} ${p.x + 8},${p.y + 6} ${p.x - 8},${p.y + 6}`}
                fill={anchor.id === selectedId ? "#2563eb" : "#0f766e"}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <title>{`${anchor.kind.value} · ${anchor.id}`}</title>
            </g>
          );
        })}

        {/* In-progress geometry, drawn last so it is never hidden. */}
        {draftPreview?.kind === "polygon" && (
          <g>
            <polyline
              points={[
                ...draftPreview.points,
                ...(draftPreview.live ? [draftPreview.live] : []),
              ]
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            {draftPreview.points.map((p, index) => (
              <circle key={index} cx={p.x} cy={p.y} r="3.5" fill="#2563eb" />
            ))}
          </g>
        )}
        {draftPreview?.kind === "rect" && (
          <g>
            <rect
              x={draftPreview.x}
              y={draftPreview.y}
              width={draftPreview.width}
              height={draftPreview.height}
              fill="#2563eb"
              fillOpacity={0.12}
              stroke="#2563eb"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <text
              x={draftPreview.x + draftPreview.width / 2}
              y={draftPreview.y - 6}
              textAnchor="middle"
              style={{ fontSize: 11 }}
              className="fill-blue-700"
            >
              {(draftPreview.widthMm / 1000).toFixed(1)} ×{" "}
              {(draftPreview.depthMm / 1000).toFixed(1)} m
            </text>
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
        <span>
          {cursor
            ? `${(cursor.xMm / 1000).toFixed(2)}, ${(cursor.zMm / 1000).toFixed(2)} m`
            : "—"}
        </span>
        <span>{snapMm > 0 ? `snap ${snapMm} mm` : "snap off"}</span>
        {gridLines && <span>grid {gridLines.step} mm</span>}
        {shiftHeld && <span className="text-blue-600">ortho</span>}
      </div>

      <button
        type="button"
        onClick={fit}
        className="absolute bottom-2 right-2 rounded border bg-background px-2 py-1 text-[10px] shadow-sm"
      >
        Fit
      </button>

      {mode !== "pan" && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
          {mode === "polygon"
            ? "Click to place vertices · double-click or Enter closes · Shift for ortho · Esc cancels"
            : mode === "rect"
              ? "Drag a rectangle · Shift for a square · Esc cancels"
              : tool === "entrance"
                ? "Click near a boundary edge to place an entrance"
                : isPlacementTool(tool)
                  ? `Click to place a ${tool === "lighting" ? "light" : tool} on the plan · Delete removes · Generate BIM compiles it`
                  : "Click to place circulation nodes · each click links to the last · Esc ends the run"}
        </div>
      )}
    </div>
  );
}
