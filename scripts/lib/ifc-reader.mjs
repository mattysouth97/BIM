// scripts/lib/ifc-reader.mjs
//
// A thin, honest wrapper over web-ifc for build-time extraction.
//
// This exists so the extraction scripts share one set of accessors. web-ifc has
// two traps that produce silently wrong output rather than an error, and both
// are handled here exactly once:
//
//   1. `GetLine(id, ref, true)` — the "flattened" form — does not expose nested
//      entity references the way the un-flattened form does, so a traversal
//      written against it dead-ends without throwing. Always pass `false`.
//
//   2. Measures arrive as `{type, _internalValue, _representationValue, name}`,
//      NOT as `{value}`. Entity *references* use `{value}`. A `.value`-only
//      accessor therefore returns null for every length, and every area
//      computed from one silently becomes 0 — a whole building's envelope
//      reads as zero square metres with no error anywhere.
//
// Nothing here is BIMFIT-specific; it is the IFC layer only.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Read a numeric value out of whatever shape web-ifc hands back.
 *
 * Handles the measure wrapper, the reference wrapper and a bare number. Returns
 * null rather than 0 for anything unreadable: 0 is a legal length and would be
 * indistinguishable from "could not read", which is precisely the confusion
 * that makes the second trap above so expensive.
 */
export function num(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ("_representationValue" in value) {
    const parsed = Number(value._representationValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ("value" in value) {
    const parsed = Number(value.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Read a string/enum value (IFC enumerations arrive as `{value: "EXTERNAL"}`). */
export function str(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "value" in value) {
    const inner = value.value;
    return typeof inner === "string" ? inner : inner == null ? null : String(inner);
  }
  return String(value);
}

/**
 * Decode an `IfcCompoundPlaneAngleMeasure` — the shape `IfcSite.RefLatitude`
 * and `RefLongitude` use: `[degrees, minutes, seconds, millionths]`, where the
 * SIGN OF THE FIRST ELEMENT carries the whole value's sign. A naive
 * `d + m/60 + s/3600` therefore reads 71°3′35″W as −70.94° instead of −71.06°,
 * putting the site tens of kilometres away. Later elements may be absent.
 */
export function compoundAngleDeg(value) {
  const parts = value && typeof value === "object" && "value" in value ? value.value : value;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isFinite(part))) return null;
  const [degrees, minutes = 0, seconds = 0, millionths = 0] = numbers;
  const sign = Object.is(degrees, -0) || degrees < 0 ? -1 : 1;
  const magnitude =
    Math.abs(degrees) +
    Math.abs(minutes) / 60 +
    Math.abs(seconds) / 3600 +
    Math.abs(millionths) / 3_600_000_000;
  return sign * magnitude;
}

/** The expressID a reference points at, or null when the slot is empty (`$`). */
export function refId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "value" in value && typeof value.value === "number") {
    return value.value;
  }
  return null;
}

export class IfcFile {
  /** @param {import('web-ifc').IfcAPI} api */
  constructor(api, modelId, fileName) {
    this.api = api;
    this.modelId = modelId;
    this.fileName = fileName;
    this._cache = new Map();
  }

  get schema() {
    return this.api.GetModelSchema(this.modelId);
  }

  /** Un-flattened line read, memoised. See trap 1. */
  line(expressID) {
    if (expressID === null || expressID === undefined) return null;
    if (this._cache.has(expressID)) return this._cache.get(expressID);
    let value = null;
    try {
      value = this.api.GetLine(this.modelId, expressID, false);
    } catch {
      value = null;
    }
    this._cache.set(expressID, value);
    return value;
  }

  /** Follow a reference slot to the entity it names. */
  deref(slot) {
    return this.line(refId(slot));
  }

  /** Every entity of a type, as an array of lines. */
  byType(typeCode) {
    const ids = this.api.GetLineIDsWithType(this.modelId, typeCode);
    const out = [];
    for (let i = 0; i < ids.size(); i += 1) {
      const line = this.line(ids.get(i));
      if (line) out.push(line);
    }
    return out;
  }

  /** The IFC class name of a line, e.g. "IfcWallStandardCase". */
  typeName(line) {
    if (!line || typeof line.type !== "number") return null;
    return this.api.GetNameFromTypeCode(line.type);
  }

  /** `ifc://<file>#<expressID>` — the citation carried into the record. */
  ref(expressIDOrLine) {
    const id =
      typeof expressIDOrLine === "number"
        ? expressIDOrLine
        : expressIDOrLine?.expressID;
    return `ifc://${this.fileName}#${id}`;
  }

  close() {
    this.api.CloseModel(this.modelId);
  }
}

/**
 * Open one or more IFC files against a single shared WASM instance.
 *
 * `wasmDir` must end in a separator — web-ifc concatenates rather than joins.
 */
export async function openIfcFiles(paths, { wasmDir }) {
  const webIfc = await import("web-ifc");
  const api = new webIfc.IfcAPI();
  api.SetWasmPath(wasmDir, true);
  await api.Init();
  const files = [];
  for (const filePath of paths) {
    const bytes = await readFile(filePath);
    const modelId = api.OpenModel(new Uint8Array(bytes));
    files.push(new IfcFile(api, modelId, path.basename(filePath)));
  }
  return { api, files, webIfc };
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Fetch a source file into a cache directory, or reuse the cached copy.
 *
 * The cache lives outside the repository on purpose: these files are tens of
 * megabytes, they are not ours, and the committed artifact is the extracted
 * record — not the input. `expectedSha256`, once a record has been committed,
 * turns an upstream change into a loud failure instead of a silent
 * regeneration.
 */
export async function fetchSource(url, cachePath, { expectedSha256 } = {}) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  let bytes;
  if (existsSync(cachePath)) {
    bytes = await readFile(cachePath);
  } else {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(cachePath, bytes);
  }
  const digest = sha256(bytes);
  if (expectedSha256 && digest !== expectedSha256) {
    throw new Error(
      `${path.basename(cachePath)} does not match the committed record.\n` +
        `  expected sha256 ${expectedSha256}\n` +
        `  actual   sha256 ${digest}\n` +
        `The upstream file changed, or the cache is stale. Delete the cached ` +
        `copy and re-run to accept the new file deliberately — never edit the ` +
        `committed hash to make this pass.`,
    );
  }
  return { bytes, sha256: digest, byteLength: bytes.byteLength };
}

/**
 * A Git-LFS-backed file on GitHub. `raw.githubusercontent.com` serves a
 * ~133-byte pointer for these, which parses as a valid but empty IFC; the
 * `media.` host serves the real content.
 */
export function githubLfsUrl(owner, repo, ref, filePath) {
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://media.githubusercontent.com/media/${owner}/${repo}/${ref}/${encoded}`;
}
