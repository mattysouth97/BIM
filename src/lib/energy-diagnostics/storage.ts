import { get, set } from "idb-keyval";

import { sha256Hex } from "./hashing";
import {
  CANONICAL_ENERGY_MODEL_VERSION,
  type CanonicalEnergyModel,
  type EnergyFact,
  type IsoDateTime,
  type SourceReference,
} from "./types";

/**
 * IndexedDB persistence is intentionally separate from every pre-existing BIMFIT
 * store. A canonical model is one reproducible derived record; original drawing
 * bytes are content-addressed records in a different namespace.
 */
const STORAGE_NAMESPACE = "bimfit:energy-diagnostics";
const PROJECT_RECORD_KIND = "bimfit.energy-diagnostics.project";
const SOURCE_RECORD_KIND = "bimfit.energy-diagnostics.source-bytes";

export const ENERGY_DIAGNOSTICS_STORAGE_VERSION = 2 as const;
export const ENERGY_SOURCE_STORAGE_VERSION = 1 as const;

const SHA256_PATTERN = /^(?:sha256:)?([a-f\d]{64})$/i;

type StorageVersion = 1 | typeof ENERGY_DIAGNOSTICS_STORAGE_VERSION;
type UnknownRecord = Record<string, unknown>;

export type EnergyDiagnosticsStorageErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_RECORD"
  | "SAVE_FAILED"
  | "LOAD_FAILED"
  | "CORRUPT_RECORD"
  | "UNSUPPORTED_VERSION"
  | "MIGRATION_FAILED"
  | "SOURCE_SAVE_FAILED"
  | "SOURCE_LOAD_FAILED"
  | "CORRUPT_SOURCE"
  | "INVALID_CONTENT_HASH"
  | "SOURCE_HASH_MISMATCH"
  | "HASH_UNAVAILABLE";

export class EnergyDiagnosticsStorageError extends Error {
  readonly code: EnergyDiagnosticsStorageErrorCode;
  readonly recordKey?: string;

  constructor(
    code: EnergyDiagnosticsStorageErrorCode,
    message: string,
    options?: { cause?: unknown; recordKey?: string },
  ) {
    super(message, options);
    this.name = "EnergyDiagnosticsStorageError";
    this.code = code;
    this.recordKey = options?.recordKey;
  }
}

/**
 * The first storage envelope. V1 is retained as an explicit read contract so a
 * future deployment never has to guess what an older browser wrote.
 */
export type StoredEnergyDiagnosticsProjectV1 = Readonly<{
  kind: typeof PROJECT_RECORD_KIND;
  storageVersion: 1;
  savedAtIso: IsoDateTime;
  model: CanonicalEnergyModel;
}>;

/** Current envelope. Source hashes are an integrity manifest, never file bytes. */
export type StoredEnergyDiagnosticsProject = Readonly<{
  kind: typeof PROJECT_RECORD_KIND;
  storageVersion: typeof ENERGY_DIAGNOSTICS_STORAGE_VERSION;
  projectId: string;
  modelId: string;
  savedAtIso: IsoDateTime;
  sourceContentHashes: readonly string[];
  model: CanonicalEnergyModel;
}>;

type StoredEnergySourceBytes = Readonly<{
  kind: typeof SOURCE_RECORD_KIND;
  storageVersion: typeof ENERGY_SOURCE_STORAGE_VERSION;
  /** Lower-case, unprefixed SHA-256 digest. */
  contentHash: string;
  byteLength: number;
  storedAtIso: IsoDateTime;
  bytes: ArrayBuffer;
}>;

export type StoredEnergySourceDescriptor = Omit<StoredEnergySourceBytes, "bytes">;

export type SaveEnergyDiagnosticsProjectOptions = Readonly<{
  savedAtIso?: IsoDateTime;
}>;

