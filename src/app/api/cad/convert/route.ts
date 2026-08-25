// src/app/api/cad/convert/route.ts
// POST /api/cad/convert — accepts a DWG file upload and returns DXF text.
//
// Conversion strategy (tried in order, every outcome reported):
//   1. External converter binary named by DWG_CONVERTER_PATH (ODA File
//      Converter, dwg2dxf, …). Only when an operator configured one — it is a
//      self-hosting escape hatch and can never exist in a serverless function.
//   2. LibreDWG WASM in-process (src/lib/cad/libredwg-node.ts). No binary, no
//      child process, reads through AC1032. THIS is the tier that works on
//      Vercel; before it existed the route answered 501 to every upload in
//      production regardless of the file.
//
// The route validates the upload (extension, size, DWG version header) before
// attempting anything, and a failure response carries the detected version
// plus what each strategy did — so the client can say what the file is instead
// of repeating generic "export as DXF" advice.

import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { convertDwgToDxfOnServer } from "@/lib/cad/libredwg-node";
import { readDwgVersion, describeVersion } from "@/lib/cad/dwg-version";
import {
  CAD_CLIENT_MAX_FILE_BYTES,
  CAD_SERVER_FALLBACK_MAX_FILE_BYTES,
  CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES,
  formatFileSizeMiB,
} from "@/lib/cad/import-limits";

const execFileAsync = promisify(execFile);

/** WASM instantiation plus a large drawing can outrun the 10 s default. */
export const maxDuration = 60;

/** P1-06 (a): converter hard timeout so a hung binary can't hold the route open. */
const CONVERTER_TIMEOUT_MS = 60_000;

/**
 * Best-effort per-instance back-pressure for the CPU-heavy converter. A
 * platform-level limiter can span instances; this guard still prevents one
 * warm server process from starting overlapping WASM/child-process jobs.
 */
let conversionSlotOccupied = false;

function throwIfRequestAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The DWG conversion request was aborted", "AbortError");
}

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

/**
 * `turbopackIgnore` on both uses of CONVERTER_PATH: its value comes from the
 * environment, so Node File Tracing cannot resolve what is being read or
 * executed and conservatively traces the ENTIRE project into this function's
 * bundle (which is what the "Encountered unexpected file in NFT list" build
 * warning reported). The binary is operator-supplied and intentionally
 * outside the deployment, so there is nothing here for tracing to find.
 */
function converterAvailable(): boolean {
  return (
    CONVERTER_PATH.length > 0 &&
    existsSync(/* turbopackIgnore: true */ CONVERTER_PATH)
  );
}

async function convertWithOda(
  inputDir: string,
  outputDir: string,
  signal?: AbortSignal,
): Promise<void> {
  await execFileAsync(
    /* turbopackIgnore: true */ CONVERTER_PATH,
    [
      inputDir,
      outputDir,
      "ACAD2018", // output DXF version
      "DXF",
      "0", // recurse = no
      "1", // audit = yes
    ],
    { timeout: CONVERTER_TIMEOUT_MS, signal },
  );
}

