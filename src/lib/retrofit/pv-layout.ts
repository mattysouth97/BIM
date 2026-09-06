// src/lib/retrofit/pv-layout.ts
//
// Stages 2 and 3 of the PV placement methodology
// (docs/04_Agent-Handoffs/2026-09-06-pv-roof-placement-methodology.md):
// usable area per measured roof plane, and the modules that fit on it.
//
// Pure: no THREE, no React, no fetch. Input is the `roof-planes.json` shape
// stage 1 emits; output is module poses, per-plane metrics and building
// totals. Everything downstream — the two viewers, the legend, and the
// economics — reads THIS, so the picture, the count and the kWp agree by
// construction. That is the whole point: today the economics prices a kWp
// derived from an area ratio while a grid draws whatever fits a bounding
// box, and the two never meet.
//
// Geometry conventions, chosen to match what the app already does:
//   - Plan coordinates are metres in the model's XZ frame, `[x, z]`, the
//     same frame `ring-utils.ts` works in. `insetRing` (miter-limited) and
//     `pointInRing` are reused rather than reimplemented.
//   - A ring is counter-clockwise for an outer boundary, clockwise for a
//     hole, in the right-handed XZ sense used by the manifest outlines.
//   - Azimuth is the bearing of the DOWNSLOPE direction in degrees clockwise
//     from the model's project north. A flat plane has none.

import { insetRing, pointInRing } from "@/lib/gis/ring-utils";

// ── Module and rack constants ─────────────────────────────────────────────

/**
 * One module: 1.70 × 1.00 m at 0.40 kWp.
 *
 * Stands for the mainstream 60-cell / 120-half-cell mono-PERC class that
 * Korean rooftop work is quoted in (~1.70 × 1.00 m, 390-410 Wp). It is an
 * assumption about a product, not a measurement of one, and it is the ONLY
 * place a module dimension or rating is written down.
 */
export const PV_MODULE_LENGTH_M = 1.7;
export const PV_MODULE_WIDTH_M = 1.0;
export const PV_PANEL_RATED_KWP = 0.4;

/** Gap between modules within a row, and between rows, on a flush pitch. */
export const PV_MODULE_GAP_M = 0.02;
export const PV_ROW_GAP_M = 0.1;

/** Fixed-rack tilt on a flat roof — Korean fixed-tilt convention. */
export const PV_FIXED_RACK_TILT_DEG = 30;

/**
 * Edge setback, metres. `A-PV-SETBACK`.
 *
 * 1.0 m on a flat roof for parapet access and the wind-uplift edge zone;
 * 0.3 m on a pitched plane from eaves, ridge and verges. **Both are
 * assumptions** — they are the numbers this kind of layout is normally drawn
 * to, not a figure read from a Korean standard, and they stay assumptions
 * until someone cites one.
 */
export const PV_SETBACK_FLAT_M = 1.0;
export const PV_SETBACK_PITCHED_M = 0.3;

/** Working clearance grown around every obstruction. `A-PV-CLEARANCE`. */
export const PV_OBSTRUCTION_CLEARANCE_M = 0.5;

/** Below this a plane is treated as flat and racked; above it, flush. */
export const PV_FLAT_TILT_MAX_DEG = 10;
/** Above this a plane is a wall in all but name. */
export const PV_TILT_MAX_DEG = 60;

/**
 * Solar declination at the winter solstice, degrees. The row-pitch rule below
 * is the standard no-shading-at-solar-noon-on-the-solstice construction.
 */
export const WINTER_SOLSTICE_DECLINATION_DEG = 23.45;

/**
 * Latitude the row pitch is computed at: Seoul, 37.57° N.
 *
 * Every published building is priced under the Seoul climate assumption
 * (`A-CLIMATE`) — the Clinic's site is a Revit default, the apartment's real
 * Nijmegen location has no Korean 시도 row, and the grade is a Korean one.
 * Using the buildings' true latitudes here while the energy engine runs them
 * in Seoul would put two different suns in one answer. When a building gets
 * a real climate, this comes from that climate, not from here.
 */