/** Public key helpers make backup/inspection code use the exact same namespace. */
export function energyDiagnosticsProjectStorageKey(
  projectId: string,
  version: StorageVersion = ENERGY_DIAGNOSTICS_STORAGE_VERSION,
): string {
  assertIdentifier(projectId, "projectId");
  return `${STORAGE_NAMESPACE}:project:v${version}:${encodeURIComponent(projectId)}`;
}

export function energySourceStorageKey(contentHash: string): string {
  return `${STORAGE_NAMESPACE}:source:v${ENERGY_SOURCE_STORAGE_VERSION}:sha256:${normalizeContentHash(contentHash)}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new EnergyDiagnosticsStorageError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string no longer than 256 characters.`,
    );
  }
}

function normalizeContentHash(contentHash: string): string {
  if (typeof contentHash !== "string") {
    throw new EnergyDiagnosticsStorageError(
      "INVALID_CONTENT_HASH",
      "A SHA-256 content hash is required for source bytes.",
    );
  }
  const match = SHA256_PATTERN.exec(contentHash.trim());
  if (!match) {
    throw new EnergyDiagnosticsStorageError(
      "INVALID_CONTENT_HASH",
      "Source content hashes must be 64 hexadecimal SHA-256 characters (an optional sha256: prefix is accepted).",
    );
  }
  return match[1].toLowerCase();
}

function assertIsoDateTime(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO date-time string.`);
  }
}

function requiredString(record: UnknownRecord, field: string, context: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${field} must be a non-empty string.`);
  }
  return value;
}

function requiredArray(record: UnknownRecord, field: string, context: string): readonly unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) throw new Error(`${context}.${field} must be an array.`);
  return value;
}

function assertUniqueEntityIds(items: readonly unknown[], context: string): void {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) throw new Error(`${context}[${index}] must be an object.`);
    const id = requiredString(item, "id", `${context}[${index}]`);
    if (ids.has(id)) throw new Error(`${context} contains duplicate stable id "${id}".`);
    ids.add(id);
  }
}

function assertSourceReference(value: unknown, context: string): asserts value is SourceReference {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  requiredString(value, "id", context);
  requiredString(value, "documentId", context);
  requiredString(value, "drawingRevision", context);
  requiredString(value, "extractionRunId", context);
}

function assertEnergyFact(value: unknown, context: string): asserts value is EnergyFact<unknown> {
  if (!isRecord(value)) throw new Error(`${context} must be an object.`);
  requiredString(value, "id", context);
  requiredString(value, "key", context);
  requiredString(value, "status", context);
  requiredString(value, "extractionMethod", context);
  requiredString(value, "authority", context);
  if (typeof value.reviewedByUser !== "boolean") {
    throw new Error(`${context}.reviewedByUser must be boolean.`);
  }
  if (value.confidence !== null && typeof value.confidence !== "number") {
    throw new Error(`${context}.confidence must be a number or null.`);
  }
  assertIsoDateTime(value.createdAt, `${context}.createdAt`);
  assertIsoDateTime(value.updatedAt, `${context}.updatedAt`);
  const sourceRefs = requiredArray(value, "sourceRefs", context);
  for (const [index, sourceRef] of sourceRefs.entries()) {
    assertSourceReference(sourceRef, `${context}.sourceRefs[${index}]`);
  }
}

/** Canonical records must stay data-only; source binary data has its own keys. */
function assertNoBinaryValues(value: unknown): void {
  const visited = new WeakSet<object>();

  const visit = (candidate: unknown, path: string): void => {
    if (candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) {
      throw new Error(`${path} contains binary data; persist source bytes by content hash instead.`);
    }
    if (typeof Blob !== "undefined" && candidate instanceof Blob) {
      throw new Error(`${path} contains a Blob; persist source bytes by content hash instead.`);
    }
    if (typeof candidate !== "object" || candidate === null) return;
    // Canonical `facts` is an index of facts also embedded in model branches,
    // so seeing the same immutable record twice is expected and not a cycle.
    if (visited.has(candidate)) return;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(candidate)) visit(child, `${path}.${key}`);
  };

  visit(value, "model");
}

