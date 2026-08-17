// src/lib/generative/blueprint/import-cad-file.ts
//
// CAD drawing → reviewable BlueprintSpec, with a report of exactly how the
// reading was made. Pure and deterministic: no Math.random, no Date.now, no
// network — the same CadDocument and the same assignments always produce a
// byte-identical blueprint and report.
//
// The module answers three questions the UI has to be able to ask BEFORE the
// user adopts anything:
//
//   1. what is in this file?      — `summariseLayers`: layer, entity counts,
//                                    closed-shape count, largest closed area
//   2. what would it be read as?  — `guessLayerAssignments`: a GUESS, returned
//                                    for confirmation. Nothing here applies it.
//   3. what did the read produce? — `importCadDocument`: blueprint + report of
//                                    loops per role, skipped entities and why,
//                                    and the unit/scale decision.
//
// UNITS. `CadDocument` coordinates are already metres (`map-dxf-to-doc.ts`
// applied the `$INSUNITS` scale once). This module therefore only converts
// metres → millimetres (×1000) inside `from-cad.ts`, and NEVER re-applies
// `unitScaleToMeters`. What it does decide is how much that scale can be
// trusted: a file that declared its units is calibrated; a file that declared
// none had metres ASSUMED for it, which is recorded as an assumption, a
// lowered calibration confidence, and an uncertainty entry on the boundary.

import { ZodError } from "zod";

import type { CadDocument, CadEntity } from "@/lib/cad/doc/types";
import { entityToChains } from "@/lib/cad/doc/entity-geometry";

import type { SpaceType } from "../spec/building-spec";
import {
  BlueprintSpecSchema,
  type BlueprintSpec,
  type FidelityMode,
} from "./blueprint-spec";
import { interpretCadDocument, type CadLayerMapping } from "./from-cad";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** What one CAD layer is taken to mean. "ignore" drops it before loop detection. */
export type CadLayerRole =
  | "boundary"
  | "void"
  | "core"
  | "zone"
  | "circulation"
  | "ignore";

export const CAD_LAYER_ROLES: CadLayerRole[] = [
  "boundary",
  "void",
  "core",
  "zone",
  "circulation",
  "ignore",
];

export interface CadLayerAssignment {
  role: CadLayerRole;
  /** Only meaningful for role "zone". */
  program?: SpaceType;
}

/** Layer name → assignment. Keys are the layer names as they appear in the file. */
export type CadLayerAssignments = Record<string, CadLayerAssignment>;

/** Why a layer carries the role it does. Never hidden from the user. */
export type CadLayerGuessBasis =
  /** A keyword in the layer name matched the table below. */
  | "layer-name"
  /** No name matched boundary, so the largest closed shape was NOMINATED. */
  | "largest-closed-shape"
  /** Nothing matched; the layer is left out unless the user says otherwise. */
  | "no-match";

export interface CadLayerSummary {
  name: string;
  /** Entities on this layer, after block flattening. */
  entityCount: number;
  /** Closed shapes (closed polylines, circles, full ellipses) — loop candidates. */
  closedShapeCount: number;
  /** TEXT/MTEXT entities: labels, not geometry. */
  textCount: number;
  /** Area of the largest closed shape on the layer, m². 0 when there is none. */
  largestClosedAreaSqm: number;
  guess: CadLayerAssignment;
  basis: CadLayerGuessBasis;
}

/** Program a zone-role layer starts with until the user picks another. */
export const DEFAULT_ZONE_PROGRAM: SpaceType = "office-open";

/**
 * Layer-name heuristics, in precedence order: most specific first, so a
 * compound name like "CORE-WALL" reads as a core rather than an outline.
 * Matching is case-insensitive substring — real layer names are compound
 * ("A-WALL-EXT", "코어-1") and a word-boundary match would miss most of them.
 */
