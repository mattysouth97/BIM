// src/lib/generative/blueprint/from-svg.ts
//
// Bridge from a raw SVG document (string) into the blueprint interpretation
// seam — the SVG counterpart of `from-cad.ts`. Two exports, mirroring that
// file's shape exactly:
//
//   svgToSegments  — walk the SVG DOM-equivalent and emit segments + labels,
//     millimetres, ready for ANY consumer of the shared "segments" contract
//     (a BIMReasoningProvider request, or the deterministic reader below).
//     Mirrors `cadDocumentToSegments`.
//
//   fromSvgString  — skips the provider entirely and calls the SAME
//     loop-detection core (`from-segments.ts`) directly, with an optional
//     explicit id/data-layer→role mapping. Mirrors `fromCadDocument`.
//
// WHY NO DOMParser
// ----------------
// `happy-dom` (this repo's test environment) puts a global `DOMParser` in
// scope, so `new DOMParser().parseFromString(svg, "image/svg+xml")` would
// pass every test here and then throw in production: this module is reached
// from a Next.js API route (Node runtime), and `happy-dom` is a devDependency
// — it is not installed, let alone globalised, in a production build. Relying
// on it would be a bug that only a real deployment surfaces. So this file
// parses SVG/XML itself: a small, dependency-free, recursive-descent walker
// (see `parseXmlDocument` below) good enough for the well-formed vector
// output real CAD/design tools emit. It is not a general HTML-tolerant
// parser — malformed markup throws rather than guessing, which is exactly
// this module's contract (see "HONESTY" below).
//
// UNITS IN — SVG "user units"
// ----------------------------
// SVG has no notion of a real-world unit; a coordinate is just a number in
// whatever frame the nearest `viewBox` establishes (or, absent a `viewBox`,
// the bare numbers on each element). A floor-plan SVG is not a web graphic —
// there is no reliable way to *infer* "1 unit = 1 mm" from the file alone, so
// the caller MUST supply `svgUnitsToMm`, mirroring the calibration step
// `blueprint-spec.ts`'s `CoordinateSystemSchema.method` names ("explicit
// dimension", "known element", ...): if the drawing was exported at 1 unit =
// 1 mm, pass 1 (the default — READ THIS AS "UNCALIBRATED", not as a safe
// assumption); at 1 unit = 1 inch, pass 25.4; etc. Getting this wrong scales
// every downstream dimension uniformly, silently.
//
// VIEWBOX VS WIDTH/HEIGHT
// ------------------------
// When a `viewBox` is present it — not the outer `width`/`height` — defines
// the coordinate system every child element's numbers are already expressed
// in (that is simply how SVG works: `width`/`height` only say how large the
// *viewport* renders on screen, a presentation concern). So this reader does
// NOT rescale coordinates by any `width`/`height` vs `viewBox` ratio — doing
// so would apply a bogus "physical size" correction on top of numbers that
// are already correct in their own frame, silently doubling up with whatever
// `svgUnitsToMm` the caller supplies. The `viewBox` is parsed and validated
// (a malformed one throws) but its `min-x`/`min-y` offset is deliberately
// NOT subtracted from output coordinates either — `from-cad.ts` passes CAD
// coordinates through verbatim (whatever origin the source file used), and
// this file does the same for consistency: the blueprint keeps the drawing's
// own origin, not a normalised one.
//
// AXIS CONVENTION
// ----------------
// Like `from-cad.ts`, this is a direct pass-through: SVG's X → blueprint X,
// SVG's Y → blueprint Z, unflipped. Note that SVG's Y axis increases
// DOWNWARD (screen convention) while architectural "north-up" plans often
// treat +Z as "up" on the sheet — if a source SVG was authored Y-up, the
// caller is responsible for flipping before calibrating, exactly as they
// would be responsible for any other authoring-convention mismatch.
//
// SUPPORTED ELEMENTS
// -------------------
//   <line>, <polyline>, <polygon>       — straight edges, verbatim.
//   <rect>                              — 4 corners; `rx`/`ry` are IGNORED
//     (rendered as a sharp rectangle) — a documented limitation, not a bug.
//   <path>                              — M/m L/l H/h V/v C/c Q/q Z/z, plus
//     A/a (elliptical arc). Curves are flattened to straight chords (see
//     "CURVE FLATTENING" below) because `SegmentInputMm` — like the DXF path
//     — only carries straight edges; `interpretSegmentsToBlueprint`'s loop
//     detector works on a segment soup, not on curved primitives.
//   <text>, <tspan>                     — becomes ONE `LabelInputMm` per
//     `<text>`, anchored at the `<text>` element's own (transformed) x/y,
//     with all descendant text (including nested `<tspan>`s) concatenated
//     and whitespace-collapsed. A `<tspan>` that repositions itself with its
//     own `x`/`y` (common for hand-laid-out multi-line labels) is NOT split
//     into a second, separately-anchored label — a documented limitation.
//   nested <g transform="...">          — `translate`, `scale`, `rotate`,
//     `matrix`, plus `skewX`/`skewY` as a bonus. Transforms compose down the
//     tree (ancestor ∘ own), applied once per point, right before it becomes
//     a `PointMm`.
//
// EXPLICITLY UNSUPPORTED (documented, not silently dropped)
// ------------------------------------------------------------
//   <circle>, <ellipse>, <image>  — recognised and explicitly skipped (see
//     `UNSUPPORTED_SHAPE_TAGS`). Curved-primitive circles/ellipses are
//     outside the "at minimum" element set this adapter commits to; `<image>`
//     is raster content a vector importer has no geometry to read.
//   `S/s`, `T/t` path commands (smooth-curve shorthands) — throw a clear
//     error naming the unsupported command, rather than silently ignoring
//     the curve or guessing a control point. Expand them to `C`/`Q` before
//     import (most vector tools have an "expand smooth curves" export
//     option).
//   `<defs>`, `<symbol>`, `<clipPath>`, `<mask>`, `<pattern>`, `<marker>`,
//     `<use>` — non-rendering definitions / references. This importer does
//     not resolve `<use href="...">`, so anything ONLY reachable through one
//     is not read. A floor plan traced from primitives directly (the normal
//     case for an exported drawing) is unaffected.
//   percentage lengths (`x="50%"`) and physical CSS units on individual
//     coordinate attributes (`x="10mm"`) — throw a clear error. A bare `px`
//     suffix is accepted (treated as 1 user unit, the common case); anything
//     else asks for a re-export in plain user-unit coordinates.
//
// CURVE FLATTENING
// ------------------
// Cubic/quadratic Béziers: fixed-subdivision (`BEZIER_FLATTEN_SEGMENTS`
// straight chords per curve) rather than adaptive flatness testing — simpler
// and, since chord count is a pure function of the control points, exactly as
// deterministic. Flattening happens in the path's OWN (untransformed) local
// space, then every sampled point is carried through the accumulated
// transform — valid because `translate`/`scale`/`rotate`/`matrix`/`skew` are
// all affine, and an affine image of a Bézier or elliptical arc is exactly
// the same curve with transformed control points/foci, so
// flatten-then-transform and transform-then-flatten agree exactly at the
// vertices this function actually emits.
//
// Elliptical arcs (`A`/`a`): flattened via the standard SVG endpoint-to-
// centre parameterisation (SVG 1.1 Appendix F.6), sampled at a fixed angular
// step (`ARC_ANGLE_STEP_RAD`) so a near-full-circle arc still gets a
// reasonable chord count and a small sweep does not get needlessly over-
// sampled.
//
// HONESTY
// --------
// Same principle as `from-segments.ts`: never fabricate geometry, never
// silently drop it. Malformed/unparseable SVG throws a clear `Error` — it
// never falls back to an empty blueprint. A geometry-bearing element this
// module chooses not to support is either flattened to its best real
// approximation (curves) or explicitly, visibly skipped (circles, `<use>`) —
// nothing is dropped without the reader of this file being told where and
// why.
//
// No `Math.random`, no `Date.now`: identical SVG text always produces an
// identical `BlueprintSpec`.

