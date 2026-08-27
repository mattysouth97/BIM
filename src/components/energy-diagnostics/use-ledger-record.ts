"use client";

/**
 * Resolves a `/diagnostics/new?method=ledger&building=<id>` id into the
 * 건축물대장 record the baseline builder needs.
 *
 * Deliberately does NOT yet attach the VWorld outline: that polygon is in
 * lon/lat degrees and reaching fidelity L1 honestly means projecting it to
 * metres, not handing degrees to a builder that expects metres. Until then the
 * baseline uses the outline derived from 건축면적, which is labelled as an
 * assumption rather than presented as a measured shape.
 */

import { useMemo } from "react";

import { useCompositeBuilding } from "@/hooks/use-composite-building";
import { DEMO_BUILDING_ID, parseBuildingId } from "@/lib/constants";
import { demoFloors, demoTitle } from "@/lib/demo/demo-building";

import type { LedgerRecord } from "./ledger-baseline-loader";

export type LedgerRecordState =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "loading" }>
  | Readonly<{ phase: "ready"; record: LedgerRecord }>
  | Readonly<{ phase: "unavailable"; message: string }>;

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

  return useMemo<LedgerRecordState>(() => {
    if (sample) {
      return {
        phase: "ready",
        record: { title: demoTitle, floors: demoFloors },
      };
    }
    if (!parsed) {
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
    const title = composite.title?.items?.[0];
    if (title) {
      return {
        phase: "ready",
        record: { title, floors: composite.floors?.items ?? [] },
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
    composite.isLoading,
    composite.isError,
    composite.title,
    composite.floors,
  ]);
}
