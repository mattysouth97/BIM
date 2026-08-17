// src/lib/generative/blueprint/import-svg-file.ts
//
// SVG drawing → reviewable BlueprintSpec, with a report of exactly how the
// reading was made. The SVG counterpart of `import-cad-file.ts`, and
// deliberately NOT a fork of it: the vocabulary (`CadLayerRole`,
// `CadLayerAssignments`), the role-guess policy (`summariseLayerCounts`), the
// failure classification (`classifyImportFailure`), the report shape
// (`CadImportReport`) and the interpretation core (`interpretSegments`) are all
// the SAME symbols the DXF/DWG path uses, so the import dialog drives both
// sources through one mapping table, one preview and one adoption step.
//
// What differs is only what genuinely differs between the two formats:
//
//   LAYERS. SVG has no DXF layer table. `from-svg.ts` defines an element's
//   "layer" as its own `data-layer` (falling back to `id`), inherited down
//   through `<g>` ancestors — so a `<g data-layer="A-WALL">` behaves like a
//   DXF layer grouping its children. Geometry with no `data-layer`/`id`
//   anywhere up its ancestor chain carries NO layer: it cannot be assigned a
//   role and cannot be ignored, but it still takes part in loop detection.
//   That is reported (`SvgReadFacts.unlayeredSegmentCount`), never hidden.
//
//   COUNTS. The SVG seam (`svgToSegments`) yields edges, not entities, so a
//   layer's "entityCount" here is its EDGE count, and its closed-shape count /
//   largest closed area are obtained by running the SAME loop detector the
//   import itself uses over that layer's own edges. `textCount` is
//   structurally 0: `LabelInputMm` carries no layer, so per-layer text
//   attribution does not exist at this seam — the count is therefore never
//   rendered as a number for SVG (the dialog shows "—") and the document-level
//   label count is reported in `SvgReadFacts.labelCount` instead.
//
//   UNITS. A DXF can declare `$INSUNITS`; an SVG never declares a real-world
//   unit at all — a user unit is just a number. So the scale can only come
//   from the person importing the file, and this module reports it that way:
//   left at the default (1 user unit = 1 mm) it is an ASSUMPTION with a
//   confidence below `validate-blueprint`'s 0.5 calibration floor, so the
//   editor raises SCALE_UNCALIBRATED; set explicitly it is an importer-stated
//   calibration, recorded as such — never as something the file said.
//
// Pure and deterministic: no Math.random, no Date.now, no network. The same
// SVG text and the same assignments always produce a byte-identical blueprint
// and report.

import { detectClosedLoops, ringArea, type Segment as GeomSegment } from "../geom";
import type { SpaceType } from "../spec/building-spec";

import {
  BlueprintSpecSchema,
  type BlueprintSpec,
  type FidelityMode,
} from "./blueprint-spec";
import {
  interpretSegments,
  type LabelInputMm,
  type SegmentInputMm,
} from "./from-segments";
import { svgToSegments } from "./from-svg";
import {
  classifyImportFailure,
  DEFAULT_ZONE_PROGRAM,
  summariseLayerCounts,
  toCadLayerMapping,
  type CadImportReport,
  type CadLayerAssignments,
  type CadLayerRole,
  type CadLayerSummary,
  type CadSkippedEntities,
  type LayerCounts,
} from "./import-cad-file";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * Scale is the one decision an SVG cannot make for itself. `svgUnitsToMm`
 * defaults to 1 and that default means "uncalibrated", not "millimetres" —
 * see `from-svg.ts`'s "UNITS IN" header.
 */
export interface SvgScaleDecision {
  svgUnitsToMm: number;
  /** True when the person importing SET the scale; false = default left alone. */
  confirmed: boolean;
  /** The scale decision in words. Always present — an SVG never declares units. */
  statement: string;
  calibrationConfidence: number;
}

