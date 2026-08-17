"use client";

// src/components/generative/schematic/plan-symbols-layer.tsx
//
// LevelPlan.symbols → SVG, drawn with the authored/generated family library
// (src/lib/plan-symbols/). Each PlanSymbolInstance resolves to a SymbolGraph
// (registry.ts, or the KIND_TO_TOOL tool default for a familyId-less
// generated element), evaluates to local-mm geometry, is mirrored for a
// left-handed door and placed at (xMm, zMm, rotationRad), then projected
// through the same ViewTransform the rest of the plan uses.
//
// Importing library/index.ts is what makes symbolFor() return the 102
// hand-authored graphs instead of tool-default placeholders — nothing else
// on the page path imports it.
import "@/lib/plan-symbols/library/index";

import type { ReactElement } from "react";

import { TOOL_DEFAULTS } from "@/lib/plan-symbols/catalog-defaults";
import {
  evaluateSymbol,
  SymbolGraphError,
  type PointMm,
  type Stroke,
  type SymbolGeometry,
} from "@/lib/plan-symbols/evaluate";
import type { StrokeWeight, SymbolGraph } from "@/lib/plan-symbols/graph-types";
import { symbolFor } from "@/lib/plan-symbols/registry";

import { KIND_TO_TOOL, type PlanSymbolInstance } from "./plan-model";
import { toScreen, type ScreenPoint, type ViewTransform } from "./view-transform";

/* ------------------------------------------------------------------ */
/* Style — plan-convention line weights, matched to the wall/column     */
/* strokes plan-overlay.tsx already draws (exterior wall 2.5, interior  */
/* 1.25) so symbols read as part of the same drawing, not a decal.      */
/* ------------------------------------------------------------------ */

export const WEIGHT_PX: Record<StrokeWeight, number> = {
  cut: 2.5,
  medium: 1.25,
  thin: 0.75,
  symbol: 0.5,
};

export const WEIGHT_COLOR: Record<StrokeWeight, string> = {
  cut: "#0f172a",
  medium: "#334155",
  thin: "#64748b",
  symbol: "#94a3b8",
};

/** Distinct from the blueprint layer's dash patterns ("8 4" / "4 3") so the two never read as the same kind of line. */
export const SYMBOL_DASH = "3 2";

const FALLBACK_GRAPH: SymbolGraph = {
  id: "plan-symbols-layer/fallback",
  params: { widthMm: 400, depthMm: 400 },
  nodes: [{ op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: "widthMm", depthMm: "depthMm" }],
};

/** The graph to evaluate for this instance: its own family, or the kind's tool default when it has none. */
export function graphForInstance(instance: PlanSymbolInstance): SymbolGraph {
  if (instance.familyId) return symbolFor(instance.familyId);
  const tool = KIND_TO_TOOL[instance.kind];
  return tool ? TOOL_DEFAULTS[tool] : FALLBACK_GRAPH;
}

function paramOverrides(instance: PlanSymbolInstance): Record<string, number> {
  const overrides: Record<string, number> = {};
  if (instance.params.widthMm !== undefined) overrides.widthMm = instance.params.widthMm;
  if (instance.params.heightMm !== undefined) overrides.heightMm = instance.params.heightMm;
  if (instance.hostWallThicknessMm !== undefined) overrides.thicknessMm = instance.hostWallThicknessMm;
  return overrides;
}

/**
 * Reflect x=0 (the local +Z axis) — a right-handed door's leaf/swing mirrored
 * from the left-handed graph every door family is authored as. Arc angles
 * reflect too: a point at angle θ maps to 180−θ, so the swing keeps its true
 * direction instead of just flipping in place.
 */
function mirrorLocalX(geometry: SymbolGeometry): SymbolGeometry {
  return {
    boundsMm: geometry.boundsMm
      ? {
          minX: -geometry.boundsMm.maxX,
          maxX: -geometry.boundsMm.minX,
          minZ: geometry.boundsMm.minZ,
          maxZ: geometry.boundsMm.maxZ,
        }
      : null,
    strokes: geometry.strokes.map((stroke): Stroke => {
      if (stroke.kind === "path") {
        return { ...stroke, points: stroke.points.map((p) => ({ xMm: -p.xMm, zMm: p.zMm })) };
      }
      if (stroke.kind === "circle") {
        return { ...stroke, centerMm: { xMm: -stroke.centerMm.xMm, zMm: stroke.centerMm.zMm } };
      }
      return {
        ...stroke,
        centerMm: { xMm: -stroke.centerMm.xMm, zMm: stroke.centerMm.zMm },
        startAngleDeg: 180 - stroke.startAngleDeg,
        sweepDeg: -stroke.sweepDeg,
      };
    }),
  };
}

