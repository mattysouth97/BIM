// src/app/building/[id]/page.tsx — thin server wrapper
// Exports generateMetadata (building-specific title) and renders the client
// workspace child. Title is derived from the parsed building id — no secrets
// or env values are ever forwarded into metadata (AFF-2).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseBuildingId } from "@/lib/constants";
import { isCadDraftPk } from "@/lib/workflow/cad-draft";
import BuildingWorkspace from "./building-workspace";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * P2-24 — a /building/[id] segment is routable when it is either a valid
 * 5-part ledger id or a cad-first draft id (cad-<uuid>). Pure function —
 * unit-tested in src/lib/__tests__/building-metadata-title.test.ts.
 */
export function isRoutableBuildingId(id: string): boolean {
  return isCadDraftPk(id) || parseBuildingId(id) !== null;
}

/**
 * Derive a human-readable metadata title from a raw building id segment.
 * Returns a fallback string when the id is malformed so generateMetadata
 * never throws.  Pure function — unit-tested in
 * src/lib/__tests__/building-metadata-title.test.ts.
 */
export function buildingMetadataTitle(id: string): string {
  // P2-24: cad drafts carry no ledger codes — an honest draft title instead.
  if (isCadDraftPk(id)) return "CAD 트윈 드래프트 | GreenRetrofit Simulator";
  const parsed = parseBuildingId(id);
  if (!parsed) return "건물 정보 | GreenRetrofit Simulator";
  return `건물 ${parsed.sigunguCd}-${parsed.bjdongCd} | GreenRetrofit Simulator`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: buildingMetadataTitle(id) };
}

export default async function BuildingDetailPage({ params }: Props) {
  const { id } = await params;
  // Validate the id at the server layer so a bad URL 404s before the client
  // component even mounts (complements the client-side parseBuildingId guard).
  // P2-24: cad-first draft ids (cad-<uuid>) are routable too.
  if (!isRoutableBuildingId(id)) notFound();

  return <BuildingWorkspace params={params} />;
}
