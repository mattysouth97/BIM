// src/lib/cad/dwg-parser.ts
// Client-side DWG → DXF conversion using the libdxfrw WASM module.
//
// Converts DWG binary data to DXF text entirely in the browser via
// fileHandler.fileImport() + fileHandler.fileExport(), then pipes the
// result through parseDxfText() so the rest of the pipeline (unit
// conversion, candidate ranking, area filtering) stays the same.
//
// The WASM module (~1.4 MB) is lazy-loaded on first use and cached.
// Supports AutoCAD R14 through AutoCAD 2020 DWG files.

import { parseDxfText, type ParsedDxf } from "./dxf-parser";

/** Recognised DWG version strings (bytes 0–5 of the file header). */
export const DWG_VERSIONS: Record<string, string> = {
  AC1014: "AutoCAD R14 (1997)",
  AC1015: "AutoCAD 2000",
  AC1018: "AutoCAD 2004",
  AC1021: "AutoCAD 2007",
  AC1024: "AutoCAD 2010",
  AC1027: "AutoCAD 2013",
  AC1032: "AutoCAD 2018+",
};

export interface DwgHeaderInfo {
  versionId: string;
  versionLabel: string;
  fileSize: number;
}

/**
 * Read and validate the DWG binary header.
 *
 * Returns `null` when the buffer is too small or does not start with a
 * recognised "ACxxxx" magic string.
 */
export function readDwgHeader(buffer: ArrayBuffer): DwgHeaderInfo | null {
  if (buffer.byteLength < 6) return null;

  const bytes = new Uint8Array(buffer, 0, 6);
  const versionId = String.fromCharCode(...bytes);

  if (!/^AC\d{4}$/.test(versionId)) return null;

  return {
    versionId,
    versionLabel: DWG_VERSIONS[versionId] ?? "Unknown",
    fileSize: buffer.byteLength,
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

    if (typeof mod.DRW_FileHandler !== "object" || !mod.DRW_FileHandler) {
      throw new Error("WASM module loaded but DRW_FileHandler is missing");
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

/**
 * Convert a DWG file to `ParsedDxf` using the client-side WASM converter.
 *
 * Flow: validate header → load WASM (lazy) → DWG→DXF via libdxfrw
 *       fileImport/fileExport → parseDxfText().
 *
 * Falls back to the server route `/api/cad/convert` if the WASM module
 * cannot be loaded (e.g. SSR context or script-loading failure).
 */
export async function parseDwgFile(
  file: File,
  options?: ParseDwgOptions,
): Promise<ParsedDxf> {
  const warnings: string[] = [];

  const buffer = await file.arrayBuffer();
  const header = readDwgHeader(buffer);

  if (!header) {
    return {
      candidates: [],
      unitScaleToMeters: 1,
      warnings: [
        "File does not appear to be a valid DWG — missing AC‑version header.",
      ],
    };
  }

  if (header.versionLabel === "Unknown") {
    warnings.push(
      `Unrecognised DWG version '${header.versionId}' — conversion may fail.`,
    );
  }

  // --- Tier 1: libdxfrw WASM (fast, 1.4 MB; best for R14–2013) ------------
  try {
    const dxfText = await convertDwgToDxf(buffer);
    if (dxfText) {
      const parsed = parseDxfText(dxfText);
      return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
    }
    warnings.push("DWG read succeeded but DXF export returned empty output.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Client-side DWG conversion failed: ${msg}`);
  }

  // --- Tier 2: LibreDWG WASM (10 MB lazy; reads modern AC1032 files) ------
  try {
    const { convertDwgViaLibreDwg } = await import("./libredwg-converter");
    const dxfText = await convertDwgViaLibreDwg(buffer);
    if (dxfText) {
      const parsed = parseDxfText(dxfText);
      return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
    }
    warnings.push("LibreDWG conversion produced no DXF output.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`LibreDWG conversion failed: ${msg}`);
  }

  // --- Tier 3: server round-trip ------------------------------------------
  try {
    return await convertViaServer(file, warnings, options);
  } catch {
    return {
      candidates: [],
      unitScaleToMeters: 1,
      warnings: [
        ...warnings,
        "DWG conversion failed. In your CAD tool, save the file as 'AutoCAD 2013 DWG' or export it as DXF, then re-upload.",
      ],
    };
  }
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

async function convertViaServer(
  file: File,
  warnings: string[],
  options?: ParseDwgOptions,
): Promise<ParsedDxf> {
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
      .catch(() => ({} as Record<string, unknown>));
    const hint = (body as Record<string, string>).hint;
    const error = (body as Record<string, string>).error;
    const msg = hint ?? error ?? `DWG conversion failed (HTTP ${res.status})`;
    return {
      candidates: [],
      unitScaleToMeters: 1,
      warnings: [...warnings, msg],
    };
  }

  const dxfText = await res.text();
  const parsed = parseDxfText(dxfText);
  return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
}
