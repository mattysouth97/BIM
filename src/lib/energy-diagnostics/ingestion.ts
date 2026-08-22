import { parseDxfText } from "@/lib/cad/dxf-parser";

import {
  classifyDrawing,
  documentTier,
  inferRevision,
  revisionGroupStem,
} from "./classification";
import {
  createEnergyFact,
  createMissingFact,
  resolveFactCandidates,
} from "./facts";
import { polygonArea, validatePolygon } from "./geometry";
import { sha256Hex, toBytes } from "./hashing";
import { stableId } from "./ids";
import type {
  BoundingBox2D,
  CadLayerInventoryItem,
  ConflictRecord,
  DrawingDocumentType,
  DrawingFormat,
  DrawingSet,
  EnergyFact,
  EvidenceAuthority,
  EvidenceStatus,
  ExtractionMethod,
  ExtractionRun,
  MissingValueRecord,
  Point2D,
  Polygon2D,
  SourceDocument,
  SourceReference,
  UnsupportedStageRecord,
} from "./types";

export const DRAWING_INGESTION_PIPELINE_VERSION = "1.0.0" as const;
export const MAX_DRAWING_BYTES = 50 * 1024 * 1024;
export const MAX_DRAWING_PAGES = 200;

export type DrawingValidationIssue = Readonly<{
  code:
    | "empty_file"
    | "file_too_large"
    | "too_many_pages"
    | "unsafe_file_name"
    | "unsupported_extension"
    | "mime_type_mismatch"
    | "invalid_signature"
    | "active_svg_content";
  message: string;
  blocking: boolean;
}>;

/**
 * Adapter result accepted from existing schematic/DWG/SVG paths. The core does
 * not parse or reinterpret those formats a second time.
 */
export type VectorBoundaryInput = Readonly<{
  polygon: Polygon2D;
  cadLayer?: string;
  entityRef?: string;
  pageNumber?: number;
  sheetId?: string;
  confidence?: number;
}>;

export type ExtractionSignal = Readonly<{
  id?: string;
  key: string;
  value: unknown;
  unit?: string;
  status?: Exclude<EvidenceStatus, "missing">;
  confidence: number;
  extractionMethod: ExtractionMethod;
  authority: EvidenceAuthority;
  pageNumber?: number;
  sheetId?: string;
  cadLayer?: string;
  boundingBox?: BoundingBox2D;
  geometryRef?: string;
  entityRef?: string;
  originalText?: string;
  linked3dObjectId?: string;
  assumptionId?: string;
}>;

/** Source-only input. `content` is intentionally absent from all output types. */
export type DrawingSourceInput = Readonly<{
  fileName: string;
  mimeType?: string;
  content: string | ArrayBuffer | Uint8Array;
  formatHint?: DrawingFormat;
  revision?: string;
  pageCount?: number;
  userDocumentType?: DrawingDocumentType;
  textSample?: string;
  units?: string;
  drawingScale?: number;
  northOrientationDeg?: number;
  vectorBoundaries?: readonly VectorBoundaryInput[];
  extractionSignals?: readonly ExtractionSignal[];
  cadLayers?: readonly CadLayerInventoryItem[];
}>;

export type RejectedDrawingFile = Readonly<{
  fileName: string;
  byteLength: number;
  issues: readonly DrawingValidationIssue[];
}>;

export type ExtractedBoundary = Readonly<{
  id: string;
  documentId: string;
  polygon: EnergyFact<Polygon2D>;
  areaSqm: EnergyFact<number>;
  cadLayer?: string;
  entityRef?: string;
}>;

export type DrawingSetIngestionResult = Readonly<{
  drawingSet: DrawingSet;
  extractionRun: ExtractionRun;
  extractedFacts: readonly EnergyFact<unknown>[];
  extractedBoundaries: readonly ExtractedBoundary[];
  conflicts: readonly ConflictRecord[];
  missingValues: readonly MissingValueRecord[];
  rejectedFiles: readonly RejectedDrawingFile[];
}>;

