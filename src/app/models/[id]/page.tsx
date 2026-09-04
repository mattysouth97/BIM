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
import { envelopeConstructions } from "@/lib/reference-buildings/constructions";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
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

  // Solved here rather than in the client component: the U-values are pure
  // functions of the manifest plus the material library, and computing them on
  // the server keeps the whole standards library out of the browser bundle for
  // a page that only needs the answers.
  const constructions = envelopeConstructions(manifest);
  // The recipe + materials the demo's energy frame consumes, or null for a
  // building whose inputs are not written yet. Resolved here for the same
  // reason as the constructions: the registry pulls the ground-coupling and
  // standards modules, which the browser does not need.
  const energy = referenceBuildingEnergyInputs(id);

  return (
    <ReferenceBuildingWorkspace
      manifest={manifest}
      modelUrl={referenceBuildingModelUrl(id)}
      baseUrl={referenceBuildingBaseUrl(id)}
      constructions={constructions}
      energy={energy}
      locale="ko"
    />
  );
}