import type { SpaceType } from "../spec/building-spec";
import {
  interpretSegmentsToBlueprint,
  type InterpretSegmentsOptions,
  type LabelInputMm,
  type SegmentInputMm,
} from "./from-segments";
import type { BlueprintSpec, PointMm } from "./blueprint-spec";

/**
 * UX-facing layer mapping, mirroring `CadLayerMapping` from `from-cad.ts`.
 * SVG has no DXF-style `layer` field, so "layer" here means: an element's own
 * `data-layer` attribute, falling back to its `id`, inherited down through
 * `<g>` ancestors exactly like a DXF entity inherits nothing but a CAD
 * "layer" groups many entities — a `<g data-layer="A-WALL">` wrapping several
 * `<path>`s behaves like several DXF entities all drawn on layer "A-WALL".
 */
export interface SvgLayerMapping {
  boundary?: string[];
  core?: string[];
  /** id/data-layer → the zone program it always means, e.g. `{"A-ROOM-OFFICE": "office-open"}`. */
  zone?: Record<string, SpaceType>;
}

/* ------------------------------------------------------------------ */
/* Minimal local vector/matrix math                                    */
/* ------------------------------------------------------------------ */
//
// Deliberately NOT the geometry kernel's `Vec2` (`../geom`) — this module
// only ever needs affine point transforms, not the 2D boolean/offset kernel,
// so it stays self-contained the same way `from-cad.ts` needs no geometry
// import at all.

type Vec2 = readonly [number, number];

/**
 * 2D affine transform as `[a, b, c, d, e, f]`, SVG's own convention:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 * i.e. the matrix `[[a, c, e], [b, d, f], [0, 0, 1]]`.
 */
type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

/** `m1 ∘ m2` — apply `m2` first, then `m1`. Ancestor-then-own composition order. */
function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMatrix(m: Matrix, p: Vec2): Vec2 {
  const [a, b, c, d, e, f] = m;
  return [a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f];
}

/* ------------------------------------------------------------------ */
/* Numbers, lengths, point lists                                       */
/* ------------------------------------------------------------------ */

