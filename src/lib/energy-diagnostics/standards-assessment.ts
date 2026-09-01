/**
 * Regulatory context for a diagnostic result: which 기준/버전 the numbers were
 * computed under, how each envelope assembly compares to its 별표1 ceiling,
 * and where the primary-energy figure would sit on the ZEB reference table.
 *
 * PRESENTATION-LAYER DERIVATION ONLY. This module never mutates the model,
 * never emits facts, and never claims certification: every output carries
 * the standard's identity and, for the ZEB row, an explicit 참고용
 * disclaimer — the screening engine is not ECO2 and its result is not an
 * 인증 수치. Sources: docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md.
 */

import { ledgerUseCategory } from "@/lib/ledger/floor-rows";
import {
  checkUValueCompliance,
  resolveInsulationRegion,
  resolveInsulationRegionFromAddress,
  uValueLimit,
  INSULATION_REGION_LABEL_KO,
  type RegionResolution,
  type RegulatedElement,
  type UValueComplianceCheck,
} from "@/lib/energy-standards/u-value-limits";
import { zebGradeOf, ZEB_GRADE_LABEL_KO, type ZebResult } from "@/lib/energy-standards/zeb";

import {
  DEGREE_DAY_ENGINE_ID,
  DEGREE_DAY_ENGINE_VERSION,
  ENERGY_ADAPTER_VERSION,
  type DegreeDaySimulationRun,
} from "./adapter";
import type { CanonicalEnergyModel } from "./types";

export type CalcBasis = Readonly<{
  engineId: string;
  engineVersion: string;
  adapterVersion: string;
  /** The run's deterministic input hash, when a run is supplied. */
  inputHash: string | null;
  standards: readonly Readonly<{ id: string; nameKo: string; version: string }>[];
}>;

export type ConstructionComplianceCheck = Readonly<{
  constructionId: string;
  constructionName: string;
  elementKo: string;
  element: RegulatedElement;
  check: UValueComplianceCheck;
  /** Fact id of the U-value under test, for evidence-inspector selection. */
  uValueFactId: string;
}>;

export type ZebReference = Readonly<{
  result: ZebResult;
  gradeLabelKo: string;
  primaryPerM2Kwh: number;
  /** Always shown next to the grade. */
  disclaimerKo: string;
}>;

export type StandardsAssessment = Readonly<{
  calcBasis: CalcBasis;
  region:
    | (RegionResolution & Readonly<{ sigunguCode: string; labelKo: string }>)
    | null;
  residential: boolean;
  /** Empty when the region is unknown — no check is invented. */
  uValueChecks: readonly ConstructionComplianceCheck[];
  /** Null when the run has no primary-energy figure. */
  zebReference: ZebReference | null;
}>;

const STANDARDS: CalcBasis["standards"] = Object.freeze([
  Object.freeze({
    id: "saving-standard",
    nameKo: "건축물의 에너지절약설계기준 별표1",
    version: "국토교통부고시 제2025-738호 (시행 2025-12-31)",
  }),
  Object.freeze({
    id: "zeb-certification",
    nameKo: "제로에너지건축물 인증 기준",
    version: "국토교통부고시 제2024-893호 (시행 2025-01-01)",
  }),
  Object.freeze({
    id: "primary-factors",
    nameKo: "1차에너지 환산계수 (MOTIE/KEMCO)",
    version: "전력 2.75 · 가스 1.1 · 지역난방 0.728",
  }),
]);

const ELEMENT_KO: Record<RegulatedElement, string> = {
  exterior_wall: "외벽",
  roof: "지붕",
  lowest_floor_heated: "최하층 바닥(난방)",
  lowest_floor_unheated: "최하층 바닥(비난방)",
  interfloor_heated: "층간바닥",
  window: "창",
  door: "문",
  apartment_entrance_door: "세대현관문",
};

function factValue<T>(model: CanonicalEnergyModel, key: string): T | null {
  const fact = model.facts.find((candidate) => candidate.key === key);
  return (fact?.value as T | undefined) ?? null;
}

/**
 * Which 별표1 row each construction answers to, derived from the surfaces
 * and openings that actually reference it — model-agnostic (works for both
 * tier-one and ledger constructions).
 */