/**
 * Storage validation deliberately checks persistence-critical landmarks rather
 * than duplicating the full canonical-model validator. This catches truncation,
 * wrong versions, lost provenance, and unstable IDs without creating a second
 * interpretation of every building field.
 */
function validateCanonicalModel(value: unknown, expectedProjectId?: string): CanonicalEnergyModel {
  if (!isRecord(value)) throw new Error("model must be an object.");
  requiredString(value, "id", "model");
  if (value.schemaVersion !== CANONICAL_ENERGY_MODEL_VERSION) {
    throw new Error(
      `model.schemaVersion must be ${CANONICAL_ENERGY_MODEL_VERSION}; received ${String(value.schemaVersion)}.`,
    );
  }
  requiredString(value, "modelVersion", "model");

  if (!isRecord(value.project)) throw new Error("model.project must be an object.");
  const projectId = requiredString(value.project, "id", "model.project");
  requiredString(value.project, "name", "model.project");
  if (value.project.locale !== "ko" && value.project.locale !== "en") {
    throw new Error("model.project.locale must be ko or en.");
  }
  if (expectedProjectId !== undefined && projectId !== expectedProjectId) {
    throw new Error(
      `The record key names project "${expectedProjectId}" but the canonical model names "${projectId}".`,
    );
  }

  if (!isRecord(value.drawingSet)) throw new Error("model.drawingSet must be an object.");
  requiredString(value.drawingSet, "id", "model.drawingSet");
  const documents = requiredArray(value.drawingSet, "documents", "model.drawingSet");
  assertUniqueEntityIds(documents, "model.drawingSet.documents");
  for (const [index, document] of documents.entries()) {
    if (!isRecord(document)) throw new Error(`model.drawingSet.documents[${index}] must be an object.`);
    requiredString(document, "fileName", `model.drawingSet.documents[${index}]`);
    normalizeContentHash(requiredString(document, "contentHash", `model.drawingSet.documents[${index}]`));
    if (!Number.isInteger(document.byteLength) || (document.byteLength as number) < 0) {
      throw new Error(`model.drawingSet.documents[${index}].byteLength must be a non-negative integer.`);
    }
  }

  const extractionRuns = requiredArray(value, "extractionRuns", "model");
  const facts = requiredArray(value, "facts", "model");
  const conflicts = requiredArray(value, "conflicts", "model");
  const missingValues = requiredArray(value, "missingValues", "model");
  const assumptions = requiredArray(value, "assumptions", "model");
  const scenarios = requiredArray(value, "scenarios", "model");
  const simulationRuns = requiredArray(value, "simulationRuns", "model");

  assertUniqueEntityIds(extractionRuns, "model.extractionRuns");
  assertUniqueEntityIds(facts, "model.facts");
  assertUniqueEntityIds(conflicts, "model.conflicts");
  assertUniqueEntityIds(missingValues, "model.missingValues");
  assertUniqueEntityIds(assumptions, "model.assumptions");
  assertUniqueEntityIds(scenarios, "model.scenarios");
  assertUniqueEntityIds(simulationRuns, "model.simulationRuns");

  for (const [index, fact] of facts.entries()) assertEnergyFact(fact, `model.facts[${index}]`);
  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    if (!isRecord(scenario)) continue;
    requiredString(scenario, "baselineModelId", `model.scenarios[${scenarioIndex}]`);
    const deltas = requiredArray(scenario, "deltas", `model.scenarios[${scenarioIndex}]`);
    assertUniqueEntityIds(deltas, `model.scenarios[${scenarioIndex}].deltas`);
    for (const [deltaIndex, delta] of deltas.entries()) {
      if (!isRecord(delta)) continue;
      requiredString(delta, "path", `model.scenarios[${scenarioIndex}].deltas[${deltaIndex}]`);
      requiredString(delta, "baselineFactId", `model.scenarios[${scenarioIndex}].deltas[${deltaIndex}]`);
      assertEnergyFact(
        delta.replacement,
        `model.scenarios[${scenarioIndex}].deltas[${deltaIndex}].replacement`,
      );
    }
  }
  for (const [runIndex, run] of simulationRuns.entries()) {
    if (!isRecord(run)) continue;
    requiredString(run, "modelId", `model.simulationRuns[${runIndex}]`);
    requiredString(run, "scenarioId", `model.simulationRuns[${runIndex}]`);
    if (!isRecord(run.engineInput)) {
      throw new Error(`model.simulationRuns[${runIndex}].engineInput must be an object.`);
    }
    requiredString(run.engineInput, "inputHash", `model.simulationRuns[${runIndex}].engineInput`);
    requiredString(run.engineInput, "engineId", `model.simulationRuns[${runIndex}].engineInput`);
    requiredString(run.engineInput, "engineVersion", `model.simulationRuns[${runIndex}].engineInput`);
    requiredString(run.engineInput, "adapterVersion", `model.simulationRuns[${runIndex}].engineInput`);
  }

  assertNoBinaryValues(value);
  return value as CanonicalEnergyModel;
}