const NUMBER_SOURCE = String.raw`[-+]?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][-+]?\d+)?`;
const NUMBER_RE_ANCHORED_START = new RegExp(`^${NUMBER_SOURCE}`);
const NUMBER_RE_FULL = new RegExp(`^${NUMBER_SOURCE}$`);
const NUMBER_RE_GLOBAL = new RegExp(NUMBER_SOURCE, "g");
const PX_SUFFIXED_RE = new RegExp(`^(${NUMBER_SOURCE})px$`);

/** Bare number or a `px`-suffixed one; anything else (percentages, mm/cm/in/pt) is `undefined`. */
function tryParseLength(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (NUMBER_RE_FULL.test(trimmed)) return Number.parseFloat(trimmed);
  const px = PX_SUFFIXED_RE.exec(trimmed);
  return px ? Number.parseFloat(px[1]) : undefined;
}

function parseLength(raw: string, context: string): number {
  const value = tryParseLength(raw);
  if (value === undefined) {
    throw new Error(
      `Unsupported length "${raw}" in ${context}: only bare numbers (and an ` +
        `optional trailing "px", treated as 1 user unit) are supported. ` +
        `Percentages and physical units (mm, cm, in, pt) on individual ` +
        `coordinates are not — export the drawing in plain user-unit coordinates.`,
    );
  }
  return value;
}

function readAttrNumber(
  attrs: Record<string, string>,
  name: string,
  fallback: number,
  context: string,
): number {
  const raw = attrs[name];
  if (raw === undefined) return fallback;
  return parseLength(raw, `${context} "${name}"`);
}

/** Whitespace/comma-separated coordinate pairs, e.g. a `points` attribute. */
function parsePointList(raw: string, context: string): Vec2[] {
  const nums = raw.match(NUMBER_RE_GLOBAL);
  if (!nums || nums.length === 0) {
    throw new Error(`Malformed "points" attribute in ${context}: no numbers found.`);
  }
  if (nums.length % 2 !== 0) {
    throw new Error(
      `Malformed "points" attribute in ${context}: odd number of coordinate values.`,
    );
  }
  const points: Vec2[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    points.push([Number.parseFloat(nums[i]), Number.parseFloat(nums[i + 1])]);
  }
  return points;
}

function parseViewBox(raw: string): { minX: number; minY: number; width: number; height: number } {
  const nums = (raw.match(NUMBER_RE_GLOBAL) ?? []).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    throw new Error(
      `Malformed "viewBox" attribute: "${raw}" (expected 4 numbers: min-x min-y width height).`,
    );
  }
  return { minX: nums[0], minY: nums[1], width: nums[2], height: nums[3] };
}

/* ------------------------------------------------------------------ */
/* transform="..." parsing                                            */
/* ------------------------------------------------------------------ */

const TRANSFORM_LIST_RE = /^(\s*[A-Za-z]+\s*\([^)]*\)\s*,?\s*)+$/;
const TRANSFORM_FUNC_RE = /([A-Za-z]+)\s*\(([^)]*)\)/g;

function transformFunctionToMatrix(name: string, args: number[], raw: string): Matrix {
  switch (name) {
    case "translate": {
      const [tx = 0, ty = 0] = args;
      return [1, 0, 0, 1, tx, ty];
    }
    case "scale": {
      const [sx, sy] = args;
      if (sx === undefined) {
        throw new Error(`transform "${raw}": scale() needs at least one argument.`);
      }
      return [sx, 0, 0, sy ?? sx, 0, 0];
    }
    case "rotate": {
      const [deg, cx, cy] = args;
      if (deg === undefined) {
        throw new Error(`transform "${raw}": rotate() needs an angle.`);
      }
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (cx !== undefined && cy !== undefined) {
        // rotate about (cx,cy) = translate(cx,cy) ∘ rotate ∘ translate(-cx,-cy).
        return multiplyMatrix(multiplyMatrix([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
      }
      return rot;
    }
    case "matrix": {
      if (args.length !== 6) {
        throw new Error(`transform "${raw}": matrix() needs exactly 6 arguments.`);
      }
      const [a, b, c, d, e, f] = args;
      return [a, b, c, d, e, f];
    }
    case "skewX": {
      const [deg] = args;
      if (deg === undefined) throw new Error(`transform "${raw}": skewX() needs an angle.`);
      return [1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0];
    }
    case "skewY": {
      const [deg] = args;
      if (deg === undefined) throw new Error(`transform "${raw}": skewY() needs an angle.`);
      return [1, Math.tan((deg * Math.PI) / 180), 0, 1, 0, 0];
    }
    default:
      throw new Error(
        `transform "${raw}": unsupported transform function "${name}()". ` +
          `Supported: translate, scale, rotate, matrix, skewX, skewY.`,
      );
  }
}

function parseTransform(raw: string): Matrix {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return IDENTITY_MATRIX;
  if (!TRANSFORM_LIST_RE.test(trimmed)) {
    throw new Error(`Malformed "transform" attribute: "${raw}"`);
  }
  let result = IDENTITY_MATRIX;
  TRANSFORM_FUNC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TRANSFORM_FUNC_RE.exec(trimmed)) !== null) {
    const args = (match[2].match(NUMBER_RE_GLOBAL) ?? []).map(Number);
    result = multiplyMatrix(result, transformFunctionToMatrix(match[1], args, raw));
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Curve flattening (local, untransformed space)                       */
/* ------------------------------------------------------------------ */

/** Fixed subdivision count per Bézier — see the file header's "CURVE FLATTENING". */
const BEZIER_FLATTEN_SEGMENTS = 16;
/** Angular resolution for arc flattening: a full circle becomes 32 chords. */
const ARC_ANGLE_STEP_RAD = Math.PI / 16;
const ARC_MIN_SEGMENTS = 4;

/** Points from `t = 1/N .. 1` (excludes the start point, which the caller already has). */
function flattenCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= BEZIER_FLATTEN_SEGMENTS; i += 1) {
    const t = i / BEZIER_FLATTEN_SEGMENTS;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  out[out.length - 1] = p3;
  return out;
}

function flattenQuadratic(p0: Vec2, p1: Vec2, p2: Vec2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= BEZIER_FLATTEN_SEGMENTS; i += 1) {
    const t = i / BEZIER_FLATTEN_SEGMENTS;
    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]);
  }
  out[out.length - 1] = p2;
  return out;
}