/** Facts about the read that have no DXF equivalent, so no place in the shared report. */
export interface SvgReadFacts {
  /** Edges the SVG yielded, after `ignore` layers were dropped. */
  segmentCount: number;
  /** Edges dropped because their layer was mapped to "ignore". */
  ignoredSegmentCount: number;
  /**
   * Edges carrying no `data-layer`/`id` at all. They cannot be assigned a role
   * and cannot be ignored, but they DO take part in loop detection.
   */
  unlayeredSegmentCount: number;
  /** `<text>` labels read. Not attributable to a layer at this seam. */
  labelCount: number;
  scale: SvgScaleDecision;
}

/** The shared report, plus the SVG-only facts. Still a `CadImportReport`. */
export interface SvgImportReport extends CadImportReport {
  svg: SvgReadFacts;
}

/** The CAD failure codes, plus the one failure only a text format can have. */
export type SvgImportErrorCode =
  | "SVG_MALFORMED"
  | "NO_ENTITIES"
  | "NO_BOUNDARY_LAYER"
  | "NO_CLOSED_LOOPS"
  | "BOUNDARY_LAYER_HAS_NO_CLOSED_LOOP"
  | "COORDINATES_OUT_OF_RANGE"
  | "IMPORT_FAILED";

export interface SvgImportError {
  code: SvgImportErrorCode;
  message: string;
}

export type SvgImportOutcome =
  | { ok: true; blueprint: BlueprintSpec; report: SvgImportReport }
  | { ok: false; error: SvgImportError; report: SvgImportReport };

export interface SvgImportOptions {
  fileName?: string;
  name?: string;
  /** 1 SVG user unit = this many millimetres. Default 1 (= uncalibrated). */
  svgUnitsToMm?: number;
  /** True when the importer set the scale; false ⇒ the default was assumed. */
  scaleConfirmed?: boolean;
  floorNos?: number[];
  fidelityMode?: FidelityMode;
  snapToleranceMm?: number;
  minLoopAreaSqm?: number;
}

/**
 * Confidence in an importer-stated scale. Above `validate-blueprint`'s 0.5
 * floor (the person said so, and nothing else could have), but below the 0.95
 * a DXF's own `$INSUNITS` header earns — a typed number is not a measurement.
 */
const STATED_SCALE_CONFIDENCE = 0.75;
/**
 * Confidence in the untouched default. Deliberately the same 0.4 an
 * assumed-unit DXF gets, and for the same reason: below the calibration floor,
 * so the import arrives carrying a visible SCALE_UNCALIBRATED issue.
 */
const ASSUMED_SCALE_CONFIDENCE = 0.4;

/** Loop-detection defaults, mirrored from `from-segments.ts` so the per-layer
 * summary counts the same loops the import itself will find. */
const SNAP_TOLERANCE_MM_DEFAULT = 5;
const MIN_LOOP_AREA_SQM_DEFAULT = 1;

/* ------------------------------------------------------------------ */
/* Scale                                                               */
/* ------------------------------------------------------------------ */

export function decideSvgScale(
  svgUnitsToMm = 1,
  scaleConfirmed = false,
): SvgScaleDecision {
  return {
    svgUnitsToMm,
    confirmed: scaleConfirmed,
    statement: scaleConfirmed
      ? `Scale supplied at import: 1 SVG user unit = ${svgUnitsToMm} mm. The file itself declares no real-world unit — this is your statement, not the drawing's.`
      : `The SVG declares no real-world unit and no scale was given, so 1 user unit was ASSUMED to be 1 mm.`,
    calibrationConfidence: scaleConfirmed
      ? STATED_SCALE_CONFIDENCE
      : ASSUMED_SCALE_CONFIDENCE,
  };
}

/* ------------------------------------------------------------------ */
/* Layer inspection                                                    */
/* ------------------------------------------------------------------ */

const toGeom = (segment: SegmentInputMm): GeomSegment => ({
  start: [segment.startMm.xMm / 1000, segment.startMm.zMm / 1000],
  end: [segment.endMm.xMm / 1000, segment.endMm.zMm / 1000],
});

/**
 * Per-layer edge counts, plus the closed shapes each layer forms ON ITS OWN —
 * found with the same detector, tolerance and minimum area the import uses, so
 * the "largest closed shape" a boundary guess rests on is a loop that really
 * would be detected, not a bounding-box estimate.
 */