export const PV_LAYOUT_LATITUDE_DEG = 37.57;

// ── The stage-1 contract ──────────────────────────────────────────────────

export type PlanRing = readonly (readonly [number, number])[];

/** A polygon in plan: one outer ring and any number of holes. */
export interface PlanPolygon {
  outer: PlanRing;
  holes?: readonly PlanRing[];
}

/** A ring that says which it is, as `roof-planes.json` writes them. */
export interface TaggedRing {
  kind: "outer" | "hole";
  points: PlanRing;
}

export type ObstructionKind = "opening" | "plant" | "parapet";

export interface RoofObstruction {
  kind: ObstructionKind;
  /** The element it came from, so a subtraction can be traced to a thing. */
  elementName: string;
  /**
   * The obstruction's plan polygon. `roof-planes.json` names this field
   * `plan`; `outline` is accepted as an alias because the methodology doc
   * called it that and a reader may well write it that way. Same tolerance,
   * and the same reason, as `toPolygon` accepting two outline shapes: the
   * artifact on disk is the contract, and a producer using the documented
   * name should not silently subtract nothing.
   */
  plan?: PlanRing;
  outline?: PlanRing;
}

/** The obstruction's polygon under whichever of the two names it arrived by. */
export function obstructionPlan(o: RoofObstruction): PlanRing {
  return o.plan ?? o.outline ?? [];
}

/** One measured roof plane, as `roof-planes.json` states it. */
export interface RoofPlane {
  id: string;
  elementName: string;
  elementType: string;
  /** Unit normal, [x, y, z] with y up. */
  normal: readonly [number, number, number];
  tiltDeg: number;
  /** Bearing of the downslope direction from project north; null when flat. */
  azimuthDeg: number | null;
  surfaceSqm: number;
  projectedSqm: number;
  minElevationM: number;
  maxElevationM: number;
  /**
   * Plan outline as CLOSED rings, outer first then holes — the shape both
   * producers emit (`roof-planes.json` from the IFC walk, `twinRoofPlanes`
   * from the storey plates), so a measured plane and a twin plane come
   * through one door.
   */
  outline: readonly (PlanRing | TaggedRing)[];
  obstructions?: readonly RoofObstruction[];
  /**
   * Twin planes only: the plate is not contained in the one below, so the
   * AREA is trustworthy and the ring-and-hole SHAPE is not. Excluded with a
   * named reason rather than laid out on an inferred boundary — placing
   * modules against a boundary we do not believe is the bounding-box bug
   * with better provenance.
   */
  partialOverlap?: boolean;
}

export interface RoofPlaneSet {
  kind: "bimfit_reference_building_roof_planes";
  buildingId: string;
  /** True when project north was used because the model states no true north. */
  northAssumed: boolean;
  planes: readonly RoofPlane[];
}

// ── Results ───────────────────────────────────────────────────────────────

export type PlaneExclusionReason =
  | "tilt-above-60"
  | "smaller-than-one-module"
  | "north-facing-pitch"
  | "no-usable-area-after-setback"
  | "outline-shape-not-trustworthy";

export interface PlaneSubtraction {
  kind: ObstructionKind | "setback";
  elementName: string;
  areaSqm: number;
}

/** A module, placed. */
export interface PvModuleInstance {
  planeId: string;
  /** Centre in model coordinates, [x, y, z], y up. */
  centre: readonly [number, number, number];
  /** Pose as a unit quaternion [x, y, z, w] taking +Y to the module normal. */
  quaternion: readonly [number, number, number, number];
  /** The module's own tilt and bearing, which on a rack are the rack's. */
  tiltDeg: number;
  azimuthDeg: number;
}

