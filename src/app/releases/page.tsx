// src/app/releases/page.tsx
// Thin explorer page for the v7.0 Prediction Data Product — Phase 35 Task 11.
//
// SERVER COMPONENT ONLY. No client directive, no interactivity, no sliders,
// no in-browser prediction. This page is marketing/exploration surface for
// the data product; the Parquet release + API are the product. Enforced by
// the CI guard in scripts/ci-check-plan.mjs (Task 11 explorer-purity check).

import { Database, Download, FileJson, FileText, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StaticFileReleaseStore } from "@/lib/portfolio/release-store";

async function loadReleaseData() {
  const store = new StaticFileReleaseStore();
  const [history, manifest] = await Promise.all([
    store.listReleases(),
    store.getManifest("latest"),
  ]);

  const calibration = manifest ? await store.getCalibration(manifest.version) : null;

  // Check whether predictions are actually published (Parquet, or a readable
  // JSON/JSONL substitute) — never fabricate a row count.
  let predictionsAvailable = false;
  if (manifest) {
    const probe = await store.getPredictions(manifest.version, "0000000000");
    // "unknown-region" means the predictions file exists and was parsed
    // successfully, just no rows matched our probe bjdongCd.
    predictionsAvailable = probe.status === "unknown-region" || probe.status === "ok";
  }

  return { history, manifest, calibration, predictionsAvailable };
}

export default async function ReleasesPage() {
  const { history, manifest, calibration, predictionsAvailable } = await loadReleaseData();

  if (!manifest) {
    return (
      <div className="mx-auto max-w-screen-lg px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>No releases published yet</CardTitle>
            <CardDescription>
              The v7.0 Prediction Data Product has not published a release. Check back later.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const version = manifest.version;
  const artifactBase = `/releases/${version}`;

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-12">
      <section className="mb-10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio Prediction Data Product</h1>
            <p className="text-sm text-muted-foreground">
              Versioned, calibrated energy-prediction releases for the Korean building stock.
            </p>
          </div>
        </div>
      </section>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                Latest release: {version}
                {manifest.codename && <Badge variant="secondary">{manifest.codename}</Badge>}
              </CardTitle>
              <CardDescription>
                Generated {manifest.generatedAt} · schema v{manifest.featureSchemaVersion ?? "unknown"}
              </CardDescription>
            </div>
            {predictionsAvailable ? (
              <Badge>predictions.parquet available</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-400 text-amber-700">
                predictions.parquet pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Building coverage</p>
              <p className="text-lg font-semibold">
                {manifest.coverage?.buildingCount?.toLocaleString() ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Region coverage</p>
              <p className="text-lg font-semibold">
                {manifest.coverage?.sidoCount ?? "-"} 시도 / {manifest.coverage?.sigunguCount ?? "-"} 시군구
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="text-lg font-semibold">{manifest.modelVersion ?? "-"}</p>
            </div>
          </div>

          {!predictionsAvailable && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              The trained model and dataset artifacts for this release currently exist only on the
              offline training host. <code>predictions.parquet</code> has not yet been uploaded, so the
              prediction API will return <code>503</code> for this region until it lands.
            </p>
          )}
        </CardContent>
      </Card>

      {calibration && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Calibration against ECO2</CardTitle>
            <CardDescription>
              {calibration.tierLabel ?? calibration.tier ?? "Held-out validation"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">MAPE</p>
                <p className="text-lg font-semibold">
                  {(calibration.metrics.mape * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Kendall tau</p>
                <p className="text-lg font-semibold">{calibration.metrics.kendallTau.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Held-out sample</p>
                <p className="text-lg font-semibold">
                  {calibration.holdout?.buildingCount?.toLocaleString() ?? "-"} buildings
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
          <CardDescription>Download links for release {version}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              {predictionsAvailable ? (
                <a href={`${artifactBase}/predictions.parquet`} className="text-primary hover:underline">
                  predictions.parquet
                </a>
              ) : (
                <span className="text-muted-foreground">
                  predictions.parquet <span className="italic">(pending upload)</span>
                </span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-muted-foreground" />
              <a href={`${artifactBase}/schema.json`} className="text-primary hover:underline">
                schema.json
              </a>
            </li>
            <li className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <a href={`${artifactBase}/data-dictionary.md`} className="text-primary hover:underline">
                data-dictionary.md
              </a>
            </li>
            <li className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <a href={`${artifactBase}/calibration.md`} className="text-primary hover:underline">
                calibration.md
              </a>
              {!calibration && <span className="text-xs text-muted-foreground">(pending)</span>}
            </li>
            <li className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-muted-foreground" />
              <a href={`${artifactBase}/calibration.json`} className="text-primary hover:underline">
                calibration.json
              </a>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            API access
          </CardTitle>
          <CardDescription>Read-only REST for programmatic consumers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <code className="rounded bg-muted px-1.5 py-0.5">GET /api/v1/predictions/{"{bjdongCd}"}</code>
            {" "}— latest-release rows for a 10-digit 법정동 code. Rate-limited to 60 req/min per IP.
          </p>
          <p className="text-muted-foreground">
            Release history: {history.length > 0 ? history.join(", ") : version}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
