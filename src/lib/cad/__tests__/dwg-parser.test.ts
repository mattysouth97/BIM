import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readDwgHeader, parseDwgFile, DWG_VERSIONS } from "../dwg-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headerBuffer(ascii: string, totalSize = 64): ArrayBuffer {
  const buf = new ArrayBuffer(totalSize);
  const view = new Uint8Array(buf);
  for (let i = 0; i < ascii.length; i++) {
    view[i] = ascii.charCodeAt(i);
  }
  return buf;
}

function makeFile(name: string, buffer: ArrayBuffer): File {
  return new File([buffer], name, { type: "application/acad" });
}

// ---------------------------------------------------------------------------
// readDwgHeader — pure binary validation (no WASM needed)
// ---------------------------------------------------------------------------

describe("readDwgHeader", () => {
  it("returns null for an empty buffer", () => {
    expect(readDwgHeader(new ArrayBuffer(0))).toBeNull();
  });

  it("returns null for a buffer shorter than 6 bytes", () => {
    expect(readDwgHeader(new ArrayBuffer(5))).toBeNull();
  });

  it("returns null when the header is not an AC-version string", () => {
    expect(readDwgHeader(headerBuffer("NOTDWG"))).toBeNull();
    expect(readDwgHeader(headerBuffer("%PDF-1"))).toBeNull();
  });

  it.each(Object.entries(DWG_VERSIONS))(
    "recognises version %s as '%s'",
    (versionId, expectedLabel) => {
      const result = readDwgHeader(headerBuffer(versionId, 128));
      expect(result).not.toBeNull();
      expect(result!.versionId).toBe(versionId);
      expect(result!.versionLabel).toBe(expectedLabel);
      expect(result!.fileSize).toBe(128);
    },
  );

  it("returns 'Unknown' label for an unrecognised AC version", () => {
    const result = readDwgHeader(headerBuffer("AC9999"));
    expect(result).not.toBeNull();
    expect(result!.versionId).toBe("AC9999");
    expect(result!.versionLabel).toBe("Unknown");
  });
});

// ---------------------------------------------------------------------------
// parseDwgFile — integration tests with mocked WASM / fetch
// ---------------------------------------------------------------------------

describe("parseDwgFile", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a warning for a non-DWG file (bad header)", async () => {
    const file = makeFile("bad.dwg", headerBuffer("NOTDWG"));
    const result = await parseDwgFile(file);
    expect(result.candidates).toEqual([]);
    expect(result.warnings.some((w) => w.includes("valid DWG"))).toBe(true);
  });

  it("falls back to server and surfaces server error as warning", async () => {
    // WASM won't load in vitest (no window.document), so it falls back to
    // the server route.  Mock the server to return an error.
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "DWG conversion is not yet available",
          hint: "Export as DXF.",
        }),
        { status: 501, headers: { "content-type": "application/json" } },
      ),
    );

    const file = makeFile("plan.dwg", headerBuffer("AC1032", 512));
    const result = await parseDwgFile(file);
    expect(result.candidates).toEqual([]);
    expect(
      result.warnings.some((w) => w.includes("Export as DXF")),
    ).toBe(true);
  });

  it("parses server DXF response into candidates on fallback", async () => {
    const dxfText = [
      "0", "SECTION", "2", "HEADER",
      "9", "$INSUNITS", "70", "6",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE",
      "8", "OUTLINE",
      "90", "4", "70", "1",
      "10", "0", "20", "0",
      "10", "20", "20", "0",
      "10", "20", "20", "15",
      "10", "0", "20", "15",
      "0", "ENDSEC",
      "0", "EOF",
    ].join("\n");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(dxfText, { status: 200 }),
    );

    const file = makeFile("plan.dwg", headerBuffer("AC1032", 1024));
    const result = await parseDwgFile(file);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].layer).toBe("OUTLINE");
    expect(result.candidates[0].areaSqm).toBeCloseTo(300, 0);
  });

  it("includes an unrecognised-version warning alongside results", async () => {
    const dxfText = [
      "0", "SECTION", "2", "HEADER",
      "9", "$INSUNITS", "70", "6",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE",
      "8", "A",
      "90", "4", "70", "1",
      "10", "0", "20", "0",
      "10", "10", "20", "0",
      "10", "10", "20", "10",
      "10", "0", "20", "10",
      "0", "ENDSEC",
      "0", "EOF",
    ].join("\n");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(dxfText, { status: 200 }),
    );

    const file = makeFile("plan.dwg", headerBuffer("AC9999", 512));
    const result = await parseDwgFile(file);

    expect(result.candidates).toHaveLength(1);
    expect(
      result.warnings.some((w) => w.includes("Unrecognised DWG version")),
    ).toBe(true);
  });

  it("retries WASM load after a previous failure (cache reset)", async () => {
    const dxfText = [
      "0", "SECTION", "2", "HEADER",
      "9", "$INSUNITS", "70", "6",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE",
      "8", "WALL",
      "90", "4", "70", "1",
      "10", "0", "20", "0",
      "10", "12", "20", "0",
      "10", "12", "20", "10",
      "10", "0", "20", "10",
      "0", "ENDSEC",
      "0", "EOF",
    ].join("\n");

    // First call: server fallback returns 501
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "not available", hint: "Export as DXF." }),
        { status: 501, headers: { "content-type": "application/json" } },
      ),
    );

    const file1 = makeFile("a.dwg", headerBuffer("AC1032", 512));
    const result1 = await parseDwgFile(file1);
    expect(result1.candidates).toEqual([]);

    // Second call: server returns valid DXF (simulating a retry scenario)
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(dxfText, { status: 200 }),
    );

    const file2 = makeFile("b.dwg", headerBuffer("AC1032", 512));
    const result2 = await parseDwgFile(file2);
    expect(result2.candidates).toHaveLength(1);
    expect(result2.candidates[0].layer).toBe("WALL");
  });
});
