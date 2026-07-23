// src/app/api/cad/convert/route.ts
// POST /api/cad/convert — accepts a DWG file upload and returns DXF text.
//
// Conversion strategy (tried in order):
//   1. External converter binary configured via DWG_CONVERTER_PATH env var
//      (e.g. ODA File Converter, dwg2dxf, or any tool that accepts
//       `<converter> <input.dwg> <output-dir>` and writes a .dxf).
//   2. Graceful 501 with a user-actionable hint to export as DXF manually.
//
// The route validates the upload (extension, size, DWG header magic) before
// attempting conversion. When a converter IS available, it writes the upload
// to a temp directory, shells out, reads the resulting .dxf, and returns it
// as text/plain so the client can pipe it through parseDxfText().

import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Max file size — 50 MB. Mirrors the client-side dropzone limit. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** P1-06 (a): converter hard timeout so a hung binary can't hold the route open. */
const CONVERTER_TIMEOUT_MS = 60_000;

const DWG_HEADER_PATTERN = /^AC\d{4}$/;

/**
 * P1-06 (a): reject filenames that could escape the temp work dir — path
 * separators, NUL, or any name differing from its own basename. The client
 * name is otherwise unrestricted (Korean names, spaces, etc. are fine)
 * because the upload is written to a fixed server-side name; the original
 * name is never used as a filesystem path. Deliberately NOT a control-char
 * class: multipart parsers that decode filenames as latin-1 turn UTF-8
 * bytes into C1 chars, which would false-reject non-ASCII names.
 */
const UNSAFE_NAME_CHARS = /[/\\\x00]/;

/** Fixed on-disk name for the uploaded DWG inside the per-request temp dir. */
const UPLOAD_BASENAME = "upload.dwg";

/**
 * Path to an external DWG→DXF converter binary.
 * Expected interface:
 *   ODA style:  <bin> <inputDir> <outputDir> <outputVersion> DXF 0 1
 *   Simple:     <bin> <input.dwg> <output.dxf>
 *
 * Set `DWG_CONVERTER_MODE` to "oda" (default) or "simple" to select the
 * calling convention.
 */
const CONVERTER_PATH = process.env.DWG_CONVERTER_PATH ?? "";
const CONVERTER_MODE = (process.env.DWG_CONVERTER_MODE ?? "oda") as
  | "oda"
  | "simple";

function converterAvailable(): boolean {
  return CONVERTER_PATH.length > 0 && existsSync(CONVERTER_PATH);
}

function readMagic(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 6) return null;
  const bytes = new Uint8Array(buffer, 0, 6);
  const magic = String.fromCharCode(...bytes);
  return DWG_HEADER_PATTERN.test(magic) ? magic : null;
}

async function convertWithOda(
  inputDir: string,
  outputDir: string,
): Promise<void> {
  await execFileAsync(
    CONVERTER_PATH,
    [
      inputDir,
      outputDir,
      "ACAD2018", // output DXF version
      "DXF",
      "0", // recurse = no
      "1", // audit = yes
    ],
    { timeout: CONVERTER_TIMEOUT_MS },
  );
}

async function convertSimple(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync(CONVERTER_PATH, [inputPath, outputPath], {
    timeout: CONVERTER_TIMEOUT_MS,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- Parse multipart body -----------------------------------------------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid multipart/form-data body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");

  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json(
      { error: "Missing 'file' field in form data" },
      { status: 400 },
    );
  }

  const file = fileEntry as File;

  // --- Validate extension -------------------------------------------------
  const rawName = file.name ?? "";
  const nameLower = rawName.toLowerCase();
  if (!nameLower.endsWith(".dwg")) {
    return NextResponse.json(
      {
        error: "Only .dwg files are accepted on this endpoint",
        hint: "If you already have a .dxf file, upload it directly — client-side parsing handles DXF without the server.",
      },
      { status: 400 },
    );
  }

  // --- Sanitize filename (P1-06 a) — reject traversal/separators ----------
  // Only path-escape vectors are rejected; the name itself may contain any
  // characters (Korean, spaces, …) since it is never used as a filesystem
  // path — the upload is written under UPLOAD_BASENAME instead.
  if (basename(rawName) !== rawName || UNSAFE_NAME_CHARS.test(rawName)) {
    return NextResponse.json(
      {
        error: "Invalid filename — must not contain path separators ('/', '\\') or control characters",
      },
      { status: 400 },
    );
  }

  // --- Validate size -------------------------------------------------------
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`,
        size: file.size,
      },
      { status: 413 },
    );
  }

  // --- Validate DWG header magic -------------------------------------------
  const buffer = await file.arrayBuffer();
  const magic = readMagic(buffer);
  if (!magic) {
    return NextResponse.json(
      {
        error: "File does not appear to be a valid DWG (missing AC-version header)",
        hint: "Ensure the file is a genuine AutoCAD DWG. If it was renamed from another format, use the original extension.",
      },
      { status: 422 },
    );
  }

  // --- Convert -------------------------------------------------------------
  if (!converterAvailable()) {
    return NextResponse.json(
      {
        error: "DWG conversion is not yet available on this server",
        hint: "In your CAD tool, save the file as 'AutoCAD 2013 DWG' (File → Save As → AutoCAD 2013 Drawing) or export it as DXF, then re-upload.",
        dwgVersion: magic,
      },
      { status: 501 },
    );
  }

  const workDir = join(tmpdir(), `bim-dwg-${randomUUID()}`);
  const inputDir = join(workDir, "in");
  const outputDir = join(workDir, "out");
  // The client filename is never used on disk — fixed name, zero injection surface.
  const inputPath = join(inputDir, UPLOAD_BASENAME);

  try {
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(inputPath, Buffer.from(buffer));

    if (CONVERTER_MODE === "oda") {
      await convertWithOda(inputDir, outputDir);
    } else {
      const outputPath = join(
        outputDir,
        UPLOAD_BASENAME.replace(/\.dwg$/i, ".dxf"),
      );
      await convertSimple(inputPath, outputPath);
    }

    const outputFiles = await readdir(outputDir);
    const dxfFile = outputFiles.find((f) => f.toLowerCase().endsWith(".dxf"));

    if (!dxfFile) {
      return NextResponse.json(
        {
          error: "Converter produced no DXF output",
          hint: "The DWG may use features unsupported by the server converter. Export as DXF manually.",
          dwgVersion: magic,
        },
        { status: 502 },
      );
    }

    const dxfText = await readFile(join(outputDir, dxfFile), "utf-8");
    return new NextResponse(dxfText, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "DWG conversion failed",
        detail: err instanceof Error ? err.message : String(err),
        hint: "Export the DWG as DXF in your CAD tool and upload the .dxf file.",
        dwgVersion: magic,
      },
      { status: 502 },
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