function sourceContentHashesFor(model: CanonicalEnergyModel): readonly string[] {
  return [
    ...new Set(model.drawingSet.documents.map((document) => normalizeContentHash(document.contentHash))),
  ].sort();
}

function currentRecordFor(
  model: CanonicalEnergyModel,
  savedAtIso: IsoDateTime,
): StoredEnergyDiagnosticsProject {
  return {
    kind: PROJECT_RECORD_KIND,
    storageVersion: ENERGY_DIAGNOSTICS_STORAGE_VERSION,
    projectId: model.project.id,
    modelId: model.id,
    savedAtIso,
    sourceContentHashes: sourceContentHashesFor(model),
    model,
  };
}

function corruptRecord(key: string, cause: unknown): EnergyDiagnosticsStorageError {
  const detail = cause instanceof Error ? ` ${cause.message}` : "";
  return new EnergyDiagnosticsStorageError(
    "CORRUPT_RECORD",
    `The saved energy-diagnostics project at "${key}" is incomplete or corrupt.${detail}`,
    { cause, recordKey: key },
  );
}

function parseCurrentRecord(
  raw: unknown,
  key: string,
  expectedProjectId: string,
): StoredEnergyDiagnosticsProject {
  try {
    if (!isRecord(raw)) throw new Error("The storage envelope is not an object.");
    if (raw.kind !== PROJECT_RECORD_KIND) throw new Error("The storage record kind is invalid.");
    if (raw.storageVersion !== ENERGY_DIAGNOSTICS_STORAGE_VERSION) {
      if (typeof raw.storageVersion === "number") {
        throw new EnergyDiagnosticsStorageError(
          "UNSUPPORTED_VERSION",
          `Energy-diagnostics storage version ${raw.storageVersion} is not supported.`,
          { recordKey: key },
        );
      }
      throw new Error("The storage version is missing.");
    }
    assertIsoDateTime(raw.savedAtIso, "savedAtIso");
    if (raw.projectId !== expectedProjectId) throw new Error("projectId does not match its key.");
    const model = validateCanonicalModel(raw.model, expectedProjectId);
    if (raw.modelId !== model.id) throw new Error("modelId does not match the canonical model.");
    if (!Array.isArray(raw.sourceContentHashes)) throw new Error("sourceContentHashes must be an array.");
    const storedHashes = raw.sourceContentHashes.map((hash) => normalizeContentHash(String(hash))).sort();
    const modelHashes = sourceContentHashesFor(model);
    if (
      storedHashes.length !== modelHashes.length ||
      storedHashes.some((hash, index) => hash !== modelHashes[index])
    ) {
      throw new Error("The source hash manifest does not match the drawing set.");
    }
    return raw as StoredEnergyDiagnosticsProject;
  } catch (cause) {
    if (cause instanceof EnergyDiagnosticsStorageError && cause.code === "UNSUPPORTED_VERSION") {
      throw cause;
    }
    throw corruptRecord(key, cause);
  }
}