export type DrawingSetIngestionOptions = Readonly<{
  setName: string;
  /** Explicit timestamp keeps fixture and retry output reproducible. */
  ingestedAt?: string;
  pipelineVersion?: string;
}>;

type PreparedSource = Readonly<{
  index: number;
  input: DrawingSourceInput;
  format: DrawingFormat;
  bytes: Uint8Array<ArrayBuffer>;
  text: string;
  contentHash: string;
  documentId: string;
  revision: string;
  revisionGroupId: string;
  classification: ReturnType<typeof classifyDrawing>;
  dxf: ReturnType<typeof parseDxfText> | null;
}>;

export function validateDrawingSource(
  input: DrawingSourceInput,
): Readonly<{
  accepted: boolean;
  format: DrawingFormat | null;
  byteLength: number;
  issues: readonly DrawingValidationIssue[];
}> {
  const bytes = toBytes(input.content);
  const issues: DrawingValidationIssue[] = [];
  const format = input.formatHint ?? inferFormat(input.fileName);

  if (bytes.byteLength === 0) {
    issues.push(issue("empty_file", "The drawing file is empty.", true));
  }
  if (bytes.byteLength > MAX_DRAWING_BYTES) {
    issues.push(
      issue(
        "file_too_large",
        `The drawing exceeds the ${MAX_DRAWING_BYTES} byte limit.`,
        true,
      ),
    );
  }
  if ((input.pageCount ?? 1) > MAX_DRAWING_PAGES) {
    issues.push(
      issue(
        "too_many_pages",
        `The drawing exceeds the ${MAX_DRAWING_PAGES} page limit.`,
        true,
      ),
    );
  }
  if (
    input.fileName.includes("..") ||
    input.fileName.includes("/") ||
    input.fileName.includes("\\")
  ) {
    issues.push(
      issue(
        "unsafe_file_name",
        "File names may not contain paths or parent-directory segments.",
        true,
      ),
    );
  }
  if (!format) {
    issues.push(
      issue(
        "unsupported_extension",
        "Supported inputs are DWG, DXF, SVG, PDF, PNG, JPEG, WEBP, TIFF, and BIMFIT data.",
        true,
      ),
    );
  }

  if (format) {
    const mimeIssue = validateMimeType(input.mimeType, format);
    if (mimeIssue) issues.push(mimeIssue);
    if (!hasExpectedSignature(bytes, format)) {
      issues.push(
        issue(
          "invalid_signature",
          `The content signature does not match ${format.toUpperCase()}.`,
          true,
        ),
      );
    }
    if (format === "svg" && containsActiveSvgContent(decodeText(bytes))) {
      issues.push(
        issue(
          "active_svg_content",
          "SVG scripts, event handlers, foreign objects, and external references are not accepted.",
          true,
        ),
      );
    }
  }

  return Object.freeze({
    accepted: Boolean(format) && !issues.some((candidate) => candidate.blocking),
    format,
    byteLength: bytes.byteLength,
    issues: Object.freeze(issues),
  });
}