/**
 * SVG 1.1 Appendix F.6 endpoint-to-centre arc parameterisation, sampled into
 * straight chords. `from`/`to` and the returned points are all in the same
 * local (untransformed) space; the caller flattens BEFORE transforming (see
 * the file header's "CURVE FLATTENING" for why that is exact for an affine
 * transform stack).
 */
function flattenArc(
  from: Vec2,
  rxIn: number,
  ryIn: number,
  xAxisRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Vec2,
): Vec2[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  if (x1 === x2 && y1 === y2) return []; // zero-length arc: a documented no-op, not a line.
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [to]; // degenerate ellipse: SVG treats this as a straight line.

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const sign = largeArc !== sweep ? 1 : -1;
  const numerator = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const denominator = rxSq * y1pSq + rySq * x1pSq || 1e-12;
  const co = sign * Math.sqrt(numerator / denominator);
  const cxp = co * ((rx * y1p) / ry);
  const cyp = co * ((-ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1e-12;
    let ang = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  };

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(ARC_MIN_SEGMENTS, Math.ceil(Math.abs(dTheta) / ARC_ANGLE_STEP_RAD));
  const out: Vec2[] = [];
  for (let i = 1; i <= segments; i += 1) {
    const theta = theta1 + (dTheta * i) / segments;
    const ex = cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi;
    const ey = cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi;
    out.push([ex, ey]);
  }
  out[out.length - 1] = to; // pin the exact endpoint against float drift.
  return out;
}

/* ------------------------------------------------------------------ */
/* Path data ("d") parsing                                             */
/* ------------------------------------------------------------------ */

interface Subpath {
  points: Vec2[];
  closed: boolean;
}

class PathScanner {
  private i = 0;
  constructor(private readonly s: string) {}

  private skipSeparators(): void {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i += 1;
  }

  hasMore(): boolean {
    this.skipSeparators();
    return this.i < this.s.length;
  }

  /** A command letter, if the next significant character is one — does not consume it. */
  peekCommand(): string | null {
    this.skipSeparators();
    const c = this.s[this.i];
    return c !== undefined && /[A-Za-z]/.test(c) ? c : null;
  }

  consumeCommand(): string {
    this.skipSeparators();
    const c = this.s[this.i];
    this.i += 1;
    return c;
  }

  readNumber(): number {
    this.skipSeparators();
    const m = NUMBER_RE_ANCHORED_START.exec(this.s.slice(this.i));
    if (!m) {
      throw new Error(
        `Expected a number in path data at position ${this.i}: "${this.s.slice(this.i, this.i + 20)}"`,
      );
    }
    this.i += m[0].length;
    return Number.parseFloat(m[0]);
  }

  /** Arc flags are exactly one character, "0" or "1" — never comma/space separated from what follows. */
  readFlag(): boolean {
    this.skipSeparators();
    const c = this.s[this.i];
    if (c !== "0" && c !== "1") {
      throw new Error(`Expected an arc flag ("0" or "1") at position ${this.i} in path data.`);
    }
    this.i += 1;
    return c === "1";
  }
}

const SUPPORTED_PATH_COMMANDS = "M/m L/l H/h V/v C/c Q/q Z/z A/a";

/**
 * Isolated in its own function (rather than checked inline where `current` is
 * read) so narrowing `Subpath | null` to `Subpath` is a plain parameter
 * check, unaffected by TypeScript's control-flow analysis across the
 * enclosing loop/switch and the `startSubpath` closure that mutates
 * `current` from outside this check's textual scope.
 */
function closeCurrentSubpath(current: Subpath | null, context: string): void {
  if (!current) throw new Error(`"Z" with no active subpath in ${context}.`);
  current.closed = true;
}

/**
 * Parse a `d` attribute into one or more subpaths, each a straight-chord
 * polyline in the path's own local (untransformed) space. `S/s`/`T/t`
 * (smooth-curve shorthand) and any other command letter throw rather than
 * being silently skipped — see the file header's "EXPLICITLY UNSUPPORTED".
 */
function parsePathToSubpaths(d: string, context: string): Subpath[] {
  const scanner = new PathScanner(d);
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let cur: Vec2 = [0, 0];
  let subpathStart: Vec2 = [0, 0];
  let cmd: string | null = null;
  /** True once ANY moveto has run — distinguishes draw-before-M (an error) from draw-after-Z (a new subpath). */
  let hasMoved = false;

  const startSubpath = (p: Vec2): Subpath => {
    const next: Subpath = { points: [p], closed: false };
    subpaths.push(next);
    current = next;
    subpathStart = p;
    cur = p;
    hasMoved = true;
    return next;
  };
  const addPoints = (points: Vec2[]): void => {
    // SVG 1.1 §8.3.3: a drawing command straight after a closepath begins a
    // NEW subpath at the initial point of the one just closed — the Z handler
    // nulled `current` and reset `cur` to that point, so continuing here must
    // not append into the closed loop (it would corrupt its closing edge).
    // Before any moveto at all there is nothing to continue: that is an error.
    const target = current ?? (hasMoved ? startSubpath(cur) : null);
    if (!target) {
      throw new Error(`Path data in ${context} has drawing commands before an initial moveto.`);
    }
    for (const p of points) target.points.push(p);
    if (points.length > 0) cur = points[points.length - 1];
  };

  while (scanner.hasMore()) {
    const letter = scanner.peekCommand();
    if (letter) {
      cmd = scanner.consumeCommand();
    } else if (cmd === null) {
      throw new Error(`Path data in ${context} must start with a moveto command (M/m).`);
    }
    switch (cmd) {
      case "M": {
        startSubpath([scanner.readNumber(), scanner.readNumber()]);
        cmd = "L"; // implicit-repeat rule: extra coordinate pairs after M are linetos.
        break;
      }
      case "m": {
        const base = cur;
        startSubpath([base[0] + scanner.readNumber(), base[1] + scanner.readNumber()]);
        cmd = "l";
        break;
      }
      case "L":
        addPoints([[scanner.readNumber(), scanner.readNumber()]]);
        break;
      case "l": {
        const base = cur;
        addPoints([[base[0] + scanner.readNumber(), base[1] + scanner.readNumber()]]);
        break;
      }
      case "H":
        addPoints([[scanner.readNumber(), cur[1]]]);
        break;
      case "h":
        addPoints([[cur[0] + scanner.readNumber(), cur[1]]]);
        break;
      case "V":
        addPoints([[cur[0], scanner.readNumber()]]);
        break;
      case "v":
        addPoints([[cur[0], cur[1] + scanner.readNumber()]]);
        break;
      case "C": {
        const p1: Vec2 = [scanner.readNumber(), scanner.readNumber()];
        const p2: Vec2 = [scanner.readNumber(), scanner.readNumber()];
        const p3: Vec2 = [scanner.readNumber(), scanner.readNumber()];
        addPoints(flattenCubic(cur, p1, p2, p3));
        break;
      }
      case "c": {
        const base = cur;
        const p1: Vec2 = [base[0] + scanner.readNumber(), base[1] + scanner.readNumber()];
        const p2: Vec2 = [base[0] + scanner.readNumber(), base[1] + scanner.readNumber()];
        const p3: Vec2 = [base[0] + scanner.readNumber(), base[1] + scanner.readNumber()];
        addPoints(flattenCubic(cur, p1, p2, p3));
        break;
      }
      case "Q": {
        const p1: Vec2 = [scanner.readNumber(), scanner.readNumber()];
        const p2: Vec2 = [scanner.readNumber(), scanner.readNumber()];
        addPoints(flattenQuadratic(cur, p1, p2));
        break;
      }
      case "q": {
        const base = cur;
        const p1: Vec2 = [base[0] + scanner.readNumber(), base[1] + scanner.readNumber()];
        const p2: Vec2 = [base[0] + scanner.readNumber(), base[1] + scanner.readNumber()];
        addPoints(flattenQuadratic(cur, p1, p2));
        break;
      }
      case "A":
      case "a": {
        const rx = Math.abs(scanner.readNumber());
        const ry = Math.abs(scanner.readNumber());
        const xRot = scanner.readNumber();
        const largeArc = scanner.readFlag();
        const sweep = scanner.readFlag();
        const rawEnd: Vec2 = [scanner.readNumber(), scanner.readNumber()];
        const base = cur;
        const end: Vec2 = cmd === "a" ? [base[0] + rawEnd[0], base[1] + rawEnd[1]] : rawEnd;
        addPoints(flattenArc(cur, rx, ry, xRot, largeArc, sweep, end));
        break;
      }
      case "Z":
      case "z": {
        closeCurrentSubpath(current, context);
        // The closed subpath is finished business: a later draw command opens
        // a NEW subpath at its initial point (§8.3.3), which `addPoints`
        // arranges when it sees `current === null` after a moveto has run.
        current = null;
        cur = subpathStart;
        cmd = null; // Z takes no implicit-repeat arguments — force the next token to be a letter.
        break;
      }
      default:
        throw new Error(
          `Unsupported SVG path command "${cmd}" in ${context}'s "d" attribute. ` +
            `Supported: ${SUPPORTED_PATH_COMMANDS} (S/s and T/t smooth-curve ` +
            `shorthands are not — expand them to C/Q before import).`,
        );
    }
  }

  return subpaths;
}

/* ------------------------------------------------------------------ */
/* A minimal, dependency-free XML walker                               */
/* ------------------------------------------------------------------ */
//
// Deliberately not a general HTML-tolerant parser — SVG is XML, and this
// reads it as XML: well-formed only, no implied close tags, no unquoted
// attributes. Real vector-drawing exports satisfy this; hand-edited HTML5
// "SVG-ish" markup may not, and should be re-saved from an SVG-aware tool
// before import.

interface XmlElement {
  readonly type: "element";
  readonly tag: string;
  readonly attrs: Record<string, string>;
  readonly children: XmlNode[];
}
interface XmlTextNode {
  readonly type: "text";
  readonly value: string;
}
type XmlNode = XmlElement | XmlTextNode;

const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match, ent: string) => {
    if (ent[0] === "#") {
      const isHex = ent[1] === "x" || ent[1] === "X";
      const code = isHex ? Number.parseInt(ent.slice(2), 16) : Number.parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    switch (ent) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return match; // Unknown named entity: leave verbatim rather than guessing.
    }
  });
}