export function svgLayerCounts(
  segments: SegmentInputMm[],
  options: { snapToleranceMm?: number; minLoopAreaSqm?: number } = {},
): Map<string, LayerCounts> {
  const toleranceM = (options.snapToleranceMm ?? SNAP_TOLERANCE_MM_DEFAULT) / 1000;
  const minAreaSqm = options.minLoopAreaSqm ?? MIN_LOOP_AREA_SQM_DEFAULT;

  const byLayer = new Map<string, SegmentInputMm[]>();
  for (const segment of segments) {
    if (!segment.layer) continue;
    const bucket = byLayer.get(segment.layer);
    if (bucket) bucket.push(segment);
    else byLayer.set(segment.layer, [segment]);
  }

  const counts = new Map<string, LayerCounts>();
  for (const [layer, layerSegments] of byLayer) {
    const loops = detectClosedLoops(layerSegments.map(toGeom), toleranceM, {
      minAreaSqm,
    });
    counts.set(layer, {
      entityCount: layerSegments.length,
      closedShapeCount: loops.length,
      // No per-layer text attribution exists at this seam — see the header.
      textCount: 0,
      largestClosedAreaSqm: loops.reduce((max, ring) => Math.max(max, ringArea(ring)), 0),
    });
  }
  return counts;
}

/**
 * Every layer in the SVG with its counts and the role GUESSED for it — the
 * same guess policy the DXF path uses, applied to SVG-derived counts. A guess,
 * returned for confirmation; nothing here applies it.
 */
export function summariseSvgLayers(
  segments: SegmentInputMm[],
  options: { snapToleranceMm?: number; minLoopAreaSqm?: number } = {},
): CadLayerSummary[] {
  return summariseLayerCounts(svgLayerCounts(segments, options));
}