export async function ingestDrawingSet(
  inputs: readonly DrawingSourceInput[],
  options: DrawingSetIngestionOptions,
): Promise<DrawingSetIngestionResult> {
  const ingestedAt = options.ingestedAt ?? "1970-01-01T00:00:00.000Z";
  const pipelineVersion = options.pipelineVersion ?? DRAWING_INGESTION_PIPELINE_VERSION;
  const rejectedFiles: RejectedDrawingFile[] = [];
  const prepared: PreparedSource[] = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const validation = validateDrawingSource(input);
    if (!validation.accepted || !validation.format) {
      rejectedFiles.push({
        fileName: input.fileName,
        byteLength: validation.byteLength,
        issues: validation.issues,
      });
      continue;
    }

    const bytes = toBytes(input.content);
    const text = decodeText(bytes);
    const contentHash = await sha256Hex(bytes);
    const revision = inferRevision(input.fileName, input.revision);
    const revisionGroupId = stableId("revision-group", revisionGroupStem(input.fileName));
    const documentId = stableId(
      "document",
      input.fileName.toLocaleLowerCase("en-US"),
      contentHash,
      index,
    );
    const textSample = input.textSample ?? text.slice(0, 64_000);
    prepared.push({
      index,
      input,
      format: validation.format,
      bytes,
      text,
      contentHash,
      documentId,
      revision,
      revisionGroupId,
      classification: classifyDrawing({
        fileName: input.fileName,
        textSample,
        userDocumentType: input.userDocumentType,
      }),
      dxf: validation.format === "dxf" ? parseDxfText(text) : null,
    });
  }

  const extractionRunId = stableId(
    "extraction-run",
    pipelineVersion,
    prepared.map((source) => source.contentHash),
  );
  const documents: SourceDocument[] = [];
  const boundaries: ExtractedBoundary[] = [];
  const rawFacts: EnergyFact<unknown>[] = [];
  const conflicts: ConflictRecord[] = [];
  const missingValues: MissingValueRecord[] = [];
  const unsupportedStages: UnsupportedStageRecord[] = [];
  const warnings: string[] = [];
  const firstDocumentByHash = new Map<string, string>();
  const latestDocumentByRevisionGroup = new Map<string, string>();

  for (const source of prepared) {
    const duplicateOfDocumentId = firstDocumentByHash.get(source.contentHash);
    if (!duplicateOfDocumentId) {
      firstDocumentByHash.set(source.contentHash, source.documentId);
    }
    const previousRevisionDocumentId = latestDocumentByRevisionGroup.get(
      source.revisionGroupId,
    );
    if (!duplicateOfDocumentId) {
      latestDocumentByRevisionGroup.set(source.revisionGroupId, source.documentId);
    }

    const baseSourceRef = sourceReference({
      id: stableId("source", source.documentId, "document"),
      documentId: source.documentId,
      drawingRevision: source.revision,
      extractionRunId,
      entityRef: "document-metadata",
    });
    const documentFacts = createDocumentFacts(source, baseSourceRef, ingestedAt);
    rawFacts.push(
      documentFacts.units,
      documentFacts.drawingScale,
      documentFacts.northOrientationDeg,
    );

    const isRaster = ["png", "jpeg", "webp", "tiff"].includes(source.format);
    const geometryDrawing = ["site_plan", "floor_plan", "elevation", "section"].includes(
      source.classification.documentType,
    );
    const needsCalibration =
      isRaster && geometryDrawing && documentFacts.drawingScale.value === null;

    const sourceBoundaries = duplicateOfDocumentId
      ? []
      : extractVectorBoundaries(
          source,
          extractionRunId,
          ingestedAt,
          warnings,
          unsupportedStages,
        );
    boundaries.push(...sourceBoundaries);
    rawFacts.push(
      ...sourceBoundaries.flatMap((boundary) => [boundary.polygon, boundary.areaSqm]),
    );

    if (duplicateOfDocumentId) {
      warnings.push(
        `${source.input.fileName} duplicates ${duplicateOfDocumentId}; extraction was reused/skipped.`,
      );
    } else {
      for (const signal of source.input.extractionSignals ?? []) {
        rawFacts.push(signalToFact(signal, source, extractionRunId, ingestedAt));
      }
    }

    if (source.classification.documentType === "unknown") {
      unsupportedStages.push(
        unsupported(
          source.documentId,
          "user_review",
          "user_review_required",
          "Drawing type could not be classified confidently; assign it before model compilation.",
          false,
        ),
      );
    }
    if (needsCalibration) {
      unsupportedStages.push(
        unsupported(
          source.documentId,
          "scale_detection",
          "calibration_required",
          "Raster geometry cannot be measured until a known length or drawing scale is confirmed.",
          true,
        ),
      );
      missingValues.push(
        missingRecord(
          `drawing.${source.documentId}.drawingScale`,
          [source.documentId],
          "geometry",
          true,
          "A raster scale calibration is required; pixel distances are not dimensions.",
          ingestedAt,
        ),
      );
    }
    if (geometryDrawing && sourceBoundaries.length === 0 && !duplicateOfDocumentId) {
      missingValues.push(
        missingRecord(
          `drawing.${source.documentId}.floorBoundary`,
          [source.documentId],
          "geometry",
          source.classification.documentType === "floor_plan",
          "No calibrated closed boundary was extracted from this geometry drawing.",
          ingestedAt,
        ),
      );
    }

    const layers = mergeCadLayers(
      source.input.cadLayers ?? [],
      source.dxf?.candidates.map((candidate) => candidate.layer) ?? [],
    );
    documents.push(
      Object.freeze({
        id: source.documentId,
        fileName: source.input.fileName,
        format: source.format,
        mimeType: source.input.mimeType ?? defaultMimeType(source.format),
        byteLength: source.bytes.byteLength,
        contentHash: source.contentHash,
        revision: source.revision,
        revisionGroupId: source.revisionGroupId,
        ...(duplicateOfDocumentId ? { duplicateOfDocumentId } : {}),
        ...(!duplicateOfDocumentId && previousRevisionDocumentId
          ? { supersedesDocumentId: previousRevisionDocumentId }
          : {}),
        classification: source.classification,
        pages: Object.freeze(
          Array.from({ length: source.input.pageCount ?? 1 }, (_, pageIndex) => ({
            id: stableId("page", source.documentId, pageIndex + 1),
            pageNumber: pageIndex + 1,
          })),
        ),
        cadLayers: layers,
        units: documentFacts.units,
        drawingScale: documentFacts.drawingScale,
        northOrientationDeg: documentFacts.northOrientationDeg,
        validationStatus: needsCalibration ? "needs_calibration" : "accepted",
        createdAt: ingestedAt,
      }),
    );
  }

  const reconciledFacts = reconcileFacts(
    rawFacts,
    conflicts,
    prepared,
    ingestedAt,
  );

  if (
    prepared.some((source) =>
      ["site_plan", "floor_plan"].includes(source.classification.documentType),
    ) &&
    !reconciledFacts.some(
      (fact) => fact.key.endsWith("northOrientationDeg") && fact.value !== null,
    )
  ) {
    missingValues.push(
      missingRecord(
        "site.northOrientationDeg",
        documents
          .filter((document) =>
            ["site_plan", "floor_plan"].includes(document.classification.documentType),
          )
          .map((document) => document.id),
        "geometry",
        true,
        "North orientation is required before orientation-sensitive simulation.",
        ingestedAt,
      ),
    );
  }

  const drawingSetId = stableId(
    "drawing-set",
    options.setName,
    prepared.map((source) => source.contentHash),
  );
  const drawingSet: DrawingSet = Object.freeze({
    id: drawingSetId,
    name: options.setName,
    tier: documents.reduce<1 | 2 | 3>(
      (highest, document) =>
        Math.max(highest, documentTier(document.classification.documentType)) as 1 | 2 | 3,
      1,
    ),
    documents: Object.freeze(documents),
    revisionGroupIds: Object.freeze(
      [...new Set(documents.map((document) => document.revisionGroupId))].sort(),
    ),
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
  });
  const extractionRun: ExtractionRun = Object.freeze({
    id: extractionRunId,
    pipelineVersion,
    sourceDocumentIds: Object.freeze(documents.map((document) => document.id)),
    sourceContentHashes: Object.freeze(documents.map((document) => document.contentHash)),
    status:
      unsupportedStages.length > 0 || warnings.length > 0
        ? "completed_with_warnings"
        : "completed",
    startedAt: ingestedAt,
    completedAt: ingestedAt,
    warnings: Object.freeze(warnings),
    unsupportedStages: Object.freeze(unsupportedStages),
  });

  return Object.freeze({
    drawingSet,
    extractionRun,
    extractedFacts: Object.freeze(reconciledFacts),
    extractedBoundaries: Object.freeze(boundaries),
    conflicts: Object.freeze(conflicts),
    missingValues: Object.freeze(missingValues),
    rejectedFiles: Object.freeze(rejectedFiles),
  });
}

