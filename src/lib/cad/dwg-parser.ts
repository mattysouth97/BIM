// src/lib/cad/dwg-parser.ts
// Client-side DWG → DXF conversion, tried across three tiers.
//
//   1. libdxfrw WASM   (~1.4 MB, /wasm/libdxfrw.js)      R10 … AC1027 (2013)
//   2. LibreDWG WASM   (~10 MB, lazy npm chunk)          R10 … AC1032 (2018+)
//   3. /api/cad/convert (LibreDWG under Node, + optional external binary)
//
// The DWG version is read from the file's 6-byte header BEFORE any tier runs.
// A tier that provably cannot read that version is skipped with that reason
// rather than attempted — an attempt would fail with a message about internal
// parser state, which tells a user nothing about their file. Every tier's
// outcome is recorded, and a total failure reports the whole list.
//
// Each tier is independently guarded: one tier throwing never aborts the
// chain, it only records a `failed` outcome and moves to the next.

import { parseDxfText, type ParsedDxf } from "./dxf-parser";
import {
  readDwgVersion,
  tierSupports,
  summariseDwgFailure,
  formatTierOutcome,
  type DwgDiagnostics,
  type DwgTierName,
  type DwgTierOutcome,
  type DwgVersionInfo,
} from "./dwg-version";

// Re-exported so existing importers (viewer, upload stage) keep working.
export { DWG_VERSIONS, readDwgVersion } from "./dwg-version";
export type { DwgVersionInfo, DwgDiagnostics, DwgTierOutcome } from "./dwg-version";

export interface DwgHeaderInfo {
  versionId: string;
  versionLabel: string;
  fileSize: number;
}

/**
 * Read and validate the DWG binary header.
 *
 * Thin adapter over `readDwgVersion` kept for callers that want the flat
 * `{ versionId, versionLabel, fileSize }` shape. Returns `null` when the
 * buffer is too small or does not start with a well-formed "ACxxxx" tag.
 */
export function readDwgHeader(buffer: ArrayBuffer): DwgHeaderInfo | null {
  const version = readDwgVersion(buffer);
  if (!version) return null;
  return {
    versionId: version.versionId,
    versionLabel: version.label,
    fileSize: version.fileSize,
  };
}