async function convertSimple(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<void> {
  await execFileAsync(/* turbopackIgnore: true */ CONVERTER_PATH, [inputPath, outputPath], {
    timeout: CONVERTER_TIMEOUT_MS,
    signal,
  });
}

/**
 * Run the operator-configured external binary. Returns the DXF text, or
 * `null` with a reason when it is not configured, produced nothing, or failed.
 * Request cancellation propagates so the caller never starts the WASM tier
 * after the client disconnects.
 */
async function tryExternalConverter(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<{ dxfText: string | null; detail: string }> {
  if (!converterAvailable()) {
    return {
      dxfText: null,
      detail: CONVERTER_PATH.length === 0
        ? "DWG_CONVERTER_PATH가 설정되지 않음 (건너뜀)"
        : "설정된 외부 변환기를 사용할 수 없음 (건너뜀)",
    };
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
      await convertWithOda(inputDir, outputDir, signal);
    } else {
      await convertSimple(
        inputPath,
        join(outputDir, UPLOAD_BASENAME.replace(/\.dwg$/i, ".dxf")),
        signal,
      );
    }

    const outputFiles = await readdir(outputDir);
    const dxfFile = outputFiles.find((f) => f.toLowerCase().endsWith(".dxf"));
    if (!dxfFile) {
      return { dxfText: null, detail: "외부 변환기가 DXF를 생성하지 못함" };
    }

    return {
      dxfText: await readFile(join(outputDir, dxfFile), "utf-8"),
      detail: "외부 변환기 성공",
    };
  } catch (err) {
    // Do not fall through into the in-process WASM converter after the
    // requesting client has canceled the external conversion.
    if (signal?.aborted) throw err;
    console.error("[cad-convert] External converter failed", err);
    return {
      dxfText: null,
      detail: "외부 변환기가 파일을 변환하지 못함",
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Run LibreDWG WASM in-process. Distinguishes "the module could not load"
 * (a deployment fault — the .wasm did not ship) from "LibreDWG declined this
 * file", because the two need completely different responses from a user.
 */
async function tryLibreDwg(
  buffer: ArrayBuffer,
): Promise<{ dxfText: string | null; detail: string }> {
  try {
    const dxfText = await convertDwgToDxfOnServer(buffer);
    return dxfText
      ? { dxfText, detail: "LibreDWG WASM 성공" }
      : { dxfText: null, detail: "LibreDWG WASM이 이 도면을 해독하지 못함 (손상되었거나 지원하지 않는 요소 포함)" };
  } catch (err) {
    console.error("[cad-convert] LibreDWG module failed", err);
    return {
      dxfText: null,
      detail: "LibreDWG WASM 모듈을 사용할 수 없음 (서버 배포 상태 확인 필요)",
    };
  }
}

function requestRejectedBeforeParsing(req: NextRequest): NextResponse | null {
  // This is a browser CSRF check, not an authentication boundary. Production
  // also enforces an IP-keyed Vercel Firewall quota on this exact POST route;
  // the in-process semaphore below is defense in depth for each warm instance.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json(
      {
        error: "Cross-origin DWG conversion requests are not allowed",
        hint: "Open the BIMFIT importer on this site and choose the drawing there.",
      },
      { status: 403 },
    );
  }

  const rawLength = req.headers.get("content-length");
  const declaredLength = rawLength == null ? null : Number(rawLength);
  if (
    declaredLength != null &&
    Number.isFinite(declaredLength) &&
    declaredLength > CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES
  ) {
    return NextResponse.json(
      {
        error: "Multipart request exceeds the server fallback body limit",
        hint: "Use browser conversion, export DXF, or simplify the DWG before retrying.",
        declaredBytes: declaredLength,
        limitBytes: CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES,
      },
      { status: 413 },
    );
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rejected = requestRejectedBeforeParsing(req);
  if (rejected) return rejected;

  if (conversionSlotOccupied) {
    return NextResponse.json(
      {
        error: "DWG converter is busy",
        hint: "Wait a few seconds, then retry. Your drawing has not been changed.",
      },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }
  conversionSlotOccupied = true;

  try {
    return await convertRequest(req);
  } finally {
    conversionSlotOccupied = false;
  }
}

async function convertRequest(req: NextRequest): Promise<NextResponse> {
  // --- Parse multipart body -----------------------------------------------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn("[cad-convert] Rejected invalid multipart body", err);
    return NextResponse.json(
      {
        error: "Invalid multipart/form-data body",
        hint: "Choose the DWG again in BIMFIT and retry the import.",
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
  if (file.size > CAD_SERVER_FALLBACK_MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `File exceeds the ${formatFileSizeMiB(CAD_SERVER_FALLBACK_MAX_FILE_BYTES)} server fallback limit`,
        detail:
          "The production upload path cannot reliably receive a larger multipart body. " +
          `Browser DWG conversion remains available for files up to ${formatFileSizeMiB(CAD_CLIENT_MAX_FILE_BYTES)}.`,
        hint: "Use the browser import first. If it cannot read this drawing, export it as DXF or simplify the DWG before retrying.",
        size: file.size,
        limitBytes: CAD_SERVER_FALLBACK_MAX_FILE_BYTES,
      },
      { status: 413 },
    );
  }

  // --- Identify the DWG version --------------------------------------------
  const buffer = await file.arrayBuffer();
  const version = readDwgVersion(buffer);
  if (!version) {
    return NextResponse.json(
      {
        error: "File does not appear to be a valid DWG (missing AC-version header)",
        hint: "Ensure the file is a genuine AutoCAD DWG. If it was renamed from another format, use the original extension.",
      },
      { status: 422 },
    );
  }

  // --- Convert -------------------------------------------------------------
  const attempts: string[] = [];

  throwIfRequestAborted(req.signal);
  const external = await tryExternalConverter(buffer, req.signal);
  attempts.push(`외부 변환기: ${external.detail}`);
  if (external.dxfText) {
    return new NextResponse(external.dxfText, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // LibreDWG cannot be interrupted once its synchronous WASM work begins.
  // Observe cancellation immediately before entering it.
  throwIfRequestAborted(req.signal);
  const libredwg = await tryLibreDwg(buffer);
  attempts.push(`LibreDWG: ${libredwg.detail}`);
  if (libredwg.dxfText) {
    return new NextResponse(libredwg.dxfText, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json(
    {
      error: `${describeVersion(version)} 파일을 서버에서 변환하지 못했습니다`,
      detail: attempts.join(" / "),
      hint: "CAD 프로그램에서 DXF로 내보낸 뒤 다시 업로드하세요.",
      dwgVersion: version.versionId,
      dwgVersionLabel: version.label,
    },
    { status: 502 },
  );
}
