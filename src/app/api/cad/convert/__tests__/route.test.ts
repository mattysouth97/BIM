import { describe, it, expect } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";
import {
  CAD_SERVER_FALLBACK_MAX_FILE_BYTES,
  CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES,
} from "@/lib/cad/import-limits";

/** Build a NextRequest carrying a multipart form with an optional file. */
function makeRequest(form: FormData): NextRequest {
  const req = new Request("http://localhost/api/cad/convert", {
    method: "POST",
    body: form,
  });
  return req as unknown as NextRequest;
}

/** Minimal request double for guards that must run before multipart parsing. */
function makePreflightRequest(headers: Record<string, string>): NextRequest {
  const normalized = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    headers: {
      get: (name: string) => normalized.get(name.toLowerCase()) ?? null,
    },
    url: "http://localhost/api/cad/convert",
    signal: new AbortController().signal,
    formData: () => {
      throw new Error("multipart body must not be parsed by a preflight guard");
    },
  } as unknown as NextRequest;
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
  it("rejects cross-origin browser requests before parsing the body", async () => {
    const req = makePreflightRequest({ Origin: "https://example.invalid" });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("rejects an oversized declared multipart body before formData allocation", async () => {
    const req = makePreflightRequest({
      "Content-Length": String(CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES + 1),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.limitBytes).toBe(CAD_SERVER_FALLBACK_MAX_REQUEST_BYTES);
  });

  it("applies per-instance back-pressure before parsing a second request", async () => {
    let release!: (form: FormData) => void;
    const pendingForm = new Promise<FormData>((resolve) => {
      release = resolve;
    });
    const firstRequest = {
      headers: new Headers(),
      url: "http://localhost/api/cad/convert",
      signal: new AbortController().signal,
      formData: () => pendingForm,
    } as unknown as NextRequest;
    const firstResponse = POST(firstRequest);
    await Promise.resolve();

    try {
      const secondResponse = await POST(makeRequest(new FormData()));
      expect(secondResponse.status).toBe(429);
      expect(secondResponse.headers.get("retry-after")).toBe("5");
    } finally {
      release(new FormData());
    }
    expect((await firstResponse).status).toBe(400);
  });

  it("does not enter a converter after the request has been canceled", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("cancelled.dwg", 1_024));
    const controller = new AbortController();
    controller.abort();
    const req = {
      headers: { get: () => null },
      url: "http://localhost/api/cad/convert",
      signal: controller.signal,
      formData: async () => form,
    } as unknown as NextRequest;

    await expect(POST(req)).rejects.toMatchObject({ name: "AbortError" });

    // The semaphore is released by the aborted request.
    expect(await POST(makeRequest(new FormData()))).toMatchObject({ status: 400 });
  });

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

  it("returns 413 before conversion when DWG exceeds the production fallback limit", async () => {
    const tooBig = CAD_SERVER_FALLBACK_MAX_FILE_BYTES + 1;
    const form = new FormData();
    form.set("file", makeDwgFile("huge.dwg", tooBig));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds/i);
    expect(body.error).toContain("4 MB");
    expect(body.detail).toContain("50 MB");
    expect(body.hint).toMatch(/browser|DXF/i);
    expect(body.size).toBe(tooBig);
    expect(body.limitBytes).toBe(CAD_SERVER_FALLBACK_MAX_FILE_BYTES);
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

  // The route no longer answers "conversion unavailable": LibreDWG WASM runs
  // in-process, so a well-formed header always gets a real attempt. These
  // fixtures are AC-headed but otherwise zero-filled, so LibreDWG correctly
  // declines them — 502 with a reason, not 501 with a shrug.
  it("attempts conversion and reports why it failed for an undecodable DWG", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("plan.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.dwgVersion).toBe("AC1032");
    expect(body.dwgVersionLabel).toBe("AutoCAD 2018");
    expect(body.hint).toMatch(/dxf/i);
    // Both strategies are accounted for, so the failure is diagnosable.
    expect(body.detail).toMatch(/외부 변환기/);
    expect(body.detail).toMatch(/LibreDWG/);
  });

  it("skips the external converter when DWG_CONVERTER_PATH is unset", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("plan.dwg", 1024));
    const res = await POST(makeRequest(form));
    const body = await res.json();
    expect(body.detail).toMatch(/DWG_CONVERTER_PATH가 설정되지 않음/);
  });

  it("accepts .DWG (uppercase) extension", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("PLAN.DWG", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(502);
  });

  it("reports the detected DWG version in the failure response", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("old.dwg", 512, "AC1015"));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.dwgVersion).toBe("AC1015");
    expect(body.dwgVersionLabel).toBe("AutoCAD 2000");
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
    // Conversion is attempted and declines the stub bytes ⇒ 502, which means
    // it got PAST filename validation (a rejected name is 400).
    expect(res.status).toBe(502);
  });

  // Korean users name drawings in Korean — the filename must not be forced
  // into an ASCII slug. Validation only guards against path escape, so any
  // separator-free name reaches the converter stage (502 on stub bytes).
  it("accepts a Korean filename", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("도면_1층평면도.dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(502);
  });

  it("accepts filenames with spaces and parentheses", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("floor plan (final 2).dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(502);
  });

  it("rejects a filename containing a null byte", async () => {
    const form = new FormData();
    form.set("file", makeDwgFile("evil" + String.fromCharCode(0) + ".dwg", 1024));
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(400);
  });
});