function extractVectorBoundaries(
  source: PreparedSource,
  extractionRunId: string,
  createdAt: string,
  warnings: string[],
  unsupportedStages: UnsupportedStageRecord[],
): ExtractedBoundary[] {
  const adapterBoundaries = source.input.vectorBoundaries;
  const dxfBoundaries: readonly VectorBoundaryInput[] | undefined = source.dxf?.candidates.map((candidate) => ({
    polygon: candidate.polygon as Polygon2D,
    cadLayer: candidate.layer,
    entityRef: `dxf-layer:${candidate.layer}`,
    confidence: 0.98,
  }));
  const inputs = dxfBoundaries ?? adapterBoundaries ?? [];

  if (source.dxf) warnings.push(...source.dxf.warnings.map((warning) => `${source.input.fileName}: ${warning}`));
  if (inputs.length === 0) {
    const stage = ["pdf", "png", "jpeg", "webp", "tiff"].includes(source.format)
      ? "vector_geometry_extraction"
      : "vector_geometry_extraction";
    unsupportedStages.push(
      unsupported(
        source.documentId,
        stage,
        source.format === "dxf" ? "unsupported_content" : "adapter_not_available",
        source.format === "dxf"
          ? "The existing DXF parser found no valid closed vector boundary."
          : `No ${source.format.toUpperCase()} vector-adapter boundary was supplied.`,
        source.classification.documentType === "floor_plan",
      ),
    );
    return [];
  }

  const extracted: ExtractedBoundary[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const geometryFindings = validatePolygon(input.polygon);
    if (geometryFindings.length > 0) {
      unsupportedStages.push(
        unsupported(
          source.documentId,
          "vector_geometry_extraction",
          "unsupported_content",
          `Boundary ${index + 1} was rejected: ${geometryFindings
            .map((finding) => finding.message)
            .join(" ")}`,
          true,
        ),
      );
      continue;
    }
    const boundaryId = stableId(
      "boundary",
      source.documentId,
      input.cadLayer,
      input.entityRef,
      input.polygon,
    );
    const sourceRef = sourceReference({
      id: stableId("source", boundaryId),
      documentId: source.documentId,
      drawingRevision: source.revision,
      extractionRunId,
      ...(input.pageNumber ? { pageNumber: input.pageNumber } : {}),
      ...(input.sheetId ? { sheetId: input.sheetId } : {}),
      ...(input.cadLayer ? { cadLayer: input.cadLayer } : {}),
      ...(input.entityRef ? { entityRef: input.entityRef } : {}),
      geometryRef: boundaryId,
      previewCoordinates: input.polygon,
    });
    const polygon = createEnergyFact<Polygon2D>({
      key: `drawing.${source.documentId}.boundary.${index + 1}.polygon`,
      value: Object.freeze(input.polygon.map((point) => Object.freeze([...point]) as Point2D)),
      unit: "m",
      status: "extracted",
      confidence: input.confidence ?? 0.98,
      sourceRefs: [sourceRef],
      extractionMethod: "vector_geometry",
      authority: "dimensioned_vector_geometry",
      reviewedByUser: false,
      createdAt,
    });
    const areaSqm = createEnergyFact({
      key: `drawing.${source.documentId}.boundary.${index + 1}.areaSqm`,
      value: polygonArea(input.polygon),
      unit: "m2",
      status: "extracted",
      confidence: input.confidence ?? 0.98,
      sourceRefs: [sourceRef],
      extractionMethod: "vector_geometry",
      authority: "dimensioned_vector_geometry",
      reviewedByUser: false,
      createdAt,
    });
    extracted.push(
      Object.freeze({
        id: boundaryId,
        documentId: source.documentId,
        polygon,
        areaSqm,
        ...(input.cadLayer ? { cadLayer: input.cadLayer } : {}),
        ...(input.entityRef ? { entityRef: input.entityRef } : {}),
      }),
    );
  }
  return extracted;
}

