// src/app/models/[id]/page.tsx — thin server wrapper for a reference building.
//
// The gallery card opens this. It is a detail view of one model, not another
// way into the product: it has no form, takes no input, and links onward into
// step 1 like the gallery does. AGENTS.md's "no further front door" rule is
// about entry points, and this is a leaf.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  isReferenceBuildingId,
  loadReferenceBuildingManifest,
  referenceBuildingBaseUrl,
  referenceBuildingModelUrl,
} from "@/lib/reference-buildings/manifest";
import { ReferenceBuildingWorkspace } from "@/components/reference-building/reference-building-workspace";

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

export default async function ReferenceBuildingPage({ params }: Props) {
  const { id } = await params;
  if (!isReferenceBuildingId(id)) notFound();
  const manifest = await loadReferenceBuildingManifest(id);
  // A missing manifest means the build step has not run. 404 rather than an
  // empty viewer: a page that renders nothing looks like a broken model.
  if (!manifest) notFound();

  return (
    <ReferenceBuildingWorkspace
      manifest={manifest}
      modelUrl={referenceBuildingModelUrl(id)}
      baseUrl={referenceBuildingBaseUrl(id)}
      locale="ko"
    />
  );
}