export interface PlaneLayout {
  planeId: string;
  elementName: string;
  tiltDeg: number;
  azimuthDeg: number | null;
  mounting: "flush" | "racked" | "none";
  grossProjectedSqm: number;
  usableSqm: number;
  usableRatio: number;
  subtractions: PlaneSubtraction[];
  moduleCount: number;
  moduleAreaSqm: number;
  kWp: number;
  /** Present when nothing was placed BY DECISION rather than by fit. */
  excludedReason: PlaneExclusionReason | null;
  modules: PvModuleInstance[];
}

export interface PvLayoutResult {
  planes: PlaneLayout[];
  totalModules: number;
  totalKWp: number;
  totalGrossProjectedSqm: number;
  totalUsableSqm: number;
  excludedPlanes: number;
  /** Row pitch used on flat planes, and the latitude it came from. */
  rackRowPitchM: number;
  latitudeDeg: number;
  northAssumed: boolean;
}

// ── Ring helpers ──────────────────────────────────────────────────────────

const MODULE_AREA_SQM = PV_MODULE_LENGTH_M * PV_MODULE_WIDTH_M;

/**
 * Normalise an outline to one outer ring and its holes.
 *
 * Two shapes arrive here and BOTH are real. `roof-planes.json` as bim-83
 * landed it tags each ring — `[{ kind: "outer" | "hole", points }]` — while
 * the twin's `twinRoofPlanes` emits bare rings with the outer first. The
 * tagged form is the one on disk, so it is authoritative; the bare form is
 * accepted because rejecting it would make the twin a second door into a
 * library whose whole point is that there is one.
 *
 * A bare-ring outline takes ring 0 as the outer. A tagged outline reads the
 * tags and does NOT rely on order, because a producer that emits a hole first
 * would otherwise silently invert the roof.
 */
export function toPolygon(outline: readonly (PlanRing | TaggedRing)[]): PlanPolygon {
  const tagged = outline.filter((r): r is TaggedRing => !Array.isArray(r));
  if (tagged.length > 0) {
    const outer = tagged.find((r) => r.kind === "outer");
    return {
      outer: outer?.points ?? [],
      holes: tagged.filter((r) => r.kind === "hole").map((r) => r.points),
    };
  }
  const rings = outline as readonly PlanRing[];
  return { outer: rings[0] ?? [], holes: rings.slice(1) };
}

function toMutableRing(ring: PlanRing): [number, number][] {
  return ring.map(([x, z]) => [x, z] as [number, number]);
}

/** Absolute shoelace area of a ring, m². */
export function ringAreaSqm(ring: PlanRing): number {
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    twice += x1 * z2 - x2 * z1;
  }
  return Math.abs(twice) / 2;
}

