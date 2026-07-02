// src/app/api/v1/eco2-imports/route.ts
// POST /api/v1/eco2-imports — Phase 35 Task 10. DEV-ONLY corpus-grow endpoint.
//
//   503 — production (NODE_ENV !== "development")
//   401 — missing/invalid x-corpus-key header (must match CORPUS_API_KEY env)
//   400 — malformed body
//   200 — accepted; row composed from {buildingPk, featureVector, eco2Result}
//         appended to ml/portfolio/corpus/predictions.jsonl with
//         source: "eco2_labeled"
//
// Production corpus-growth path is a Phase 36 deliverable when blob storage
// lands (see plan R10). This endpoint is a local-dev-only stopgap.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { PortfolioFeatureVector } from "@/lib/portfolio/features";
import type { ECO2ImportResult } from "@/lib/energy/eco2-import";

interface Eco2ImportRequestBody {
  buildingPk: string;
  featureVector: PortfolioFeatureVector;
  eco2Result: ECO2ImportResult;
}

function isValidFeatureVector(value: unknown): value is PortfolioFeatureVector {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "number" && Number.isFinite(v)
  );
}

function isValidEco2Result(value: unknown): value is ECO2ImportResult {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.grade === "string" &&
    typeof r.demand === "number" &&
    typeof r.co2 === "number"
  );
}

function getCorpusPath(): string {
  return path.join(process.cwd(), "ml", "portfolio", "corpus", "predictions.jsonl");
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "eco2-imports is a local-dev-only endpoint" },
      { status: 503 }
    );
  }

  const providedKey = request.headers.get("x-corpus-key");
  const expectedKey = process.env.CORPUS_API_KEY;
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: "Invalid or missing x-corpus-key" }, { status: 401 });
  }

  let body: Eco2ImportRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body?.buildingPk || typeof body.buildingPk !== "string") {
    return NextResponse.json({ error: "Missing field: buildingPk" }, { status: 400 });
  }
  if (!isValidFeatureVector(body.featureVector)) {
    return NextResponse.json({ error: "Missing or invalid field: featureVector" }, { status: 400 });
  }
  if (!isValidEco2Result(body.eco2Result)) {
    return NextResponse.json({ error: "Missing or invalid field: eco2Result" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const inputSnapshotSha256 = crypto
    .createHash("sha256")
    .update(JSON.stringify({ buildingPk: body.buildingPk, featureVector: body.featureVector }))
    .digest("hex");

  const row = {
    featureVector: body.featureVector,
    prediction: body.eco2Result,
    buildingPk: body.buildingPk,
    modelVersion: "eco2-labeled",
    inputSnapshotSha256,
    timestamp,
    source: "eco2_labeled" as const,
  };

  const corpusPath = getCorpusPath();
  await fs.mkdir(path.dirname(corpusPath), { recursive: true });
  await fs.appendFile(corpusPath, JSON.stringify(row) + "\n", "utf-8");

  return NextResponse.json({ accepted: true, timestamp }, { status: 200 });
}
