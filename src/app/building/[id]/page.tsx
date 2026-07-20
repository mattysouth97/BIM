// src/app/building/[id]/page.tsx — thin server wrapper
// Exports generateMetadata (building-specific title) and renders the client
// workspace child. Title is derived from the parsed building id — no secrets
// or env values are ever forwarded into metadata (AFF-2).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseBuildingId } from "@/lib/constants";
import BuildingWorkspace from "./building-workspace";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Derive a human-readable metadata title from a raw building id segment.
 * Returns a fallback string when the id is malformed so generateMetadata
 * never throws.  Pure function — unit-tested in
 * src/lib/__tests__/building-metadata-title.test.ts.
 */
export function buildingMetadataTitle(id: string): string {
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
  if (!parseBuildingId(id)) notFound();

  return <BuildingWorkspace params={params} />;
}