const TAG_NAME_RE = /^[A-Za-z_][\w:.-]*/;
const ATTR_NAME_RE = /^[A-Za-z_][\w:.-]*/;
const WHITESPACE_RE = /\s/;

/** Parses a full SVG/XML document string into its single root element. */
function parseXmlDocument(source: string): XmlElement {
  let i = 0;
  const s = source;
  const len = s.length;

  const skipMisc = (): void => {
    for (;;) {
      while (i < len && WHITESPACE_RE.test(s[i])) i += 1;
      if (s.startsWith("<!--", i)) {
        const end = s.indexOf("-->", i + 4);
        if (end === -1) throw new Error("Unterminated XML comment.");
        i = end + 3;
        continue;
      }
      if (s.startsWith("<?", i)) {
        const end = s.indexOf("?>", i + 2);
        if (end === -1) throw new Error("Unterminated XML processing instruction.");
        i = end + 2;
        continue;
      }
      if (/^<!doctype/i.test(s.slice(i, i + 9))) {
        let depth = 0;
        let j = i;
        while (j < len) {
          if (s[j] === "[") depth += 1;
          else if (s[j] === "]") depth -= 1;
          else if (s[j] === ">" && depth <= 0) break;
          j += 1;
        }
        if (j >= len) throw new Error("Unterminated <!DOCTYPE ...>.");
        i = j + 1;
        continue;
      }
      break;
    }
  };

  const parseElement = (): XmlElement => {
    skipMisc();
    if (s[i] !== "<") {
      throw new Error(`Expected "<" at position ${i}, found "${s.slice(i, i + 20)}".`);
    }
    i += 1;
    const tagMatch = TAG_NAME_RE.exec(s.slice(i));
    if (!tagMatch) throw new Error(`Malformed tag name at position ${i}.`);
    const tag = tagMatch[0];
    i += tag.length;

    const attrs: Record<string, string> = {};
    for (;;) {
      while (i < len && WHITESPACE_RE.test(s[i])) i += 1;
      if (s[i] === "/" && s[i + 1] === ">") {
        i += 2;
        return { type: "element", tag, attrs, children: [] };
      }
      if (s[i] === ">") {
        i += 1;
        break;
      }
      const attrMatch = ATTR_NAME_RE.exec(s.slice(i));
      if (!attrMatch) {
        throw new Error(`Malformed attribute at position ${i} in <${tag}>: "${s.slice(i, i + 20)}"`);
      }
      const name = attrMatch[0];
      i += name.length;
      while (i < len && WHITESPACE_RE.test(s[i])) i += 1;
      if (s[i] !== "=") {
        throw new Error(`Attribute "${name}" in <${tag}> at position ${i} has no value.`);
      }
      i += 1;
      while (i < len && WHITESPACE_RE.test(s[i])) i += 1;
      const quote = s[i];
      if (quote !== '"' && quote !== "'") {
        throw new Error(`Expected a quoted value for attribute "${name}" in <${tag}> at position ${i}.`);
      }
      i += 1;
      const end = s.indexOf(quote, i);
      if (end === -1) {
        throw new Error(`Unterminated value for attribute "${name}" in <${tag}>.`);
      }
      attrs[name] = decodeEntities(s.slice(i, end));
      i = end + 1;
    }

    const children: XmlNode[] = [];
    for (;;) {
      const nextLt = s.indexOf("<", i);
      if (nextLt === -1) throw new Error(`Unterminated element <${tag}>: missing "</${tag}>".`);
      if (nextLt > i) {
        children.push({ type: "text", value: decodeEntities(s.slice(i, nextLt)) });
        i = nextLt;
      }
      if (s.startsWith("<!--", i)) {
        const end = s.indexOf("-->", i + 4);
        if (end === -1) throw new Error("Unterminated XML comment.");
        i = end + 3;
        continue;
      }
      if (s.startsWith("<![CDATA[", i)) {
        const end = s.indexOf("]]>", i + 9);
        if (end === -1) throw new Error("Unterminated CDATA section.");
        children.push({ type: "text", value: s.slice(i + 9, end) });
        i = end + 3;
        continue;
      }
      if (s[i + 1] === "/") {
        const closeMatch = /^<\/([A-Za-z_][\w:.-]*)\s*>/.exec(s.slice(i));
        if (!closeMatch) throw new Error(`Malformed closing tag at position ${i}.`);
        if (closeMatch[1] !== tag) {
          throw new Error(`Mismatched closing tag: expected "</${tag}>", found "</${closeMatch[1]}>".`);
        }
        i += closeMatch[0].length;
        return { type: "element", tag, attrs, children };
      }
      children.push(parseElement());
    }
  };

  skipMisc();
  if (i >= len) throw new Error("Empty or whitespace-only SVG document.");
  const root = parseElement();
  skipMisc();
  if (i < len) {
    throw new Error(`Unexpected content after the root element, at position ${i}.`);
  }
  return root;
}

