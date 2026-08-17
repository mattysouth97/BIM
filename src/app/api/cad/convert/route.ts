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

const execFileAsync = promisify(execFile);

/** WASM instantiation plus a large drawing can outrun the 10 s default. */
export const maxDuration = 60;

/** Max file size — 50 MB. Mirrors the client-side dropzone limit. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** P1-06 (a): converter hard timeout so a hung binary can't hold the route open. */
const CONVERTER_TIMEOUT_MS = 60_000;

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
    { timeout: CONVERTER_TIMEOUT_MS },
  );
}

async function convertSimple(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync(/* turbopackIgnore: true */ CONVERTER_PATH, [inputPath, outputPath], {
    timeout: CONVERTER_TIMEOUT_MS,
  });
}

/**
 * Run the operator-configured external binary. Returns the DXF text, or
 * `null` with a reason when it is not configured / produced nothing / threw.
 * Never throws: the caller still has the WASM strategy to try.
 */
async function tryExternalConverter(
  buffer: ArrayBuffer,
): Promise<{ dxfText: string | null; detail: string }> {
  if (!converterAvailable()) {
    return {
      dxfText: null,
      detail: CONVERTER_PATH.length === 0
        ? "DWG_CONVERTER_PATH가 설정되지 않음 (건너뜀)"
        : `DWG_CONVERTER_PATH 경로에 실행 파일이 없음: ${CONVERTER_PATH} (건너뜀)`,
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
      await convertWithOda(inputDir, outputDir);
    } else {
      await convertSimple(
        inputPath,
        join(outputDir, UPLOAD_BASENAME.replace(/\.dwg$/i, ".dxf")),
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
    return {
      dxfText: null,
      detail: `외부 변환기 오류: ${err instanceof Error ? err.message : String(err)}`,
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
    return {
      dxfText: null,
      detail: `LibreDWG WASM 모듈 로드 실패 (서버 배포 문제): ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
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

  const external = await tryExternalConverter(buffer);
  attempts.push(`외부 변환기: ${external.detail}`);
  if (external.dxfText) {
    return new NextResponse(external.dxfText, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

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
