import { describe, it, expect } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

/** Build a NextRequest carrying a multipart form with an optional file. */
function makeRequest(form: FormData): NextRequest {
  const req = new Request("http://localhost/api/cad/convert", {
    method: "POST",
    body: form,
  });
  return req as unknown as NextRequest;
}

/** Build a File whose first bytes are a DWG-style AC version header. */
function makeDwgFile(
  name: string,
  bytes: number,
  versionId = "AC1032",
): File {
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < versionId.length; i++) {
    buf[i] = versionId.charCodeAt(i);
  }
  return new File([buf], name, { type: "application/acad" });
}

/** File with arbitrary (non-DWG) content. */
function makeFakeFile(name: string, bytes: number): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], name, { type: "application/acad" });
}

describe("POST /api/cad/convert", () => {
  it("returns 400 when 'file' is missing", async () => {
    const form = new FormData();
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it("returns 400 when file extension is not .dwg", async () => {
    const form = new FormData();
    form.set("file", makeFakeFile("plan.dxf", 10));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/\.dwg/i);
  });

  it("returns 413 when DWG exceeds 50 MB", async () => {
    const tooBig = 50 * 1024 * 1024 + 1;
    const form = new FormData();
    form.set("file", makeDwgFile("huge.dwg", tooBig));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds/i);
    expect(body.size).toBe(tooBig);
  });

  it("returns 422 when file has .dwg extension but invalid header", async () => {
    const form = new FormData();
    form.set("file", makeFakeFile("plan.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/valid DWG/i);
    expect(body.hint).toBeDefined();
  });

  it("returns 501 with DXF-export hint for valid DWG when no converter configured", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("plan.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/not yet/i);
    expect(body.hint).toMatch(/dxf/i);
    expect(body.dwgVersion).toBe("AC1032");
  });

  it("accepts .DWG (uppercase) extension", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("PLAN.DWG", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
  });

  it("reports the detected DWG version in the 501 response", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("old.dwg", 512, "AC1015"));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.dwgVersion).toBe("AC1015");
  });

  // P1-06 (a) — traversal filename rejected before any filesystem work.
  it("rejects a path-traversal filename with 400", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("../../evil.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/filename/i);
  });

  it("rejects a filename with path separators", async () => {
    for (const bad of ["a/b.dwg", "a\\b.dwg"]) {
      const form = new FormData();
      form.set("file", makeDwgFile(bad, 1024));
      const res = await POST(makeRequest(form));
      expect(res.status).toBe(400);
    }
  });

  it("accepts a plain slug filename (regression: valid names still pass)", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("floor-plan_01.dwg", 1024));
    const res = await POST(makeRequest(form));
    // No converter configured ⇒ 501, but it got PAST filename validation.
    expect(res.status).toBe(501);
  });

  // Korean users name drawings in Korean — the filename must not be forced
  // into an ASCII slug. Validation only guards against path escape, so any
  // separator-free name reaches the converter stage (501 without converter).
  it("accepts a Korean filename", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("도면_1층평면도.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
  });

  it("accepts filenames with spaces and parentheses", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("floor plan (final 2).dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
  });

  it("rejects a filename containing a null byte", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("evil" + String.fromCharCode(0) + ".dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });
});
