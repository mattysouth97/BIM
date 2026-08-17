// src/lib/plan-symbols/evaluate.ts
//
// Turns a SymbolGraph + params into concrete mm geometry: evaluateSymbol()
// walks the node tree, resolving expression fields and folding transforms
// into a running 2D affine matrix. Arcs and circles stay analytic (a
// renderer can emit them as SVG A commands / <circle> directly); tessellate()
// is offered separately for consumers that only want point lists.

import { resolveNumeric } from "./expr";
import type {
  ArcNode,
  CircleNode,
  LineNode,
  PolylineNode,
  RectNode,
  StrokeWeight,
  SymbolGraph,
  SymbolNode,
  TickNode,
} from "./graph-types";

export class SymbolGraphError extends Error {
  constructor(
    message: string,
    public readonly symbolId: string,
  ) {
    super(`[${symbolId}] ${message}`);
    this.name = "SymbolGraphError";
  }
}

/** Total drawable-node instances (post array-expansion) a single graph may emit. */
export const MAX_SYMBOL_NODES = 200;
/** Recursion depth guard — catches accidental self-referential node trees. */
const MAX_DEPTH = 64;

export interface PointMm {
  xMm: number;
  zMm: number;
}

export interface BoundsMm {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PathStroke {
  kind: "path";
  points: PointMm[];
  closed?: boolean;
  weight: StrokeWeight;
  dashed?: boolean;
}

export interface ArcStroke {
  kind: "arc";
  centerMm: PointMm;
  radiusMm: number;
  startAngleDeg: number;
  sweepDeg: number;
  weight: StrokeWeight;
  dashed?: boolean;
}

export interface CircleStroke {
  kind: "circle";
  centerMm: PointMm;
  radiusMm: number;
  weight: StrokeWeight;
  dashed?: boolean;
}

export type Stroke = PathStroke | ArcStroke | CircleStroke;

export interface SymbolGeometry {
  strokes: Stroke[];
  boundsMm: BoundsMm | null;
}

/** 2D affine: [x', z'] = [a*x + c*z + e, b*x + d*z + f]. */
interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Mat2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function apply(m: Mat2D, x: number, z: number): PointMm {
  return { xMm: m.a * x + m.c * z + m.e, zMm: m.b * x + m.d * z + m.f };
}

/** compose(parent, child): apply child's local transform, then parent's. */
function compose(parent: Mat2D, child: Mat2D): Mat2D {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f,
  };
}

function translateMat(dx: number, dz: number): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dz };
}

function rotateMat(angleDeg: number): Mat2D {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

const MIRROR_X: Mat2D = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const MIRROR_Z: Mat2D = { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 };

interface WalkState {
  symbolId: string;
  params: Readonly<Record<string, number>>;
  strokes: Stroke[];
  bounds: BoundsMm | null;
  nodeCount: number;
}

function extendBounds(state: WalkState, point: PointMm): void {
  if (!state.bounds) {
    state.bounds = { minX: point.xMm, maxX: point.xMm, minZ: point.zMm, maxZ: point.zMm };
    return;
  }
  state.bounds.minX = Math.min(state.bounds.minX, point.xMm);
  state.bounds.maxX = Math.max(state.bounds.maxX, point.xMm);
  state.bounds.minZ = Math.min(state.bounds.minZ, point.zMm);
  state.bounds.maxZ = Math.max(state.bounds.maxZ, point.zMm);
}

function bumpNodeCount(state: WalkState): void {
  state.nodeCount++;
  if (state.nodeCount > MAX_SYMBOL_NODES) {
    throw new SymbolGraphError(
      `exceeds the ${MAX_SYMBOL_NODES}-node budget (evaluated node #${state.nodeCount})`,
      state.symbolId,
    );
  }
}

function num(state: WalkState, field: number | string): number {
  return resolveNumeric(field, state.params);
}

function requireInt(state: WalkState, value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SymbolGraphError(`${what} must resolve to a non-negative integer, got ${value}`, state.symbolId);
  }
  return value;
}

function evalLine(state: WalkState, node: LineNode, m: Mat2D): void {
  bumpNodeCount(state);
  const p1 = apply(m, num(state, node.x1), num(state, node.z1));
  const p2 = apply(m, num(state, node.x2), num(state, node.z2));
  const stroke: PathStroke = { kind: "path", points: [p1, p2], weight: node.weight, dashed: node.dashed };
  state.strokes.push(stroke);
  extendBounds(state, p1);
  extendBounds(state, p2);
}

function evalPolyline(state: WalkState, node: PolylineNode, m: Mat2D): void {
  bumpNodeCount(state);
  const points = node.points.map((p) => apply(m, num(state, p.x), num(state, p.z)));
  const stroke: PathStroke = {
    kind: "path",
    points,
    closed: node.closed,
    weight: node.weight,
    dashed: node.dashed,
  };
  state.strokes.push(stroke);
  for (const p of points) extendBounds(state, p);
}

