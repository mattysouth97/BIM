// src/lib/cad/doc/map-dxf-to-doc.ts
// npm dxf-parser output → CadDocument. Never throws.
// Pure module — no React, no DOM, no Three.

import DxfParser, { type IDxf } from "dxf-parser";
import { INSUNITS_TO_METERS } from "@/lib/cad/dxf-parser";
import type {
  CadDocument, CadEntity, CadLayer, CadPolyline, Vec2,
} from "./types";
import { arcPoints, bulgeArcPoints, circlePoints } from "./tessellate";

/* dxf-parser's entity typings are partial; we read loosely and validate. */
type RawEntity = Record<string, unknown> & { type: string; layer?: string };

export function mapDxfTextToDoc(text: string, docId: string): CadDocument {
  const warnings: string[] = [];
  const skipped: Record<string, number> = {};
  let dxf: IDxf | null = null;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch (err) {
    warnings.push(`DXF parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!dxf) return emptyDoc(docId, warnings);

  const rawInsUnits = dxf.header?.["$INSUNITS"];
  const insUnits =
    typeof rawInsUnits === "number" && Number.isFinite(rawInsUnits) ? rawInsUnits : 0;
  const scale = INSUNITS_TO_METERS[insUnits] ?? 1;
  if (insUnits === 0) warnings.push("Unitless DXF — assuming meters.");

  let nextId = 0;
  const idGen = () => `e${nextId++}`;
  const entities: CadEntity[] = [];
  const rawEntities = (dxf.entities ?? []) as unknown as RawEntity[];

  for (const raw of rawEntities) {
    const mapped = convertEntity(raw, scale, idGen, skipped, warnings, dxf, 0);
    entities.push(...mapped);
  }

  return {
    id: docId,
    layers: extractLayers(dxf, entities),
    entities,
    unitScaleToMeters: scale,
    extents: computeExtents(entities),
    warnings,
    stats: {
      totalParsed: rawEntities.length,
      mapped: entities.length,
      skipped,
    },
  };
}

function emptyDoc(docId: string, warnings: string[]): CadDocument {
  return {
    id: docId, layers: [], entities: [], unitScaleToMeters: 1,
    extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
    warnings, stats: { totalParsed: 0, mapped: 0, skipped: {} },
  };
}

const v = (p: unknown, scale: number): Vec2 | null => {
  const q = p as { x?: unknown; y?: unknown } | undefined;
  if (typeof q?.x !== "number" || typeof q?.y !== "number") return null;
  return { x: q.x * scale, y: q.y * scale };
};

/** Extended entity kinds (text/blocks/etc.) arrive in the next slice.
 *  `depth` guards recursive INSERT flattening. */
function convertEntity(
  raw: RawEntity, scale: number, idGen: () => string,
  skipped: Record<string, number>, warnings: string[], dxf: IDxf, depth: number,
): CadEntity[] {
  const layer = typeof raw.layer === "string" ? raw.layer : "0";
  const colorIndex = typeof raw.colorIndex === "number" ? raw.colorIndex : undefined;
  const base = { layer, colorIndex } as const;

  switch (raw.type) {
    case "LINE": {
      const verts = raw.vertices as unknown[] | undefined;
      const a = v(verts?.[0], scale), b = v(verts?.[1], scale);
      if (!a || !b) break;
      return [{ ...base, id: idGen(), kind: "line", a, b }];
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const rawVerts = (raw.vertices as unknown[] | undefined) ?? [];
      if (raw.type === "POLYLINE") {
        const r = raw as Record<string, unknown>;
        if (r.is3dPolyline || r.is3dPolygonMesh || r.isPolyfaceMesh) break;
      }
      const vertices: Vec2[] = [];
      const bulges: number[] = [];
      for (const rv of rawVerts) {
        const p = v(rv, scale);
        if (!p) continue;
        vertices.push(p);
        const bg = (rv as { bulge?: unknown }).bulge;
        bulges.push(typeof bg === "number" ? bg : 0);
      }
      if (vertices.length < 2) break;
      const closed = Boolean((raw as { shape?: unknown }).shape);
      const pl: CadPolyline = {
        ...base, id: idGen(), kind: "polyline", vertices, bulges, closed,
      };
      return [pl];
    }
    case "ARC": {
      const center = v(raw.center, scale);
      const { radius, startAngle, endAngle } = raw as {
        radius?: unknown; startAngle?: unknown; endAngle?: unknown;
      };
      if (!center || typeof radius !== "number") break;
      return [{
        ...base, id: idGen(), kind: "arc", center, radius: radius * scale,
        startAngle: typeof startAngle === "number" ? startAngle : 0,
        endAngle: typeof endAngle === "number" ? endAngle : Math.PI * 2,
      }];
    }
    case "CIRCLE": {
      const center = v(raw.center, scale);
      const radius = (raw as { radius?: unknown }).radius;
      if (!center || typeof radius !== "number") break;
      return [{ ...base, id: idGen(), kind: "circle", center, radius: radius * scale }];
    }
    case "TEXT": {
      const position = v((raw as Record<string, unknown>).startPoint, scale);
      const r = raw as { textHeight?: unknown; rotation?: unknown; text?: unknown };
      if (!position || typeof r.text !== "string") break;
      return [{
        ...base, id: idGen(), kind: "text", position, text: r.text,
        height: typeof r.textHeight === "number" ? r.textHeight * scale : 0.2,
        rotation: typeof r.rotation === "number" ? (r.rotation * Math.PI) / 180 : 0,
      }];
    }
    case "MTEXT": {
      const r = raw as { position?: unknown; height?: unknown; rotation?: unknown; text?: unknown };
      const position = v(r.position, scale);
      if (!position || typeof r.text !== "string") break;
      return [{
        ...base, id: idGen(), kind: "text", position,
        text: stripMtextCodes(r.text),
        height: typeof r.height === "number" ? r.height * scale : 0.2,
        rotation: typeof r.rotation === "number" ? (r.rotation * Math.PI) / 180 : 0,
      }];
    }
    case "POINT": {
      const position = v((raw as Record<string, unknown>).position, scale);
      if (!position) break;
      return [{ ...base, id: idGen(), kind: "point", position }];
    }
    case "ELLIPSE": {
      const r = raw as {
        center?: unknown; majorAxisEndPoint?: unknown; axisRatio?: unknown;
        startAngle?: unknown; endAngle?: unknown;
      };
      const center = v(r.center, scale);
      const majorAxis = v(r.majorAxisEndPoint, scale);
      if (!center || !majorAxis || typeof r.axisRatio !== "number") break;
      return [{
        ...base, id: idGen(), kind: "ellipse", center, majorAxis, ratio: r.axisRatio,
        startParam: typeof r.startAngle === "number" ? r.startAngle : 0,
        endParam: typeof r.endAngle === "number" ? r.endAngle : Math.PI * 2,
      }];
    }
    case "SPLINE": {
      const cps = ((raw as { controlPoints?: unknown[] }).controlPoints ?? [])
        .map((p) => v(p, scale))
        .filter((p): p is Vec2 => p !== null);
      if (cps.length < 2) break;
      warnings.push("SPLINE approximated by its control polygon.");
      return [{
        ...base, id: idGen(), kind: "polyline",
        vertices: cps, bulges: cps.map(() => 0), closed: false,
      }];
    }
    case "INSERT":
    case "DIMENSION": {
      if (depth >= 4) break; // runaway nesting guard
      const r = raw as {
        name?: unknown; block?: unknown; position?: unknown; anchorPoint?: unknown;
        xScale?: unknown; yScale?: unknown; rotation?: unknown;
      };
      const blockName = typeof r.name === "string" ? r.name
        : typeof r.block === "string" ? r.block : null;
      const block = blockName
        ? (dxf.blocks as Record<string, { entities?: RawEntity[]; position?: unknown } | undefined> | undefined)?.[blockName]
        : undefined;
      if (!block?.entities?.length) break; // unresolvable → skipped
      const insertAt = v(r.position, scale) ?? v(r.anchorPoint, scale) ?? { x: 0, y: 0 };
      const basePoint = v(block.position, scale) ?? { x: 0, y: 0 };
      const sx = typeof r.xScale === "number" ? r.xScale : 1;
      const sy = typeof r.yScale === "number" ? r.yScale : 1;
      const rot = typeof r.rotation === "number" ? (r.rotation * Math.PI) / 180 : 0;
      const out: CadEntity[] = [];
      for (const child of block.entities) {
        for (const e of convertEntity(child, scale, idGen, skipped, warnings, dxf, depth + 1)) {
          out.push(transformEntity(e, insertAt, basePoint, sx, sy, rot, blockName!));
        }
      }
      if (out.length) return out;
      break;
    }
  }
  skipped[raw.type] = (skipped[raw.type] ?? 0) + 1;
  return [];
}

/** Strip common MTEXT inline format codes; keep the visible text. */
export function stripMtextCodes(s: string): string {
  return s
    .replace(/\\P/g, "\n")                       // paragraph
    .replace(/\\[A-Za-z][^;{}\\]*;/g, "")        // \H2.5x; \fArial|b0; etc.
    .replace(/[{}]/g, "")                        // group braces
    .trim();
}

function xform(p: Vec2, at: Vec2, bp: Vec2, sx: number, sy: number, rot: number): Vec2 {
  const x = (p.x - bp.x) * sx, y = (p.y - bp.y) * sy;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: at.x + x * c - y * s, y: at.y + x * s + y * c };
}

function transformEntity(
  e: CadEntity, at: Vec2, bp: Vec2, sx: number, sy: number, rot: number, blockName: string,
): CadEntity {
  const t = (p: Vec2) => xform(p, at, bp, sx, sy, rot);
  const tagged = { ...e, fromBlock: blockName };
  switch (tagged.kind) {
    case "line": return { ...tagged, a: t(tagged.a), b: t(tagged.b) };
    case "polyline": return { ...tagged, vertices: tagged.vertices.map(t) };
    case "arc": {
      // Uniform scale assumed for radius; mirror/skew inserts are out of scope v1.
      return {
        ...tagged, center: t(tagged.center), radius: tagged.radius * Math.abs(sx),
        startAngle: tagged.startAngle + rot, endAngle: tagged.endAngle + rot,
      };
    }
    case "circle": return { ...tagged, center: t(tagged.center), radius: tagged.radius * Math.abs(sx) };
    case "ellipse": {
      const maj = xform(
        { x: tagged.majorAxis.x + bp.x, y: tagged.majorAxis.y + bp.y }, { x: 0, y: 0 }, bp, sx, sy, rot,
      );
      return { ...tagged, center: t(tagged.center), majorAxis: maj };
    }
    case "text": return { ...tagged, position: t(tagged.position), rotation: tagged.rotation + rot };
    case "point": return { ...tagged, position: t(tagged.position) };
  }
}

function extractLayers(dxf: IDxf, entities: CadEntity[]): CadLayer[] {
  const table = (dxf.tables as unknown as {
    layer?: { layers?: Record<string, { colorIndex?: number; frozen?: boolean; visible?: boolean }> };
  } | undefined)?.layer?.layers ?? {};
  const names = new Set<string>(Object.keys(table));
  for (const e of entities) names.add(e.layer);
  return [...names].sort().map((name) => {
    const t = table[name];
    return {
      name,
      colorIndex: typeof t?.colorIndex === "number" ? Math.abs(t.colorIndex) : 7,
      visible: t?.visible === false || t?.frozen === true ? false : true,
    };
  });
}

function computeExtents(entities: CadEntity[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const e of entities) {
    switch (e.kind) {
      case "line": eat(e.a); eat(e.b); break;
      case "polyline":
        for (let i = 0; i < e.vertices.length; i++) {
          const j = (i + 1) % e.vertices.length;
          if (!e.closed && j === 0) { eat(e.vertices[i]); break; }
          if (e.bulges[i]) bulgeArcPoints(e.vertices[i], e.vertices[j], e.bulges[i]).forEach(eat);
          else eat(e.vertices[i]);
        }
        break;
      case "arc": arcPoints(e.center, e.radius, e.startAngle, e.endAngle).forEach(eat); break;
      case "circle": circlePoints(e.center, e.radius).forEach(eat); break;
      case "ellipse": {
        const a = Math.hypot(e.majorAxis.x, e.majorAxis.y);
        eat({ x: e.center.x - a, y: e.center.y - a });
        eat({ x: e.center.x + a, y: e.center.y + a });
        break;
      }
      case "text": eat(e.position); break;
      case "point": eat(e.position); break;
    }
  }
  if (minX === Infinity) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
