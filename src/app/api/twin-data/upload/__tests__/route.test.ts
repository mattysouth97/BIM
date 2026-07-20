// src/app/api/twin-data/upload/__tests__/route.test.ts
// P0-01 — POST /api/twin-data/upload hardening tests.
// DI mirrors eco2-imports/__tests__/route.test.ts: tempdir chdir +
// vi.resetModules + vi.stubEnv + dynamic import so .twin-data writes land in
// a temp dir.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const ORIGINAL_CWD = process.cwd();
const KEY = "twin-secret";

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const payload = JSON.stringify(body);
  const req = new Request("http://localhost/api/twin-data/upload", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload, "utf-8")),
      ...headers,
    },
  });
  return req as unknown as NextRequest;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    buildingId: "bldg_01-A",
    dataType: "energy-bills",
    data: { bills: [{ month: "2026-01", kwh: 1200 }] },
    ...overrides,
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("POST /api/twin-data/upload", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "twin-upload-test-"));
    process.chdir(tempDir);
    vi.resetModules();
    vi.stubEnv("TWIN_DATA_API_KEY", KEY);
  });

  afterEach(async () => {
    process.chdir(ORIGINAL_CWD);
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
    // Red-phase safety net: a traversal write from the unhardened route would
    // land in os.tmpdir()/evil — remove it if it ever appears.
    await fs.rm(path.join(os.tmpdir(), "evil"), { recursive: true, force: true });
  });

  describe("traversal and malformed buildingId are rejected with 400 and no write", () => {
    const badIds = ["../../evil", "a/b", "a\\b", "a".repeat(65), "id with space"];

    for (const badId of badIds) {
      it(`rejects buildingId ${JSON.stringify(badId)}`, async () => {
        const { POST } = await import("../route");

        const res = await POST(
          makeRequest(validBody({ buildingId: badId }), { "x-twin-data-key": KEY })
        );
        expect(res.status).toBe(400);

        // Nothing may be created — neither inside .twin-data nor at the
        // traversal target.
        expect(await exists(path.join(tempDir, ".twin-data"))).toBe(false);
        expect(await exists(path.join(os.tmpdir(), "evil"))).toBe(false);
      });
    }
  });

  it("returns 401 when x-twin-data-key is missing and writes nothing", async () => {
    const { POST } = await import("../route");

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
    expect(await exists(path.join(tempDir, ".twin-data"))).toBe(false);
  });

  it("returns 401 when x-twin-data-key is wrong and writes nothing", async () => {
    const { POST } = await import("../route");

    const res = await POST(makeRequest(validBody(), { "x-twin-data-key": "wrong" }));
    expect(res.status).toBe(401);
    expect(await exists(path.join(tempDir, ".twin-data"))).toBe(false);
  });

  it("fails closed with 401 when TWIN_DATA_API_KEY is unset", async () => {
    vi.stubEnv("TWIN_DATA_API_KEY", "");
    const { POST } = await import("../route");

    const res = await POST(makeRequest(validBody(), { "x-twin-data-key": "" }));
    expect(res.status).toBe(401);
    expect(await exists(path.join(tempDir, ".twin-data"))).toBe(false);
  });

  it("returns 413 before body parsing when content-length exceeds 64 KB", async () => {
    const { POST } = await import("../route");

    // happy-dom's Request recomputes content-length from the real body, so a
    // minimal stand-in matching the route's surface (headers.get + json) is
    // used, mirroring eco2-imports/__tests__/route.test.ts.
    const oversizedHeaders = new Headers({
      "content-type": "application/json",
      "x-twin-data-key": KEY,
      "content-length": String(64 * 1024 + 1),
    });
    let parsed = false;
    const fakeReq = {
      headers: oversizedHeaders,
      json: async () => {
        parsed = true;
        return validBody();
      },
    } as unknown as NextRequest;

    const res = await POST(fakeReq);
    expect(res.status).toBe(413);
    expect(parsed).toBe(false);
  });

  it("stores the payload and returns an ISO storedAt without any filesystem path", async () => {
    const { POST } = await import("../route");

    const res = await POST(makeRequest(validBody(), { "x-twin-data-key": KEY }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; storedAt: string };
    expect(body.success).toBe(true);
    // storedAt is an ISO timestamp, not a path.
    expect(body.storedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(".twin-data");
    expect(raw).not.toMatch(/[A-Za-z]:\\/); // no Windows drive letters
    expect(raw).not.toContain(tempDir);

    const filePath = path.join(tempDir, ".twin-data", "bldg_01-A", "energy-bills.json");
    const stored = JSON.parse(await fs.readFile(filePath, "utf-8"));
    expect(stored.buildingId).toBe("bldg_01-A");
    expect(stored.dataType).toBe("energy-bills");
    expect(stored.storedAt).toBe(body.storedAt);
  });

  it("returns 400 for invalid JSON (regression)", async () => {
    const { POST } = await import("../route");

    const req = new Request("http://localhost/api/twin-data/upload", {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json", "x-twin-data-key": KEY },
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid dataType (regression)", async () => {
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest(validBody({ dataType: "secrets" }), { "x-twin-data-key": KEY })
    );
    expect(res.status).toBe(400);
    expect(await exists(path.join(tempDir, ".twin-data"))).toBe(false);
  });

  it("returns 400 when data is missing (regression)", async () => {
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest(validBody({ data: null }), { "x-twin-data-key": KEY })
    );
    expect(res.status).toBe(400);
  });
});
