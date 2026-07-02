// src/lib/portfolio/release-store.ts
// ReleaseStore interface + Phase 35 StaticFileReleaseStore implementation —
// Task 9.
//
// Reads immutable release artifacts from public/releases/ on the local
// filesystem. Server-side only (uses node:fs + process.cwd()).
//
// Phase 36 can swap in an ObjectStorageReleaseStore without touching callers
// — every consumer depends on the ReleaseStore interface, never on the
// filesystem layout directly.

import { promises as fs } from "fs";
import path from "path";
import type {
  CalibrationJson,
  LatestReleasePointer,
  PredictionRow,
  PredictionsResult,
  ReleaseManifest,
} from "./types";

export interface ReleaseStore {
  /**
   * Resolve a release manifest. Pass "latest" to resolve via the top-level
   * pointer at public/releases/manifest.json. Returns null if the version
   * (or the pointer itself) does not exist.
   */
  getManifest(version: string | "latest"): Promise<ReleaseManifest | null>;

  /** List all released versions per the top-level manifest.json history. */
  listReleases(): Promise<string[]>;

  /**
   * Look up prediction rows for a given bjdongCd within the latest release.
   * Always returns a typed result — never fabricates rows. If no readable
   * predictions file exists (predictions.json / predictions.jsonl), or the
   * release itself doesn't exist, returns a "data-unavailable" result rather
   * than throwing or returning an empty-but-"ok" payload.
   */
  getPredictions(version: string | "latest", bjdongCd: string): Promise<PredictionsResult>;

  /** Read the calibration.json for a given release version, if present. */
  getCalibration(version: string): Promise<CalibrationJson | null>;
}

const RELEASES_DIR = () => path.join(process.cwd(), "public", "releases");

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class StaticFileReleaseStore implements ReleaseStore {
  private releasesDir: string;

  constructor(releasesDir: string = RELEASES_DIR()) {
    this.releasesDir = releasesDir;
  }

  private async getLatestPointer(): Promise<LatestReleasePointer | null> {
    return readJsonFile<LatestReleasePointer>(path.join(this.releasesDir, "manifest.json"));
  }

  private async resolveVersion(version: string | "latest"): Promise<string | null> {
    if (version !== "latest") return version;
    const pointer = await this.getLatestPointer();
    return pointer?.latest ?? null;
  }

  async getManifest(version: string | "latest"): Promise<ReleaseManifest | null> {
    const resolved = await this.resolveVersion(version);
    if (!resolved) return null;
    return readJsonFile<ReleaseManifest>(path.join(this.releasesDir, resolved, "manifest.json"));
  }

  async listReleases(): Promise<string[]> {
    const pointer = await this.getLatestPointer();
    return pointer?.history ?? [];
  }

  async getCalibration(version: string): Promise<CalibrationJson | null> {
    return readJsonFile<CalibrationJson>(path.join(this.releasesDir, version, "calibration.json"));
  }

  async getPredictions(version: string | "latest", bjdongCd: string): Promise<PredictionsResult> {
    const resolved = await this.resolveVersion(version);
    if (!resolved) {
      return { status: "data-unavailable", reason: "No release has been published yet" };
    }

    const releaseDir = path.join(this.releasesDir, resolved);
    const manifest = await readJsonFile<ReleaseManifest>(path.join(releaseDir, "manifest.json"));
    if (!manifest) {
      return { status: "data-unavailable", reason: `Release ${resolved} manifest not found` };
    }

    // predictions.parquet is the canonical artifact but is download-only —
    // not parsed in the Next.js runtime. The readable formats are
    // predictions.json (array of PredictionRow) or predictions.jsonl (one
    // PredictionRow per line). If neither exists, degrade honestly.
    const jsonPath = path.join(releaseDir, "predictions.json");
    const jsonlPath = path.join(releaseDir, "predictions.jsonl");

    let rows: PredictionRow[] | null = null;

    if (await fileExists(jsonPath)) {
      rows = await readJsonFile<PredictionRow[]>(jsonPath);
    } else if (await fileExists(jsonlPath)) {
      try {
        const raw = await fs.readFile(jsonlPath, "utf-8");
        rows = raw
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as PredictionRow);
      } catch {
        rows = null;
      }
    }

    if (!rows) {
      return {
        status: "data-unavailable",
        reason: `Release ${resolved} has no readable predictions file (predictions.parquet, if present, is a download-only artifact)`,
      };
    }

    const matching = rows.filter((row) => row.bjdongCd === bjdongCd);
    if (matching.length === 0) {
      return { status: "unknown-region" };
    }

    return {
      status: "ok",
      rows: matching,
      releaseVersion: resolved,
      schemaVersion: manifest.featureSchemaVersion ?? "unknown",
      generatedAt: manifest.generatedAt,
    };
  }
}
