// Uploaded file → CadDocument, for the schematic importer.
//
// The DXF path runs for real, from File bytes through the npm DXF parser. The
// DWG path cannot: its first two tiers are browser WASM modules and its third
// is an HTTP round trip to /api/cad/convert, none of which exist under vitest.
// So the DWG branch is tested AT THE SEAM — the injected converter stands in
// for `parseDwgFile`, and the assertions are that it receives the uploaded
// bytes and that whatever DXF it returns is what gets parsed.

import { describe, expect, it, vi } from "vitest";

import {
  ACCEPTED_CAD_EXTENSIONS,
  readCadFile,
} from "../blueprint/read-cad-file";

const ENTITIES = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "LWPOLYLINE", "8", "A-WALL", "90", "4", "70", "1",
  "10", "0", "20", "0",
  "10", "10000", "20", "0",
  "10", "10000", "20", "8000",
  "10", "0", "20", "8000",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

/** The same drawing with a declared millimetre unit, and without any. */
const DXF_TEXT = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  ENTITIES,
].join("\n");
const DXF_TEXT_UNITLESS = ["0", "SECTION", "2", "HEADER", "0", "ENDSEC", ENTITIES].join(
  "\n",
);

const file = (name: string, content: string | Uint8Array<ArrayBuffer>): File =>
  new File([content], name);

describe("readCadFile", () => {
  it("accepts exactly .dxf and .dwg", () => {
    expect([...ACCEPTED_CAD_EXTENSIONS]).toEqual([".dxf", ".dwg"]);
  });

  it("parses a DXF upload into a CadDocument", async () => {
    const result = await readCadFile(file("plan.dxf", DXF_TEXT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toBe("dxf");
    expect(result.doc.id).toBe("plan.dxf");
    expect(result.doc.entities).toHaveLength(1);
    expect(result.doc.insUnits).toBe(4);
    expect(result.doc.unitScaleToMeters).toBe(0.001);
  });

  it("rejects a file that is neither DXF nor DWG, by name", async () => {
    const result = await readCadFile(file("plan.pdf", "%PDF-1.4"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNSUPPORTED_EXTENSION");
    expect(result.error.message).toContain("plan.pdf");
  });

  it("reports an unparseable DXF as unparseable, not as an empty drawing", async () => {
    const result = await readCadFile(file("junk.dxf", "this is not a dxf"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DXF_UNPARSEABLE");
    expect(result.error.message).toMatch(/DXF parse failed/);
  });

  it("reports a well-formed but empty DXF as empty", async () => {
    const empty = ["0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF"].join("\n");
    const result = await readCadFile(file("blank.dxf", empty));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMPTY_DRAWING");
  });

  it("keeps the parser's own warnings instead of swallowing them", async () => {
    const result = await readCadFile(file("unitless.dxf", DXF_TEXT_UNITLESS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContain("Unitless DXF — assuming meters.");
  });
});

describe("readCadFile — DWG seam", () => {
  it("hands the uploaded bytes to the converter and parses what comes back", async () => {
    const bytes = new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x33, 0x32, 0x07, 0x09]); // "AC1032…"
    const convertDwg = vi.fn(async (received: File) => {
      // The converter is given the FILE, not a re-encoded copy of it.
      const buffer = new Uint8Array(await received.arrayBuffer());
      expect(received.name).toBe("plan.dwg");
      expect([...buffer]).toEqual([...bytes]);
      return { dxfText: DXF_TEXT, warnings: ["Unrecognised DWG version 'AC1032'."] };
    });

    const result = await readCadFile(file("plan.dwg", bytes), { convertDwg });

    expect(convertDwg).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("dwg");
    expect(result.doc.entities).toHaveLength(1);
    expect(result.warnings).toContain("Unrecognised DWG version 'AC1032'.");
  });

  it("fails with the converter's own reason when every tier failed", async () => {
    const convertDwg = vi.fn(async () => ({
      warnings: [
        "Client-side DWG conversion failed: WASM unavailable",
        "DWG conversion failed. Save as 'AutoCAD 2013 DWG' or export DXF.",
      ],
    }));

    const result = await readCadFile(file("plan.dwg", new Uint8Array([1, 2, 3])), {
      convertDwg,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DWG_CONVERSION_FAILED");
    // The specific last-tier reason, not a generic "import failed".
    expect(result.error.message).toContain("AutoCAD 2013 DWG");
    expect(result.warnings).toHaveLength(2);
  });

  it("reports the DWG version and every tier's outcome when diagnostics exist", async () => {
    const convertDwg = vi.fn(async () => ({
      warnings: ["something generic and unhelpful"],
      diagnostics: {
        version: {
          versionId: "AC1032",
          label: "AutoCAD 2018",
          year: 2018,
          known: true,
          fileSize: 2048,
        },
        outcomes: [
          { tier: "libdxfrw" as const, status: "skipped" as const, detail: "AC1032 미지원" },
          { tier: "libredwg" as const, status: "failed" as const, detail: "wasm 404" },
          { tier: "server" as const, status: "failed" as const, detail: "502" },
        ],
      },
    }));

    const result = await readCadFile(file("plan.dwg", new Uint8Array([1, 2, 3])), {
      convertDwg,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DWG_CONVERSION_FAILED");
    // The headline names the format instead of repeating stock advice…
    expect(result.error.message).toContain("AutoCAD 2018 (AC1032)");
    expect(result.error.message).toContain("plan.dwg");
    // …and each tier is accounted for, skip reason included.
    expect(result.error.detail).toHaveLength(3);
    expect(result.error.detail![0]).toContain("AC1032 미지원");
    expect(result.error.detail![1]).toContain("wasm 404");
  });

  it("does not call the converter for a DXF", async () => {
    const convertDwg = vi.fn(async () => ({ warnings: [] }));
    await readCadFile(file("plan.dxf", DXF_TEXT), { convertDwg });
    expect(convertDwg).not.toHaveBeenCalled();
  });
});