/* ------------------------------------------------------------------ */
/* Walking the parsed tree into segments + labels                      */
/* ------------------------------------------------------------------ */

/**
 * Non-rendering containers/definitions. Descending into them would pull in
 * geometry that is never actually drawn unless referenced via `<use>`, which
 * this importer does not resolve (a documented limitation, not a silent one:
 * see the file header's "EXPLICITLY UNSUPPORTED").
 */
const NON_RENDERING_CONTAINER_TAGS = new Set([
  "defs",
  "symbol",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "use",
  "style",
  "title",
  "desc",
  "metadata",
]);

/**
 * Recognised-but-unsupported drawable shapes, listed explicitly (rather than
 * silently falling into the generic container recursion, which would just
 * find no matching children and produce nothing) so the omission is visibly
 * a scope decision — see the file header's "EXPLICITLY UNSUPPORTED".
 */
const UNSUPPORTED_SHAPE_TAGS = new Set(["circle", "ellipse", "image"]);

function toPointMm(p: Vec2, svgUnitsToMm: number): PointMm {
  return { xMm: Math.round(p[0] * svgUnitsToMm), zMm: Math.round(p[1] * svgUnitsToMm) };
}

function pushOpenChain(
  localPoints: Vec2[],
  matrix: Matrix,
  layer: string | undefined,
  svgUnitsToMm: number,
  out: SegmentInputMm[],
): void {
  const pts = localPoints.map((p) => toPointMm(applyMatrix(matrix, p), svgUnitsToMm));
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.xMm === b.xMm && a.zMm === b.zMm) continue; // drop a degenerate zero-length edge.
    out.push({ startMm: a, endMm: b, ...(layer ? { layer } : {}) });
  }
}

