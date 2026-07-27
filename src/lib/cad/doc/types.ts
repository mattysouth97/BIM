// src/lib/cad/doc/types.ts
// CadDocument — the editable CAD document model (phase-1: read-only viewer).
// Plain serializable data. Meters, native DXF XY, radians CCW.

export interface Vec2 { x: number; y: number }

interface CadEntityBase {
  /** Stable per-document id, assigned by the mapper ("e0", "e1", …). */
  id: string;
  layer: string;
  /** ACI color override; undefined = ByLayer. */
  colorIndex?: number;
  /** Set when the entity was flattened out of a block reference. */
  fromBlock?: string;
}

export interface CadLine extends CadEntityBase { kind: "line"; a: Vec2; b: Vec2 }
export interface CadPolyline extends CadEntityBase {
  kind: "polyline";
  vertices: Vec2[];
  /** Bulge leaving vertex i toward i+1; same length as vertices (0 = straight). */
  bulges: number[];
  closed: boolean;
}
export interface CadArc extends CadEntityBase {
  kind: "arc"; center: Vec2; radius: number; startAngle: number; endAngle: number;
}
export interface CadCircle extends CadEntityBase { kind: "circle"; center: Vec2; radius: number }
export interface CadEllipse extends CadEntityBase {
  kind: "ellipse";
  center: Vec2;
  /** Endpoint of the major axis relative to center (meters). */
  majorAxis: Vec2;
  /** Minor/major axis ratio (0..1]. */
  ratio: number;
  startParam: number;
  endParam: number;
}
export interface CadText extends CadEntityBase {
  kind: "text"; position: Vec2; height: number; rotation: number; text: string;
}
export interface CadPointEntity extends CadEntityBase { kind: "point"; position: Vec2 }

export type CadEntity =
  | CadLine | CadPolyline | CadArc | CadCircle | CadEllipse | CadText | CadPointEntity;

export interface CadLayer { name: string; colorIndex: number; visible: boolean }

export interface CadDocumentStats {
  /** Entities seen in the DXF ENTITIES section (before block flattening). */
  totalParsed: number;
  /** Entities that made it into `entities`. */
  mapped: number;
  /** Skipped DXF entity types → count (never silently dropped). */
  skipped: Record<string, number>;
}

export interface CadDocument {
  id: string;
  layers: CadLayer[];
  entities: CadEntity[];
  unitScaleToMeters: number;
  extents: { min: Vec2; max: Vec2 };
  warnings: string[];
  stats: CadDocumentStats;
}