function parseV1Record(
  raw: unknown,
  key: string,
  expectedProjectId: string,
): StoredEnergyDiagnosticsProjectV1 {
  try {
    if (!isRecord(raw)) throw new Error("The storage envelope is not an object.");
    if (raw.kind !== PROJECT_RECORD_KIND) throw new Error("The storage record kind is invalid.");
    if (raw.storageVersion !== 1) {
      if (typeof raw.storageVersion === "number") {
        throw new EnergyDiagnosticsStorageError(
          "UNSUPPORTED_VERSION",
          `Energy-diagnostics storage version ${raw.storageVersion} is not supported.`,
          { recordKey: key },
        );
      }
      throw new Error("The storage version is missing.");
    }
    assertIsoDateTime(raw.savedAtIso, "savedAtIso");
    validateCanonicalModel(raw.model, expectedProjectId);
    return raw as StoredEnergyDiagnosticsProjectV1;
  } catch (cause) {
    if (cause instanceof EnergyDiagnosticsStorageError && cause.code === "UNSUPPORTED_VERSION") {
      throw cause;
    }
    throw corruptRecord(key, cause);
  }
}

export async function saveEnergyDiagnosticsProject(
  model: CanonicalEnergyModel,
  options: SaveEnergyDiagnosticsProjectOptions = {},
): Promise<StoredEnergyDiagnosticsProject> {
  let validated: CanonicalEnergyModel;
  let savedAtIso: string;
  try {
    validated = validateCanonicalModel(model);
    savedAtIso = options.savedAtIso ?? new Date().toISOString();
    assertIsoDateTime(savedAtIso, "savedAtIso");
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "INVALID_RECORD",
      `The canonical energy model cannot be persisted. ${cause instanceof Error ? cause.message : ""}`.trim(),
      { cause },
    );
  }

  const record = currentRecordFor(validated, savedAtIso);
  const key = energyDiagnosticsProjectStorageKey(validated.project.id);
  try {
    await set(key, record);
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "SAVE_FAILED",
      "The energy-diagnostics project could not be saved to this browser's storage.",
      { cause, recordKey: key },
    );
  }
  return record;
}

async function readStoredValue(key: string): Promise<unknown> {
  try {
    return await get<unknown>(key);
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "LOAD_FAILED",
      "This browser's energy-diagnostics storage could not be read.",
      { cause, recordKey: key },
    );
  }
}

/**
 * Loads the current record, or validates and copy-migrates V1. The V1 key is
 * deliberately retained as a recovery copy; migration never deletes the only
 * known-good project.
 */
export async function loadEnergyDiagnosticsProjectRecord(
  projectId: string,
): Promise<StoredEnergyDiagnosticsProject | null> {
  assertIdentifier(projectId, "projectId");
  const currentKey = energyDiagnosticsProjectStorageKey(projectId);
  const current = await readStoredValue(currentKey);
  if (current !== undefined && current !== null) {
    return parseCurrentRecord(current, currentKey, projectId);
  }

  const v1Key = energyDiagnosticsProjectStorageKey(projectId, 1);
  const legacy = await readStoredValue(v1Key);
  if (legacy === undefined || legacy === null) return null;

  const validV1 = parseV1Record(legacy, v1Key, projectId);
  const migrated = currentRecordFor(validV1.model, validV1.savedAtIso);
  try {
    await set(currentKey, migrated);
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "MIGRATION_FAILED",
      "The V1 energy-diagnostics project is valid, but a recoverable V2 copy could not be saved.",
      { cause, recordKey: currentKey },
    );
  }
  return migrated;
}

export async function loadEnergyDiagnosticsProject(
  projectId: string,
): Promise<CanonicalEnergyModel | null> {
  return (await loadEnergyDiagnosticsProjectRecord(projectId))?.model ?? null;
}

function copyBytes(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

export async function computeSourceContentHash(
  bytes: ArrayBuffer | Uint8Array,
): Promise<string> {
  const copied = copyBytes(bytes);
  try {
    return await sha256Hex(copied);
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "HASH_UNAVAILABLE",
      "SHA-256 could not be computed in this runtime; source bytes were not persisted.",
      { cause },
    );
  }
}

