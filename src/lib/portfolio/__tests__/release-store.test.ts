// src/lib/portfolio/__tests__/release-store.test.ts
// Tests for StaticFileReleaseStore — Phase 35 Task 9.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { StaticFileReleaseStore } from "../release-store";

async function makeTempReleasesDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "releases-test-"));
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data), "utf-8");
}

describe("StaticFileReleaseStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempReleasesDir();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("resolves 'latest' via top-level manifest.json pointer", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    await writeJson(path.join(dir, "v0.1.0", "manifest.json"), {
      version: "v0.1.0",
      generatedAt: "2026-04-22T00:00:00Z",
      featureSchemaVersion: "1.0.0",
    });

    const store = new StaticFileReleaseStore(dir);
    const manifest = await store.getManifest("latest");
    expect(manifest?.version).toBe("v0.1.0");
  });

  it("returns null manifest when no top-level pointer exists", async () => {
    const store = new StaticFileReleaseStore(dir);
    const manifest = await store.getManifest("latest");
    expect(manifest).toBeNull();
  });

  it("returns null manifest for a missing specific version", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    const store = new StaticFileReleaseStore(dir);
    const manifest = await store.getManifest("v9.9.9");
    expect(manifest).toBeNull();
  });

  it("listReleases returns the history array", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    const store = new StaticFileReleaseStore(dir);
    const list = await store.listReleases();
    expect(list).toEqual(["v0.1.0"]);
  });

  it("listReleases returns empty array when no manifest exists", async () => {
    const store = new StaticFileReleaseStore(dir);
    const list = await store.listReleases();
    expect(list).toEqual([]);
  });

  it("getPredictions returns data-unavailable when no release is published", async () => {
    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("latest", "1111010100");
    expect(result.status).toBe("data-unavailable");
  });

  it("getPredictions returns data-unavailable when release exists but has no predictions file", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    await writeJson(path.join(dir, "v0.1.0", "manifest.json"), {
      version: "v0.1.0",
      generatedAt: "2026-04-22T00:00:00Z",
      featureSchemaVersion: "1.0.0",
    });

    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("latest", "1111010100");
    expect(result.status).toBe("data-unavailable");
    if (result.status === "data-unavailable") {
      expect(result.reason).toMatch(/predictions/i);
    }
  });

  it("getPredictions returns unknown-region when predictions.json exists but bjdongCd not present", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    await writeJson(path.join(dir, "v0.1.0", "manifest.json"), {
      version: "v0.1.0",
      generatedAt: "2026-04-22T00:00:00Z",
      featureSchemaVersion: "1.0.0",
    });
    await writeJson(path.join(dir, "v0.1.0", "predictions.json"), [
      {
        bjdongCd: "1111010200",
        buildingPk: "pk-1",
        predictedEuiKwhPerSqmYr: 120,
        predictedGrade: "3",
        modelVersion: "xgb-1.3.2",
        generatedAt: "2026-04-22T00:00:00Z",
      },
    ]);

    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("latest", "1111010100");
    expect(result.status).toBe("unknown-region");
  });

  it("getPredictions returns ok with matching rows from predictions.json", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    await writeJson(path.join(dir, "v0.1.0", "manifest.json"), {
      version: "v0.1.0",
      generatedAt: "2026-04-22T00:00:00Z",
      featureSchemaVersion: "1.0.0",
    });
    const row = {
      bjdongCd: "1111010100",
      buildingPk: "pk-1",
      predictedEuiKwhPerSqmYr: 120,
      predictedGrade: "3",
      modelVersion: "xgb-1.3.2",
      generatedAt: "2026-04-22T00:00:00Z",
    };
    await writeJson(path.join(dir, "v0.1.0", "predictions.json"), [row]);

    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("latest", "1111010100");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.rows).toEqual([row]);
      expect(result.releaseVersion).toBe("v0.1.0");
      expect(result.schemaVersion).toBe("1.0.0");
    }
  });

  it("getPredictions reads predictions.jsonl when predictions.json is absent", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    await writeJson(path.join(dir, "v0.1.0", "manifest.json"), {
      version: "v0.1.0",
      generatedAt: "2026-04-22T00:00:00Z",
      featureSchemaVersion: "1.0.0",
    });
    const row = {
      bjdongCd: "1111010100",
      buildingPk: "pk-2",
      predictedEuiKwhPerSqmYr: 99,
      predictedGrade: "2",
      modelVersion: "xgb-1.3.2",
      generatedAt: "2026-04-22T00:00:00Z",
    };
    await fs.writeFile(path.join(dir, "v0.1.0", "predictions.jsonl"), JSON.stringify(row) + "\n", "utf-8");

    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("latest", "1111010100");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.rows).toEqual([row]);
    }
  });

  it("getCalibration returns null when calibration.json is absent", async () => {
    const store = new StaticFileReleaseStore(dir);
    const calibration = await store.getCalibration("v0.1.0");
    expect(calibration).toBeNull();
  });

  it("getCalibration reads calibration.json when present", async () => {
    await writeJson(path.join(dir, "v0.1.0", "calibration.json"), {
      version: "v0.1.0",
      metrics: { mape: 0.084, kendallTau: 0.672 },
    });
    const store = new StaticFileReleaseStore(dir);
    const calibration = await store.getCalibration("v0.1.0");
    expect(calibration?.metrics.kendallTau).toBe(0.672);
  });

  // ─── Version allowlist — rejects path-traversal-shaped version strings ────

  it("getManifest rejects a version containing path traversal characters", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    const store = new StaticFileReleaseStore(dir);
    const manifest = await store.getManifest("../../etc/passwd");
    expect(manifest).toBeNull();
  });

  it("getManifest accepts 'latest' as a version value", async () => {
    await writeJson(path.join(dir, "manifest.json"), { latest: "v0.1.0", history: ["v0.1.0"] });
    await writeJson(path.join(dir, "v0.1.0", "manifest.json"), {
      version: "v0.1.0",
      generatedAt: "2026-04-22T00:00:00Z",
      featureSchemaVersion: "1.0.0",
    });
    const store = new StaticFileReleaseStore(dir);
    const manifest = await store.getManifest("latest");
    expect(manifest?.version).toBe("v0.1.0");
  });

  it("getCalibration rejects a version containing path separators", async () => {
    const store = new StaticFileReleaseStore(dir);
    const calibration = await store.getCalibration("../secrets");
    expect(calibration).toBeNull();
  });

  it("getCalibration rejects a version containing a null byte", async () => {
    const store = new StaticFileReleaseStore(dir);
    const calibration = await store.getCalibration("v0.1.0 ");
    expect(calibration).toBeNull();
  });

  it("getPredictions returns data-unavailable for a version containing path traversal characters", async () => {
    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("../../etc/passwd", "1111010100");
    expect(result.status).toBe("data-unavailable");
    if (result.status === "data-unavailable") {
      expect(result.reason).toMatch(/invalid/i);
    }
  });

  it("getPredictions returns data-unavailable for a version containing a slash", async () => {
    const store = new StaticFileReleaseStore(dir);
    const result = await store.getPredictions("v0.1.0/../other", "1111010100");
    expect(result.status).toBe("data-unavailable");
  });
});