function createDocumentFacts(
  source: PreparedSource,
  sourceRef: SourceReference,
  createdAt: string,
): Pick<SourceDocument, "units" | "drawingScale" | "northOrientationDeg"> {
  const dxfUnit = source.dxf ? unitNameFromScale(source.dxf.unitScaleToMeters) : null;
  const units = source.input.units
    ? userDocumentFact(
        `drawing.${source.documentId}.units`,
        source.input.units,
        undefined,
        createdAt,
      )
    : dxfUnit
      ? createEnergyFact({
          key: `drawing.${source.documentId}.units`,
          value: dxfUnit,
          status: source.dxf?.warnings.some((warning) => warning.includes("Unitless"))
            ? "defaulted"
            : "extracted",
          confidence: source.dxf?.warnings.some((warning) => warning.includes("Unitless"))
            ? 0.5
            : 0.99,
          sourceRefs: [sourceRef],
          extractionMethod: source.dxf?.warnings.some((warning) => warning.includes("Unitless"))
            ? "project_default"
            : "vector_geometry",
          authority: source.dxf?.warnings.some((warning) => warning.includes("Unitless"))
            ? "project_template"
            : "dimensioned_vector_geometry",
          ...(source.dxf?.warnings.some((warning) => warning.includes("Unitless"))
            ? { assumptionId: "assumption.dxf-unitless-as-meter" }
            : {}),
          reviewedByUser: false,
          createdAt,
        })
      : createMissingFact<string>({
          key: `drawing.${source.documentId}.units`,
          createdAt,
        });
  const drawingScale = source.input.drawingScale
    ? userDocumentFact(
        `drawing.${source.documentId}.drawingScale`,
        source.input.drawingScale,
        "ratio",
        createdAt,
      )
    : source.dxf
      ? createEnergyFact({
          key: `drawing.${source.documentId}.drawingScale`,
          value: source.dxf.unitScaleToMeters,
          unit: "m/drawing-unit",
          status: source.dxf.warnings.some((warning) => warning.includes("Unitless"))
            ? "defaulted"
            : "extracted",
          confidence: source.dxf.warnings.some((warning) => warning.includes("Unitless"))
            ? 0.5
            : 0.99,
          sourceRefs: [sourceRef],
          extractionMethod: source.dxf.warnings.some((warning) => warning.includes("Unitless"))
            ? "project_default"
            : "vector_geometry",
          authority: source.dxf.warnings.some((warning) => warning.includes("Unitless"))
            ? "project_template"
            : "dimensioned_vector_geometry",
          ...(source.dxf.warnings.some((warning) => warning.includes("Unitless"))
            ? { assumptionId: "assumption.dxf-unitless-as-meter" }
            : {}),
          reviewedByUser: false,
          createdAt,
        })
      : createMissingFact<number>({
          key: `drawing.${source.documentId}.drawingScale`,
          unit: "ratio",
          createdAt,
        });
  const northOrientationDeg = Number.isFinite(source.input.northOrientationDeg)
    ? userDocumentFact(
        `drawing.${source.documentId}.northOrientationDeg`,
        source.input.northOrientationDeg as number,
        "deg",
        createdAt,
      )
    : createMissingFact<number>({
        key: `drawing.${source.documentId}.northOrientationDeg`,
        unit: "deg",
        createdAt,
      });
  return { units, drawingScale, northOrientationDeg };
}

