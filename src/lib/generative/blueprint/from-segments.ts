// src/lib/generative/blueprint/from-segments.ts
//
// Deterministic segment-soup → BlueprintSpec reader. The shared core behind
// BOTH the offline heuristic provider's "segments" interpretation
// (`provider/heuristic-provider.ts`) and the CAD importer (`from-cad.ts`) —
// one loop-detection pass, not two that could quietly drift apart.
//
// UNITS IN: millimetres, integers — the provider request / CAD convention.
// GEOMETRY KERNEL: metres (`geom/`). Conversion happens at exactly the two
// edges of this file: mm→m immediately before `detectClosedLoops`, m→mm on
// every point written back into the BlueprintSpec.
//
// This is a REAL, if modest, reading of the geometry — not a fabrication:
//   - the largest closed loop is the boundary, unless a layer explicitly
//     mapped to "boundary" names a different one;
//   - loops fully inside the boundary are read as voids, cores or zones by
//     layer-name hint, explicit layer mapping, or a contained text label;
//   - a loop this function cannot place with any evidence is DROPPED, with
//     an honest `uncertainty` entry — never guessed into a room.
//
// No Math.random, no Date.now: identical segments always produce an
// identical BlueprintSpec.

import {
  detectClosedLoops,
  pointInPolygon,
  ringArea,
  type Polygon,
  type Ring,
  type Segment as GeomSegment,
  type Vec2,
} from "../geom";
import type { Provenanced, SpaceType } from "../spec/building-spec";
import { makePolyLoop, userValue } from "./builders";
import {
  BlueprintSpecSchema,
  type BlueprintAssumption,
  type BlueprintSpec,
  type CoreIntent,
  type FidelityMode,
  type InterpretationUncertainty,
  type PointMm,
  type VoidIntent,
} from "./blueprint-spec";

/* ------------------------------------------------------------------ */
/* Input shapes — mirror the provider's "segments" request             */
/* ------------------------------------------------------------------ */

/** One measured edge, already millimetres — vector geometry, never a raster. */
export interface SegmentInputMm {
  startMm: PointMm;
  endMm: PointMm;
  /** Originating CAD/drawing layer, when known — the strongest hint available. */
  layer?: string;
}

/** A text label lifted off the drawing, in the same mm frame as the segments. */
export interface LabelInputMm {
  text: string;
  positionMm: PointMm;
  /** Text height in millimetres, when known. Informational only. */
  heightMm?: number;
}

type CoreContentValue = CoreIntent["contents"][number];
type VoidKindValue = VoidIntent["kind"]["value"];

/**
 * Per-layer classification overrides, case-insensitive on the layer name.
 * Absent ⇒ fall back to the generic regex/label heuristics below. This is
 * what lets `from-cad.ts` honour an explicit "A-WALL → boundary" mapping
 * while the plain segments path (no CAD document, no mapping) still gets a
 * genuine — just less confident — reading from layer-name substrings alone.
 */
export interface LayerRoles {
  /** Layer names whose loop becomes the boundary; largest loop otherwise. */
  boundary?: string[];
  /** Layer names whose loop becomes a `CoreIntent`. */
  core?: string[];
  /** Layer name → explicit zone program, bypassing keyword/label inference. */
  zoneProgramByLayer?: Record<string, SpaceType>;
}

export interface InterpretSegmentsOptions {
  id?: string;
  name?: string;
  source?: BlueprintSpec["source"];
  /** Levels the read boundary/voids/core/zones apply to. Default: [1]. */
  floorNos?: number[];
  fidelityMode?: FidelityMode;
  /** Endpoint-welding tolerance for loop detection, millimetres. Default 5. */
  snapToleranceMm?: number;
  /** Loops smaller than this are drafting noise, not rooms. Default 1 m². */
  minLoopAreaSqm?: number;
  /** Void area at/above this is "courtyard", below it "shaft". Default 25 m². */
  shaftMaxAreaSqm?: number;
  calibrationConfidence?: number;
  layerRoles?: LayerRoles;
}

