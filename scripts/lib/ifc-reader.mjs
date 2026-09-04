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

/** SI prefixes IFC may put on a unit, as a multiplier of the base unit. */
const SI_PREFIX = Object.freeze({
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3,
  HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3,
  MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
});

/**
 * How many metres one file length unit is, and square metres per area unit.
 *
 * Nothing under `scripts/lib/` read `IfcUnitAssignment` until 2026-09-04, and
 * the Clinic is in metres, so every length attribute happened to be right —
 * by luck, not by handling. bim-bf ran the same code against a millimetre file
 * and `extractStoreys` reported storeys at **-1000 m** with a 3000 m
 * floor-to-floor. A file in feet would have been subtler and worse.
 *
 * **This applies to ATTRIBUTE lengths only** — `IfcBuildingStorey.Elevation`,
 * `IfcMaterialLayer.LayerThickness`, quantity values. It must NEVER be applied
 * to geometry: web-ifc's tessellation and `flatTransformation` already come
 * back in metres whatever the file declares, so scaling those would break the
 * models that currently work.
 *
 * Length and area are read INDEPENDENTLY rather than one derived from the
 * other. They genuinely disagree in the wild: Schependomlaan declares
 * `LENGTHUNIT` as MILLI.METRE and `AREAUNIT` as plain SQUARE_METRE, so
 * squaring the length scale would divide every area by a million.
 */
export function readUnits(api, webIfc, modelID) {
  const result = {
    lengthToMetres: 1,
    areaToSquareMetres: 1,
    lengthUnitName: null,
    areaUnitName: null,
    /** True when the file states no unit and the default was assumed. */
    lengthAssumed: true,
    areaAssumed: true,
  };

  const assignments = api.GetLineIDsWithType(modelID, webIfc.IFCUNITASSIGNMENT);
  for (let a = 0; a < assignments.size(); a += 1) {
    const assignment = api.GetLine(modelID, assignments.get(a), false);
    const units = assignment?.Units ?? [];
    for (const entry of units) {
      const id = refId(entry);
      if (id === null) continue;
      const unit = api.GetLine(modelID, id, false);
      if (!unit) continue;
      const unitType = String(str(unit.UnitType) ?? "");
      const typeName = api.GetNameFromTypeCode(unit.type);

      if (typeName === "IfcSIUnit") {
        const prefix = str(unit.Prefix);
        const factor = prefix ? (SI_PREFIX[String(prefix)] ?? 1) : 1;
        if (unitType.includes("LENGTHUNIT")) {
          result.lengthToMetres = factor;
          result.lengthUnitName = `${prefix ?? ""}${str(unit.Name) ?? ""}`;
          result.lengthAssumed = false;
        } else if (unitType.includes("AREAUNIT")) {
          // An SI area prefix scales the BASE metre, so it squares.
          result.areaToSquareMetres = factor * factor;
          result.areaUnitName = `${prefix ?? ""}${str(unit.Name) ?? ""}`;
          result.areaAssumed = false;
        }
      } else if (typeName === "IfcConversionBasedUnit") {
        // Imperial and other non-SI units: the factor sits on the referenced
        // IfcMeasureWithUnit. Feet appear in US models and would otherwise
        // read as metres — a 3.28x error that looks like a plausible building.
        const factorLine = api.GetLine(modelID, refId(unit.ConversionFactor), false);
        const value = num(factorLine?.ValueComponent);
        if (value !== null && Number.isFinite(value)) {
          if (unitType.includes("LENGTHUNIT")) {
            result.lengthToMetres = value;
            result.lengthUnitName = str(unit.Name) ?? "conversion-based";
            result.lengthAssumed = false;
          } else if (unitType.includes("AREAUNIT")) {
            result.areaToSquareMetres = value;
            result.areaUnitName = str(unit.Name) ?? "conversion-based";
            result.areaAssumed = false;
          }
        }
      }
    }
  }
  return result;
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
    const file = new IfcFile(api, modelId, path.basename(filePath));
    // Resolved once here rather than at each call site, so a caller cannot
    // forget it. `units.lengthToMetres` applies to ATTRIBUTE lengths only —
    // geometry is already metres. See `readUnits`.
    file.units = readUnits(api, webIfc, modelId);
    files.push(file);
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
