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

/** Tiny file stand-in (size/content do not matter for these checks). */
function makeFile(
  name: string,
  bytes: number,
  type = "application/acad"
): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], name, { type });
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
    form.set("file", makeFile("plan.dxf", 10));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/\.dwg/i);
  });

  it("returns 413 when DWG exceeds 50 MB", async () => {
    // 50 MB + 1 byte.
    const tooBig = 50 * 1024 * 1024 + 1;
    const form = new FormData();
    form.set("file", makeFile("huge.dwg", tooBig));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds/i);
    expect(body.size).toBe(tooBig);
  });

  it("returns 501 with a DXF-export hint for a valid DWG upload", async () => {
    const form = new FormData();
    form.set("file", makeFile("plan.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/not yet/i);
    expect(body.hint).toMatch(/\.dxf/i);
  });

  it("accepts .DWG (uppercase) extension", async () => {
    const form = new FormData();
    form.set("file", makeFile("PLAN.DWG", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(501);
  });
});