/* ------------------------------------------------------------------ */
/* Defaults + keyword tables                                          */
/* ------------------------------------------------------------------ */

const SNAP_TOLERANCE_MM_DEFAULT = 5;
const MIN_LOOP_AREA_SQM_DEFAULT = 1;
const SHAFT_MAX_AREA_SQM_DEFAULT = 25;
const CALIBRATION_CONFIDENCE_DEFAULT = 0.9;

// Substring, not word-boundary: real layer names are compound ("A-CORE",
// "CORE-SHAFT", "ZONE_OFFICE") and a strict `\bcore\b` would miss most of them.
const CORE_LAYER_HINT = /core/i;
const ZONE_LAYER_HINT = /zone/i;

const ZONE_KEYWORDS: Array<[RegExp, SpaceType]> = [
  [/\boffice\b/i, "office-open"],
  [/\bmeeting\b/i, "meeting"],
  [/\blobby\b/i, "lobby"],
  [/\breception\b/i, "reception"],
  [/\bcorridor\b/i, "corridor"],
  [/\b(restroom|toilet|wc)\b/i, "restroom"],
  [/\b(pantry|kitchen)\b/i, "pantry"],
  [/\b(storage|store)\b/i, "storage"],
  [/\b(mechanical|mech)\b/i, "mechanical"],
  [/\b(electrical|elec)\b/i, "electrical"],
  [/\blab(?:oratory)?\b/i, "laboratory"],
  [/\b(classroom|class)\b/i, "classroom"],
  [/\b(retail|shop)\b/i, "retail"],
  [/\b(unit|apartment|dwelling|residential)\b/i, "residential-unit"],
  [/\batrium\b/i, "atrium"],
  [/\bcirculation\b/i, "circulation"],
];

const CORE_CONTENT_KEYWORDS: Array<[RegExp, CoreContentValue]> = [
  [/\bstair\b/i, "stair"],
  [/\b(elevator|lift)\b/i, "elevator"],
  [/\b(restroom|toilet|wc)\b/i, "restroom"],
  [/\blobby\b/i, "lobby"],
  [/\bshaft\b/i, "shaft"],
];

