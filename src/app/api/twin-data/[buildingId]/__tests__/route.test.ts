// src/app/api/twin-data/[buildingId]/__tests__/route.test.ts
// P0-01 — GET /api/twin-data/[buildingId] hardening tests.
// Params arrive as Promise<{ buildingId: string }> per the App Router
// signature; tests construct the same shape.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const ORIGINAL_CWD = process.cwd();

function makeGetArgs(buildingId: string) {
  const req = new Request(
    `http://localhost/api/twin-data/${encodeURIComponent(buildingId)}`
  ) as unknown as NextRequest;
  return [req, { params: Promise.resolve({ buildingId }) }] as const;
}

async function writeFixture(
  tempDir: string,
  buildingId: string,
  dataType: string,
  payload: Record<string, unknown>
) {
  const dir = path.join(tempDir, ".twin-data", buildingId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${dataType}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
}

describe("GET /api/twin-data/[buildingId]", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "twin-get-test-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(ORIGINAL_CWD);
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("traversal ids are rejected with 400 (not 404, no filesystem read)", () => {
    const badIds = ["../../evil", "..%2F..%2Fevil", "a/b", "a\\b", "a".repeat(65), "id with space"];

    for (const badId of badIds) {
      it(`rejects buildingId ${JSON.stringify(badId)}`, async () => {
        const { GET } = await import("../route");
        const [req, ctx] = makeGetArgs(badId);

        const res = await GET(req, ctx);
        expect(res.status).toBe(400);
      });
    }
  });

  it("returns 404 for a valid slug with no stored data", async () => {
    const { GET } = await import("../route");
    const [req, ctx] = makeGetArgs("bldg_01-A");

    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns lastUpdated equal to the stored storedAt, not the response time", async () => {
    const storedAt = "2026-07-01T08:30:00.000Z";
    await writeFixture(tempDir, "bldg_01-A", "energy-bills", {
      buildingId: "bldg_01-A",
      dataType: "energy-bills",
      data: { bills: [{ month: "2026-01", kwh: 1200 }] },
      storedAt,
    });

    const { GET } = await import("../route");
    const [req, ctx] = makeGetArgs("bldg_01-A");

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastUpdated).toBe(storedAt);
    expect(body.energyBills).toEqual({ bills: [{ month: "2026-01", kwh: 1200 }] });
  });

  it("returns the max storedAt across data types", async () => {
    await writeFixture(tempDir, "bldg_01-A", "energy-bills", {
      buildingId: "bldg_01-A",
      dataType: "energy-bills",
      data: { bills: [] },
      storedAt: "2026-06-01T00:00:00.000Z",
    });
    await writeFixture(tempDir, "bldg_01-A", "equipment", {
      buildingId: "bldg_01-A",
      dataType: "equipment",
      data: { hvac: "EHP" },
      storedAt: "2026-07-15T12:00:00.000Z",
    });

    const { GET } = await import("../route");
    const [req, ctx] = makeGetArgs("bldg_01-A");

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastUpdated).toBe("2026-07-15T12:00:00.000Z");
  });

  it("falls back to file mtime when a stored file lacks storedAt", async () => {
    const filePath = await writeFixture(tempDir, "bldg_01-A", "energy-bills", {
      buildingId: "bldg_01-A",
      dataType: "energy-bills",
      data: { bills: [] },
    });
    const stat = await fs.stat(filePath);

    const { GET } = await import("../route");
    const [req, ctx] = makeGetArgs("bldg_01-A");

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastUpdated).toBe(stat.mtime.toISOString());
  });

  it("maps all three data types to camelCase keys (regression)", async () => {
    const storedAt = "2026-07-01T00:00:00.000Z";
    await writeFixture(tempDir, "bldg_01-A", "energy-bills", {
      buildingId: "bldg_01-A", dataType: "energy-bills", data: { bills: [] }, storedAt,
    });
    await writeFixture(tempDir, "bldg_01-A", "floor-plans", {
      buildingId: "bldg_01-A", dataType: "floor-plans", data: { plans: [] }, storedAt,
    });
    await writeFixture(tempDir, "bldg_01-A", "equipment", {
      buildingId: "bldg_01-A", dataType: "equipment", data: { hvac: "EHP" }, storedAt,
    });

    const { GET } = await import("../route");
    const [req, ctx] = makeGetArgs("bldg_01-A");

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.energyBills).toEqual({ bills: [] });
    expect(body.floorPlans).toEqual({ plans: [] });
    expect(body.equipment).toEqual({ hvac: "EHP" });
  });
});