function signalToFact(
  signal: ExtractionSignal,
  source: PreparedSource,
  extractionRunId: string,
  createdAt: string,
): EnergyFact<unknown> {
  const sourceRef = sourceReference({
    id:
      signal.id ??
      stableId(
        "source",
        source.documentId,
        signal.key,
        signal.pageNumber,
        signal.sheetId,
        signal.entityRef,
        signal.originalText,
      ),
    documentId: source.documentId,
    drawingRevision: source.revision,
    extractionRunId,
    ...(signal.pageNumber ? { pageNumber: signal.pageNumber } : {}),
    ...(signal.sheetId ? { sheetId: signal.sheetId } : {}),
    ...(signal.cadLayer ? { cadLayer: signal.cadLayer } : {}),
    ...(signal.boundingBox ? { boundingBox: signal.boundingBox } : {}),
    ...(signal.geometryRef ? { geometryRef: signal.geometryRef } : {}),
    ...(signal.entityRef ? { entityRef: signal.entityRef } : {}),
    ...(signal.originalText ? { originalText: signal.originalText.slice(0, 1_000) } : {}),
    ...(signal.linked3dObjectId ? { linked3dObjectId: signal.linked3dObjectId } : {}),
  });
  return createEnergyFact({
    key: signal.key,
    value: signal.value,
    ...(signal.unit ? { unit: signal.unit } : {}),
    status: signal.status ?? "extracted",
    confidence: signal.confidence,
    sourceRefs: [sourceRef],
    extractionMethod: signal.extractionMethod,
    authority: signal.authority,
    ...(signal.assumptionId ? { assumptionId: signal.assumptionId } : {}),
    reviewedByUser: signal.status === "user_confirmed",
    createdAt,
  });
}

