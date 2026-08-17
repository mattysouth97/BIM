// src/lib/plan-symbols/graph-types.ts
//
// A SymbolGraph is a plain JSON-able recipe for one family's 2D plan symbol:
// a small tree of drawing primitives wrapped in transforms, evaluated against
// mm parameters. Nothing here does any drawing or math — see evaluate.ts.
//
// Local frame convention (matches the schematic plan overlay this feeds):
// origin = the family's placement anchor, +X = rotationY 0, units = mm,
// plan XZ plane (Y is up and out of scope for a 2D symbol).

/**
 * A numeric field is either a literal mm value or a bounded expression
 * string over this graph's params (e.g. "widthMm/2", "min(widthMm,900)").
 * See expr.ts for the safe grammar — never eval() this.
 */
export type NumericField = number | string;

/** Plan-convention line weight. Not a stroke color — renderers map this to px/mm. */
export type StrokeWeight = "cut" | "medium" | "thin" | "symbol";

export interface DrawableBase {
  weight: StrokeWeight;
  dashed?: boolean;
}

export interface LineNode extends DrawableBase {
  op: "line";
  x1: NumericField;
  z1: NumericField;
  x2: NumericField;
  z2: NumericField;
}

export interface PolylineNode extends DrawableBase {
  op: "polyline";
  points: Array<{ x: NumericField; z: NumericField }>;
  closed?: boolean;
}

export interface ArcNode extends DrawableBase {
  op: "arc";
  cx: NumericField;
  cz: NumericField;
  radius: NumericField;
  startAngleDeg: NumericField;
  sweepDeg: NumericField;
}

export interface CircleNode extends DrawableBase {
  op: "circle";
  cx: NumericField;
  cz: NumericField;
  radius: NumericField;
}

/** Centered rectangle: (cx, cz) is the centre, not a corner. */
export interface RectNode extends DrawableBase {
  op: "rect";
  cx: NumericField;
  cz: NumericField;
  widthMm: NumericField;
  depthMm: NumericField;
  /** Optional local rotation, degrees, about (cx, cz). Default 0. */
  rotationDeg?: NumericField;
}

/**
 * A short reference mark: a straight segment of `lengthMm` centred at
 * (x, z), pointing along `angleDeg` (0 = local +X). Used for grid ticks,
 * risers, baluster marks, leader stubs — anywhere a full `line` node would
 * be verbose to author by hand.
 */
export interface TickNode extends DrawableBase {
  op: "tick";
  x: NumericField;
  z: NumericField;
  /** Direction, degrees from local +X. Default 0. */
  angleDeg?: NumericField;
  /** Total mark length, mm. Default 150. */
  lengthMm?: NumericField;
}

export type DrawableNode =
  | LineNode
  | PolylineNode
  | ArcNode
  | CircleNode
  | RectNode
  | TickNode;

export interface TranslateNode {
  op: "translate";
  dx: NumericField;
  dz: NumericField;
  children: SymbolNode[];
}

/** Rotate children about the current local origin (0, 0). */
export interface RotateNode {
  op: "rotate";
  angleDeg: NumericField;
  children: SymbolNode[];
}

/** Mirror children's x coordinate (reflect across the local z axis, x = 0). */
export interface MirrorXNode {
  op: "mirrorX";
  children: SymbolNode[];
}

/** Mirror children's z coordinate (reflect across the local x axis, z = 0). */
export interface MirrorZNode {
  op: "mirrorZ";
  children: SymbolNode[];
}

/** `count` copies of children, each translated by i * stepMm along `axis` (default "x"). */
export interface ArrayLinearNode {
  op: "arrayLinear";
  count: NumericField;
  stepMm: NumericField;
  axis?: "x" | "z";
  children: SymbolNode[];
}

/** `count` copies of children, each rotated by i * angleStepDeg about the local origin. */
export interface ArrayRadialNode {
  op: "arrayRadial";
  count: NumericField;
  angleStepDeg: NumericField;
  children: SymbolNode[];
}

/** Pure grouping — no transform, just organisation. */
export interface GroupNode {
  op: "group";
  children: SymbolNode[];
}

export type TransformNode =
  | TranslateNode
  | RotateNode
  | MirrorXNode
  | MirrorZNode
  | ArrayLinearNode
  | ArrayRadialNode
  | GroupNode;

export type SymbolNode = DrawableNode | TransformNode;

export interface SymbolGraph {
  id: string;
  /** Default mm param values. Evaluating with no overrides must still work. */
  params?: Record<string, number>;
  nodes: SymbolNode[];
}
