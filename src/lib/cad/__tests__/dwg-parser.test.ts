import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readDwgHeader, parseDwgFile, DWG_VERSIONS } from "../dwg-parser";
import { convertDwgViaLibreDwg } from "../libredwg-converter";

// Tier-2 LibreDWG converter is mocked for all tests in this file: the real
// module loads a 10 MB WASM binary, which is neither possible nor desirable
// in the test environment. Default behavior = unavailable (throws), which
// matches the pre-LibreDWG flow and keeps the server-fallback tests intact.
vi.mock("../libredwg-converter", () => ({
  convertDwgViaLibreDwg: vi.fn(),
}));

const mockedLibreDwg = vi.mocked(convertDwgViaLibreDwg);

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
    mockedLibreDwg
      .mockReset()
      .mockRejectedValue(new Error("LibreDWG unavailable in tests"));
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

  // -------------------------------------------------------------------------
  // Tier-2 LibreDWG fallback (modern AC1032 files libdxfrw can't read)
  // -------------------------------------------------------------------------

  const LIBREDWG_DXF = [
    "0", "SECTION", "2", "HEADER",
    "9", "$INSUNITS", "70", "6",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE",
    "8", "BIM_OUTLINE",
    "90", "4", "70", "1",
    "10", "0", "20", "0",
    "10", "30", "20", "0",
    "10", "30", "20", "20",
    "10", "0", "20", "20",
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n");

  it("converts via LibreDWG when libdxfrw fails, without calling the server", async () => {
    mockedLibreDwg.mockReset().mockResolvedValue(LIBREDWG_DXF);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const file = makeFile("modern.dwg", headerBuffer("AC1032", 1024));
    const result = await parseDwgFile(file);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].layer).toBe("BIM_OUTLINE");
    expect(result.candidates[0].areaSqm).toBeCloseTo(600, 0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to server when LibreDWG also fails", async () => {
    mockedLibreDwg
      .mockReset()
      .mockRejectedValue(new Error("dwg_write_dxf returned null"));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(LIBREDWG_DXF, { status: 200 }),
    );

    const file = makeFile("plan.dwg", headerBuffer("AC1032", 1024));
    const result = await parseDwgFile(file);

    expect(result.candidates).toHaveLength(1);
    expect(
      result.warnings.some((w) => w.includes("LibreDWG conversion failed")),
    ).toBe(true);
  });

  it("warns when LibreDWG returns empty output and continues to server", async () => {
    mockedLibreDwg.mockReset().mockResolvedValue(null);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "not available", hint: "Export as DXF." }),
        { status: 501, headers: { "content-type": "application/json" } },
      ),
    );

    const file = makeFile("plan.dwg", headerBuffer("AC1032", 512));
    const result = await parseDwgFile(file);

    expect(result.candidates).toEqual([]);
    expect(
      result.warnings.some((w) => w.includes("no DXF output")),
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Version-gated tier selection — a tier that cannot read the detected
  // version is SKIPPED with that reason, never attempted.
  // -------------------------------------------------------------------------

  describe("tier gating and diagnostics", () => {
    /** Outcome for one tier, or undefined when it was never considered. */
    const outcomeFor = (
      result: Awaited<ReturnType<typeof parseDwgFile>>,
      tier: string,
    ) => result.diagnostics.outcomes.find((o) => o.tier === tier);

    it("skips libdxfrw for AC1032 instead of letting it fail obscurely", async () => {
      mockedLibreDwg.mockReset().mockResolvedValue(LIBREDWG_DXF);
      globalThis.fetch = vi.fn();

      const result = await parseDwgFile(
        makeFile("modern.dwg", headerBuffer("AC1032", 1024)),
      );

      const libdxfrw = outcomeFor(result, "libdxfrw");
      expect(libdxfrw?.status).toBe("skipped");
      expect(libdxfrw?.detail).toContain("AC1032");
      // …and the skip reason names the ceiling, so the user learns WHY.
      expect(libdxfrw?.detail).toContain("AutoCAD 2013");
    });

    it("attempts libdxfrw for AC1027, which it does support", async () => {
      mockedLibreDwg.mockReset().mockResolvedValue(LIBREDWG_DXF);
      globalThis.fetch = vi.fn();

      const result = await parseDwgFile(
        makeFile("legacy.dwg", headerBuffer("AC1027", 1024)),
      );

      // No WASM in vitest, so it is attempted and fails — but attempted.
      expect(outcomeFor(result, "libdxfrw")?.status).toBe("failed");
    });

    it("records the detected version on every result, success or failure", async () => {
      mockedLibreDwg.mockReset().mockResolvedValue(LIBREDWG_DXF);
      globalThis.fetch = vi.fn();

      const ok = await parseDwgFile(makeFile("a.dwg", headerBuffer("AC1032", 512)));
      expect(ok.diagnostics.version).toMatchObject({
        versionId: "AC1032",
        label: "AutoCAD 2018",
        known: true,
      });

      mockedLibreDwg.mockReset().mockRejectedValue(new Error("nope"));
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("{}", { status: 502 }));
      const bad = await parseDwgFile(makeFile("b.dwg", headerBuffer("AC1032", 512)));
      expect(bad.diagnostics.version?.versionId).toBe("AC1032");
    });

    it("marks the succeeding tier and stops there", async () => {
      mockedLibreDwg.mockReset().mockResolvedValue(LIBREDWG_DXF);
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await parseDwgFile(
        makeFile("modern.dwg", headerBuffer("AC1032", 1024)),
      );

      expect(outcomeFor(result, "libredwg")?.status).toBe("succeeded");
      // The server tier is never even considered once a tier succeeded.
      expect(outcomeFor(result, "server")).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("keeps going after a tier throws — one failure never aborts the chain", async () => {
      mockedLibreDwg
        .mockReset()
        .mockRejectedValue(new Error("Failed to resolve module specifier"));
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(LIBREDWG_DXF, { status: 200 }),
      );

      const result = await parseDwgFile(
        makeFile("modern.dwg", headerBuffer("AC1032", 1024)),
      );

      expect(outcomeFor(result, "libredwg")?.status).toBe("failed");
      expect(outcomeFor(result, "libredwg")?.detail).toContain(
        "Failed to resolve module specifier",
      );
      expect(outcomeFor(result, "server")?.status).toBe("succeeded");
      expect(result.candidates).toHaveLength(1);
    });

    it("surfaces the server's own reason as the server tier's failure detail", async () => {
      mockedLibreDwg.mockReset().mockRejectedValue(new Error("boom"));
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "AutoCAD 2018 (AC1032) 파일을 서버에서 변환하지 못했습니다",
            detail: "LibreDWG: 해독 실패",
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await parseDwgFile(
        makeFile("modern.dwg", headerBuffer("AC1032", 1024)),
      );

      expect(outcomeFor(result, "server")?.detail).toContain("LibreDWG: 해독 실패");
    });

    it("reports every tier's outcome in the final failure warning", async () => {
      mockedLibreDwg.mockReset().mockRejectedValue(new Error("wasm gone"));
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("{}", { status: 502 }));

      const result = await parseDwgFile(
        makeFile("modern.dwg", headerBuffer("AC1032", 1024)),
      );

      expect(result.diagnostics.outcomes).toHaveLength(3);
      expect(result.diagnostics.outcomes.map((o) => o.status)).toEqual([
        "skipped",
        "failed",
        "failed",
      ]);
      // The headline names the format rather than repeating generic advice.
      expect(result.warnings.at(-1)).toContain("AutoCAD 2018 (AC1032)");
    });

    it("reports a non-DWG upload as a bad file, with no tier outcomes", async () => {
      const result = await parseDwgFile(makeFile("bad.dwg", headerBuffer("NOTDWG")));
      expect(result.diagnostics.version).toBeNull();
      expect(result.diagnostics.outcomes).toEqual([]);
      expect(result.warnings.some((w) => w.includes("DWG 파일로 보이지 않습니다"))).toBe(
        true,
      );
    });
  });
});