function reconcileFacts(
  facts: readonly EnergyFact<unknown>[],
  conflicts: ConflictRecord[],
  sources: readonly PreparedSource[],
  createdAt: string,
): EnergyFact<unknown>[] {
  const groups = new Map<string, EnergyFact<unknown>[]>();
  for (const fact of facts) {
    const group = groups.get(fact.key) ?? [];
    group.push(fact);
    groups.set(fact.key, group);
  }
  const revisionByDocumentId = new Map(
    sources.map((source) => [source.documentId, source.revision]),
  );
  const result: EnergyFact<unknown>[] = [];
  for (const [key, candidates] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (candidates.length === 1) {
      result.push(candidates[0]);
      continue;
    }
    const resolution = resolveFactCandidates({
      key,
      candidates,
      affectedObjectIds: candidates.flatMap((candidate) =>
        candidate.sourceRefs.map((sourceRef) => sourceRef.documentId),
      ),
      blocking: candidates.some((candidate) => candidate.status === "conflicted"),
      downstreamImpact:
        `Competing drawing values affect engine input ${key}; revisions: ` +
        candidates
          .flatMap((candidate) =>
            candidate.sourceRefs.map(
              (sourceRef) => revisionByDocumentId.get(sourceRef.documentId) ?? "unknown",
            ),
          )
          .join(", "),
      createdAt,
    });
    result.push(resolution.selected);
    if (resolution.conflict) conflicts.push(resolution.conflict);
  }
  return result;
}

function userDocumentFact<T>(
  key: string,
  value: T,
  unit: string | undefined,
  createdAt: string,
): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "user_confirmed",
    confidence: 1,
    sourceRefs: [],
    extractionMethod: "user_input",
    authority: "user_confirmed_project_value",
    reviewedByUser: true,
    createdAt,
  });
}

function sourceReference(input: SourceReference): SourceReference {
  return Object.freeze(input);
}

function missingRecord(
  key: string,
  affectedObjectIds: readonly string[],
  requiredFor: MissingValueRecord["requiredFor"],
  blocking: boolean,
  message: string,
  createdAt: string,
): MissingValueRecord {
  return Object.freeze({
    id: stableId("missing", key, affectedObjectIds),
    key,
    affectedObjectIds: Object.freeze([...affectedObjectIds]),
    requiredFor,
    blocking,
    allowedAssumptionIds: Object.freeze([]),
    message,
    createdAt,
  });
}

function unsupported(
  documentId: string,
  stage: UnsupportedStageRecord["stage"],
  reasonCode: UnsupportedStageRecord["reasonCode"],
  message: string,
  blocking: boolean,
): UnsupportedStageRecord {
  return Object.freeze({
    id: stableId("unsupported", documentId, stage, reasonCode),
    documentId,
    stage,
    reasonCode,
    message,
    blocking,
  });
}

