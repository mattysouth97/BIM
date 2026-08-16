// src/lib/workflow/cad-draft.ts
// P2-24 — CAD-first standalone workflow: synthetic draft identity + minimal
// manual parameters for buildings that have no 건축물대장 (ledger) entry.
//
// The workflow mode is DERIVED from the PK prefix, never stored, so building
// identity and mode cannot drift apart and deep links to /building/cad-<uuid>
// self-classify. Pure module: no React, no stores (AFF-1).

import type { BrTitleInfo } from "@/lib/types";

export type WorkflowMode = "ledger" | "cad-first";

export const CAD_DRAFT_PREFIX = "cad-";

/** Minimal manual inputs a CAD-first user provides at the 정보 입력 stage. */
export interface CadDraftParams {
  /** Above-ground floor count (지상층수). */
  floors: number;
  /** Approximate completion/permit year — drives the era-based recipe. */
  year: number;
  /** 시군구 code for regional climate (HDD/CDD) lookups. */
  sigunguCd: string;
}

export function makeCadDraftPk(): string {
  return `${CAD_DRAFT_PREFIX}${crypto.randomUUID()}`;
}

export function isCadDraftPk(pk: string | null | undefined): boolean {
  return typeof pk === "string" && pk.startsWith(CAD_DRAFT_PREFIX);
}

export function getWorkflowMode(pk: string | null | undefined): WorkflowMode {
  return isCadDraftPk(pk) ? "cad-first" : "ledger";
}

/** Year bounds are sanity limits, not policy: Korea's oldest ledger entries
 *  predate 1900, and permits a decade+ out don't exist. */
const MIN_YEAR = 1800;
const MAX_YEAR = 2200;

export function isCadDraftParamsValid(p?: CadDraftParams): boolean {
  if (!p) return false;
  return (
    Number.isInteger(p.floors) &&
    p.floors >= 1 &&
    Number.isInteger(p.year) &&
    p.year >= MIN_YEAR &&
    p.year <= MAX_YEAR &&
    typeof p.sigunguCd === "string" &&
    p.sigunguCd.length > 0
  );
}

/** Shoelace area of a single ring in m² (winding-agnostic). */
export function ringAreaSqm(ring: [number, number][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/**
 * Synthesize the minimal BrTitleInfo a CAD draft needs to flow through the
 * existing generateBuildingGeometry → toRecipe pipeline.
 *
 * Honesty contract (AFF-6): only three kinds of values appear —
 *   1. user-entered facts (floors, year, region),
 *   2. values DERIVED from the CAD footprint (archArea; totArea = area × floors),
 *   3. explicit unavailable markers ("" / 0), which downstream consumers
 *      already render as "-" per the zero-value convention.
 * Nothing is fabricated.
 */
export function cadDraftTitle(
  pk: string,
  params: CadDraftParams,
  footprintAreaSqm: number
): BrTitleInfo {
  return {
    mgmBldrgstPk: pk,
    bldNm: "",
    platPlcNm: "",
    newPlatPlc: "",
    sigunguCd: params.sigunguCd,
    bjdongCd: "",
    platGbCd: "",
    bun: "",
    ji: "",
    mainPurpsCd: "",
    mainPurpsCdNm: "",
    etcPurps: "",
    strctCd: "",
    strctCdNm: "",
    etcStrct: "",
    grndFlrCnt: params.floors,
    ugrndFlrCnt: 0,
    totArea: footprintAreaSqm * params.floors,
    archArea: footprintAreaSqm,
    platArea: 0,
    bcRat: 0,
    vlRat: 0,
    useAprDay: "",
    // YYYYMMDD permit-date string classifyEra() expects; Jan 1 keeps it a
    // year-only claim.
    pmsDay: `${params.year}0101`,
    stcnsDay: "",
    roofCd: "",
    roofCdNm: "",
    heit: 0,
    regstrGbCd: "",
    regstrGbCdNm: "",
    regstrKindCd: "",
    regstrKindCdNm: "",
  };
}