function evalArc(state: WalkState, node: ArcNode, m: Mat2D): void {
  bumpNodeCount(state);
  const cx = num(state, node.cx);
  const cz = num(state, node.cz);
  const radius = num(state, node.radius);
  const startAngleDeg = num(state, node.startAngleDeg);
  const sweepDeg = num(state, node.sweepDeg);
  if (radius <= 0) throw new SymbolGraphError(`arc radius must be positive, got ${radius}`, state.symbolId);
  const center = apply(m, cx, cz);
  const stroke: ArcStroke = {
    kind: "arc",
    centerMm: center,
    // A uniform-scale, no-shear matrix (translate/rotate/mirror composition
    // only produces those) preserves circle radii; take the transformed X
    // basis vector's length as the effective scale.
    radiusMm: radius * Math.hypot(m.a, m.b),
    startAngleDeg,
    sweepDeg,
    weight: node.weight,
    dashed: node.dashed,
  };
  state.strokes.push(stroke);
  extendArcBounds(state, stroke);
}

function evalCircle(state: WalkState, node: CircleNode, m: Mat2D): void {
  bumpNodeCount(state);
  const cx = num(state, node.cx);
  const cz = num(state, node.cz);
  const radius = num(state, node.radius);
  if (radius <= 0) throw new SymbolGraphError(`circle radius must be positive, got ${radius}`, state.symbolId);
  const center = apply(m, cx, cz);
  const radiusMm = radius * Math.hypot(m.a, m.b);
  const stroke: CircleStroke = { kind: "circle", centerMm: center, radiusMm, weight: node.weight, dashed: node.dashed };
  state.strokes.push(stroke);
  extendBounds(state, { xMm: center.xMm - radiusMm, zMm: center.zMm - radiusMm });
  extendBounds(state, { xMm: center.xMm + radiusMm, zMm: center.zMm + radiusMm });
}

function extendArcBounds(state: WalkState, arc: ArcStroke): void {
  // Conservative: bound by the full circle. Good enough for layout/coverage
  // checks; a renderer wanting a tight arc box should tessellate instead.
  extendBounds(state, { xMm: arc.centerMm.xMm - arc.radiusMm, zMm: arc.centerMm.zMm - arc.radiusMm });
  extendBounds(state, { xMm: arc.centerMm.xMm + arc.radiusMm, zMm: arc.centerMm.zMm + arc.radiusMm });
}

function evalRect(state: WalkState, node: RectNode, m: Mat2D): void {
  bumpNodeCount(state);
  const cx = num(state, node.cx);
  const cz = num(state, node.cz);
  const width = num(state, node.widthMm);
  const depth = num(state, node.depthMm);
  const rotationDeg = node.rotationDeg === undefined ? 0 : num(state, node.rotationDeg);
  const halfW = width / 2;
  const halfD = depth / 2;
  const local = compose(translateMat(cx, cz), rotateMat(rotationDeg));
  const combined = compose(m, local);
  const corners: Array<[number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  const points = corners.map(([x, z]) => apply(combined, x, z));
  const stroke: PathStroke = { kind: "path", points, closed: true, weight: node.weight, dashed: node.dashed };
  state.strokes.push(stroke);
  for (const p of points) extendBounds(state, p);
}

function evalTick(state: WalkState, node: TickNode, m: Mat2D): void {
  bumpNodeCount(state);
  const x = num(state, node.x);
  const z = num(state, node.z);
  const angleDeg = node.angleDeg === undefined ? 0 : num(state, node.angleDeg);
  const length = node.lengthMm === undefined ? 150 : num(state, node.lengthMm);
  const rad = (angleDeg * Math.PI) / 180;
  const half = length / 2;
  const dx = Math.cos(rad) * half;
  const dz = Math.sin(rad) * half;
  const p1 = apply(m, x - dx, z - dz);
  const p2 = apply(m, x + dx, z + dz);
  const stroke: PathStroke = { kind: "path", points: [p1, p2], weight: node.weight, dashed: node.dashed };
  state.strokes.push(stroke);
  extendBounds(state, p1);
  extendBounds(state, p2);
}

function walk(state: WalkState, node: SymbolNode, m: Mat2D, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new SymbolGraphError(`exceeds max nesting depth of ${MAX_DEPTH}`, state.symbolId);
  }
  switch (node.op) {
    case "line":
      return evalLine(state, node, m);
    case "polyline":
      return evalPolyline(state, node, m);
    case "arc":
      return evalArc(state, node, m);
    case "circle":
      return evalCircle(state, node, m);
    case "rect":
      return evalRect(state, node, m);
    case "tick":
      return evalTick(state, node, m);
    case "group":
      for (const child of node.children) walk(state, child, m, depth + 1);
      return;
    case "translate": {
      const next = compose(m, translateMat(num(state, node.dx), num(state, node.dz)));
      for (const child of node.children) walk(state, child, next, depth + 1);
      return;
    }
    case "rotate": {
      const next = compose(m, rotateMat(num(state, node.angleDeg)));
      for (const child of node.children) walk(state, child, next, depth + 1);
      return;
    }
    case "mirrorX": {
      const next = compose(m, MIRROR_X);
      for (const child of node.children) walk(state, child, next, depth + 1);
      return;
    }
    case "mirrorZ": {
      const next = compose(m, MIRROR_Z);
      for (const child of node.children) walk(state, child, next, depth + 1);
      return;
    }
    case "arrayLinear": {
      const count = requireInt(state, num(state, node.count), "arrayLinear count");
      const step = num(state, node.stepMm);
      const axis = node.axis ?? "x";
      for (let i = 0; i < count; i++) {
        const next =
          axis === "x" ? compose(m, translateMat(i * step, 0)) : compose(m, translateMat(0, i * step));
        for (const child of node.children) walk(state, child, next, depth + 1);
      }
      return;
    }
    case "arrayRadial": {
      const count = requireInt(state, num(state, node.count), "arrayRadial count");
      const angleStep = num(state, node.angleStepDeg);
      for (let i = 0; i < count; i++) {
        const next = compose(m, rotateMat(i * angleStep));
        for (const child of node.children) walk(state, child, next, depth + 1);
      }
      return;
    }
    default: {
      const exhaustive: never = node;
      throw new SymbolGraphError(`unknown node op: ${JSON.stringify(exhaustive)}`, state.symbolId);
    }
  }
}

