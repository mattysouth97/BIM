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
import {
  summariseDwgFailure,
  type DwgDiagnostics,
} from "@/lib/cad/dwg-version";

/**
 * Drawing formats the schematic importer accepts. `"svg"` does NOT become a
 * `CadDocument` — it has no CAD document model at all; it is read as text and
 * interpreted by `from-svg.ts` / `import-svg-file.ts`. The format name lives
 * here anyway because it is the same vocabulary the store's import provenance
 * records, and a schematic must be able to say which kind of file it came from.
 */
export type CadFileFormat = "dxf" | "dwg" | "svg";

/** Formats that go through `readCadFile` into a `CadDocument`. */
export const ACCEPTED_CAD_EXTENSIONS = [".dxf", ".dwg"] as const;

/** Everything the import dialog accepts, CAD document or not. */
export const ACCEPTED_DRAWING_EXTENSIONS = [".dxf", ".dwg", ".svg"] as const;

export interface DwgConversionResult {
  /** Converted DXF text; absent when every conversion tier failed. */
  dxfText?: string;
  warnings: string[];
  /**
   * What the file is and what every tier did about it. Present whenever the
   * DWG tier chain ran, so a failure can name the format instead of guessing.
   */
  diagnostics?: DwgDiagnostics;
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

/**
 * A typed failure. `detail` holds per-step lines that explain the headline —
 * for a DWG, one line per conversion tier saying whether it was attempted or
 * skipped and why. The `{ code, message }` shape is unchanged; `detail` is
 * additive, so callers that only render the message keep working.
 */
export interface CadFileReadError {
  code: CadFileReadErrorCode;
  message: string;
  detail?: string[];
}

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
      error: CadFileReadError;
      warnings: string[];
    };

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

/**
 * Which reader a picked file belongs to, by extension alone — `null` for
 * anything the importer does not accept. Extension, not sniffing: DXF and SVG
 * are both text, and a file the user named `.svg` is a claim worth reporting
 * back verbatim when it turns out not to parse.
 */
export function classifyDrawingFile(fileName: string): CadFileFormat | null {
  switch (extensionOf(fileName)) {
    case ".dxf":
      return "dxf";
    case ".dwg":
      return "dwg";
    case ".svg":
      return "svg";
    default:
      return null;
  }
}

export type SvgFileReadResult =
  | { ok: true; text: string; format: "svg" }
  | { ok: false; error: { code: CadFileReadErrorCode; message: string } };

/**
 * SVG upload → raw text. There is no document model to build: `from-svg.ts`
 * parses the markup itself (deliberately, see its header), so the only failure
 * this step can have is a file that is not an SVG or holds nothing at all.
 * Malformed markup is NOT diagnosed here — it surfaces, with the parser's own
 * message, at the interpretation step.
 */
export async function readSvgFile(file: File): Promise<SvgFileReadResult> {
  if (extensionOf(file.name) !== ".svg") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_EXTENSION",
        message: `"${file.name}" is not an SVG file.`,
      },
    };
  }

  const text = await file.text();
  if (text.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_DRAWING",
        message: `"${file.name}" is empty — there is no markup to read.`,
      },
    };
  }

  return { ok: true, text, format: "svg" };
}

/** The default DWG tier chain — loaded only when a DWG is actually opened. */
async function convertDwgViaViewerPipeline(file: File): Promise<DwgConversionResult> {
  const { parseDwgFile } = await import("@/lib/cad/dwg-parser");
  const parsed = await parseDwgFile(file);
  return {
    ...(parsed.dxfText ? { dxfText: parsed.dxfText } : {}),
    warnings: parsed.warnings,
    diagnostics: parsed.diagnostics,
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
      // Prefer the assembled diagnostic — it names the DWG version and lists
      // each tier's outcome. Only when the tier chain produced no diagnostics
      // at all (an injected converter in tests) does this fall back to the
      // last warning, and then to generic advice.
      const report = converted.diagnostics
        ? summariseDwgFailure(converted.diagnostics, file.name)
        : null;
      return {
        ok: false,
        error: {
          code: "DWG_CONVERSION_FAILED",
          message:
            report?.message ??
            converted.warnings[converted.warnings.length - 1] ??
            "The DWG could not be converted to DXF. In your CAD tool, save it as 'AutoCAD 2013 DWG' or export DXF, then try again.",
          ...(report && report.detail.length > 0 ? { detail: report.detail } : {}),
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