function pushClosedLoop(
  localPoints: Vec2[],
  matrix: Matrix,
  layer: string | undefined,
  svgUnitsToMm: number,
  out: SegmentInputMm[],
): void {
  const pts = localPoints.map((p) => toPointMm(applyMatrix(matrix, p), svgUnitsToMm));
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.xMm === b.xMm && a.zMm === b.zMm) continue;
    out.push({ startMm: a, endMm: b, ...(layer ? { layer } : {}) });
  }
}

/** Concatenate every descendant text node's raw content, in document order. */
function collectTextRaw(node: XmlElement): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else out += collectTextRaw(child);
  }
  return out;
}

function walk(
  node: XmlElement,
  parentMatrix: Matrix,
  parentLayer: string | undefined,
  svgUnitsToMm: number,
  segments: SegmentInputMm[],
  labels: LabelInputMm[],
): void {
  const tag = node.tag;
  if (NON_RENDERING_CONTAINER_TAGS.has(tag)) return;
  if (UNSUPPORTED_SHAPE_TAGS.has(tag)) return;

  const attrs = node.attrs;
  const localMatrix = attrs.transform !== undefined ? parseTransform(attrs.transform) : IDENTITY_MATRIX;
  const matrix = multiplyMatrix(parentMatrix, localMatrix);
  const layer = attrs["data-layer"] ?? attrs.id ?? parentLayer;
  const context = `<${tag}>`;

  switch (tag) {
    case "line": {
      const x1 = readAttrNumber(attrs, "x1", 0, context);
      const y1 = readAttrNumber(attrs, "y1", 0, context);
      const x2 = readAttrNumber(attrs, "x2", 0, context);
      const y2 = readAttrNumber(attrs, "y2", 0, context);
      pushOpenChain(
        [
          [x1, y1],
          [x2, y2],
        ],
        matrix,
        layer,
        svgUnitsToMm,
        segments,
      );
      return;
    }
    case "polyline": {
      if (attrs.points === undefined) return;
      pushOpenChain(parsePointList(attrs.points, context), matrix, layer, svgUnitsToMm, segments);
      return;
    }
    case "polygon": {
      if (attrs.points === undefined) return;
      pushClosedLoop(parsePointList(attrs.points, context), matrix, layer, svgUnitsToMm, segments);
      return;
    }
    case "rect": {
      const x = readAttrNumber(attrs, "x", 0, context);
      const y = readAttrNumber(attrs, "y", 0, context);
      const width = readAttrNumber(attrs, "width", Number.NaN, context);
      const height = readAttrNumber(attrs, "height", Number.NaN, context);
      // A non-positive or absent width/height renders nothing in SVG itself —
      // this is not a data error, so it is skipped rather than thrown.
      // `rx`/`ry` (rounded corners) are ignored: rendered as a sharp rect.
      if (!(width > 0) || !(height > 0)) return;
      pushClosedLoop(
        [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ],
        matrix,
        layer,
        svgUnitsToMm,
        segments,
      );
      return;
    }
    case "path": {
      if (attrs.d === undefined) return;
      for (const sub of parsePathToSubpaths(attrs.d, context)) {
        if (sub.points.length < 2) continue;
        if (sub.closed) pushClosedLoop(sub.points, matrix, layer, svgUnitsToMm, segments);
        else pushOpenChain(sub.points, matrix, layer, svgUnitsToMm, segments);
      }
      return;
    }
    case "text": {
      const x = readAttrNumber(attrs, "x", 0, context) + readAttrNumber(attrs, "dx", 0, context);
      const y = readAttrNumber(attrs, "y", 0, context) + readAttrNumber(attrs, "dy", 0, context);
      const content = collectTextRaw(node).replace(/\s+/g, " ").trim();
      if (content.length === 0) return; // no children walked further: tspans are consumed above.
      const positionMm = toPointMm(applyMatrix(matrix, [x, y]), svgUnitsToMm);
      const heightUnits = tryParseLength(attrs["font-size"]);
      labels.push({
        text: content,
        positionMm,
        ...(heightUnits !== undefined ? { heightMm: Math.round(heightUnits * svgUnitsToMm) } : {}),
      });
      return; // deliberately not recursing: tspans were already folded into `content` above.
    }
    default: {
      // <svg>, <g>, and any other container/unrecognised element: recurse.
      for (const child of node.children) {
        if (child.type === "element") walk(child, matrix, layer, svgUnitsToMm, segments, labels);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract every drawn edge + text label from an SVG document, in
 * millimetres. Mirrors `cadDocumentToSegments`'s role for `from-cad.ts`.
 *
 * `svgUnitsToMm` — see the file header's "UNITS IN": 1 SVG user unit ×
 * `svgUnitsToMm` = 1 millimetre. Defaults to 1 (i.e. "assume the file was
 * already authored in millimetres") — this is an assumption of last resort,
 * not a safe default; pass the real calibration whenever it is known.
 */
export function svgToSegments(
  svg: string,
  svgUnitsToMm = 1,
): { segments: SegmentInputMm[]; labels: LabelInputMm[] } {
  if (typeof svg !== "string" || svg.trim().length === 0) {
    throw new Error("svgToSegments/fromSvgString received an empty SVG document.");
  }
  if (!(svgUnitsToMm > 0)) {
    throw new Error(`svgUnitsToMm must be a positive number, got ${svgUnitsToMm}.`);
  }

  const root = parseXmlDocument(svg);
  if (root.tag !== "svg") {
    throw new Error(`Expected an <svg> root element, found <${root.tag}>.`);
  }
  // Validated for well-formedness, then deliberately NOT applied as a
  // transform — see the file header's "VIEWBOX VS WIDTH/HEIGHT".
  if (root.attrs.viewBox !== undefined) parseViewBox(root.attrs.viewBox);

  const segments: SegmentInputMm[] = [];
  const labels: LabelInputMm[] = [];
  const rootLayer = root.attrs["data-layer"] ?? root.attrs.id;
  for (const child of root.children) {
    if (child.type === "element") {
      walk(child, IDENTITY_MATRIX, rootLayer, svgUnitsToMm, segments, labels);
    }
  }
  return { segments, labels };
}

/**
 * Direct SVG → BlueprintSpec conversion, no reasoning provider involved.
 * Reuses `interpretSegmentsToBlueprint`'s loop detection; `layerMapping`
 * only narrows classification confidence upward, it never invents a loop
 * that geometry does not contain. Mirrors `fromCadDocument`.
 */
export function fromSvgString(
  svg: string,
  layerMapping: SvgLayerMapping = {},
  options: InterpretSegmentsOptions & { svgUnitsToMm?: number } = {},
): BlueprintSpec {
  const { svgUnitsToMm = 1, ...interpretOptions } = options;
  const { segments, labels } = svgToSegments(svg, svgUnitsToMm);
  return interpretSegmentsToBlueprint(segments, labels, {
    ...interpretOptions,
    source: interpretOptions.source ?? "svg",
    layerRoles: {
      boundary: layerMapping.boundary,
      core: layerMapping.core,
      zoneProgramByLayer: layerMapping.zone,
    },
  });
}
