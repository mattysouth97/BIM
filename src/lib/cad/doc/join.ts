// src/lib/cad/doc/join.ts
// AutoCAD-style JOIN: weld open line / polyline / arc chains that share
// endpoints into a single polyline. When the first and last vertices meet,
// the result is closed so it can become a floor outline.

import type { CadArc, CadEntity, CadPolyline, Vec2 } from "./types";

export const JOIN_FUZZ_M = 1e-3;

export interface JoinOptions {
  /** If set, only the connected components that touch these ids are joined. */
  seedIds?: string[];
  fuzz?: number;
}

export interface JoinResult {
  entities: CadEntity[];
  /** Source entities consumed into a multi-piece weld or a close. */
  joinedCount: number;
  closed: CadPolyline[];
  changed: boolean;
}

interface OpenChain {
  sourceIds: string[];
  vertices: Vec2[];
  bulges: number[];
  layer: string;
  colorIndex?: number;
}

const TAU = Math.PI * 2;

function near(a: Vec2, b: Vec2, fuzz: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= fuzz;
}

function ccwSweep(start: number, end: number): number {
  let sweep = end - start;
  while (sweep <= 0) sweep += TAU;
  return sweep;
}

function polar(center: Vec2, radius: number, angle: number): Vec2 {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

function padBulges(vertices: Vec2[], bulges: number[]): number[] {
  const n = vertices.length;
  const out = bulges.slice(0, n);
  while (out.length < n) out.push(0);
  return out;
}

function arcToChain(e: CadArc): OpenChain | null {
  if (e.radius <= 0) return null;
  const start = polar(e.center, e.radius, e.startAngle);
  const end = polar(e.center, e.radius, e.endAngle);
  if (near(start, end, 1e-9)) return null;
  const bulge = Math.tan(ccwSweep(e.startAngle, e.endAngle) / 4);
  return {
    sourceIds: [e.id],
    vertices: [start, end],
    bulges: [bulge, 0],
    layer: e.layer,
    colorIndex: e.colorIndex,
  };
}

function entityToOpenChain(e: CadEntity): OpenChain | null {
  if (e.kind === "line") {
    if (near(e.a, e.b, 1e-9)) return null;
    return {
      sourceIds: [e.id],
      vertices: [{ ...e.a }, { ...e.b }],
      bulges: [0, 0],
      layer: e.layer,
      colorIndex: e.colorIndex,
    };
  }
  if (e.kind === "polyline") {
    if (e.closed || e.vertices.length < 2) return null;
    return {
      sourceIds: [e.id],
      vertices: e.vertices.map((v) => ({ ...v })),
      bulges: padBulges(e.vertices, e.bulges),
      layer: e.layer,
      colorIndex: e.colorIndex,
    };
  }
  if (e.kind === "arc") return arcToChain(e);
  return null;
}

function reverseChain(c: OpenChain): OpenChain {
  const n = c.vertices.length;
  const vertices = [...c.vertices].reverse();
  const bulges = Array.from({ length: n }, () => 0);
  for (let i = 0; i < n - 1; i++) {
    bulges[n - 2 - i] = -c.bulges[i];
  }
  return { ...c, vertices, bulges };
}

function appendChain(a: OpenChain, b: OpenChain): OpenChain {
  return {
    sourceIds: [...a.sourceIds, ...b.sourceIds],
    vertices: [...a.vertices, ...b.vertices.slice(1)],
    bulges: [...a.bulges.slice(0, a.vertices.length - 1), ...b.bulges],
    layer: a.layer,
    colorIndex: a.colorIndex,
  };
}

function startOf(c: OpenChain): Vec2 {
  return c.vertices[0];
}

function endOf(c: OpenChain): Vec2 {
  return c.vertices[c.vertices.length - 1];
}

function tryAttach(current: OpenChain, other: OpenChain, fuzz: number): OpenChain | null {
  if (near(endOf(current), startOf(other), fuzz)) return appendChain(current, other);
  if (near(endOf(current), endOf(other), fuzz)) return appendChain(current, reverseChain(other));
  if (near(startOf(current), endOf(other), fuzz)) return appendChain(other, current);
  if (near(startOf(current), startOf(other), fuzz)) return appendChain(reverseChain(other), current);
  return null;
}

function grow(seed: OpenChain, pool: OpenChain[], fuzz: number): OpenChain {
  let current = seed;
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < pool.length; i++) {
      const attached = tryAttach(current, pool[i], fuzz);
      if (!attached) continue;
      current = attached;
      pool.splice(i, 1);
      grew = true;
      break;
    }
  }
  return current;
}

