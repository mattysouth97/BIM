// src/lib/generative/blueprint/read-cad-file.ts
//
// Uploaded file → CadDocument, for the schematic importer.
//
// This is deliberately the SAME path the CAD viewer's upload uses
// (`src/components/upload/upload-stage.tsx`): `.dxf` text goes straight to
// `mapDxfTextToDoc`; `.dwg` goes through `parseDwgFile`, whose three tiers
// (libdxfrw WASM → LibreDWG WASM → the `/api/cad/convert` server route) are
// already proven and already return the converted DXF text. Nothing about DWG
// conversion is reimplemented here.
//
// The converter is injectable for exactly one reason: the WASM tiers cannot
// run under vitest, so tests exercise the DXF path for real and the DWG branch
// at this seam.

import { mapDxfTextToDoc } from "@/lib/cad/doc/map-dxf-to-doc";
import type { CadDocument } from "@/lib/cad/doc/types";

export type CadFileFormat = "dxf" | "dwg";

export const ACCEPTED_CAD_EXTENSIONS = [".dxf", ".dwg"] as const;

export interface DwgConversionResult {
  /** Converted DXF text; absent when every conversion tier failed. */
  dxfText?: string;
  warnings: string[];
}

export interface ReadCadFileDeps {
  /** DWG → DXF text. Defaults to the viewer's `parseDwgFile` tier chain. */
  convertDwg?: (file: File) => Promise<DwgConversionResult>;
}

export type CadFileReadErrorCode =
  | "UNSUPPORTED_EXTENSION"
  | "DWG_CONVERSION_FAILED"
  | "DXF_UNPARSEABLE"
  | "EMPTY_DRAWING";

export type CadFileReadResult =
  | {
      ok: true;
      doc: CadDocument;
      format: CadFileFormat;
      /** Warnings the conversion/parse raised; shown, never swallowed. */
      warnings: string[];
    }
  | {
      ok: false;
      error: { code: CadFileReadErrorCode; message: string };
      warnings: string[];
    };

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

/** The default DWG tier chain — loaded only when a DWG is actually opened. */
async function convertDwgViaViewerPipeline(file: File): Promise<DwgConversionResult> {
  const { parseDwgFile } = await import("@/lib/cad/dwg-parser");
  const parsed = await parseDwgFile(file);
  return {
    ...(parsed.dxfText ? { dxfText: parsed.dxfText } : {}),
    warnings: parsed.warnings,
  };
}

export async function readCadFile(
  file: File,
  deps: ReadCadFileDeps = {},
): Promise<CadFileReadResult> {
  const extension = extensionOf(file.name);

  if (extension !== ".dxf" && extension !== ".dwg") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_EXTENSION",
        message: `"${file.name}" is not a DXF or DWG file. Export the drawing as DXF, or upload the original DWG.`,
      },
      warnings: [],
    };
  }

  const warnings: string[] = [];
  let dxfText: string;

  if (extension === ".dwg") {
    const convert = deps.convertDwg ?? convertDwgViaViewerPipeline;
    const converted = await convert(file);
    warnings.push(...converted.warnings);
    if (!converted.dxfText) {
      return {
        ok: false,
        error: {
          code: "DWG_CONVERSION_FAILED",
          message:
            converted.warnings[converted.warnings.length - 1] ??
            "The DWG could not be converted to DXF. In your CAD tool, save it as 'AutoCAD 2013 DWG' or export DXF, then try again.",
        },
        warnings,
      };
    }
    dxfText = converted.dxfText;
  } else {
    dxfText = await file.text();
  }

  const doc = mapDxfTextToDoc(dxfText, file.name);
  warnings.push(...doc.warnings);

  // `mapDxfTextToDoc` never throws; a hard parse failure comes back as an
  // empty document carrying the reason, which must not be reported as an
  // empty-but-valid drawing.
  const parseFailure = doc.warnings.find((w) => w.startsWith("DXF parse failed"));
  if (parseFailure) {
    return {
      ok: false,
      error: { code: "DXF_UNPARSEABLE", message: parseFailure },
      warnings,
    };
  }

  if (doc.entities.length === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_DRAWING",
        message: `"${file.name}" parsed cleanly but holds no geometry the CAD reader supports (${
          Object.keys(doc.stats.skipped).join(", ") || "no entities at all"
        }).`,
      },
      warnings,
    };
  }

  return { ok: true, doc, format: extension === ".dwg" ? "dwg" : "dxf", warnings };
}
