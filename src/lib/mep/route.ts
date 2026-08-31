// src/lib/mep/route.ts
//
// Corridor-graph routing + deterministic coordination (rules Z1/Z4/Z5, §15,
// §28). Mains run along the corridor spine, zone branches leave
// perpendicular, terminal runouts drop to devices. Systems sharing an
// elevation band get distinct plan channels AND distinct branch-line
// offsets; where a branch must cross another system's main in the same band
// it dips (a real coordination move, rendered as such); terminal drops that
// would pass through lower bands shift off the occupied lines. Everything is
// deterministic — identical inputs coordinate identically.

import type { MepBuildingContext, MepFloorContext } from "./context";
import { MepGraphBuilder, clearOfColumns, v3 } from "./graph";
import { SPINE_CHANNELS, SPRINKLER_SPACING_M, SPRINKLER_WALL_MIN_M } from "./rules";
import type { MepNode, MepSystem, MepZone, SegmentRole, Vec3 } from "./types";

export interface RiserFloorTap {
  floorNo: number;
  node: MepNode;
}

/**
 * Builds a vertical riser as a chain of nodes at each requested elevation.
 * Returns the per-floor tap nodes and the final (far) end.
 */
export function buildRiser(
  g: MepGraphBuilder,
  system: MepSystem,
  start: MepNode,
  x: number,
  z: number,
  taps: { floorNo: number; y: number }[],
  endY: number | null,
  rules?: string[],
): { taps: RiserFloorTap[]; end: MepNode } {
  const towardY = endY ?? taps[taps.length - 1]?.y ?? 0;
  const ordered = [...taps].sort((a, b) => (start.position.y <= towardY ? a.y - b.y : b.y - a.y));
  let prev = start;
  if (Math.abs(start.position.x - x) + Math.abs(start.position.z - z) > 1e-6) {
    prev = g.chain(
      system,
      prev,
      [v3(x, start.position.y, start.position.z), v3(x, start.position.y, z)],
      { role: "connector", floorNo: start.floorNo, rules },
    );
  }
  const out: RiserFloorTap[] = [];
  for (const tap of ordered) {
    const node = g.addNode(system.id, "junction", v3(x, tap.y, z), tap.floorNo);
    g.addSegment(system, prev, node, { role: "riser", floorNo: tap.floorNo, rules });
    out.push({ floorNo: tap.floorNo, node });
    prev = node;
  }
  let end = prev;
  if (endY !== null && Math.abs(endY - prev.position.y) > 1e-6) {
    end = g.chain(system, prev, [v3(x, endY, z)], { role: "riser", floorNo: null, rules });
  }
  return { taps: out, end };
}

// ---------------------------------------------------------------------------
// Coordination lines: where other trades' runs live on this floor.

const COLUMN_CLEAR = 0.55;
/**
 * Branch BASE lines clear columns by enough that every per-system offset
 * (−0.94 … +0.7) still clears by COLUMN_CLEAR — one shared push preserves
 * the offsets' mutual separation instead of collapsing them onto one line.
 */
const BRANCH_BASE_CLEAR = 1.55;
const LINE_MARGIN = 0.6;
const DIP_HALF = 0.45;

/** Push `x` out of the closed interval [min−margin, max+margin]. */
export function clearOfInterval(x: number, min: number, max: number, margin: number): number {
  if (x <= min - margin || x >= max + margin) return x;
  const mid = (min + max) / 2;
  return x < mid ? min - margin : max + margin;
}

/**
 * Shift `value` clear of every line in `lines` by at least `margin` —
 * globally: picks the nearest position satisfying ALL lines rather than
 * iterating (dense line sets made the iterative version bounce and exit
 * dirty).
 */
export function clearOfLines(value: number, lines: number[], margin: number): number {
  const ok = (v: number) => lines.every((l) => Math.abs(l - v) >= margin - 1e-9);
  if (ok(value)) return value;
  const candidates = lines.flatMap((l) => [l + margin, l - margin]).filter(ok);
  if (candidates.length === 0) return value;
  candidates.sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
  return candidates[0];
}

/** All spine-channel main z-lines on a floor (absolute, column-cleared). */
export function mainZLines(ctx: MepBuildingContext): number[] {
  const columnsZ = ctx.columns.map((c) => c.z);
  return Object.values(SPINE_CHANNELS).map((ch) => clearOfColumns(ctx.spine.z + ch, columnsZ, COLUMN_CLEAR));
}

