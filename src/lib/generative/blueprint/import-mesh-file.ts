// src/lib/generative/blueprint/import-mesh-file.ts
//
// The mesh path's equivalent of `import-cad-file.ts` / `import-svg-file.ts`:
// it takes the mesh a DXF turned out to hold, runs the real extraction, and
// returns the blueprint together with a `CadImportReport` — the same report
// shape the dialog, the store's import provenance and the inspector already
// speak. One report type means a mesh import is auditable exactly like a 2D
// one, with the fields that cannot apply left honestly empty rather than
// filled with plausible-looking zeros.
//
// WHAT IS EMPTY, AND WHY.
//   · `layers` and `mapping` are `[]`. A mesh has CAD layers, but no layer of
//     a mesh is a boundary/void/core the way a drawn layer is — the roles are
//     produced by cutting the solid, not by naming a layer. Offering a role
//     table here would be a control that changes nothing.
//   · `loops` counts what the extraction actually produced.
//
// Units are decided by `decideUnits`, the same function the 2D importer uses,
// and stamped onto the spec the same way: a file that declared `$INSUNITS` is
// calibrated; one that did not gets an assumption, a lowered confidence and an
// uncertainty entry, so an uncalibrated mesh import arrives carrying
// SCALE_UNCALIBRATED instead of passing as measured.

import { ZodError } from "zod";

import type { MeshFaceStats } from "@/lib/cad/doc/extract-mesh-faces";

import { BlueprintSpecSchema, type BlueprintSpec } from "./blueprint-spec";
import {
  extractBlueprintFromMesh,
  meshStats,
  type MeshExtractionFacts,
  type MeshFace,
  type MeshStats,
} from "./from-mesh";
import {
  decideUnits,
  type CadImportReport,
  type CadSkippedEntities,
  type CadUnitDecision,
} from "./import-cad-file";

/** Everything the reader learned about a mesh-only drawing. */
export interface MeshDrawing {
  /** Faces in metres, plan XY, Z up. */
  faces: MeshFace[];
  /** Height range, triangle counts, suggested cut height and storey estimate. */
  stats: MeshStats;
  /** Per-entity extraction counts, including types nothing could read. */
  extraction: MeshFaceStats;
  /** The CadDocument id the 2D read used — the file name it was given. */
  documentId: string;
  insUnits?: number;
  unitScaleToMeters: number;
  /** Warnings from the DXF parse and the mesh read. */
  parserWarnings: string[];
}

export interface MeshImportOptions {
  fileName?: string;
  name?: string;
  /** Cut height in METRES. Defaults to `stats.suggestedSliceZ`. */
  sliceZ?: number;
  /** True ⇒ skip the cut and read the projected footprint. */
  useProjection?: boolean;
  floorNos?: number[];
}

export type MeshImportErrorCode =
  | "NO_MESH_FACES"
  | "MESH_NO_CLOSED_BOUNDARY"
  | "IMPORT_FAILED";

export interface MeshImportError {
  code: MeshImportErrorCode;
  message: string;
  detail: string[];
}

export type MeshImportOutcome =
  | {
      ok: true;
      blueprint: BlueprintSpec;
      report: CadImportReport;
      facts: MeshExtractionFacts;
    }
  | { ok: false; error: MeshImportError; report: CadImportReport };

function skippedFromExtraction(extraction: MeshFaceStats): CadSkippedEntities[] {
  return Object.entries(extraction.unreadEntityTypes)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([subject, count]) => ({
      reason: "unsupported-dxf-type" as const,
      subject,
      count,
    }));
}

function baseReport(mesh: MeshDrawing, units: CadUnitDecision, fileName?: string): CadImportReport {
  return {
    documentId: mesh.documentId,
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
    skipped: skippedFromExtraction(mesh.extraction),
    units,
    parserWarnings: [...mesh.parserWarnings],
  };
}

/**
 * Stamp the unit decision onto a mesh-derived spec. Identical policy to the 2D
 * importer's: an assumed unit is marked `"assumed"` and uncalibrated, never
 * dressed up as native millimetres.
 */
function withUnitProvenance(
  blueprint: BlueprintSpec,
  units: CadUnitDecision,
): BlueprintSpec {
  const boundaryId = blueprint.boundaries[0]?.loop.id;
  return BlueprintSpecSchema.parse({
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
          ? `The file declared $INSUNITS = ${units.insUnits} (${units.unitScaleToMeters} m per drawing unit); the mesh was read at that scale and metres converted to millimetres ×1000.`
          : `${units.assumption} The mesh was read at that scale, then metres converted to millimetres ×1000.`,
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
  });
}

/** Read the mesh a DXF holds into a reviewable blueprint. Never throws. */
export function importMeshDrawing(
  mesh: MeshDrawing,
  options: MeshImportOptions = {},
): MeshImportOutcome {
  const units = decideUnits(mesh);
  const report = baseReport(mesh, units, options.fileName);
  const name = options.name ?? options.fileName ?? mesh.documentId;

  const outcome = extractBlueprintFromMesh(mesh.faces, {
    name,
    unitScaleAlreadyApplied: true,
    ...(options.sliceZ !== undefined ? { sliceZ: options.sliceZ } : {}),
    method: options.useProjection ? "projection" : "auto",
    ...(options.floorNos ? { floorNos: options.floorNos } : {}),
    source: "dxf",
    calibrationConfidence: units.calibrationConfidence,
  });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error, report };
  }

  let blueprint: BlueprintSpec;
  try {
    blueprint = withUnitProvenance(outcome.blueprint, units);
  } catch (caught) {
    return {
      ok: false,
      report,
      error: {
        code: "IMPORT_FAILED",
        message:
          caught instanceof ZodError
            ? `The extracted blueprint failed its own schema: ${caught.issues
                .slice(0, 3)
                .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
                .join("; ")}`
            : caught instanceof Error
              ? caught.message
              : String(caught),
        detail: [],
      },
    };
  }

  return {
    ok: true,
    blueprint,
    facts: outcome.facts,
    report: {
      ...report,
      loops: {
        ...report.loops,
        detected: outcome.facts.loopsDetected,
        boundary: blueprint.boundaries.length,
        void: blueprint.voids.length,
        core: blueprint.cores.length,
        zone: blueprint.zones.length,
      },
      boundaryAreaSqm: outcome.facts.boundaryAreaSqm,
    },
  };
}

/** Mesh faces + the file facts around them → the `MeshDrawing` the dialog holds. */
export function toMeshDrawing(input: {
  faces: MeshFace[];
  extraction: MeshFaceStats;
  documentId: string;
  insUnits?: number;
  unitScaleToMeters: number;
  parserWarnings: string[];
}): MeshDrawing {
  return {
    faces: input.faces,
    stats: meshStats(input.faces),
    extraction: input.extraction,
    documentId: input.documentId,
    ...(input.insUnits !== undefined ? { insUnits: input.insUnits } : {}),
    unitScaleToMeters: input.unitScaleToMeters,
    parserWarnings: [...input.parserWarnings],
  };
}
