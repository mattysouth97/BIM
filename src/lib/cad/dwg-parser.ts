// src/lib/cad/dwg-parser.ts
// Client-side DWG binary validation, version detection, and server-mediated
// conversion to the ParsedDxf format used by the rest of the CAD pipeline.
//
// DWG is a proprietary binary format. Geometry extraction happens server-side
// (via ODA File Converter or a compatible converter configured through the
// DWG_CONVERTER_PATH environment variable). This module handles:
//   1. Binary header validation (magic bytes + version string)
//   2. AutoCAD version detection
//   3. Round-trip to POST /api/cad/convert → DXF text → parseDxfText()
//
// Pure module — no React, no DOM APIs beyond fetch().

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
  /** Raw 6-char version identifier from the file header. */
  versionId: string;
  /** Human-readable AutoCAD version label, or "Unknown" if unrecognised. */
  versionLabel: string;
  /** File size in bytes. */
  fileSize: number;
}

/**
 * Read and validate the DWG binary header.
 *
 * Returns `null` when the buffer is too small or does not start with a
 * recognised "ACxxxx" magic string (i.e. not a valid DWG file).
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

export interface ParseDwgOptions {
  /** Override the conversion endpoint (defaults to `/api/cad/convert`). */
  convertUrl?: string;
  /** AbortSignal forwarded to fetch(). */
  signal?: AbortSignal;
}

/**
 * Convert a DWG file to `ParsedDxf` via the server conversion route.
 *
 * Flow: validate header → POST binary to server → receive DXF text → parseDxfText().
 *
 * Returns a `ParsedDxf` with warnings populated for every non-fatal issue
 * (version detection, server hints, etc.). Throws on network or server errors
 * that make conversion impossible.
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

  const url = options?.convertUrl ?? "/api/cad/convert";
  const form = new FormData();
  form.set("file", file);

  const res = await fetch(url, {
    method: "POST",
    body: form,
    signal: options?.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    const hint = (body as Record<string, string>).hint;
    const error = (body as Record<string, string>).error;
    const msg =
      hint ?? error ?? `DWG conversion failed (HTTP ${res.status})`;
    return { candidates: [], unitScaleToMeters: 1, warnings: [...warnings, msg] };
  }

  const dxfText = await res.text();
  const parsed = parseDxfText(dxfText);

  return {
    ...parsed,
    warnings: [...warnings, ...parsed.warnings],
  };
}