/** The guessed assignments alone, keyed by `data-layer`/`id`. */
export function guessSvgLayerAssignments(
  segments: SegmentInputMm[],
  options: { snapToleranceMm?: number; minLoopAreaSqm?: number } = {},
): CadLayerAssignments {
  const out: CadLayerAssignments = {};
  for (const summary of summariseSvgLayers(segments, options)) {
    out[summary.name] = summary.guess;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "imported-schematic";
}

/** The report shape for a failure that happened before anything could be read. */
function emptyReport(
  fileName: string | undefined,
  scale: SvgScaleDecision,
): SvgImportReport {
  return {
    documentId: fileName ?? "svg",
    ...(fileName ? { fileName } : {}),
    layers: [],
    mapping: [],
    loops: {
      detected: 0,
      boundary: 0,
      void: 0,
      core: 0,
      zone: 0,
      circulation: 0,
      outsideBoundary: 0,
    },
    boundaryAreaSqm: 0,
    skipped: [],
    units: unitDecisionOf(scale),
    parserWarnings: [],
    svg: {
      segmentCount: 0,
      ignoredSegmentCount: 0,
      unlayeredSegmentCount: 0,
      labelCount: 0,
      scale,
    },
  };
}

/**
 * The shared `CadUnitDecision`, filled honestly for a format with no unit
 * header: `declared` is ALWAYS false — an SVG never declares a real-world unit
 * — and `assumption` therefore always carries the scale's provenance, so every
 * consumer of the shared report (dialog summary, inspector) states where the
 * number came from instead of implying the file supplied it.
 */
function unitDecisionOf(scale: SvgScaleDecision): CadImportReport["units"] {
  return {
    unitScaleToMeters: scale.svgUnitsToMm / 1000,
    metersToMillimetres: 1000,
    declared: false,
    assumption: scale.statement,
    calibrationConfidence: scale.calibrationConfidence,
  };
}

/**
 * Read an SVG document into a BlueprintSpec under an explicit layer mapping,
 * and report what that read did.
 *
 * Failure is returned, never thrown, and never papered over: malformed SVG
 * comes back as SVG_MALFORMED carrying the parser's own message (`from-svg.ts`
 * throws rather than guessing), and a boundary layer holding no closed loop
 * fails rather than quietly promoting some other loop.
 */
export function importSvgString(
  svg: string,
  assignments: CadLayerAssignments,
  options: SvgImportOptions = {},
): SvgImportOutcome {
  const scale = decideSvgScale(options.svgUnitsToMm ?? 1, options.scaleConfirmed ?? false);
  const fileName = options.fileName;

  let read: { segments: SegmentInputMm[]; labels: LabelInputMm[] };
  try {
    read = svgToSegments(svg, scale.svgUnitsToMm);
  } catch (caught) {
    return {
      ok: false,
      error: {
        code: "SVG_MALFORMED",
        message: caught instanceof Error ? caught.message : String(caught),
      },
      report: emptyReport(fileName, scale),
    };
  }

  const { segments: allSegments, labels } = read;
  const loopOptions = {
    ...(options.snapToleranceMm !== undefined
      ? { snapToleranceMm: options.snapToleranceMm }
      : {}),
    ...(options.minLoopAreaSqm !== undefined
      ? { minLoopAreaSqm: options.minLoopAreaSqm }
      : {}),
  };

  const layerCounts = svgLayerCounts(allSegments, loopOptions);
  const summaries = summariseLayerCounts(layerCounts);
  const mapping = toCadLayerMapping(assignments);
  const ignored = new Set((mapping.ignore ?? []).map((name) => name.toLowerCase()));

  // "ignore" drops GEOMETRY before loop detection, exactly as on the CAD path;
  // labels are not layer-bound here, so they are all still read.
  const segments = allSegments.filter(
    (segment) => !(segment.layer && ignored.has(segment.layer.toLowerCase())),
  );

  const unlayeredSegmentCount = allSegments.filter((segment) => !segment.layer).length;
  const facts: SvgReadFacts = {
    segmentCount: segments.length,
    ignoredSegmentCount: allSegments.length - segments.length,
    unlayeredSegmentCount,
    labelCount: labels.length,
    scale,
  };

  const mappingRows = [...layerCounts.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((layer) => {
      const assignment = assignments[layer] ?? { role: "ignore" as CadLayerRole };
      return {
        layer,
        role: assignment.role,
        ...(assignment.role === "zone"
          ? { program: assignment.program ?? DEFAULT_ZONE_PROGRAM }
          : {}),
        entityCount: layerCounts.get(layer)?.entityCount ?? 0,
      };
    });

  const skipped: CadSkippedEntities[] = [...layerCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .filter(([layer]) => (assignments[layer]?.role ?? "ignore") === "ignore")
    .map(([layer, counts]) => ({
      reason: "layer-ignored" as const,
      // "— edges" because an SVG layer's countable unit is an edge, not a
      // DXF entity; the shared renderers print `count · subject`.
      subject: `${layer} — edges`,
      count: counts.entityCount,
    }));

  const baseReport: SvgImportReport = {
    documentId: fileName ?? "svg",
    ...(fileName ? { fileName } : {}),
    layers: summaries,
    mapping: mappingRows,
    loops: {
      detected: 0,
      boundary: 0,
      void: 0,
      core: 0,
      zone: 0,
      circulation: 0,
      outsideBoundary: 0,
    },
    boundaryAreaSqm: 0,
    skipped,
    units: unitDecisionOf(scale),
    parserWarnings: [],
    svg: facts,
  };

  if (allSegments.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_ENTITIES",
        message:
          "The SVG parsed but holds no geometry this reader supports (<line>, <polyline>, <polygon>, <rect>, <path>). <circle>, <ellipse>, <image> and <use> references are not read.",
      },
      report: baseReport,
    };
  }

  const boundaryLayers = mapping.boundary ?? [];
  if (boundaryLayers.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_BOUNDARY_LAYER",
        message:
          "No layer is mapped to the boundary. The floor plate outline has to come from a data-layer/id you name — it will not be guessed from the largest shape on the sheet.",
      },
      report: baseReport,
    };
  }

  // Circulation rides the zone channel with a fixed program — the same merge
  // `from-cad.ts` performs, so the interpreter keeps one zone concept.
  const zoneProgramByLayer: Record<string, SpaceType> = { ...(mapping.zone ?? {}) };
  for (const layer of mapping.circulation ?? []) zoneProgramByLayer[layer] = "circulation";

  const name = options.name ?? fileName ?? "svg";

  let interpreted: ReturnType<typeof interpretSegments>;
  try {
    interpreted = interpretSegments(segments, labels, {
      id: slugify(name),
      name,
      source: "svg",
      ...(options.floorNos ? { floorNos: options.floorNos } : {}),
      ...(options.fidelityMode ? { fidelityMode: options.fidelityMode } : {}),
      ...loopOptions,
      calibrationConfidence: scale.calibrationConfidence,
      layerRoles: {
        boundary: mapping.boundary,
        core: mapping.core,
        void: mapping.void,
        zoneProgramByLayer,
      },
    });
  } catch (caught) {
    return {
      ok: false,
      error: classifyImportFailure(caught, boundaryLayers),
      report: baseReport,
    };
  }

  const { blueprint, stats } = interpreted;

  if (!stats.boundaryExplicit) {
    return {
      ok: false,
      error: {
        code: "BOUNDARY_LAYER_HAS_NO_CLOSED_LOOP",
        message: `${stats.loopsDetected} closed loop(s) were found, but none of them lie on the boundary layer(s) ${boundaryLayers.join(
          ", ",
        )}. No other loop was substituted.`,
      },
      report: {
        ...baseReport,
        loops: { ...baseReport.loops, detected: stats.loopsDetected },
      },
    };
  }

  const circulationZones = blueprint.zones.filter(
    (zone) => zone.program.value === "circulation",
  ).length;

  const report: SvgImportReport = {
    ...baseReport,
    loops: {
      detected: stats.loopsDetected,
      boundary: blueprint.boundaries.length,
      void: blueprint.voids.length,
      core: blueprint.cores.length,
      zone: blueprint.zones.length - circulationZones,
      circulation: circulationZones,
      outsideBoundary: stats.loopsOutsideBoundary,
    },
    ...(stats.boundaryLayer !== undefined ? { boundaryLayer: stats.boundaryLayer } : {}),
    boundaryAreaSqm: stats.boundaryAreaSqm,
    skipped: [
      ...baseReport.skipped,
      ...(stats.loopsOutsideBoundary > 0
        ? [
            {
              reason: "loop-outside-boundary" as const,
              subject: "closed loops",
              count: stats.loopsOutsideBoundary,
            },
          ]
        : []),
    ],
  };

  return { ok: true, blueprint: withScaleProvenance(blueprint, scale), report };
}