function elementForConstruction(
  model: CanonicalEnergyModel,
  constructionId: string,
  residential: boolean,
): RegulatedElement | null {
  for (const surface of model.geometry.surfaces) {
    if (surface.constructionId.value !== constructionId) continue;
    if (surface.type === "exterior_wall") return "exterior_wall";
    if (surface.type === "roof") return "roof";
    if (surface.type === "ground_floor") {
      // The register does not state 바닥난방 여부; Korean residential practice
      // is floor heating, so 주거 is checked against the 난방 row and 비주거
      // against 비난방. The row name in the result makes the choice visible.
      return residential ? "lowest_floor_heated" : "lowest_floor_unheated";
    }
  }
  for (const opening of model.geometry.openings) {
    if (opening.constructionId.value !== constructionId) continue;
    if (opening.type === "door") return "door";
    return "window";
  }
  return null;
}

/** Assemble the regulatory context for a model and (optionally) its run. */
export function assessStandards(
  model: CanonicalEnergyModel,
  run: DegreeDaySimulationRun | null,
): StandardsAssessment {
  // The ledger builder keeps the raw 주용도코드 on building.useType and the
  // register address on site.location; ledger.* ingestion facts are not part
  // of the model's own fact index.
  const mainPurpsCd =
    factValue<string>(model, "ledger.mainPurpsCd") ??
    factValue<string>(model, "building.useType") ??
    "";
  const residential = ledgerUseCategory(mainPurpsCd) === "residential";

  const sigunguCode = factValue<string>(model, "ledger.sigunguCd");
  const address =
    factValue<string>(model, "ledger.platPlcNm") ??
    factValue<string>(model, "site.location") ??
    undefined;
  const resolved = sigunguCode
    ? resolveInsulationRegion(sigunguCode, address)
    : address
      ? resolveInsulationRegionFromAddress(address)
      : null;
  const region = resolved
    ? {
        ...resolved,
        sigunguCode: sigunguCode ?? "",
        labelKo: INSULATION_REGION_LABEL_KO[resolved.region],
      }
    : null;

  const uValueChecks: ConstructionComplianceCheck[] = [];
  if (region) {
    for (const construction of model.envelope.constructions) {
      const element = elementForConstruction(model, construction.id, residential);
      if (!element) continue;
      const actual = construction.uValueWPerM2K.value;
      if (typeof actual !== "number" || !Number.isFinite(actual)) continue;
      const check = checkUValueCompliance(actual, {
        element,
        region: region.region,
        exposure: "direct",
        residential,
      });
      if (!check) continue;
      uValueChecks.push({
        constructionId: construction.id,
        constructionName: String(construction.name.value ?? construction.id),
        elementKo: ELEMENT_KO[element],
        element,
        check,
        uValueFactId: construction.uValueWPerM2K.id,
      });
    }
  }

  const primary = run?.result?.primary ?? null;
  const zebReference: ZebReference | null = primary
    ? (() => {
        const result = zebGradeOf({
          primaryEnergyDemandKwhPerM2: primary.perM2Kwh,
          primaryEnergyProductionKwhPerM2: 0,
          residential,
        });
        return {
          result,
          gradeLabelKo: ZEB_GRADE_LABEL_KO[result.grade],
          primaryPerM2Kwh: primary.perM2Kwh,
          disclaimerKo:
            "참고용 위치입니다. 도일법 스크리닝 결과를 ZEB 등급표에 대입한 것으로, " +
            "ECO2 인증 계산이 아니며 신재생 생산량(0으로 가정)도 반영되지 않았습니다.",
        };
      })()
    : null;

  return Object.freeze({
    calcBasis: Object.freeze({
      engineId: DEGREE_DAY_ENGINE_ID,
      engineVersion: DEGREE_DAY_ENGINE_VERSION,
      adapterVersion: ENERGY_ADAPTER_VERSION,
      inputHash: run?.engineInput.inputHash ?? null,
      standards: STANDARDS,
    }),
    region,
    residential,
    uValueChecks: Object.freeze(uValueChecks),
    zebReference,
  });
}

/** Ceiling for one element in a resolved region — for the assembly editor's live pass/fail. */
export function limitForElement(
  region: RegionResolution["region"],
  element: RegulatedElement,
  residential: boolean,
) {
  return uValueLimit({ element, region, exposure: "direct", residential });
}