export const LAYER_NAME_HEURISTICS: Array<{
  pattern: RegExp;
  role: Exclude<CadLayerRole, "ignore">;
}> = [
  { pattern: /core|코어/i, role: "core" },
  { pattern: /atrium|court|void/i, role: "void" },
  { pattern: /corridor|circulation/i, role: "circulation" },
  { pattern: /zone|room|공간/i, role: "zone" },
  { pattern: /wall|outline|boundary|외벽/i, role: "boundary" },
];

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export interface CadUnitDecision {
  /** Raw `$INSUNITS` the file declared; undefined when the header was absent. */
  insUnits?: number;
  /** Metres per drawing unit the CAD parser applied. */
  unitScaleToMeters: number;
  /** CadDocument metres → blueprint millimetres. Always 1000, stated not implied. */
  metersToMillimetres: 1000;
  /** True when the file named its units. False ⇒ metres were assumed for it. */
  declared: boolean;
  /** Present only when `declared` is false — what was assumed, in words. */
  assumption?: string;
  calibrationConfidence: number;
}

export type CadSkipReason =
  /**
   * The layer was mapped to "ignore" (or left unassigned), so its GEOMETRY was
   * dropped before loop detection. `count` is that geometry only — text on an
   * ignored layer is still read as a label and is therefore not "skipped".
   */
  | "layer-ignored"
  /** The DXF entity type has no CadDocument equivalent — it never parsed. */
  | "unsupported-dxf-type"
  /** A closed loop was detected outside the boundary and not incorporated. */
  | "loop-outside-boundary";

export interface CadSkippedEntities {
  reason: CadSkipReason;
  /** Layer name for "layer-ignored"; DXF type for "unsupported-dxf-type". */
  subject: string;
  count: number;
}

export interface CadImportReport {
  documentId: string;
  fileName?: string;
  /** Every layer in the file, its counts, and the role that was guessed for it. */
  layers: CadLayerSummary[];
  /** The assignments actually used, layer by layer. */
  mapping: Array<{
    layer: string;
    role: CadLayerRole;
    program?: SpaceType;
    entityCount: number;
  }>;
  /** Closed loops the interpreter detected, and how many reached each role. */
  loops: {
    detected: number;
    boundary: number;
    void: number;
    core: number;
    zone: number;
    circulation: number;
    outsideBoundary: number;
  };
  /** Dominant layer of the loop that became the boundary, when recoverable. */
  boundaryLayer?: string;
  boundaryAreaSqm: number;
  skipped: CadSkippedEntities[];
  units: CadUnitDecision;
  /** Warnings the CAD parser itself raised (unitless file, SPLINE approximation…). */
  parserWarnings: string[];
}

export type CadImportErrorCode =
  | "NO_ENTITIES"
  | "NO_BOUNDARY_LAYER"
  | "NO_CLOSED_LOOPS"
  | "BOUNDARY_LAYER_HAS_NO_CLOSED_LOOP"
  | "COORDINATES_OUT_OF_RANGE"
  | "IMPORT_FAILED";

export interface CadImportError {
  code: CadImportErrorCode;
  message: string;
}

export type CadImportOutcome =
  | { ok: true; blueprint: BlueprintSpec; report: CadImportReport }
  | { ok: false; error: CadImportError; report: CadImportReport };

export interface CadImportOptions {
  /** Shown in the report and used as the blueprint name when none is given. */
  fileName?: string;
  name?: string;
  floorNos?: number[];
  fidelityMode?: FidelityMode;
  snapToleranceMm?: number;
  minLoopAreaSqm?: number;
}

/* ------------------------------------------------------------------ */
/* Layer inspection                                                    */
/* ------------------------------------------------------------------ */