function endpointsTouch(a: OpenChain, b: OpenChain, fuzz: number): boolean {
  return (
    near(startOf(a), startOf(b), fuzz) ||
    near(startOf(a), endOf(b), fuzz) ||
    near(endOf(a), startOf(b), fuzz) ||
    near(endOf(a), endOf(b), fuzz)
  );
}

function componentOf(seed: OpenChain, all: OpenChain[], fuzz: number): Set<string> {
  const ids = new Set(seed.sourceIds);
  const queue = [seed];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const other of all) {
      if (other.sourceIds.some((id) => ids.has(id))) continue;
      if (!endpointsTouch(cur, other, fuzz)) continue;
      for (const id of other.sourceIds) ids.add(id);
      queue.push(other);
    }
  }
  return ids;
}

function finalize(c: OpenChain, fuzz: number): CadPolyline {
  const n = c.vertices.length;
  const closes = n >= 3 && near(c.vertices[0], c.vertices[n - 1], fuzz);
  const vertices = closes ? c.vertices.slice(0, -1) : c.vertices;
  const bulges = closes
    ? c.bulges.slice(0, vertices.length)
    : padBulges(vertices, c.bulges);
  return {
    id: c.sourceIds[0],
    kind: "polyline",
    layer: c.layer,
    colorIndex: c.colorIndex,
    vertices,
    bulges,
    closed: closes,
  };
}

/**
 * Join open linework that shares endpoints. Closed circles / polylines,
 * text, and points pass through unchanged.
 */
export function joinConnectedEntities(
  entities: CadEntity[],
  opts: JoinOptions = {},
): JoinResult {
  const fuzz = opts.fuzz ?? JOIN_FUZZ_M;
  const chains: OpenChain[] = [];
  const passthrough: CadEntity[] = [];
  const byId = new Map<string, CadEntity>();

  for (const e of entities) {
    byId.set(e.id, e);
    const chain = entityToOpenChain(e);
    if (chain) chains.push(chain);
    else passthrough.push(e);
  }

  let allowed: Set<string> | null = null;
  if (opts.seedIds && opts.seedIds.length > 0) {
    allowed = new Set<string>();
    for (const seedId of opts.seedIds) {
      const seed = chains.find((c) => c.sourceIds.includes(seedId));
      if (!seed) continue;
      for (const id of componentOf(seed, chains, fuzz)) allowed.add(id);
    }
  }

  const work: OpenChain[] = [];
  const leftover: CadEntity[] = [];
  for (const c of chains) {
    if (allowed && !c.sourceIds.some((id) => allowed.has(id))) {
      leftover.push(byId.get(c.sourceIds[0])!);
    } else {
      work.push(c);
    }
  }

  const welded: CadPolyline[] = [];
  const closed: CadPolyline[] = [];
  let joinedCount = 0;
  const remaining = [...work];

  while (remaining.length > 0) {
    const grown = grow(remaining.shift()!, remaining, fuzz);
    const pl = finalize(grown, fuzz);
    const weldedMany = grown.sourceIds.length > 1;
    if (weldedMany || pl.closed) {
      welded.push(pl);
      if (pl.closed) closed.push(pl);
      joinedCount += grown.sourceIds.length;
    } else {
      leftover.push(byId.get(grown.sourceIds[0])!);
    }
  }

  const next = [...passthrough, ...leftover, ...welded];
  const changed =
    next.length !== entities.length ||
    closed.some((pl) => {
      const was = byId.get(pl.id);
      return !(was?.kind === "polyline" && was.closed);
    });

  return { entities: next, joinedCount, closed, changed };
}
