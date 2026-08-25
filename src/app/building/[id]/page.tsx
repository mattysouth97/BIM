// src/app/building/[id]/page.tsx — thin server wrapper
// Exports generateMetadata (building-specific title) and renders the client
// workspace child. Title is derived from the parsed building id — no secrets
// or env values are ever forwarded into metadata (AFF-2).

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  DEMO_BUILDING_ID,
  DRAWING_BUILDING_ID,
  parseBuildingId,
} from "@/lib/constants";
import { isGeneratedPk } from "@/lib/generative/design-storage";
import BuildingWorkspace from "./building-workspace";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * A /building/[id] segment is routable when it is a valid 5-part ledger id, a
 * cad-first draft id (cad-<uuid>), or a generated design id (GEN-0042[.3]).
 * Pure function — unit-tested in
 * src/lib/__tests__/building-metadata-title.test.ts.
 *
 * `parseBuildingId` is deliberately NOT extended to generated ids: a design has
 * no 시군구/법정동/번지, and returning sentinel codes for one would hand the
 * ledger hooks coordinates nobody surveyed. The workspace branches on
 * `isGeneratedPk` before any ledger parsing happens.
 */
export function isRoutableBuildingId(id: string): boolean {
  return (
    id === DEMO_BUILDING_ID ||
    id === DRAWING_BUILDING_ID ||
    isGeneratedPk(id) ||
    parseBuildingId(id) !== null
  );
}

/**
 * Derive a human-readable metadata title from a raw building id segment.
 * Returns a fallback string when the id is malformed so generateMetadata
 * never throws.  Pure function — unit-tested in
 * src/lib/__tests__/building-metadata-title.test.ts.
 */
export function buildingMetadataTitle(id: string): string {
  if (id === DEMO_BUILDING_ID) return "Sample Energy Diagnostic | BIMFIT";
  if (id === DRAWING_BUILDING_ID) return "Create Energy Diagnostic | BIMFIT";
  // The design's own name lives in IndexedDB, which the server cannot read —
  // the id is the only honest title available at metadata time.
  if (isGeneratedPk(id)) return `생성 설계 ${id} | BIMFIT`;
  const parsed = parseBuildingId(id);
  if (!parsed) return "건물 정보 | BIMFIT";
  return `건물 ${parsed.sigunguCd}-${parsed.bjdongCd} | BIMFIT`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: buildingMetadataTitle(id) };
}

export default async function BuildingDetailPage({ params }: Props) {
  const { id } = await params;
  // Legacy Demo and Drawing URLs remain compatibility doors, not product
  // modes. Both enter the one Energy Diagnostic state machine.
  if (id === DEMO_BUILDING_ID) redirect("/diagnostics/new?method=sample");
  if (id === DRAWING_BUILDING_ID) redirect("/diagnostics/new?method=create");
  if (isGeneratedPk(id)) redirect("/diagnostics/new?method=create");
  // Validate the id at the server layer so a bad URL 404s before the client
  // component even mounts (complements the client-side parseBuildingId guard).
  // P2-24: cad-first draft ids (cad-<uuid>) are routable too.
  if (!isRoutableBuildingId(id)) notFound();

  return <BuildingWorkspace params={params} />;
}