export async function saveEnergySourceBytes(input: Readonly<{
  contentHash: string;
  bytes: ArrayBuffer | Uint8Array;
  storedAtIso?: IsoDateTime;
}>): Promise<StoredEnergySourceDescriptor> {
  const contentHash = normalizeContentHash(input.contentHash);
  const bytes = copyBytes(input.bytes);
  const computedHash = await computeSourceContentHash(bytes);
  if (computedHash !== contentHash) {
    throw new EnergyDiagnosticsStorageError(
      "SOURCE_HASH_MISMATCH",
      `Source bytes hash to ${computedHash}, not the declared ${contentHash}; nothing was saved.`,
    );
  }

  const storedAtIso = input.storedAtIso ?? new Date().toISOString();
  try {
    assertIsoDateTime(storedAtIso, "storedAtIso");
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "INVALID_ARGUMENT",
      "storedAtIso must be an ISO date-time string.",
      { cause },
    );
  }

  const record: StoredEnergySourceBytes = {
    kind: SOURCE_RECORD_KIND,
    storageVersion: ENERGY_SOURCE_STORAGE_VERSION,
    contentHash,
    byteLength: bytes.byteLength,
    storedAtIso,
    bytes,
  };
  const key = energySourceStorageKey(contentHash);
  try {
    await set(key, record);
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "SOURCE_SAVE_FAILED",
      "The source drawing bytes could not be saved to this browser's storage.",
      { cause, recordKey: key },
    );
  }

  const { bytes: _bytes, ...descriptor } = record;
  return descriptor;
}

function parseSourceRecord(raw: unknown, key: string, expectedHash: string): StoredEnergySourceBytes {
  try {
    if (!isRecord(raw)) throw new Error("The source envelope is not an object.");
    if (raw.kind !== SOURCE_RECORD_KIND) throw new Error("The source record kind is invalid.");
    if (raw.storageVersion !== ENERGY_SOURCE_STORAGE_VERSION) {
      throw new Error(`Source storage version ${String(raw.storageVersion)} is unsupported.`);
    }
    if (normalizeContentHash(String(raw.contentHash)) !== expectedHash) {
      throw new Error("The source hash does not match its key.");
    }
    if (!(raw.bytes instanceof ArrayBuffer)) throw new Error("The source byte buffer is missing.");
    if (!Number.isInteger(raw.byteLength) || raw.byteLength !== raw.bytes.byteLength) {
      throw new Error("The source byte length is inconsistent.");
    }
    assertIsoDateTime(raw.storedAtIso, "storedAtIso");
    return raw as StoredEnergySourceBytes;
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "CORRUPT_SOURCE",
      `The source drawing record at "${key}" is incomplete or corrupt.`,
      { cause, recordKey: key },
    );
  }
}

/** Returns a defensive copy and verifies the bytes still match their key. */
export async function loadEnergySourceBytes(contentHash: string): Promise<ArrayBuffer | null> {
  const normalizedHash = normalizeContentHash(contentHash);
  const key = energySourceStorageKey(normalizedHash);
  let raw: unknown;
  try {
    raw = await get<unknown>(key);
  } catch (cause) {
    throw new EnergyDiagnosticsStorageError(
      "SOURCE_LOAD_FAILED",
      "This browser's source drawing storage could not be read.",
      { cause, recordKey: key },
    );
  }
  if (raw === undefined || raw === null) return null;

  const record = parseSourceRecord(raw, key, normalizedHash);
  const actualHash = await computeSourceContentHash(record.bytes);
  if (actualHash !== normalizedHash) {
    throw new EnergyDiagnosticsStorageError(
      "CORRUPT_SOURCE",
      `The source drawing bytes at "${key}" no longer match their content hash.`,
      { recordKey: key },
    );
  }
  return record.bytes.slice(0);
}