/** Cluster zone centre-x values into branch lines (≤1.5 m apart share a line). */
function branchClusters(zones: MepZone[]): { x: number; zones: MepZone[] }[] {
  const sorted = [...zones].sort(
    (a, b) => (a.rect.minX + a.rect.maxX) / 2 - (b.rect.minX + b.rect.maxX) / 2,
  );
  const clusters: { xs: number[]; zones: MepZone[] }[] = [];
  for (const zone of sorted) {
    const cx = (zone.rect.minX + zone.rect.maxX) / 2;
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last.xs[last.xs.length - 1] - cx) < 1.5) {
      last.xs.push(cx);
      last.zones.push(zone);
    } else {
      clusters.push({ xs: [cx], zones: [zone] });
    }
  }
  return clusters.map((c) => ({ x: c.xs.reduce((s, v) => s + v, 0) / c.xs.length, zones: c.zones }));
}

/** One cluster base x → the shared, cleared branch base line. */
function clearedBase(ctx: MepBuildingContext, x: number): number {
  const columnsX = ctx.columns.map((c) => c.x);
  const bank = ctx.core.elevator;
  let v = clearOfColumns(x, columnsX, BRANCH_BASE_CLEAR);
  v = clearOfInterval(v, bank.minX, bank.maxX, BRANCH_BASE_CLEAR);
  return Math.min(ctx.spine.maxX, Math.max(ctx.spine.minX, v));
}

/** The zone-column base x-lines every system's branches derive from. */
export function branchBaseXs(ctx: MepBuildingContext, zones: MepZone[]): number[] {
  return branchClusters(zones).map((c) => clearedBase(ctx, c.x));
}

/** Water-band branch x-lines (chw/hw/ref offsets) — what ceiling drops must avoid. */
export function waterBranchXs(ctx: MepBuildingContext, zones: MepZone[]): number[] {
  const base = branchBaseXs(ctx, zones);
  const offsets = [-0.7, -0.52, -0.94, -0.76, 0.7];
  return base.flatMap((x) => offsets.map((o) => x + o));
}

/**
 * Resolve a line coordinate against columns AND the hoistway interval —
 * two-sided: when a value is trapped between a column and the bank, escape
 * to the column's far side. Deterministic candidate order.
 */
function resolveLine(x: number, columnsX: number[], bankMin: number, bankMax: number): number {
  const clearBoth = (v: number): boolean =>
    columnsX.every((c) => Math.abs(c - v) >= COLUMN_CLEAR) && (v <= bankMin - 0.7 || v >= bankMax + 0.7);
  if (clearBoth(x)) return x;
  const candidates: number[] = [];
  for (const c of columnsX) {
    if (Math.abs(c - x) < COLUMN_CLEAR + 1.2) {
      candidates.push(c + COLUMN_CLEAR, c - COLUMN_CLEAR);
    }
  }
  // Bank edges, stepped outward in case a column sits right at the edge.
  for (let k = 0; k <= 4; k += 1) {
    candidates.push(bankMin - 0.7 - 0.35 * k, bankMax + 0.7 + 0.35 * k);
  }
  candidates.sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
  for (const v of candidates) if (clearBoth(v)) return v;
  return x;
}

/** Sprinkler branch-line xs: the head grid shifted clear of water branch lines, columns and the hoistway. */
export function sprinklerBranchXs(ctx: MepBuildingContext, zones: MepZone[]): number[] {
  const avoid = waterBranchXs(ctx, zones);
  const columnsX = ctx.columns.map((c) => c.x);
  const bank = ctx.core.elevator;
  const xs: number[] = [];
  for (
    let x = ctx.bounds.minX + SPRINKLER_WALL_MIN_M;
    x <= ctx.bounds.maxX - SPRINKLER_WALL_MIN_M + 1e-6;
    x += SPRINKLER_SPACING_M
  ) {
    xs.push(resolveLine(clearOfLines(x, avoid, 0.45), columnsX, bank.minX, bank.maxX));
  }
  return xs;
}