/**
 * Stamp the scale decision onto the spec. An untouched default is marked
 * uncalibrated with method "assumed", which is what makes the editor's issues
 * panel raise SCALE_UNCALIBRATED. A scale the importer stated is recorded as
 * "explicit-dimension" — the closest `ScaleMethod` to "a stated dimension was
 * trusted" — and its assumption entry names the importer, not the file, as the
 * source, because an SVG never carries a real-world unit of its own.
 */
function withScaleProvenance(
  blueprint: BlueprintSpec,
  scale: SvgScaleDecision,
): BlueprintSpec {
  const boundaryId = blueprint.boundaries[0]?.loop.id;

  const next: BlueprintSpec = {
    ...blueprint,
    coordinateSystem: {
      ...blueprint.coordinateSystem,
      method: scale.confirmed ? "explicit-dimension" : "assumed",
      calibrated: scale.confirmed,
      calibrationConfidence: scale.calibrationConfidence,
    },
    assumptions: [
      ...blueprint.assumptions,
      {
        id: "svg-scale",
        label: "SVG unit scale",
        statement: `${scale.statement} Coordinates were multiplied by ${scale.svgUnitsToMm} to reach millimetres.`,
        source: scale.confirmed ? "USER_PROVIDED" : "INFERRED",
        confidence: scale.calibrationConfidence,
      },
    ],
    uncertainty:
      scale.confirmed || boundaryId === undefined
        ? blueprint.uncertainty
        : [
            ...blueprint.uncertainty,
            {
              targetId: boundaryId,
              interpretation:
                "Every dimension rests on an assumed 1 user unit = 1 mm; the SVG never declared a unit. Confirm one known length before treating sizes as absolute.",
              confidence: scale.calibrationConfidence,
              evidence: "inferred" as const,
            },
          ],
  };

  return BlueprintSpecSchema.parse(next);
}