function mergeCadLayers(
  supplied: readonly CadLayerInventoryItem[],
  parsedNames: readonly string[],
): readonly CadLayerInventoryItem[] {
  const byName = new Map(supplied.map((layer) => [layer.name, layer]));
  for (const name of parsedNames) {
    const previous = byName.get(name);
    byName.set(name, {
      name,
      entityCount: (previous?.entityCount ?? 0) + 1,
      visible: previous?.visible ?? true,
    });
  }
  return Object.freeze(
    [...byName.values()].sort((left, right) => left.name.localeCompare(right.name)),
  );
}

function inferFormat(fileName: string): DrawingFormat | null {
  const lower = fileName.toLocaleLowerCase("en-US");
  if (lower.endsWith(".bimfit-schematic.json")) return "bimfit_schematic";
  if (lower.endsWith(".bimfit-model.json")) return "bimfit_model";
  const extension = lower.split(".").pop();
  switch (extension) {
    case "dwg":
    case "dxf":
    case "svg":
    case "pdf":
    case "png":
    case "webp":
    case "tiff":
      return extension;
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "tif":
      return "tiff";
    default:
      return null;
  }
}

function hasExpectedSignature(bytes: Uint8Array, format: DrawingFormat): boolean {
  const prefix = decodeText(bytes.slice(0, Math.min(bytes.byteLength, 512))).trimStart();
  switch (format) {
    case "dxf":
      return /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\b/i.test(prefix) || prefix.includes("SECTION");
    case "dwg":
      return prefix.startsWith("AC10");
    case "svg":
      return /^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefix);
    case "pdf":
      return prefix.startsWith("%PDF-");
    case "png":
      return bytes.byteLength >= 8 && bytes[0] === 0x89 && decodeText(bytes.slice(1, 4)) === "PNG";
    case "jpeg":
      return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "webp":
      return decodeText(bytes.slice(0, 4)) === "RIFF" && decodeText(bytes.slice(8, 12)) === "WEBP";
    case "tiff":
      return (
        (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
        (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)
      );
    case "bimfit_schematic":
    case "bimfit_model":
      try {
        const parsed: unknown = JSON.parse(decodeText(bytes));
        return Boolean(parsed && typeof parsed === "object");
      } catch {
        return false;
      }
  }
}

function validateMimeType(
  mimeType: string | undefined,
  format: DrawingFormat,
): DrawingValidationIssue | null {
  if (!mimeType || mimeType === "application/octet-stream") return null;
  const expected = MIME_TYPES[format];
  return expected.includes(mimeType.toLocaleLowerCase("en-US"))
    ? null
    : issue(
        "mime_type_mismatch",
        `MIME type ${mimeType} does not match ${format.toUpperCase()}.`,
        true,
      );
}

function containsActiveSvgContent(text: string): boolean {
  return (
    /<script\b/i.test(text) ||
    /<foreignObject\b/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text) ||
    /(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(text)
  );
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function unitNameFromScale(scale: number): string {
  const known: readonly Readonly<[number, string]>[] = [
    [1, "m"],
    [0.001, "mm"],
    [0.01, "cm"],
    [0.0254, "in"],
    [0.3048, "ft"],
    [1000, "km"],
  ];
  return known.find(([candidate]) => Math.abs(candidate - scale) < 1e-12)?.[1] ?? "drawing-unit";
}

function defaultMimeType(format: DrawingFormat): string {
  return MIME_TYPES[format][0];
}

function issue(
  code: DrawingValidationIssue["code"],
  message: string,
  blocking: boolean,
): DrawingValidationIssue {
  return Object.freeze({ code, message, blocking });
}

const MIME_TYPES: Readonly<Record<DrawingFormat, readonly string[]>> = {
  dwg: ["application/acad", "application/x-acad", "application/dwg"],
  dxf: ["application/dxf", "application/x-dxf", "text/plain"],
  svg: ["image/svg+xml"],
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  tiff: ["image/tiff"],
  bimfit_schematic: ["application/json"],
  bimfit_model: ["application/json"],
};