/** Outer ring less its holes. */
export function polygonAreaSqm(polygon: PlanPolygon): number {
  const holes = polygon.holes ?? [];
  return Math.max(
    0,
    ringAreaSqm(polygon.outer) - holes.reduce((sum, h) => sum + ringAreaSqm(h), 0),
  );
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(x: number, z: number, polygon: PlanPolygon): boolean {
  if (!pointInRing(x, z, toMutableRing(polygon.outer))) return false;
  for (const hole of polygon.holes ?? []) {
    if (pointInRing(x, z, toMutableRing(hole))) return false;
  }
  return true;
}

/**
 * Grow a ring outward by `distance` — `insetRing` with the sign flipped.
 * Used on obstructions, where the clearance is a margin AROUND the thing.
 */
export function outsetRing(ring: PlanRing, distance: number): [number, number][] {
  return insetRing(toMutableRing(ring), -distance);
}

/**
 * Does the axis-aligned-in-(u,v) module rectangle, given as its four plan
 * corners, sit wholly inside `region` and clear of every `blocked` polygon?
 *
 * Corner containment alone is not enough for a concave region — a rectangle
 * can have all four corners inside a C-shape while spanning its mouth — so
 * the edges are sampled too. `EDGE_SAMPLES` at 1.7 m gives a sample every
 * ~14 cm, well under the smallest feature a 10 mm-simplified roof outline
 * carries, and the setback has already pulled the region 0.3-1.0 m off every
 * real edge.
 */
const EDGE_SAMPLES = 12;

export function rectangleFits(
  corners: readonly (readonly [number, number])[],
  region: PlanPolygon,
  blocked: readonly PlanRing[],
): boolean {
  const probes: [number, number][] = [];
  for (let i = 0; i < corners.length; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % corners.length];
    for (let s = 0; s < EDGE_SAMPLES; s++) {
      const t = s / EDGE_SAMPLES;
      probes.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  // Centre too: a rectangle enclosing a hole entirely would otherwise pass.
  const cx = corners.reduce((s, c) => s + c[0], 0) / corners.length;
  const cz = corners.reduce((s, c) => s + c[1], 0) / corners.length;
  probes.push([cx, cz]);

  for (const [x, z] of probes) {
    if (!pointInPolygon(x, z, region)) return false;
    for (const ring of blocked) {
      if (pointInRing(x, z, toMutableRing(ring))) return false;
    }
  }
  return true;
}

// ── Stage 2: suitability and usable area ──────────────────────────────────

/**
 * Why this plane carries no modules, or null when it may.
 *
 * Every exclusion is NAMED and returned so the legend can render it. A plane
 * that silently vanishes from a utilisation table is the bounding-box bug in
 * another form: the reader cannot tell "no roof there" from "we dropped it".
 */
export function planeExclusion(plane: RoofPlane): PlaneExclusionReason | null {
  if (plane.partialOverlap) return "outline-shape-not-trustworthy";
  if (plane.tiltDeg > PV_TILT_MAX_DEG) return "tilt-above-60";
  if (plane.projectedSqm < MODULE_AREA_SQM) return "smaller-than-one-module";
  if (plane.tiltDeg >= PV_FLAT_TILT_MAX_DEG && plane.azimuthDeg != null) {
    // Northern hemisphere: a pitch facing within ±45° of north is not a PV
    // surface at any economics. The Seoul latitude above is why "north" is
    // the wrong way and not merely the worse way.
    const fromNorth = Math.abs(((plane.azimuthDeg + 180) % 360) - 180);
    if (fromNorth <= 45) return "north-facing-pitch";
  }
  return null;
}

export interface UsableArea {
  region: PlanPolygon;
  blocked: PlanRing[];
  usableSqm: number;
  subtractions: PlaneSubtraction[];
}

/**
 * Setback the outline, grow the obstructions, and report where the roof went.
 *
 * The usable region is the inset outline; obstructions are kept as a separate
 * `blocked` list rather than booleaned out of it. That is deliberate: a
 * polygon-boolean is the one primitive this codebase does not already have,
 * and placement only ever asks "is this rectangle inside the region and clear
 * of the obstructions", which needs no boolean at all. `usableSqm` subtracts
 * each grown obstruction's own area, which is exact while obstructions lie
 * inside the inset outline and do not overlap each other — true of skylights
 * and roof plant — and OVER-subtracts if one straddles the setback edge.
 * Over-subtracting understates the usable roof, which is the safe direction
 * and is the direction stated here rather than discovered later.
 */
export function usableAreaFor(plane: RoofPlane): UsableArea {
  const setback =
    plane.tiltDeg < PV_FLAT_TILT_MAX_DEG ? PV_SETBACK_FLAT_M : PV_SETBACK_PITCHED_M;

  const polygon = toPolygon(plane.outline);
  const grossSqm = polygonAreaSqm(polygon);
  const insetOuter = insetRing(toMutableRing(polygon.outer), setback);
  // A hole is a void in the roof, so its edge needs the same setback — grown,
  // not inset, because the usable side is outside it.
  const insetHoles = (polygon.holes ?? []).map((h) => outsetRing(h, setback));
  const region: PlanPolygon = { outer: insetOuter, holes: insetHoles };

  const subtractions: PlaneSubtraction[] = [];
  const insetSqm = polygonAreaSqm(region);
  if (grossSqm - insetSqm > 1e-9) {
    subtractions.push({
      kind: "setback",
      elementName: `${setback.toFixed(1)} m edge setback (A-PV-SETBACK)`,
      areaSqm: grossSqm - insetSqm,
    });
  }

  const blocked: PlanRing[] = [];
  let obstructionSqm = 0;
  for (const obstruction of plane.obstructions ?? []) {
    const ring = obstructionPlan(obstruction);
    if (ring.length < 3) continue;
    const grown = outsetRing(ring, PV_OBSTRUCTION_CLEARANCE_M);
    blocked.push(grown);
    const area = ringAreaSqm(grown);
    obstructionSqm += area;
    subtractions.push({
      kind: obstruction.kind,
      elementName: obstruction.elementName,
      areaSqm: area,
    });
  }

  return {
    region,
    blocked,
    usableSqm: Math.max(0, insetSqm - obstructionSqm),
    subtractions,
  };
}

// ── Stage 3: layout ───────────────────────────────────────────────────────

/**
 * Row pitch that keeps a rack out of its neighbour's shadow at solar noon on
 * the winter solstice — the worst case of the year.
 *
 *   pitch = L·cos β + L·sin β / tan α,   α = 90° − φ − 23.45°
 *
 * At Seoul's 37.57° that is α ≈ 28.98° and, for a 1.0 m module at 30°,
 * a pitch of ≈ 1.769 m — 0.866 m of foreshortened module plus 0.902 m of
 * shadow. Exported so a test can assert the placed rows against the rule
 * rather than against a number somebody typed, which is how the 1.43 m this
 * comment first claimed would have survived.
 */
export function rackRowPitchM(
  latitudeDeg: number = PV_LAYOUT_LATITUDE_DEG,
  tiltDeg: number = PV_FIXED_RACK_TILT_DEG,
  moduleSlopeLengthM: number = PV_MODULE_WIDTH_M,
): number {
  const alphaDeg = 90 - latitudeDeg - WINTER_SOLSTICE_DECLINATION_DEG;
  const alpha = (alphaDeg * Math.PI) / 180;
  const beta = (tiltDeg * Math.PI) / 180;
  if (alpha <= 0) return Infinity; // sun never clears the horizon at noon
  return (
    moduleSlopeLengthM * Math.cos(beta) +
    (moduleSlopeLengthM * Math.sin(beta)) / Math.tan(alpha)
  );
}

function bboxOf(ring: PlanRing): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Quaternion [x,y,z,w] rotating +Y onto `n`. */
function quaternionFromUp(n: readonly [number, number, number]): [number, number, number, number] {
  const [nx, ny, nz] = n;
  const len = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / len, uy = ny / len, uz = nz / len;
  // axis = up × n, angle = acos(up · n), with up = (0,1,0).
  const ax = uz, ay = 0, az = -ux;
  const s = Math.hypot(ax, ay, az);
  if (s < 1e-12) {
    return uy >= 0 ? [0, 0, 0, 1] : [1, 0, 0, 0]; // aligned or inverted
  }
  const angle = Math.acos(Math.min(1, Math.max(-1, uy)));
  const half = angle / 2;
  const sinHalf = Math.sin(half);
  return [(ax / s) * sinHalf, (ay / s) * sinHalf, (az / s) * sinHalf, Math.cos(half)];
}

/** Elevation of the plane at a plan point, from its normal and a known point. */
function elevationAt(plane: RoofPlane, x: number, z: number, ref: readonly [number, number]): number {
  const [nx, ny, nz] = plane.normal;
  if (Math.abs(ny) < 1e-9) return plane.minElevationM;
  // Plane through (ref, maxElevation) — the up-slope reference — so the
  // surface passes through the measured extremes rather than floating.
  const y0 = plane.maxElevationM;
  return y0 - (nx * (x - ref[0]) + nz * (z - ref[1])) / ny;
}

/**
 * Lay modules on one plane.
 *
 * Both mountings walk a grid in a 2D frame and place a module only when its
 * WHOLE rectangle is inside the usable region and clear of every obstruction
 * — never a count handed down from an area ratio. If nothing fits, the plane
 * reports zero and says so, which is a real answer about a real roof.
 */
export function layoutPlane(plane: RoofPlane, latitudeDeg = PV_LAYOUT_LATITUDE_DEG): PlaneLayout {
  const grossProjectedSqm = polygonAreaSqm(toPolygon(plane.outline));
  const excluded = planeExclusion(plane);

  const base = {
    planeId: plane.id,
    elementName: plane.elementName,
    tiltDeg: plane.tiltDeg,
    azimuthDeg: plane.azimuthDeg,
    grossProjectedSqm,
  };

  if (excluded) {
    return {
      ...base,
      mounting: "none",
      usableSqm: 0,
      usableRatio: 0,
      subtractions: [],
      moduleCount: 0,
      moduleAreaSqm: 0,
      kWp: 0,
      excludedReason: excluded,
      modules: [],
    };
  }

  const usable = usableAreaFor(plane);
  const flat = plane.tiltDeg < PV_FLAT_TILT_MAX_DEG;
  const modules = flat
    ? layoutFlat(plane, usable, latitudeDeg)
    : layoutPitched(plane, usable);

  return {
    ...base,
    mounting: flat ? "racked" : "flush",
    usableSqm: usable.usableSqm,
    usableRatio: grossProjectedSqm > 0 ? usable.usableSqm / grossProjectedSqm : 0,
    subtractions: usable.subtractions,
    moduleCount: modules.length,
    moduleAreaSqm: modules.length * MODULE_AREA_SQM,
    kWp: modules.length * PV_PANEL_RATED_KWP,
    excludedReason: modules.length === 0 ? "no-usable-area-after-setback" : null,
    modules,
  };
}

/**
 * Flush modules on a pitch, portrait, in the plane's own (u,v) frame.
 *
 * `u` runs along the strike (horizontal, across the slope) and `v` up the
 * slope. A module is 1.0 m along `u` and 1.7 m along `v`, so its PLAN
 * footprint is 1.0 × 1.7·cos(tilt) — the slope length foreshortens, which is
 * exactly why a plan-space grid at the module's slope dimensions would put
 * modules over the eaves.
 */
function layoutPitched(plane: RoofPlane, usable: UsableArea): PvModuleInstance[] {
  const azimuth = plane.azimuthDeg ?? 180;
  const tilt = (plane.tiltDeg * Math.PI) / 180;
  const down = (azimuth * Math.PI) / 180;
  // Downslope unit vector in plan (bearing measured clockwise from +Z north).
  const dx = Math.sin(down);
  const dz = Math.cos(down);
  // Strike is perpendicular to it, in plan.
  const sx = dz;
  const sz = -dx;

  const stepU = PV_MODULE_WIDTH_M + PV_MODULE_GAP_M;
  const stepVPlan = PV_MODULE_LENGTH_M * Math.cos(tilt) + PV_ROW_GAP_M;
  const halfU = PV_MODULE_WIDTH_M / 2;
  const halfVPlan = (PV_MODULE_LENGTH_M * Math.cos(tilt)) / 2;

  return gridPlace(plane, usable, { sx, sz, dx, dz, stepU, stepVPlan, halfU, halfVPlan }, plane.tiltDeg, azimuth, plane.normal);
}

/**
 * South-facing racks on a flat plane, landscape, rows running east-west.
 *
 * The rack's own plan footprint is the module's 1.0 m slope length
 * foreshortened by the 30° tilt; the rows are spaced by the solstice rule,
 * which is a much larger number, and that spacing is what makes a flat roof
 * hold so much less than its area suggests.
 */
function layoutFlat(plane: RoofPlane, usable: UsableArea, latitudeDeg: number): PvModuleInstance[] {
  const tiltDeg = PV_FIXED_RACK_TILT_DEG;
  const tilt = (tiltDeg * Math.PI) / 180;
  // Facing south: bearing 180 from project north.
  const azimuth = 180;
  const dx = Math.sin((azimuth * Math.PI) / 180);
  const dz = Math.cos((azimuth * Math.PI) / 180);
  const sx = dz;
  const sz = -dx;

  // Landscape: the 1.70 m edge runs east-west along the row.
  const stepU = PV_MODULE_LENGTH_M + PV_MODULE_GAP_M;
  const stepVPlan = rackRowPitchM(latitudeDeg, tiltDeg, PV_MODULE_WIDTH_M);
  const halfU = PV_MODULE_LENGTH_M / 2;
  const halfVPlan = (PV_MODULE_WIDTH_M * Math.cos(tilt)) / 2;

  const normal: [number, number, number] = [
    dx * Math.sin(tilt),
    Math.cos(tilt),
    dz * Math.sin(tilt),
  ];
  return gridPlace(plane, usable, { sx, sz, dx, dz, stepU, stepVPlan, halfU, halfVPlan }, tiltDeg, azimuth, normal);
}

interface GridFrame {
  sx: number; sz: number;
  dx: number; dz: number;
  stepU: number; stepVPlan: number;
  halfU: number; halfVPlan: number;
}

function gridPlace(
  plane: RoofPlane,
  usable: UsableArea,
  f: GridFrame,
  tiltDeg: number,
  azimuthDeg: number,
  normal: readonly [number, number, number],
): PvModuleInstance[] {
  const ring = usable.region.outer;
  if (ring.length < 3) return [];
  const bb = bboxOf(ring);
  const originX = bb.minX;
  const originZ = bb.minZ;
  const span = Math.hypot(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
  const nU = Math.floor(span / f.stepU) + 2;
  const nV = Math.floor(span / f.stepVPlan) + 2;
  const quaternion = quaternionFromUp(normal);
  const ref: [number, number] = [originX, originZ];

  const out: PvModuleInstance[] = [];
  for (let iv = -nV; iv <= nV; iv++) {
    for (let iu = -nU; iu <= nU; iu++) {
      const cx = originX + f.sx * (iu * f.stepU) + f.dx * (iv * f.stepVPlan);
      const cz = originZ + f.sz * (iu * f.stepU) + f.dz * (iv * f.stepVPlan);
      const corners: [number, number][] = [
        [cx - f.sx * f.halfU - f.dx * f.halfVPlan, cz - f.sz * f.halfU - f.dz * f.halfVPlan],
        [cx + f.sx * f.halfU - f.dx * f.halfVPlan, cz + f.sz * f.halfU - f.dz * f.halfVPlan],
        [cx + f.sx * f.halfU + f.dx * f.halfVPlan, cz + f.sz * f.halfU + f.dz * f.halfVPlan],
        [cx - f.sx * f.halfU + f.dx * f.halfVPlan, cz - f.sz * f.halfU + f.dz * f.halfVPlan],
      ];
      if (!rectangleFits(corners, usable.region, usable.blocked)) continue;
      out.push({
        planeId: plane.id,
        centre: [cx, elevationAt(plane, cx, cz, ref), cz],
        quaternion,
        tiltDeg,
        azimuthDeg,
      });
    }
  }
  return out;
}

// ── Building total ────────────────────────────────────────────────────────

export function layoutRoofPlanes(
  set: RoofPlaneSet,
  latitudeDeg = PV_LAYOUT_LATITUDE_DEG,
): PvLayoutResult {
  const planes = set.planes.map((p) => layoutPlane(p, latitudeDeg));
  return {
    planes,
    totalModules: planes.reduce((s, p) => s + p.moduleCount, 0),
    totalKWp: planes.reduce((s, p) => s + p.moduleCount, 0) * PV_PANEL_RATED_KWP,
    totalGrossProjectedSqm: planes.reduce((s, p) => s + p.grossProjectedSqm, 0),
    totalUsableSqm: planes.reduce((s, p) => s + p.usableSqm, 0),
    excludedPlanes: planes.filter((p) => p.excludedReason != null).length,
    rackRowPitchM: rackRowPitchM(latitudeDeg),
    latitudeDeg,
    northAssumed: set.northAssumed,
  };
}