// ---------------------------------------------------------------------------
// WASM module lazy-loading (resets on failure so next upload retries)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmModulePromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWasmModule(): Promise<any> {
  if (wasmModulePromise) return wasmModulePromise;

  wasmModulePromise = (async () => {
    if (typeof window === "undefined") {
      throw new Error("DWG WASM conversion requires a browser environment");
    }

    await loadScript("/wasm/libdxfrw.js");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const factory = (window as any).createModule;
    if (typeof factory !== "function") {
      throw new Error(
        "libdxfrw WASM loader did not expose createModule global",
      );
    }

    const mod = await factory({
      locateFile: (name: string) => `/wasm/${name}`,
    });

    // Embind exposes a bound C++ class as its CONSTRUCTOR — a function, not an
    // object. The original guard demanded `typeof === "object"` and so rejected
    // every successfully-loaded module, killing tier 1 for all DWG versions
    // (not just the AC1032 ones it genuinely cannot read). Check for the thing
    // actually used below: a constructor whose instances have fileImport.
    if (
      typeof mod.DRW_FileHandler !== "function" ||
      typeof mod.DRW_FileHandler.prototype?.fileImport !== "function" ||
      typeof mod.DRW_Database !== "function"
    ) {
      throw new Error(
        "libdxfrw WASM loaded but does not expose the DRW_FileHandler/DRW_Database classes",
      );
    }

    return mod;
  })();

  try {
    return await wasmModulePromise;
  } catch (err) {
    wasmModulePromise = null;
    throw err;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParseDwgOptions {
  signal?: AbortSignal;
}

export type ParsedDwg = ParsedDxf & {
  dxfText?: string;
  /** What the file is, and what every tier did about it. Always present. */
  diagnostics: DwgDiagnostics;
};

/**
 * What one conversion attempt produced.
 *
 * `dxfText === null` means the tier ran cleanly but yielded nothing, and the
 * chain continues. `parsed` lets a tier hand back candidates it already parsed
 * (the server tier parses the response itself); when absent the caller parses
 * `dxfText`. `detail` overrides the tier's generic empty-output message with a
 * specific reason — the server route's own explanation of why it declined.
 */
interface TierResult {
  dxfText: string | null;
  parsed?: ParsedDxf;
  detail?: string;
}

interface Tier {
  name: DwgTierName;
  run: () => Promise<TierResult>;
  /** Warning text when the tier runs but yields no output and gives no reason. */
  emptyMessage: string;
  /** Prefix for the warning text when the tier throws. */
  failurePrefix: string;
}

/**
 * Convert a DWG file to `ParsedDxf` using the tier chain above.
 *
 * On success the converted `dxfText` is returned alongside the parsed
 * candidates — callers that build a CadDocument (viewer, schematic import)
 * have nothing to work with without it.
 */
export async function parseDwgFile(
  file: File,
  options?: ParseDwgOptions,
): Promise<ParsedDwg> {
  const warnings: string[] = [];
  const outcomes: DwgTierOutcome[] = [];

  const buffer = await file.arrayBuffer();
  const version: DwgVersionInfo | null = readDwgVersion(buffer);

  if (!version) {
    const diagnostics: DwgDiagnostics = { version: null, outcomes };
    return {
      candidates: [],
      unitScaleToMeters: 1,
      warnings: [
        "File does not appear to be a valid DWG — missing AC‑version header.",
        summariseDwgFailure(diagnostics, file.name).message,
      ],
      diagnostics,
    };
  }

  if (!version.known) {
    warnings.push(
      `Unrecognised DWG version '${version.versionId}' — conversion may fail.`,
    );
  }

  const tiers: Tier[] = [
    {
      name: "libdxfrw",
      run: async () => ({ dxfText: await convertDwgToDxf(buffer) }),
      emptyMessage: "DWG read succeeded but DXF export returned empty output.",
      failurePrefix: "Client-side DWG conversion failed",
    },
    {
      name: "libredwg",
      run: async () => {
        const { convertDwgViaLibreDwg } = await import("./libredwg-converter");
        return { dxfText: await convertDwgViaLibreDwg(buffer) };
      },
      emptyMessage: "LibreDWG conversion produced no DXF output.",
      failurePrefix: "LibreDWG conversion failed",
    },
    {
      // Sends `file`, not the buffer: the route re-reads and re-validates the
      // upload itself rather than trusting anything the client claims.
      name: "server",
      run: () => convertViaServer(file, options),
      emptyMessage: "Server conversion produced no DXF output.",
      failurePrefix: "Server DWG conversion failed",
    },
  ];

  for (const tier of tiers) {
    const support = tierSupports(tier.name, version);
    if (!support.supported) {
      const outcome: DwgTierOutcome = {
        tier: tier.name,
        status: "skipped",
        detail: support.reason,
      };
      outcomes.push(outcome);
      warnings.push(formatTierOutcome(outcome));
      continue;
    }

    try {
      const { dxfText, parsed: preParsed, detail } = await tier.run();
      if (dxfText) {
        outcomes.push({ tier: tier.name, status: "succeeded" });
        const parsed = preParsed ?? parseDxfText(dxfText);
        return {
          ...parsed,
          warnings: [...warnings, ...parsed.warnings],
          dxfText,
          diagnostics: { version, outcomes },
        };
      }
      const reason = detail ?? tier.emptyMessage;
      outcomes.push({ tier: tier.name, status: "failed", detail: reason });
      warnings.push(reason);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outcomes.push({ tier: tier.name, status: "failed", detail: msg });
      warnings.push(`${tier.failurePrefix}: ${msg}`);
    }
  }

  const diagnostics: DwgDiagnostics = { version, outcomes };
  const report = summariseDwgFailure(diagnostics, file.name);

  return {
    candidates: [],
    unitScaleToMeters: 1,
    warnings: [...warnings, report.message],
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Conversion strategies
// ---------------------------------------------------------------------------

/**
 * Convert DWG binary to DXF text using the libdxfrw WASM module.
 *
 * Uses the fileImport/fileExport path (matching the library's own
 * convert-button example) — NOT DRW_DwgR.read() which is the
 * entity-inspection path and does not set the internal writer state
 * needed by fileExport.
 */
async function convertDwgToDxf(buffer: ArrayBuffer): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await getWasmModule();

  const database = new mod.DRW_Database();
  const handler = new mod.DRW_FileHandler();
  handler.database = database;

  try {
    const imported: boolean = handler.fileImport(buffer, database, false, false);

    if (!imported) {
      throw new Error("fileImport returned false — DWG may be corrupted or use unsupported features");
    }

    const dxfText: string = handler.fileExport(
      mod.DRW_Version.AC1021,
      false,
      database,
      false,
    );
    return dxfText || null;
  } finally {
    database.delete();
    handler.delete();
  }
}

/**
 * POST the upload to `/api/cad/convert`.
 *
 * A non-OK response is NOT thrown: the route's JSON body carries the reason
 * the server could not convert (which converter ran, what it said), and that
 * reason is worth more than a status code. It comes back as the result's last
 * warning, which the tier loop records as this tier's failure detail.
 */
async function convertViaServer(
  file: File,
  options?: ParseDwgOptions,
): Promise<TierResult> {
  const form = new FormData();
  form.set("file", file);

  const res = await fetch("/api/cad/convert", {
    method: "POST",
    body: form,
    signal: options?.signal,
  });

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const fields = body as Record<string, string>;
    const detail =
      [fields.error, fields.detail, fields.hint].filter(Boolean).join(" — ") ||
      `DWG conversion failed (HTTP ${res.status})`;
    return { dxfText: null, detail };
  }

  const dxfText = await res.text();
  return { dxfText, parsed: parseDxfText(dxfText) };
}
