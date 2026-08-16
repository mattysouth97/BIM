// Classify closed CAD polylines into outline / core / room.
// Native DXF XY metres — nothing is re-centered here. Consumers convert
// a core centroid into twin XZ by subtracting the outline bbox centre.

import type { CadDocument, CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";

export type PlanRole = "outline" | "core" | "room" | "other";

export interface ClassifiedPlanPolyline {
  entityId: string;
  layer: string;
  role: PlanRole;
  areaSqm: number;
  centroid: Vec2;
  bboxCenter: Vec2;
  /** Native-metre ring, not bbox-centered. */
  polygon: [number, number][];
}

const MIN_AREA_SQM = 1;
const CORE_MIN_FRAC = 0.015;
const CORE_MAX_FRAC = 0.30;

function tessellatePolyline(pl: CadPolyline): Vec2[] {
  const pts: Vec2[] = [];
  const n = pl.vertices.length;
  for (let i = 0; i < n; i++) {
    const a = pl.vertices[i];
    const b = pl.vertices[(i + 1) % n];
    if (pl.bulges[i]) {
      const arc = bulgeArcPoints(a, b, pl.bulges[i]);
      pts.push(...arc.slice(0, -1));
    } else {
      pts.push(a);
    }
  }
  return pts;
}

function signedArea(pts: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function centroidOf(pts: Vec2[], area: number): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (Math.abs(area) < 1e-9) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const k = 1 / (6 * area);
  return { x: cx * k, y: cy * k };
}

function bboxCenterOf(pts: Vec2[]): Vec2 {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Even-odd point-in-polygon. */
export function pointInPolygon(pt: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y, yj = ring[j].y;
    const xi = ring[i].x, xj = ring[j].x;
    const intersect =
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface RawRing {
  entityId: string;
  layer: string;
  pts: Vec2[];
  areaSqm: number;
  signed: number;
  centroid: Vec2;
  bboxCenter: Vec2;
}

function toRaw(pl: CadPolyline): RawRing | null {
  if (!pl.closed || pl.vertices.length < 3) return null;
  const pts = tessellatePolyline(pl);
  if (pts.length < 3) return null;
  const signed = signedArea(pts);
  const areaSqm = Math.abs(signed);
  if (areaSqm < MIN_AREA_SQM) return null;
  return {
    entityId: pl.id,
    layer: pl.layer,
    pts,
    areaSqm,
    signed,
    centroid: centroidOf(pts, signed),
    bboxCenter: bboxCenterOf(pts),
  };
}

function toClassified(raw: RawRing, role: PlanRole): ClassifiedPlanPolyline {
  return {
    entityId: raw.entityId,
    layer: raw.layer,
    role,
    areaSqm: raw.areaSqm,
    centroid: raw.centroid,
    bboxCenter: raw.bboxCenter,
    polygon: raw.pts.map((p) => [p.x, p.y]),
  };
}

export function classifyPlanPolylines(doc: CadDocument): ClassifiedPlanPolyline[] {
  const rings: RawRing[] = [];
  for (const e of doc.entities) {
    if (e.kind !== "polyline") continue;
    const raw = toRaw(e);
    if (raw) rings.push(raw);
  }
  if (rings.length === 0) return [];

  rings.sort((a, b) => b.areaSqm - a.areaSqm);
  const outline = rings[0];
  const rest = rings.slice(1);

  const interior: RawRing[] = [];
  const outside: RawRing[] = [];
  for (const r of rest) {
    if (pointInPolygon(r.centroid, outline.pts)) interior.push(r);
    else outside.push(r);
  }

  const coreCandidates = interior.filter((r) => {
    const frac = r.areaSqm / outline.areaSqm;
    return frac >= CORE_MIN_FRAC && frac <= CORE_MAX_FRAC;
  });
  const core = coreCandidates[0] ?? null;

  const out: ClassifiedPlanPolyline[] = [toClassified(outline, "outline")];
  for (const r of interior) {
    if (core && r.entityId === core.entityId) out.push(toClassified(r, "core"));
    else out.push(toClassified(r, "room"));
  }
  for (const r of outside) out.push(toClassified(r, "other"));
  return out;
}

/**
 * Twin-local service-core slot: core centroid minus outline bbox centre.
 * DXF Y becomes world Z. Returns null when the plan has no classifiable core.
 */
export function serviceCoreFromPlan(
  classified: ClassifiedPlanPolyline[],
  coreEntityId?: string,
): { x: number; z: number } | null {
  const outline = classified.find((c) => c.role === "outline");
  if (!outline) return null;
  const picked = coreEntityId
    ? classified.find((c) => c.entityId === coreEntityId)
    : undefined;
  const core =
    picked && picked.role !== "outline"
      ? picked
      : classified.find((c) => c.role === "core");
  if (!core) return null;
  return {
    x: core.centroid.x - outline.bboxCenter.x,
    z: core.centroid.y - outline.bboxCenter.y,
  };
}
