// src/app/api/cad/convert/route.ts
// POST /api/cad/convert — accepts a DWG file upload and returns DXF text.
//
// DWG is a proprietary binary format; in-process conversion requires a
// native binary or a GPL-licensed WebAssembly build (LibreDWG-web). The
// GX team's license posture hasn't been cleared for GPL-3 at time of
// writing, so this route currently returns 501 with a clear hint to the
// user: export the drawing as .dxf and re-upload.
//
// The route structure, validation, and size limits are in place so that
// swapping in a real converter later is a drop-in change.

import { NextRequest, NextResponse } from "next/server";

/** Max file size — 50 MB. Mirrors the client-side dropzone limit. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- Parse multipart body ---------------------------------------------
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid multipart/form-data body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");

  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json(
      { error: "Missing 'file' field in form data" },
      { status: 400 }
    );
  }

  const file = fileEntry as File;

  // --- Validate extension -----------------------------------------------
  const nameLower = (file.name ?? "").toLowerCase();
  if (!nameLower.endsWith(".dwg")) {
    return NextResponse.json(
      {
        error: "Only .dwg files are accepted on this endpoint",
        hint: "If you already have a .dxf file, upload it directly — client-side parsing handles DXF without the server.",
      },
      { status: 400 }
    );
  }

  // --- Validate size -----------------------------------------------------
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`,
        size: file.size,
      },
      { status: 413 }
    );
  }

  // --- Convert (not yet implemented) -------------------------------------
  // Documented fallback per .omc/plans/cad-upload-workflow-plan.md risks table.
  // Returning 501 with a user-actionable hint preserves the workflow for users
  // who already have DXF, and signals a clean "not yet implemented" to clients.
  return NextResponse.json(
    {
      error: "DWG conversion is not yet available on this server",
      hint: "Export the DWG as DXF in your CAD tool (AutoCAD: File → Save As → AutoCAD DXF) and upload the .dxf file.",
    },
    { status: 501 }
  );
}