/**
 * The x-lines of the water-band vertical takeoffs at the wet/mechanical
 * shafts — short-range wet-core runs (DCW/DHW branches) must dip at these
 * exactly like at the zone branch lines.
 */
export function waterTakeoffXs(ctx: MepBuildingContext): number[] {
  const sr = ctx.core.serviceRiser.x;
  const mech = ctx.shafts.find((s) => s.kind === "mechanical");
  const lines = [sr, sr + 0.18, sr - 0.45, sr - 0.27];
  if (mech) lines.push(mech.x + 0.85);
  return lines;
}

// ---------------------------------------------------------------------------
// Dips: a branch crossing another system's same-band main goes around it.

/**
 * Waypoints for a straight run along one plan axis, dipping by `dipDy`
 * around every crossing line in `dips` (merged when closer than 1.2 m).
 * `axis` names the axis of travel; `fixed` is the other plan coordinate.
 */
export function dipAxisRun(
  axis: "x" | "z",
  fixed: number,
  y: number,
  from: number,
  to: number,
  dips: number[],
  dipDy: number,
): Vec3[] {
  const at = (t: number, yy: number) => (axis === "z" ? v3(fixed, yy, t) : v3(t, yy, fixed));
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const crossing = dips.filter((d) => d > lo + 0.15 && d < hi - 0.15).sort((a, b) => a - b);
  if (crossing.length === 0 || dipDy === 0) return [at(to, y)];
  const intervals: { from: number; to: number }[] = [];
  for (const d of crossing) {
    const last = intervals[intervals.length - 1];
    if (last && d - last.to < 1.2) last.to = d;
    else intervals.push({ from: d, to: d });
  }
  const dir = to >= from ? 1 : -1;
  const ordered = dir === 1 ? intervals : intervals.reverse();
  const out: Vec3[] = [];
  for (const itv of ordered) {
    const entry = (dir === 1 ? itv.from : itv.to) - dir * DIP_HALF;
    const exit = (dir === 1 ? itv.to : itv.from) + dir * DIP_HALF;
    out.push(at(entry, y));
    out.push(at(entry, y + dipDy));
    out.push(at(exit, y + dipDy));
    out.push(at(exit, y));
  }
  out.push(at(to, y));
  return out;
}

/** Back-compat wrapper: z-axis dip run at constant x. */
export function dipZRun(x: number, y: number, z1: number, z2: number, dips: number[], dipDy: number): Vec3[] {
  return dipAxisRun("z", x, y, z1, z2, dips, dipDy);
}

// ---------------------------------------------------------------------------

export interface FloorNetSpec {
  system: MepSystem;
  /** Riser tap node for this floor (already at shaft x/z, any y). */
  tap: MepNode;
  floor: MepFloorContext;
  ctx: MepBuildingContext;
  /** Plan offset of this system's corridor channel from the spine axis. */
  channel: number;
  /** Absolute Y of horizontal runs (the system's service band). */
  bandY: number;
  /** Absolute Y terminals mount at (ceiling plane / device elevation). */
  terminalY: number;
  zones: MepZone[];
  demandOf: (zone: MepZone) => number;
  /** Branch lines shift off the zone-column base by this much (coordination). */
  branchOffsetX?: number;
  /** Same-band main z-lines this system's z-runs must dip around. */
  dipAtZ?: number[];
  /** Dip direction/size (positive = up toward the slab). 0 disables. */
  dipDy?: number;
  /** Lines terminal drops must not share a plan coordinate with. */
  avoidDropZ?: number[];
  avoidDropX?: number[];
  /** Device offset from the zone centre (plan coordination). */
  terminalPoint?: (zone: MepZone) => { dx: number; dz: number };
  rules?: string[];
  insulated?: boolean;
  terminal?: (zone: MepZone) => { label?: string; equipment?: MepNode["equipment"] };
  roles?: { main?: SegmentRole; branch?: SegmentRole; runout?: SegmentRole };
}

export interface FloorNetResult {
  terminals: MepNode[];
  mainEntry: MepNode;
}

/**
 * The canonical floor distribution tree:
 *
 *   tap ─connector─ spine entry ─main junctions along the corridor─
 *        └ per branch line: perpendicular zone branch (dipping at same-band
 *          crossings) ─ junctions ─ per zone: runout → coordinated drop →
 *          terminal
 */