/** Evaluate a SymbolGraph against params (merged over the graph's own defaults). Deterministic. */
export function evaluateSymbol(graph: SymbolGraph, params: Readonly<Record<string, number>> = {}): SymbolGeometry {
  const merged: Record<string, number> = { ...graph.params, ...params };
  const state: WalkState = { symbolId: graph.id, params: merged, strokes: [], bounds: null, nodeCount: 0 };
  for (const node of graph.nodes) {
    walk(state, node, IDENTITY, 0);
  }
  return { strokes: state.strokes, boundsMm: state.bounds };
}

export interface TessellatedStroke {
  points: PointMm[];
  closed?: boolean;
  weight: StrokeWeight;
  dashed?: boolean;
}

/** Number of segments for a chordal-tolerance approximation of an arc/circle sweep. */
function segmentsForSweep(radiusMm: number, sweepDeg: number, toleranceMm: number): number {
  const sweepRad = Math.abs((sweepDeg * Math.PI) / 180);
  if (sweepRad === 0 || radiusMm <= 0) return 1;
  const clampedTolerance = Math.min(Math.max(toleranceMm, 1e-6), radiusMm);
  const maxAnglePerSegment = 2 * Math.acos(1 - clampedTolerance / radiusMm);
  const segments = Math.ceil(sweepRad / maxAnglePerSegment);
  return Math.max(2, Math.min(segments, 512));
}

/** Flatten strokes (arcs/circles included) to point lists, for consumers that only draw polylines. */
export function tessellate(strokes: readonly Stroke[], toleranceMm: number): TessellatedStroke[] {
  return strokes.map((stroke) => {
    if (stroke.kind === "path") {
      return { points: stroke.points, closed: stroke.closed, weight: stroke.weight, dashed: stroke.dashed };
    }
    if (stroke.kind === "circle") {
      const segments = segmentsForSweep(stroke.radiusMm, 360, toleranceMm);
      const points: PointMm[] = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          xMm: stroke.centerMm.xMm + Math.cos(angle) * stroke.radiusMm,
          zMm: stroke.centerMm.zMm + Math.sin(angle) * stroke.radiusMm,
        });
      }
      return { points, closed: true, weight: stroke.weight, dashed: stroke.dashed };
    }
    // arc
    const segments = segmentsForSweep(stroke.radiusMm, stroke.sweepDeg, toleranceMm);
    const points: PointMm[] = [];
    for (let i = 0; i <= segments; i++) {
      const angleDeg = stroke.startAngleDeg + (stroke.sweepDeg * i) / segments;
      const angleRad = (angleDeg * Math.PI) / 180;
      points.push({
        xMm: stroke.centerMm.xMm + Math.cos(angleRad) * stroke.radiusMm,
        zMm: stroke.centerMm.zMm + Math.sin(angleRad) * stroke.radiusMm,
      });
    }
    return { points, closed: false, weight: stroke.weight, dashed: stroke.dashed };
  });
}