/** Evaluate this instance's graph and apply its hand mirror, in the symbol's own local mm frame. Throws SymbolGraphError on a malformed graph — callers decide whether to guard. */
export function evaluateInstance(instance: PlanSymbolInstance): SymbolGeometry {
  const graph = graphForInstance(instance);
  const geometry = evaluateSymbol(graph, paramOverrides(instance));
  return instance.params.hand === "right" ? mirrorLocalX(geometry) : geometry;
}

/** Local mm point → world mm point, via this instance's own placement (translate + rotate; no scale). */
export function toWorldMm(local: PointMm, instance: Pick<PlanSymbolInstance, "xMm" | "zMm" | "rotationRad">): PointMm {
  const cos = Math.cos(instance.rotationRad);
  const sin = Math.sin(instance.rotationRad);
  return {
    xMm: instance.xMm + cos * local.xMm - sin * local.zMm,
    zMm: instance.zMm + sin * local.xMm + cos * local.zMm,
  };
}

/** Place already-evaluated local geometry into world mm — the frame `readLevelPlan`'s rooms/walls/columns already live in. */
export function placeInWorldMm(
  geometry: SymbolGeometry,
  instance: Pick<PlanSymbolInstance, "xMm" | "zMm" | "rotationRad">,
): Stroke[] {
  const rotationDeg = (instance.rotationRad * 180) / Math.PI;
  return geometry.strokes.map((stroke): Stroke => {
    if (stroke.kind === "path") {
      return { ...stroke, points: stroke.points.map((p) => toWorldMm(p, instance)) };
    }
    if (stroke.kind === "circle") {
      return { ...stroke, centerMm: toWorldMm(stroke.centerMm, instance) };
    }
    return {
      ...stroke,
      centerMm: toWorldMm(stroke.centerMm, instance),
      startAngleDeg: stroke.startAngleDeg + rotationDeg,
    };
  });
}

function pointOnCircle(center: PointMm, radiusMm: number, angleDeg: number): PointMm {
  const rad = (angleDeg * Math.PI) / 180;
  return { xMm: center.xMm + Math.cos(rad) * radiusMm, zMm: center.zMm + Math.sin(rad) * radiusMm };
}

function pathD(points: readonly ScreenPoint[], closed?: boolean): string {
  if (points.length === 0) return "";
  const body = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return closed ? `${body} Z` : body;
}

/**
 * One evaluated stroke → one SVG element. `project` carries the point
 * conversion (world-mm → screen-px on the live plan; identity on the
 * /dev/symbols card, which draws straight in mm); `scale` converts a radius
 * the same way project converts a point, so an arc/circle's curvature
 * matches its straight strokes under either projection.
 */
export function renderStroke(
  stroke: Stroke,
  key: string,
  project: (p: PointMm) => ScreenPoint,
  scale: number,
): ReactElement {
  const style = {
    fill: "none",
    stroke: WEIGHT_COLOR[stroke.weight],
    strokeWidth: WEIGHT_PX[stroke.weight],
    strokeDasharray: stroke.dashed ? SYMBOL_DASH : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (stroke.kind === "path") {
    return <path key={key} d={pathD(stroke.points.map(project), stroke.closed)} {...style} />;
  }
  if (stroke.kind === "circle") {
    const c = project(stroke.centerMm);
    return <circle key={key} cx={c.x} cy={c.y} r={stroke.radiusMm * scale} {...style} />;
  }
  const start = project(pointOnCircle(stroke.centerMm, stroke.radiusMm, stroke.startAngleDeg));
  const end = project(pointOnCircle(stroke.centerMm, stroke.radiusMm, stroke.startAngleDeg + stroke.sweepDeg));
  const r = stroke.radiusMm * scale;
  const largeArc = Math.abs(stroke.sweepDeg) > 180 ? 1 : 0;
  const sweepFlag = stroke.sweepDeg >= 0 ? 1 : 0;
  return (
    <path
      key={key}
      d={`M${start.x.toFixed(2)} ${start.y.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
      {...style}
    />
  );
}

interface Props {
  symbols: readonly PlanSymbolInstance[];
  view: ViewTransform;
}

/** The plan's family layer: every door, window, furniture, fixture and stair/railing/MEP instance, drawn from the live symbol registry. */
export function PlanSymbolsLayer({ symbols, view }: Props) {
  const project = (p: PointMm) => toScreen(view, p);

  return (
    <g>
      {symbols.map((instance) => {
        let strokes: Stroke[];
        try {
          strokes = placeInWorldMm(evaluateInstance(instance), instance);
        } catch (err) {
          // A single malformed graph (family authoring bug, corrupt override)
          // must not blank the rest of the plan.
          if (process.env.NODE_ENV !== "production") {
            const reason = err instanceof SymbolGraphError ? err.message : String(err);
            console.warn(`plan-symbols-layer: skipping ${instance.id} (${instance.typeId}): ${reason}`);
          }
          return null;
        }
        return (
          <g key={instance.id}>
            {strokes.map((stroke, i) => renderStroke(stroke, `${instance.id}-${i}`, project, view.scale))}
          </g>
        );
      })}
    </g>
  );
}
