// src/app/models/[id]/page.tsx — thin server wrapper for a reference building.
//
// The gallery card opens this. It is a detail view of one model, not another
// way into the product: it has no form, takes no input, and links onward into
// step 1 like the gallery does. AGENTS.md's "no further front door" rule is
// about entry points, and this is a leaf.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  isReferenceBuildingId,
  loadReferenceBuildingManifest,
  referenceBuildingBaseUrl,
  referenceBuildingModelUrl,
} from "@/lib/reference-buildings/manifest";
import { ReferenceModelViewer } from "@/components/reference-building/reference-model-viewer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isReferenceBuildingId(id)) return { title: "모델 | BIMFIT" };
  const manifest = await loadReferenceBuildingManifest(id);
  return {
    title: manifest ? `${manifest.name.en} | BIMFIT` : "모델 | BIMFIT",
    description: manifest?.summary.en,
  };
}

/** A figure and the thing in the model that states it. */
function Stated({
  label,
  value,
  read,
}: {
  label: string;
  value: string;
  read: string;
}) {
  return (
    <div className="border-t border-border py-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-base text-foreground">{value}</dd>
      <dd className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
        {read}
      </dd>
    </div>
  );
}

export default async function ReferenceBuildingPage({ params }: Props) {
  const { id } = await params;
  if (!isReferenceBuildingId(id)) notFound();
  const manifest = await loadReferenceBuildingManifest(id);
  // A missing manifest means the build step has not run. 404 rather than an
  // empty viewer: a page that renders nothing looks like a broken model.
  if (!manifest) notFound();

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 1 });

  return (
    <main className="mx-auto flex min-h-dvh max-w-[92rem] flex-col gap-6 px-4 py-6 lg:flex-row">
      <section className="min-h-[26rem] flex-1 overflow-hidden rounded-[8px] border border-border bg-card shadow-xs lg:min-h-[calc(100dvh-3rem)]">
        <ReferenceModelViewer
          manifest={manifest}
          modelUrl={referenceBuildingModelUrl(id)}
          baseUrl={referenceBuildingBaseUrl(id)}
          locale="ko"
        />
      </section>

      <aside className="w-full shrink-0 lg:w-[22rem]">
        <Link
          href="/"
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          ← BIMFIT
        </Link>
        <h1 className="mt-4 text-2xl text-foreground">{manifest.name.ko}</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {manifest.name.en}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {manifest.summary.ko}
        </p>

        <dl className="mt-6">
          <Stated
            label="연면적"
            value={`${fmt(manifest.areas.totalFloorAreaSqm)} m²`}
            read={`${manifest.counts.spacesFloor} spaces · GSA BIM Area, less ${fmt(
              manifest.areas.areaPlanTotalSqm - manifest.areas.totalFloorAreaSqm,
            )} m² of ROOF / OPEN TO BELOW / MECH. YARD`}
          />
          <Stated
            label="외벽 (순)"
            value={`${fmt(manifest.areas.exteriorWallNetSqm)} m²`}
            read={`${manifest.counts.exteriorWalls} walls · tessellated solid, openings and clips already voided`}
          />
          <Stated
            label="지상층"
            value={`${manifest.counts.storeys}`}
            read="IfcBuildingStorey with a storey above it"
          />
          <Stated
            label="구성 (레이어)"
            value={`${manifest.counts.assemblies}`}
            read="IfcMaterialLayerSet · names and thicknesses only, no U-value stated"
          />
        </dl>

        {/* The model states no location, and saying so is the point. */}
        {manifest.site.locationIsAuthoringDefault ? (
          <p className="mt-6 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
            {manifest.site.locationNote}
          </p>
        ) : null}

        <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {manifest.licence} · {manifest.attribution}
        </p>
      </aside>
    </main>
  );
}
