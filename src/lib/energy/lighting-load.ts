// src/lib/energy/lighting-load.ts
// Phase 01 (Honest Physics), D-01/D-02 — the single lighting-load computation
// every consumer of a lighting kWh must call. Before this plan,
// `deliveredFromDemand` derived lighting as a flat 15% share of the HVAC
// total (the grade leg) and `calculateSystemBreakdown` derived it from
// SYSTEM_RATIOS (the site-total leg) — two independently-tuned numbers for
// one physical quantity, neither reading `materials.lighting.
// lightingPowerDensity`. This module ends both: the arithmetic is lifted
// verbatim from `use-retrofit-scenario.ts:431-432`, the one place it was
// already validated, not re-derived.
// Pure functions — no React, no stores.

import { getOperatingHours, USE_CODE_OPERATING_HOURS } from "./equipment-specs";
import type { MaterialProperties } from "@/lib/material-types";

/**
 * Where the annual operating hours behind a lighting load came from: a
 * researched 주용도코드 profile (`USE_CODE_OPERATING_HOURS`), or the 2500 h
 * default with the assumption named — mirrors `SystemRatioProvenance`'s
 * discriminated shape (system-breakdown.ts) so a reader cannot mistake a
 * defaulted hours figure for a sourced one.
 *
 * `lpdWPerSqm` rides on both branches so a caller holding only this
 * provenance object (e.g. `SystemBreakdown.lightingProvenance`) can still
 * render the LPD the load was computed from, without a second channel back
 * to `MaterialProperties`.
 */
export type LightingLoadProvenance =
  | {
      source: "use_code_hours";
      mainPurpsCd: string;
      hoursPerYear: number;
      lpdWPerSqm: number;
    }
  | {
      source: "default_hours";
      mainPurpsCd?: string;
      hoursPerYear: number;
      lpdWPerSqm: number;
      /**
       * Interpolates the actual `hoursPerYear` value and the use code that
       * failed to match — never a hand-typed sentence, so it cannot drift
       * away from the number it describes (AGENTS.md, "the label lies while
       * the number is right").
       */
      assumption: string;
    };

export interface LightingLoad {
  /** Annual lighting electricity (kWh/yr). D-01: (lpd * area * hours) / 1000. */
  kwh: number;
  /** The LPD actually used in the computation (W/m²), after the T-01-01 clamp. */
  lpdWPerSqm: number;
  /** The annual operating hours actually used, after the T-01-01 clamp. */
  hoursPerYear: number;
  /** Where the operating hours came from. */
  provenance: LightingLoadProvenance;
}

export interface ModeledLightingLoadInput {
  materials: Pick<MaterialProperties, "lighting">;
  conditionedFloorAreaSqm: number;
  mainPurpsCd?: string;
}

/** T-01-01 — clamp a non-finite or negative input to 0 before multiplying. */
function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * D-01 — the one lighting-load computation in the repository. Fed by
 * `materials.lighting.lightingPowerDensity`, conditioned floor area, and the
 * building's 주용도코드-indexed annual operating hours (D-02, via the
 * newly-exported `getOperatingHours` / `USE_CODE_OPERATING_HOURS`).
 */
export function modeledLightingLoad(
  input: ModeledLightingLoadInput,
): LightingLoad {
  const lpdWPerSqm = clampNonNegative(input.materials.lighting.lightingPowerDensity);
  const conditionedFloorAreaSqm = clampNonNegative(input.conditionedFloorAreaSqm);
  const mainPurpsCd = input.mainPurpsCd;
  const hoursPerYear = clampNonNegative(getOperatingHours(mainPurpsCd ?? ""));

  const kwh = (lpdWPerSqm * conditionedFloorAreaSqm * hoursPerYear) / 1000;

  const matched = mainPurpsCd !== undefined ? USE_CODE_OPERATING_HOURS[mainPurpsCd] : undefined;
  const provenance: LightingLoadProvenance =
    matched !== undefined
      ? { source: "use_code_hours", mainPurpsCd: mainPurpsCd!, hoursPerYear, lpdWPerSqm }
      : {
          source: "default_hours",
          mainPurpsCd,
          hoursPerYear,
          lpdWPerSqm,
          assumption: mainPurpsCd
            ? `주용도코드 "${mainPurpsCd}"에 대한 조명 운영시간 자료가 없어 기본값 ${hoursPerYear}시간/년을 적용했습니다. 실측값이 아닌 가정입니다.`
            : `주용도코드가 없어 조명 운영시간 기본값 ${hoursPerYear}시간/년을 적용했습니다. 실측값이 아닌 가정입니다.`,
        };

  return { kwh, lpdWPerSqm, hoursPerYear, provenance };
}
