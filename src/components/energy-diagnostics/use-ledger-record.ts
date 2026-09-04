"use client";

/**
 * Resolves a `/diagnostics/new?method=ledger&building=<id>` id into the
 * 건축물대장 record the baseline builder needs.
 *
 * P2-29: the outline now comes from the shared reconstruction
 * (`useLedgerReconstruction`) — the same producer the 3D twin renders from, so
 * the diagnosis and the twin cannot quote different shapes for one building.
 * The reconstruction projects VWorld's lon/lat degrees into a local metric
 * frame itself, which is what previously kept that polygon out of this path.
 *
 * The grade travels with the ring: `observed` is true only for a traced
 * outline, false for one solved to satisfy the stated 건축면적. A
 * reconstruction is never survey geometry (ADR-003), so neither case is
 * labelled `dimensioned_vector_geometry`.
 */

import { useMemo } from "react";

import { useBuildingFootprint } from "@/hooks/use-building-footprint";
import { useBuildingZoning } from "@/hooks/use-building-zoning";
import { useCompositeBuilding } from "@/hooks/use-composite-building";
import { useLedgerReconstruction } from "@/hooks/use-ledger-reconstruction";
import { DEMO_BUILDING_ID, parseBuildingId } from "@/lib/constants";
import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import type { LedgerFootprint } from "@/lib/energy-diagnostics/ledger-source";
import type { Polygon2D } from "@/lib/energy-diagnostics/types";
import type { BrFloorInfo, BrTitleInfo } from "@/lib/types";

import type { LedgerRecord } from "./ledger-baseline-loader";

export type LedgerRecordState =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "loading" }>
  | Readonly<{ phase: "ready"; record: LedgerRecord }>
  | Readonly<{ phase: "unavailable"; message: string }>;

const EMPTY_FLOORS: readonly BrFloorInfo[] = Object.freeze([]);

const EMPTY_PARAMS = {
  sigunguCd: "",
  bjdongCd: "",
  platGbCd: "",
  bun: "",
  ji: "",
};

/** True for the ids that resolve from the bundled fixture, with no network. */
export function isSampleBuildingId(id: string | undefined): boolean {
  return !id || id === "demo" || id === DEMO_BUILDING_ID;
}

export function useLedgerRecord(
  buildingId: string | undefined,
  locale: "ko" | "en",
): LedgerRecordState {
  const sample = isSampleBuildingId(buildingId);
  const parsed = useMemo(
    () => (sample ? null : parseBuildingId(buildingId ?? "")),
    [sample, buildingId],
  );

  // Hooks stay unconditional; empty params leave every query disabled.
  const composite = useCompositeBuilding(parsed ?? EMPTY_PARAMS);

  const title: BrTitleInfo | null = sample
    ? demoTitle
    : (composite.title?.items?.[0] ?? null);
  // Memoised: the `?? []` would otherwise be a fresh array on every render,
  // and the record's identity is what `useLedgerBaseline` keys its rebuild on
  // — an unstable one re-runs the whole diagnosis continuously.
  const floors: readonly BrFloorInfo[] = useMemo(
    () => (sample ? demoFloors : (composite.floors?.items ?? EMPTY_FLOORS)),
    [sample, composite.floors],
  );

  const address = title?.platPlcNm || title?.newPlatPlc || undefined;
  const footprintQuery = useBuildingFootprint(address);

  // P2-31: 용도지역 at the outline's centroid. Best-effort — an absent district
  // degrades the setback to lot geometry, then to "undetermined", and is never
  // read as 주거지역.
  const zoningCenter = useMemo<[number, number] | null>(() => {
    const outer = footprintQuery.data?.polygon?.[0];
    if (!Array.isArray(outer) || outer.length < 3) return null;
    const lng = outer.reduce((sum, p) => sum + p[0], 0) / outer.length;
    const lat = outer.reduce((sum, p) => sum + p[1], 0) / outer.length;
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }, [footprintQuery.data]);
  const zoningQuery = useBuildingZoning(zoningCenter);

  const reconstruction = useLedgerReconstruction(
    title,
    floors,
    footprintQuery.data,
    zoningQuery.data,
  );

  const footprint = useMemo<LedgerFootprint | undefined>(() => {
    const twin = reconstruction?.twin;
    if (!twin) return undefined;
    // P2-30: above-grade plates travel with the outline, so the engine walls
    // each storey on its own ring. A level the reconstruction could not
    // resolve is omitted, and that storey falls back to the outline.
    const levelPlatesM = twin.levels
      .filter((level) => !level.below && level.grade !== "X-UNRESOLVED")
      .map((level) => ({
        floorNo: level.floorNo,
        ringM: level.plate[0] as unknown as Polygon2D,
      }));
    return {
      kind: "reconstructed",
      ringM: twin.footprintPolygon[0] as unknown as Polygon2D,
      observed: twin.observed,
      ...(levelPlatesM.length > 0 ? { levelPlatesM } : {}),
    };
  }, [reconstruction]);

  return useMemo<LedgerRecordState>(() => {
    if (!sample && !parsed) {
      return {
        phase: "unavailable",
        message:
          locale === "ko"
            ? "건물 주소를 알아볼 수 없습니다. 목록에서 건물을 다시 선택해 주세요."
            : "That building address could not be read. Pick the building again from the list.",
      };
    }
    // The baseline needs 표제부; 층별개요 only sharpens the per-storey areas
    // and the builder already falls back to an even share of 연면적 without
    // it. The register endpoints fail independently and intermittently, so a
    // blip on a sibling call must not discard a title we actually received.
    if (title) {
      // A better outline changes every exterior wall and window area, so the
      // baseline must not be built on the solved rectangle and then rebuilt on
      // the trace a moment later. Wait for the outline query to settle — it is
      // best-effort and short, and a failure settles it just as a hit does.
      if (footprintQuery.isLoading) return { phase: "loading" };
      return {
        phase: "ready",
        record: { title, floors, ...(footprint ? { footprint } : {}) },
      };
    }
    if (composite.isLoading) return { phase: "loading" };
    if (composite.isError) {
      return {
        phase: "unavailable",
        message:
          locale === "ko"
            ? "건축물대장을 불러오지 못했습니다. 잠시 후 다시 시도하거나 설정에서 본인 data.go.kr 키를 넣어 주세요."
            : "The building register could not be loaded. Try again shortly, or add your own data.go.kr key in Settings.",
      };
    }
    return {
      phase: "unavailable",
      message:
        locale === "ko"
          ? "이 주소에는 등록된 건축물대장이 없습니다."
          : "No building register entry is recorded at this address.",
    };
  }, [
    sample,
    parsed,
    locale,
    title,
    floors,
    footprint,
    footprintQuery.isLoading,
    composite.isLoading,
    composite.isError,
  ]);
}