function matchFirst<T>(text: string, table: Array<[RegExp, T]>): T | null {
  for (const [pattern, value] of table) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function matchAll<T>(text: string, table: Array<[RegExp, T]>): T[] {
  const out: T[] = [];
  for (const [pattern, value] of table) {
    if (pattern.test(text) && !out.includes(value)) out.push(value);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* mm ↔ m                                                              */
/* ------------------------------------------------------------------ */

const toM = (mm: number): number => mm / 1000;
const toMm = (m: number): number => Math.round(m * 1000);
const pointToM = (p: PointMm): Vec2 => [toM(p.xMm), toM(p.zMm)];
const ringToPointsMm = (ring: Ring): PointMm[] =>
  ring.map(([x, z]): PointMm => ({ xMm: toMm(x), zMm: toMm(z) }));

function inferred<T>(value: T, reason: string, confidence: number): Provenanced<T> {
  return { value, source: "INFERRED", confidence, reason };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "blueprint";
}

/* ------------------------------------------------------------------ */
/* Layer lookup — reattach the layer a loop-detection ring loses        */
/* ------------------------------------------------------------------ */
//
// `detectClosedLoops` operates on a plain {start,end} segment soup with no
// layer field, so a ring's provenance has to be recovered by matching its
// edges back to the original input. Keyed both directions since a ring's
// winding need not match the direction the edge was originally drawn in.

function edgeKey(a: PointMm, b: PointMm): string {
  return `${a.xMm},${a.zMm}|${b.xMm},${b.zMm}`;
}

function buildLayerIndex(segments: SegmentInputMm[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const segment of segments) {
    if (!segment.layer) continue;
    index.set(edgeKey(segment.startMm, segment.endMm), segment.layer);
    index.set(edgeKey(segment.endMm, segment.startMm), segment.layer);
  }
  return index;
}

/** The most common layer among a ring's edges, or undefined if none matched. */
function dominantLayerOf(ring: Ring, layerIndex: Map<string, string>): string | undefined {
  const counts = new Map<string, number>();
  for (let i = 0; i < ring.length; i += 1) {
    const a: PointMm = { xMm: toMm(ring[i][0]), zMm: toMm(ring[i][1]) };
    const b: PointMm = {
      xMm: toMm(ring[(i + 1) % ring.length][0]),
      zMm: toMm(ring[(i + 1) % ring.length][1]),
    };
    const layer = layerIndex.get(edgeKey(a, b));
    if (!layer) continue;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [layer, count] of counts) {
    if (count > bestCount) {
      best = layer;
      bestCount = count;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Containment                                                         */
/* ------------------------------------------------------------------ */

/**
 * Every vertex AND every edge midpoint of `inner` must land inside `outer`.
 * Midpoints catch the case a purely vertex-based test misses: a concave
 * (e.g. L-shaped) boundary where two consecutive inner vertices are each
 * inside on their own but the edge between them bows outside a notch.
 */
function isFullyInside(inner: Ring, outer: Ring): boolean {
  const outerPolygon: Polygon = [outer];
  for (let i = 0; i < inner.length; i += 1) {
    const a = inner[i];
    const b = inner[(i + 1) % inner.length];
    if (!pointInPolygon(a, outerPolygon)) return false;
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (!pointInPolygon(mid, outerPolygon)) return false;
  }
  return true;
}

function findContainingLabel(ring: Ring, labels: LabelInputMm[]): LabelInputMm | undefined {
  const polygon: Polygon = [ring];
  return labels.find((label) => pointInPolygon(pointToM(label.positionMm), polygon));
}

/* ------------------------------------------------------------------ */
/* Boundary selection                                                  */
/* ------------------------------------------------------------------ */

/**
 * `loops` arrives sorted by descending area (`detectClosedLoops`'s contract).
 * Without an explicit boundary layer, the largest loop wins — the common
 * case, a traced outline is the biggest closed shape on the sheet. With one,
 * the largest loop THAT CARRIES it wins instead, so a wall layer picked by
 * the importer overrides area alone.
 */
function selectBoundary(
  loops: Ring[],
  layerRoles: LayerRoles | undefined,
  layerIndex: Map<string, string>,
): { index: number; explicit: boolean } {
  const names = layerRoles?.boundary;
  if (names && names.length > 0) {
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    let bestIndex = -1;
    let bestArea = -Infinity;
    for (let i = 0; i < loops.length; i += 1) {
      const layer = dominantLayerOf(loops[i], layerIndex);
      if (!layer || !wanted.has(layer.toLowerCase())) continue;
      const area = ringArea(loops[i]);
      if (area > bestArea) {
        bestArea = area;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) return { index: bestIndex, explicit: true };
  }
  return { index: 0, explicit: false };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Read a BlueprintSpec off a segment soup. Throws a plain `Error` (not a
 * `ProviderError` — this module has no provider-layer concerns) when no
 * closed loop exists at all; a boundary is the one thing every blueprint
 * needs, and there is nothing honest to emit without one.
 */
export function interpretSegmentsToBlueprint(
  segments: SegmentInputMm[],
  labels: LabelInputMm[] = [],
  options: InterpretSegmentsOptions = {},
): BlueprintSpec {
  const geomSegments: GeomSegment[] = segments.map((s) => ({
    start: pointToM(s.startMm),
    end: pointToM(s.endMm),
  }));

  const snapToleranceM = (options.snapToleranceMm ?? SNAP_TOLERANCE_MM_DEFAULT) / 1000;
  const minLoopAreaSqm = options.minLoopAreaSqm ?? MIN_LOOP_AREA_SQM_DEFAULT;
  const loops = detectClosedLoops(geomSegments, snapToleranceM, { minAreaSqm: minLoopAreaSqm });

  if (loops.length === 0) {
    throw new Error(
      "No closed loop was found in the supplied segments; cannot read a boundary.",
    );
  }

  const layerIndex = buildLayerIndex(segments);
  const floorNos = options.floorNos && options.floorNos.length > 0 ? options.floorNos : [1];
  const shaftMaxAreaSqm = options.shaftMaxAreaSqm ?? SHAFT_MAX_AREA_SQM_DEFAULT;

  const { index: boundaryIndex, explicit: boundaryExplicit } = selectBoundary(
    loops,
    options.layerRoles,
    layerIndex,
  );
  const boundaryRing = loops[boundaryIndex];
  const boundaryAreaSqm = ringArea(boundaryRing);
  const boundaryLayer = dominantLayerOf(boundaryRing, layerIndex);
  const boundaryLoop = makePolyLoop("boundary", ringToPointsMm(boundaryRing));

  const assumptions: BlueprintAssumption[] = [
    {
      id: "boundary-selection",
      label: "Boundary loop",
      statement: boundaryExplicit
        ? `${loops.length} closed loop(s) detected; the loop on layer "${boundaryLayer}" (~${boundaryAreaSqm.toFixed(1)} m²) was mapped to the boundary.`
        : `${loops.length} closed loop(s) detected; the largest (~${boundaryAreaSqm.toFixed(1)} m²) was read as the boundary.`,
      source: "INFERRED",
      confidence: boundaryExplicit ? 0.9 : 0.75,
    },
  ];
  const uncertainty: InterpretationUncertainty[] = [];

  const coreLayerSet = new Set((options.layerRoles?.core ?? []).map((n) => n.toLowerCase()));
  const zoneProgramByLayer = new Map<string, SpaceType>();
  for (const [layer, program] of Object.entries(options.layerRoles?.zoneProgramByLayer ?? {})) {
    zoneProgramByLayer.set(layer.toLowerCase(), program);
  }

  const voids: BlueprintSpec["voids"] = [];
  const cores: BlueprintSpec["cores"] = [];
  const zones: BlueprintSpec["zones"] = [];
  let voidSeq = 0;
  let coreSeq = 0;
  let zoneSeq = 0;
  let discardedCount = 0;

  for (let i = 0; i < loops.length; i += 1) {
    if (i === boundaryIndex) continue;
    const ring = loops[i];
    const areaSqm = ringArea(ring);

    if (!isFullyInside(ring, boundaryRing)) {
      discardedCount += 1;
      // The dropped loop is not declared anywhere else in the spec, so the
      // uncertainty note must target something that IS declared — the
      // boundary — or `validateBlueprint` reports a dangling reference.
      uncertainty.push({
        targetId: boundaryLoop.id,
        interpretation: `A loop (~${areaSqm.toFixed(1)} m²) was detected outside the primary boundary and was not incorporated.`,
        confidence: 0.3,
        evidence: "geometry",
      });
      continue;
    }

    const layer = dominantLayerOf(ring, layerIndex);
    const layerLower = layer?.toLowerCase();
    const label = findContainingLabel(ring, labels);
    const explicitCore = layerLower !== undefined && coreLayerSet.has(layerLower);
    const explicitZoneProgram =
      layerLower !== undefined ? zoneProgramByLayer.get(layerLower) : undefined;

    if (explicitCore || (layer && CORE_LAYER_HINT.test(layer))) {
      coreSeq += 1;
      const id = `core-${coreSeq}`;
      const contents = label ? matchAll(label.text, CORE_CONTENT_KEYWORDS) : [];
      cores.push({
        id,
        region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, ringToPointsMm(ring)) },
        hold: { mode: "hard" },
        floorNos,
        contents,
        ...(label ? { label: label.text.slice(0, 60) } : {}),
      });
      assumptions.push({
        id: `${id}-classification`,
        label: "Core classification",
        statement: explicitCore
          ? `Loop on layer "${layer}" mapped to the core by the import layer mapping.`
          : `Loop on layer "${layer}" classified as the core from its layer name.`,
        source: "INFERRED",
        confidence: explicitCore ? 0.9 : 0.75,
      });
      continue;
    }

    const keywordProgram = label ? matchFirst(label.text, ZONE_KEYWORDS) : null;
    const zoneByLayerHint = layer !== undefined && ZONE_LAYER_HINT.test(layer);

    if (explicitZoneProgram !== undefined || zoneByLayerHint || keywordProgram) {
      zoneSeq += 1;
      const id = `zone-${zoneSeq}`;
      const program = explicitZoneProgram ?? keywordProgram ?? "service";
      const confidence = explicitZoneProgram !== undefined ? 0.9 : keywordProgram ? 0.65 : 0.4;
      const reason =
        explicitZoneProgram !== undefined
          ? `Layer "${layer}" mapped to zone program "${explicitZoneProgram}" by the import layer mapping.`
          : label
            ? `Label "${label.text}" found inside this loop.`
            : `Layer "${layer}" name suggests a program zone; no label confirmed which.`;
      zones.push({
        id,
        program: inferred(program, reason, confidence),
        region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, ringToPointsMm(ring)) },
        floorNos,
        memberIds: [],
        ...(label ? { label: label.text.slice(0, 60) } : {}),
      });
      if (explicitZoneProgram === undefined && !keywordProgram) {
        uncertainty.push({
          targetId: id,
          interpretation: `Zone "${id}" was classified from its layer name alone; no label confirmed its program.`,
          confidence,
          evidence: "geometry",
        });
      }
      continue;
    }

    voidSeq += 1;
    const id = `void-${voidSeq}`;
    const kind: VoidKindValue = areaSqm < shaftMaxAreaSqm ? "shaft" : "courtyard";
    voids.push({
      id,
      kind: inferred(
        kind,
        `Classified by area (${areaSqm.toFixed(1)} m², shaft/courtyard threshold ${shaftMaxAreaSqm} m²).`,
        0.55,
      ),
      region: { kind: "loop", loop: makePolyLoop(`${id}-loop`, ringToPointsMm(ring)) },
      floorNos,
      ...(label ? { label: label.text.slice(0, 60) } : {}),
    });
    uncertainty.push({
      targetId: id,
      interpretation: `Void "${id}" kind (${kind}) was inferred purely from area; no layer or label confirmed it.`,
      confidence: 0.55,
      evidence: "geometry",
    });
  }

  if (discardedCount > 0) {
    assumptions.push({
      id: "discarded-loops",
      label: "Loops outside the boundary",
      statement: `${discardedCount} detected loop(s) fell outside the primary boundary and were not incorporated; see the uncertainty log.`,
      source: "INFERRED",
      confidence: 0.5,
    });
  }

  const name = options.name ?? "Imported Schematic";

  const spec: BlueprintSpec = {
    schemaVersion: 1,
    id: options.id ?? slugify(name),
    name,
    source: options.source ?? "dxf",
    coordinateSystem: {
      units: "mm",
      sourceScaleRatio: userValue(1, "Segment coordinates are already absolute millimetres."),
      method: "native",
      calibrated: true,
      calibrationConfidence: options.calibrationConfidence ?? CALIBRATION_CONFIDENCE_DEFAULT,
    },
    fidelityMode: options.fidelityMode ?? "guided",
    fidelityOverrides: [],
    boundaries: [{ loop: boundaryLoop, floorNos, role: "outline" }],
    voids,
    cores,
    anchors: [],
    axes: [],
    circulation: { nodes: [], edges: [] },
    zones,
    gridSystems: [],
    verticalRules: [],
    facadeRules: [],
    relationships: [],
    dimensions: [],
    assumptions,
    uncertainty,
  };

  // The fallback must satisfy the same contract a provider's output does —
  // a drift in the schema breaks tests here first, not silently downstream.
  return BlueprintSpecSchema.parse(spec);
}