export function buildFloorNet(g: MepGraphBuilder, spec: FloorNetSpec): FloorNetResult {
  const { system, tap, floor, ctx } = spec;
  const columnsX = ctx.columns.map((c) => c.x);
  const columnsZ = ctx.columns.map((c) => c.z);
  const runZ = clearOfColumns(ctx.spine.z + spec.channel, columnsZ, COLUMN_CLEAR);
  const roles = { main: "main" as const, branch: "branch" as const, runout: "runout" as const, ...spec.roles };
  const base = { floorNo: floor.floorNo, rules: spec.rules, insulated: spec.insulated };
  const dips = (spec.dipAtZ ?? []).filter((z) => Math.abs(z - runZ) > 0.2);
  const dipDy = spec.dipDy ?? 0;

  const offset = spec.branchOffsetX ?? 0;
  const clusters = branchClusters(spec.zones).map((c) => ({
    ...c,
    x: clearedBase(ctx, c.x) + offset,
  }));
  const entryX = Math.min(
    ctx.spine.maxX,
    Math.max(ctx.spine.minX, clearOfColumns(tap.position.x, columnsX, COLUMN_CLEAR)),
  );

  // Takeoff: shaft → band elevation → corridor entry point (dipping if the
  // z-run crosses same-band mains).
  let entry = g.chain(
    system,
    tap,
    [v3(tap.position.x, spec.bandY, tap.position.z)],
    { ...base, role: "connector" },
    "bend",
  );
  entry = g.chain(
    system,
    entry,
    dipZRun(tap.position.x, spec.bandY, tap.position.z, runZ, dips, dipDy),
    { ...base, role: "connector" },
    "bend",
  );
  entry = g.chain(system, entry, [v3(entryX, spec.bandY, runZ)], { ...base, role: "connector" }, "junction");

  // Main along the corridor: junction chain leftward and rightward of entry.
  const left = clusters.filter((c) => c.x < entryX - 0.05).sort((a, b) => b.x - a.x);
  const right = clusters.filter((c) => c.x >= entryX - 0.05).sort((a, b) => a.x - b.x);
  const terminals: MepNode[] = [];

  const runSide = (side: { x: number; zones: MepZone[] }[]) => {
    let prev = entry;
    for (const cluster of side) {
      const junction = g.addNode(system.id, "junction", v3(cluster.x, spec.bandY, runZ), floor.floorNo);
      g.addSegment(system, prev, junction, { ...base, role: roles.main });
      prev = junction;
      buildZoneBranch(g, spec, junction, cluster, runZ, dips, dipDy, terminals, roles, base);
    }
  };
  runSide(left);
  runSide(right);

  return { terminals, mainEntry: entry };
}

