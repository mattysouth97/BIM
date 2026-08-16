// src/app/api/energy/consumption/__tests__/route.test.ts
// P1-06 (e, f) — corrupted BASE_URL fixed; auth + error contract.

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeReq(query: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/energy/consumption?${query}`, { headers });
}

async function importRoute() {
  vi.resetModules();
  return import("../route");
}

describe("GET /api/energy/consumption (P1-06 e)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("route source contains no leading whitespace in BASE_URL and names BldEngyHubService", () => {
    const src = readFileSync(join(__dirname, "..", "route.ts"), "utf-8");
    // No tab characters anywhere in the source (the corrupted literal had one).
    expect(src.includes("\t")).toBe(false);
    // The BASE_URL string starts cleanly with https.
    expect(src).toMatch(/BASE_URL\s*=\s*\n?\s*"https:\/\//);
    expect(src).toContain("BldEngyHubService");
  });

  it("returns 401 without x-api-key", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("mgmBldrgstPk=abc"));
    expect(res.status).toBe(401);
  });

  it("returns 502 when the upstream fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" }));
    const { GET } = await importRoute();
    const res = await GET(makeReq("mgmBldrgstPk=abc", { "x-api-key": "k" }));
    expect(res.status).toBe(502);
  });
});
