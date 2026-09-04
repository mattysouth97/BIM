"use client";

/**
 * P2-29 — the one place the app turns a 건축물대장 into a building shape.
 *
 * Both consumers read this hook: the 3D twin for its recipe geometry, and the
 * traceable engine for its boundary ring. Before it, each derived its own
 * rectangle and they disagreed whenever VWorld answered.
 *
 * The reconstruction runs on data the page has already fetched — no register
 * call is made here, so an automatic reconstruction costs one memoised pure
 * computation per building, not a round trip.
 */

import { useMemo } from "react";

import {
  evidenceFromLedger,
  reconstructModel,
  twinGeometryFromModel,
  type TwinGeometry,
} from "@/lib/cad-reconstruction/ledger-bridge";
import type {
  GisFootprintInput,
  ReconstructionModel,
  ZoningInput,
} from "@/lib/cad-reconstruction/types";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

/** The shape `useBuildingFootprint` resolves to. */
export interface FootprintQueryResult {
  polygon: number[][][] | null;
  source?: "building" | "parcel" | null;
  attributes?: {
    height: number | null;
    groundFloors: number | null;
    undergroundFloors: number | null;
  } | null;
  error: string | null;
}

export interface LedgerReconstruction {
  model: ReconstructionModel;
  /**
   * Null when the model is blocked — the register stated no dimension and GIS
   * was silent. Callers fall back to their own path and say so; they must not
   * render the model's placeholder ring.
   */
  twin: TwinGeometry | null;
}

function toGisInput(
  footprint: FootprintQueryResult | null | undefined,
): GisFootprintInput | null {
  if (!footprint) return null;
  return {
    polygon: footprint.polygon ?? null,
    source: footprint.source ?? null,
    attributes: footprint.attributes ?? null,
    error: footprint.error ?? null,
  };
}

/** What the zoning route resolves to; see `use-building-zoning`. */
export interface ZoningQueryResult {
  district: string | null;
  source?: string;
  error: string | null;
}

export function useLedgerReconstruction(
  title: BrTitleInfo | null | undefined,
  floors: readonly BrFloorInfo[] | undefined,
  footprint: FootprintQueryResult | null | undefined,
  zoning?: ZoningQueryResult | null,
): LedgerReconstruction | null {
  // `floors` is a fresh array on every render for most callers, so the identity
  // of the rows themselves is the honest dependency.
  const floorKey = useMemo(
    () => (floors ?? []).map((f) => `${f.flrNo}:${f.flrGbCd}:${f.area}`).join("|"),
    [floors],
  );
  const polygonKey = footprint?.polygon ? JSON.stringify(footprint.polygon) : "";
  const districtKey = zoning?.district ?? "";

  return useMemo(() => {
    if (!title) return null;
    const model = reconstructModel(
      evidenceFromLedger({
        buildingPk: String(title.mgmBldrgstPk ?? ""),
        title,
        floors: floors ?? [],
        gis: toGisInput(footprint),
        // P2-31: the parcel, when the footprint query fell back to one. The
        // reconstruction reads which side of the lot the building leaves free
        // to decide the face a setback comes off.
        parcel:
          footprint?.source === "parcel" ? toGisInput(footprint) : null,
        zoning: zoning
          ? ({
              district: zoning.district,
              source: zoning.source ?? "LT_C_UQ111",
              error: zoning.error,
            } satisfies ZoningInput)
          : null,
        address: title.platPlcNm || title.newPlatPlc || null,
      }),
    );
    return { model, twin: twinGeometryFromModel(model) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  }, [title, floorKey, polygonKey, footprint?.source, districtKey]);
}