function buildZoneBranch(
  g: MepGraphBuilder,
  spec: FloorNetSpec,
  junction: MepNode,
  cluster: { x: number; zones: MepZone[] },
  runZ: number,
  dips: number[],
  dipDy: number,
  terminals: MepNode[],
  roles: { main: SegmentRole; branch: SegmentRole; runout: SegmentRole },
  base: { floorNo: number; rules?: string[]; insulated?: boolean },
): void {
  const { system } = spec;
  const fore = cluster.zones
    .filter((z) => (z.rect.minZ + z.rect.maxZ) / 2 >= runZ)
    .sort((a, b) => (a.rect.minZ + a.rect.maxZ) / 2 - (b.rect.minZ + b.rect.maxZ) / 2);
  const aft = cluster.zones
    .filter((z) => (z.rect.minZ + z.rect.maxZ) / 2 < runZ)
    .sort((a, b) => (b.rect.minZ + b.rect.maxZ) / 2 - (a.rect.minZ + a.rect.maxZ) / 2);

  for (const run of [fore, aft]) {
    let prev = junction;
    let prevZ = runZ;
    for (const zone of run) {
      const zc = (zone.rect.minZ + zone.rect.maxZ) / 2;
      const xc = (zone.rect.minX + zone.rect.maxX) / 2;

      // Branch leg to this zone's z, dipping around same-band crossings.
      const legWps = dipZRun(cluster.x, spec.bandY, prevZ, zc, dips, dipDy);
      const branchNode = g.chain(system, prev, legWps, { ...base, role: roles.branch }, "junction");
      prev = branchNode;
      prevZ = zc;

      // Coordinated terminal drop: device offset + shift off occupied lines
      // AND structural columns (drops pass through every band below).
      const columnsXAll = spec.ctx.columns.map((c) => c.x);
      const columnsZAll = spec.ctx.columns.map((c) => c.z);
      const off = spec.terminalPoint?.(zone) ?? { dx: 0, dz: 0 };
      let tx = xc + off.dx;
      let tz = zc + off.dz;
      // Snap tiny offsets onto the run lines first, THEN clear obstacles —
      // clearing must never be undone by a snap-back.
      if (Math.abs(tx - cluster.x) <= 0.15) tx = cluster.x;
      if (Math.abs(tz - zc) <= 0.15) tz = zc;
      const rawTx = tx;
      const rawTz = tz;
      tx = clearOfLines(tx, [...(spec.avoidDropX ?? []), ...columnsXAll], LINE_MARGIN);
      tz = clearOfLines(tz, [...(spec.avoidDropZ ?? []), ...columnsZAll], LINE_MARGIN);
      // A jog that long would cross rooms/shafts it has no business in —
      // keep the device near its zone and let self-repair coordinate locally.
      if (Math.abs(tx - rawTx) > 1.8) tx = rawTx;
      if (Math.abs(tz - rawTz) > 1.8) tz = rawTz;
      // Never let the x-jog pass through the hoistway (rule Z3): when the jog
      // spans the bank in x, its z must stay clear of the bank band.
      const bank = spec.ctx.core.elevator;
      if (Math.max(cluster.x, tx) > bank.minX - 0.3 && Math.min(cluster.x, tx) < bank.maxX + 0.3) {
        tz = clearOfInterval(
          tz,
          bank.bankZ - bank.shaftDepth / 2,
          bank.bankZ + bank.shaftDepth / 2,
          0.45,
        );
      }

      const meta = spec.terminal?.(zone);
      // z-first: ride the (column-cleared) branch line, then jog x at the
      // (column-cleared) terminal z, then drop.
      const waypoints: Vec3[] = [];
      if (Math.abs(tz - zc) > 1e-6) waypoints.push(v3(cluster.x, spec.bandY, tz));
      if (Math.abs(tx - cluster.x) > 1e-6) waypoints.push(v3(tx, spec.bandY, tz));
      waypoints.push(v3(tx, spec.terminalY, tz));
      const terminalNode = g.chain(system, branchNode, waypoints, { ...base, role: roles.runout }, "terminal");
      terminalNode.terminal = { zoneId: zone.id, demand: spec.demandOf(zone), demandUnit: system.flowUnit };
      if (meta?.label) terminalNode.label = meta.label;
      if (meta?.equipment) {
        terminalNode.kind = "equipment";
        terminalNode.equipment = meta.equipment;
      }
      terminals.push(terminalNode);
    }
  }
}

/** Perimeter test used to pick FCU zones (rule A7): zone touches the facade band. */
export function isPerimeterZone(zone: MepZone, ctx: MepBuildingContext): boolean {
  const b = ctx.bounds;
  const margin = 2.2;
  return (
    zone.rect.minX < b.minX + margin ||
    zone.rect.maxX > b.maxX - margin ||
    zone.rect.minZ < b.minZ + margin ||
    zone.rect.maxZ > b.maxZ - margin
  );
}

/** Edge point of a zone toward the nearest plate boundary (receptacle drops). */
export function zoneFacadeOffset(zone: MepZone, ctx: MepBuildingContext): { dx: number; dz: number } {
  const cx = (zone.rect.minX + zone.rect.maxX) / 2;
  const cz = (zone.rect.minZ + zone.rect.maxZ) / 2;
  const b = ctx.bounds;
  const candidates = [
    { d: cx - b.minX, dx: zone.rect.minX - cx + 0.35, dz: 0 },
    { d: b.maxX - cx, dx: zone.rect.maxX - cx - 0.35, dz: 0 },
    { d: cz - b.minZ, dx: 0, dz: zone.rect.minZ - cz + 0.35 },
    { d: b.maxZ - cz, dx: 0, dz: zone.rect.maxZ - cz - 0.35 },
  ];
  candidates.sort((a, c) => a.d - c.d);
  return { dx: candidates[0].dx, dz: candidates[0].dz };
}