/** Shoelace area of a closed chain, m². */
function chainAreaSqm(chain: Array<{ x: number; y: number }>): number {
  if (chain.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < chain.length; i += 1) {
    const a = chain[i];
    const b = chain[(i + 1) % chain.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** True for entities that enclose an area on their own — the loop candidates. */
function isClosedShape(entity: CadEntity): boolean {
  return (
    (entity.kind === "polyline" && entity.closed) ||
    entity.kind === "circle" ||
    entity.kind === "ellipse"
  );
}

function closedAreaSqm(entity: CadEntity): number {
  if (!isClosedShape(entity)) return 0;
  const chains = entityToChains(entity);
  return chains.length > 0 ? chainAreaSqm(chains[0]) : 0;
}

interface LayerCounts {
  entityCount: number;
  closedShapeCount: number;
  textCount: number;
  largestClosedAreaSqm: number;
}

function countByLayer(doc: CadDocument): Map<string, LayerCounts> {
  const counts = new Map<string, LayerCounts>();
  const bucket = (name: string): LayerCounts => {
    const existing = counts.get(name);
    if (existing) return existing;
    const fresh: LayerCounts = {
      entityCount: 0,
      closedShapeCount: 0,
      textCount: 0,
      largestClosedAreaSqm: 0,
    };
    counts.set(name, fresh);
    return fresh;
  };

  // Declared layers appear even when empty — an empty layer is information too.
  for (const layer of doc.layers) bucket(layer.name);

  for (const entity of doc.entities) {
    const entry = bucket(entity.layer);
    entry.entityCount += 1;
    if (entity.kind === "text") entry.textCount += 1;
    if (isClosedShape(entity)) {
      entry.closedShapeCount += 1;
      entry.largestClosedAreaSqm = Math.max(
        entry.largestClosedAreaSqm,
        closedAreaSqm(entity),
      );
    }
  }
  return counts;
}

function heuristicRole(layerName: string): Exclude<CadLayerRole, "ignore"> | null {
  for (const { pattern, role } of LAYER_NAME_HEURISTICS) {
    if (pattern.test(layerName)) return role;
  }
  return null;
}

/**
 * Guess a role for every layer — a proposal for the user to confirm, never an
 * application. Name matching first; then, ONLY if no layer name suggested a
 * boundary, the unmatched layer holding the largest closed shape is nominated
 * as one (flagged `largest-closed-shape`, so the UI can say the guess came
 * from geometry rather than from a name). A drawing with neither gets no
 * boundary guess at all rather than a fabricated one.
 */
export function summariseLayers(doc: CadDocument): CadLayerSummary[] {
  const counts = countByLayer(doc);
  const summaries: CadLayerSummary[] = [...counts.entries()]
    .map(([name, c]) => {
      const role = heuristicRole(name);
      return {
        name,
        entityCount: c.entityCount,
        closedShapeCount: c.closedShapeCount,
        textCount: c.textCount,
        largestClosedAreaSqm: c.largestClosedAreaSqm,
        guess: {
          role: (role ?? "ignore") as CadLayerRole,
          ...(role === "zone" ? { program: DEFAULT_ZONE_PROGRAM } : {}),
        },
        basis: (role ? "layer-name" : "no-match") as CadLayerGuessBasis,
      };
    })
    // Stable order, independent of entity order in the file.
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  if (!summaries.some((s) => s.guess.role === "boundary")) {
    let nominee: CadLayerSummary | null = null;
    for (const summary of summaries) {
      if (summary.basis !== "no-match" || summary.largestClosedAreaSqm <= 0) continue;
      if (!nominee || summary.largestClosedAreaSqm > nominee.largestClosedAreaSqm) {
        nominee = summary;
      }
    }
    if (nominee) {
      nominee.guess = { role: "boundary" };
      nominee.basis = "largest-closed-shape";
    }
  }

  return summaries;
}

/** The guessed assignments alone, keyed by layer name. */
export function guessLayerAssignments(doc: CadDocument): CadLayerAssignments {
  const out: CadLayerAssignments = {};
  for (const summary of summariseLayers(doc)) out[summary.name] = summary.guess;
  return out;
}

/** Assignments → the layer convention `from-cad.ts` consumes. */
export function toCadLayerMapping(
  assignments: CadLayerAssignments,
): CadLayerMapping {
  const boundary: string[] = [];
  const core: string[] = [];
  const voidLayers: string[] = [];
  const circulation: string[] = [];
  const ignore: string[] = [];
  const zone: Record<string, SpaceType> = {};

  for (const [layer, assignment] of Object.entries(assignments)) {
    switch (assignment.role) {
      case "boundary":
        boundary.push(layer);
        break;
      case "core":
        core.push(layer);
        break;
      case "void":
        voidLayers.push(layer);
        break;
      case "circulation":
        circulation.push(layer);
        break;
      case "zone":
        zone[layer] = assignment.program ?? DEFAULT_ZONE_PROGRAM;
        break;
      case "ignore":
        ignore.push(layer);
        break;
    }
  }

  return { boundary, core, void: voidLayers, circulation, zone, ignore };
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/** Confidence when the file named its units; the scale is a reading, not a guess. */
const DECLARED_CONFIDENCE = 0.95;
/**
 * Confidence when units were assumed. Deliberately below
 * `validate-blueprint`'s 0.5 calibration floor, so an assumed-unit import
 * arrives carrying a visible SCALE_UNCALIBRATED issue instead of passing as
 * measured.
 */
const ASSUMED_CONFIDENCE = 0.4;

export function decideUnits(doc: CadDocument): CadUnitDecision {
  const declared = doc.insUnits !== undefined && doc.insUnits !== 0;
  return {
    ...(doc.insUnits !== undefined ? { insUnits: doc.insUnits } : {}),
    unitScaleToMeters: doc.unitScaleToMeters,
    metersToMillimetres: 1000,
    declared,
    ...(declared
      ? {}
      : {
          assumption:
            doc.insUnits === 0
              ? "The file declares itself unitless ($INSUNITS = 0); drawing units were read as metres."
              : "The file carries no $INSUNITS header; drawing units were read as metres.",
        }),
    calibrationConfidence: declared ? DECLARED_CONFIDENCE : ASSUMED_CONFIDENCE,
  };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

function skippedFromDocument(
  doc: CadDocument,
  assignments: CadLayerAssignments,
  layerCounts: Map<string, LayerCounts>,
): CadSkippedEntities[] {
  const out: CadSkippedEntities[] = [];

  for (const [layer, counts] of [...layerCounts.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    const role = assignments[layer]?.role ?? "ignore";
    const geometryCount = counts.entityCount - counts.textCount;
    if (role !== "ignore" || geometryCount === 0) continue;
    out.push({ reason: "layer-ignored", subject: layer, count: geometryCount });
  }

  for (const [type, count] of Object.entries(doc.stats.skipped).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    out.push({ reason: "unsupported-dxf-type", subject: type, count });
  }

  return out;
}

/**
 * Name the failure for what it is. `interpretSegments` throws exactly one
 * Error — no closed loop anywhere; a Zod range failure on a coordinate means
 * the drawing's units are almost certainly misdeclared; anything else is
 * reported verbatim rather than dressed up as one of those two.
 */
function classifyFailure(caught: unknown, boundaryLayers: string[]): CadImportError {
  if (caught instanceof ZodError) {
    const outOfRange = caught.issues.some(
      (issue) =>
        (issue.code === "too_big" || issue.code === "too_small") &&
        issue.path.some((key) => key === "xMm" || key === "zMm"),
    );
    if (outOfRange) {
      return {
        code: "COORDINATES_OUT_OF_RANGE",
        message:
          "The interpreted geometry falls outside the ±100 km plan frame, which usually means the drawing's units are misdeclared. Check $INSUNITS in the source file.",
      };
    }
    return {
      code: "IMPORT_FAILED",
      message: `The interpreted blueprint failed its own schema: ${caught.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
        .join("; ")}`,
    };
  }

  if (caught instanceof Error && caught.message.startsWith("No closed loop")) {
    return {
      code: "NO_CLOSED_LOOPS",
      message: `No closed loop was found in the mapped geometry (boundary layer(s): ${
        boundaryLayers.join(", ") || "none"
      }). Lines that only look joined must actually share endpoints — Join them in the CAD viewer first.`,
    };
  }

  return {
    code: "IMPORT_FAILED",
    message: caught instanceof Error ? caught.message : String(caught),
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "imported-schematic";
}

/**
 * Read a parsed CAD document into a BlueprintSpec under an explicit layer
 * mapping, and report what that read did.
 *
 * Failure is returned, never thrown, and never papered over: if the layers
 * mapped to "boundary" hold no closed loop, the largest loop from some other
 * layer is NOT substituted — the import fails and says which layer was empty.
 */
export function importCadDocument(
  doc: CadDocument,
  assignments: CadLayerAssignments,
  options: CadImportOptions = {},
): CadImportOutcome {
  const layerCounts = countByLayer(doc);
  const summaries = summariseLayers(doc);
  const units = decideUnits(doc);
  const mapping = toCadLayerMapping(assignments);

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

  const baseReport: CadImportReport = {
    documentId: doc.id,
    ...(options.fileName ? { fileName: options.fileName } : {}),
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
    skipped: skippedFromDocument(doc, assignments, layerCounts),
    units,
    parserWarnings: [...doc.warnings],
  };

  if (doc.entities.length === 0) {
    return {
      ok: false,
      error: {
        code: "NO_ENTITIES",
        message:
          "The drawing parsed but contains no geometry the CAD reader understands, so there is nothing to interpret.",
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
          "No layer is mapped to the boundary. The floor plate outline has to come from a layer you name — it will not be guessed from the largest shape on the sheet.",
      },
      report: baseReport,
    };
  }

  const name = options.name ?? options.fileName ?? doc.id;

  let read: ReturnType<typeof interpretCadDocument>;
  try {
    read = interpretCadDocument(doc, mapping, {
      id: slugify(name),
      name,
      source: "dxf",
      ...(options.floorNos ? { floorNos: options.floorNos } : {}),
      ...(options.fidelityMode ? { fidelityMode: options.fidelityMode } : {}),
      ...(options.snapToleranceMm !== undefined
        ? { snapToleranceMm: options.snapToleranceMm }
        : {}),
      ...(options.minLoopAreaSqm !== undefined
        ? { minLoopAreaSqm: options.minLoopAreaSqm }
        : {}),
      calibrationConfidence: units.calibrationConfidence,
    });
  } catch (caught) {
    return { ok: false, error: classifyFailure(caught, boundaryLayers), report: baseReport };
  }

  const { blueprint, stats } = read;

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

  const report: CadImportReport = {
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

  return { ok: true, blueprint: withUnitProvenance(blueprint, units), report };
}

/**
 * Stamp the scale decision onto the spec. An assumed-unit import is marked
 * uncalibrated with method "assumed", which is what makes the editor's issues
 * panel raise SCALE_UNCALIBRATED — the alternative, claiming "native" mm for a
 * file that never said what its numbers meant, is the silent fallback this
 * pipeline exists to avoid.
 */
function withUnitProvenance(
  blueprint: BlueprintSpec,
  units: CadUnitDecision,
): BlueprintSpec {
  const boundaryId = blueprint.boundaries[0]?.loop.id;

  const next: BlueprintSpec = {
    ...blueprint,
    coordinateSystem: {
      ...blueprint.coordinateSystem,
      method: units.declared ? "native" : "assumed",
      calibrated: units.declared,
      calibrationConfidence: units.calibrationConfidence,
    },
    assumptions: [
      ...blueprint.assumptions,
      {
        id: "cad-units",
        label: "Drawing units",
        statement: units.declared
          ? `The file declared $INSUNITS = ${units.insUnits} (${units.unitScaleToMeters} m per drawing unit); metres were converted to millimetres ×1000.`
          : `${units.assumption} Metres were then converted to millimetres ×1000.`,
        source: units.declared ? "DERIVED" : "INFERRED",
        confidence: units.calibrationConfidence,
      },
    ],
    uncertainty:
      units.declared || boundaryId === undefined
        ? blueprint.uncertainty
        : [
            ...blueprint.uncertainty,
            {
              targetId: boundaryId,
              interpretation:
                "Every dimension rests on an assumed metre unit; the file never declared one. Confirm one known length before treating sizes as absolute.",
              confidence: units.calibrationConfidence,
              evidence: "inferred" as const,
            },
          ],
  };

  return BlueprintSpecSchema.parse(next);
}
