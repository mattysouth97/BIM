"use client";

// src/components/twin/measure-chip-row.tsx
// The work, as the primary control.
//
// Until 2026-09-06 15:37 the only row a person could click was six financing
// options, and the knapsack decided what got built. So the building changed as
// a side effect of a money choice, and the user never picked a measure. The
// user asked for the opposite: implementation-oriented, not programme-oriented.
//
// So this row is the physical work — the measures the engine already
// generates — one chip each, each carrying in one line what it does to THIS
// building: 외벽 U 0.58 → 0.15 W/m²·K · 340 m² · ₩4,100만. Clicking a chip is
// what changes the model, the delta strip and the economics. The knapsack's
// budget-optimal set is now a 추천 mark on these chips and nothing more, and
// the financing programme moved to a secondary control below (지원 재원), which
// re-prices the chosen work and never re-picks it.
//
// Two rules this row is responsible for holding:
//
//  - **Exclusivity at click time.** A boiler and a heat pump are alternatives;
//    the knapsack has always known that, and now a person assembling the set
//    by hand has to be held to the same rule. `toggleMeasure` enforces it and
//    reports what it evicted, and the chip says so BEFORE the click too.
//  - **A measure this engine cannot price still says what it does.** LED and
//    PV move NPV and the 3D model but not kWh/m², because
//    `deliveredFromDemand` fixes lighting at 15 % of total and hard-codes
//    `renewable: 0`. Those chips carry the line AND the caveat, rather than
//    quietly implying the intensity moved.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useScenarioStore } from "@/store/scenario-store";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { usePvLayout } from "@/hooks/use-pv-layout";
import { getClimateData } from "@/lib/energy/climate-data";
import { computeRetrofitDelta } from "@/lib/retrofit/retrofit-delta";
import {
  buildMeasureClaim,
  measureDisplayName,
} from "@/lib/retrofit/measure-claim";
import type { ClaimEnvelopeAreas } from "@/lib/retrofit/measure-claim";
import { toggleMeasure, conflictsWith } from "@/lib/retrofit/measure-selection";
import { effectiveMeasureIds } from "@/lib/retrofit/measure-visuals";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import { measureSubsidyRatio } from "@/lib/retrofit/economic-model";
import type { EconomicAssumptions } from "@/lib/retrofit/economic-model";

export interface MeasureChipRowProps {
  /** Every measure the generators produced, financially enriched. */
  measures: RetrofitMeasure[];
  /** The knapsack's recommendation — marks chips 추천, decides nothing. */
  recommendedIds: string[];
  /** Areas the engine priced, for the claim lines. */
  areas?: ClaimEnvelopeAreas;
  /** Conditioned floor area (m²) — the basis plant and lighting are priced on. */
  totalFloorAreaSqm: number;
  /** The financing assumptions in force, to say when they apply to nothing chosen. */
  assumptions: EconomicAssumptions;
}

/** Short category label so a reader can group the row at a glance. */
const CATEGORY_LABEL: Record<string, { ko: string; en: string }> = {
  envelope: { ko: "외피", en: "Envelope" },
  hvac: { ko: "설비", en: "HVAC" },
  lighting: { ko: "조명", en: "Lighting" },
  renewable: { ko: "신재생", en: "Renewable" },
};

export function MeasureChipRow({
  measures,
  recommendedIds,
  areas,
  totalFloorAreaSqm,
  assumptions,
}: MeasureChipRowProps) {
  const { t, lang } = useT();

  const appliedMeasureIds = useScenarioStore((s) => s.appliedMeasureIds);
  const selectedMeasureIds = useScenarioStore((s) => s.selectedMeasureIds);
  const setAppliedMeasureIds = useScenarioStore((s) => s.setAppliedMeasureIds);
  const buildingInputs = useScenarioStore((s) => s.buildingInputs);

  const chosenIds = effectiveMeasureIds(appliedMeasureIds, selectedMeasureIds);

  // The physical change per measure, from the one before/after seam. Computed
  // over EVERY candidate so a chip states what it would do whether or not it
  // is currently chosen — the row is how you decide, so it cannot only
  // describe the decisions already made.
  const buildingPk = buildingInputs?.buildingPk ?? "";
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const recipe = useEffectiveRecipe(buildingPk);
  const sigunguCd = useActiveSigunguCd();
  const pvLayout = usePvLayout();

  const effectById = useMemo(() => {
    if (!materials || !recipe || measures.length === 0) return new Map();
    const delta = computeRetrofitDelta({
      materials,
      recipe,
      climate: getClimateData(sigunguCd),
      measureIds: measures.map((m) => m.id),
      pvGeometricKWp: pvLayout?.totalKWp ?? 0,
    });
    return new Map((delta?.measures ?? []).map((e) => [e.measureId, e]));
  }, [materials, recipe, sigunguCd, measures, pvLayout]);

  const claims = useMemo(
    () =>
      new Map(
        measures.map((m) => [
          m.id,
          buildMeasureClaim({
            measure: m,
            effect: effectById.get(m.id),
            areas,
            totalFloorAreaSqm,
            lang,
          }),
        ]),
      ),
    [measures, effectById, areas, totalFloorAreaSqm, lang],
  );

  const handleToggle = (measureId: string) => {
    const { next } = toggleMeasure(chosenIds, measureId, measures);
    setAppliedMeasureIds(next);
  };

  // A financing chip reading "CAPEX 70%" over a selection it does not cover
  // promises something it will not do. Measured on /models/fzk-haus, whose
  // opening selection is the PV alone: every rail figure stayed byte-identical
  // while every chip price fell to 30 %, because the public presets omit
  // `renewable` — solar is funded by 신재생에너지 보급사업, a different
  // programme. Correct arithmetic, and a label that needed saying out loud.
  const chosenMeasures = measures.filter((m) => chosenIds.includes(m.id));
  const trackCoversNothing =
    chosenMeasures.length > 0 &&
    chosenMeasures.every((m) => measureSubsidyRatio(m, assumptions) === 0) &&
    Object.keys(assumptions.subsidyByCategory ?? {}).length > 0;

  const deviates =
    appliedMeasureIds !== null &&
    (appliedMeasureIds.length !== recommendedIds.length ||
      !recommendedIds.every((id) => appliedMeasureIds.includes(id)));

  if (measures.length === 0) {
    return (
      <div
        className="px-2.5 py-1.5 text-[10px] text-muted-foreground"
        data-measure-chip-row
      >
        {t(
          "이 건물에 적용할 수 있는 공사가 아직 계산되지 않았습니다.",
          "No work has been generated for this building yet.",
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2.5 py-1.5" data-measure-chip-row>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          {t("공사 선택", "Choose the work")}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          {t(
            `${chosenIds.length}개 선택 / ${measures.length}개 가능`,
            `${chosenIds.length} of ${measures.length} chosen`,
          )}
        </span>
        {deviates ? (
          <button
            type="button"
            onClick={() => setAppliedMeasureIds([...recommendedIds])}
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            data-measure-reset-to-recommended
          >
            {t("추천안으로", "Use recommendation")}
          </button>
        ) : null}
      </div>

      <div className="flex items-stretch gap-1.5 overflow-x-auto" role="group">
        {measures.map((measure) => {
          const chosen = chosenIds.includes(measure.id);
          const recommended = recommendedIds.includes(measure.id);
          const claim = claims.get(measure.id);
          const wouldEvict = conflictsWith(measure.id, chosenIds, measures);
          const category = CATEGORY_LABEL[measure.category];

          return (
            <button
              key={measure.id}
              type="button"
              aria-pressed={chosen}
              onClick={() => handleToggle(measure.id)}
              data-measure-chip={measure.id}
              data-measure-chosen={chosen ? "true" : "false"}
              // Whether the knapsack currently recommends this measure, as a
              // fact rather than as the rendered 추천/Suggested badge below.
              // Counting the badge means counting a rendering: it is
              // language-coupled, and "the string appears" is the assertion
              // this repo keeps getting caught by. Requested by bim-83 for the
              // e2e that pins the 추천 marks against the optimum.
              data-measure-recommended={recommended ? "true" : "false"}
              className={cn(
                "flex min-w-[13rem] shrink-0 flex-col items-start gap-0.5 rounded-md border px-2 py-1 text-left transition-colors",
                chosen
                  ? "border-emerald-400 bg-emerald-500/10 dark:border-emerald-700"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex w-full items-baseline gap-1">
                <span className="truncate text-[11px] font-medium leading-tight text-foreground">
                  {measureDisplayName(measure.id, lang, measure.name)}
                </span>
                {category ? (
                  <span className="shrink-0 text-[8px] text-muted-foreground/70">
                    {category[lang]}
                  </span>
                ) : null}
                {recommended ? (
                  <span className="ml-auto shrink-0 text-[8px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {t("추천", "Suggested")}
                  </span>
                ) : null}
              </span>

              {/* The claim: what this work does to this building. Built from
                  the delta and the engine's own areas, never hand-written. */}
              {claim ? (
                <span
                  className="text-[10px] leading-tight tabular-nums text-muted-foreground"
                  data-measure-claim={measure.id}
                >
                  {claim.line}
                </span>
              ) : null}

              {claim && !claim.pricedByEngine ? (
                <span className="text-[9px] leading-tight text-amber-600 dark:text-amber-400">
                  {t(
                    "kWh/m²에는 반영되지 않음 · NPV·3D에만",
                    "Not in kWh/m² · NPV and 3D only",
                  )}
                </span>
              ) : null}

              {wouldEvict.length > 0 ? (
                <span className="text-[9px] leading-tight text-muted-foreground/80">
                  {t(
                    `${wouldEvict.map((m) => measureDisplayName(m.id, "ko", m.name)).join(", ")} 대신 선택됩니다`,
                    `Replaces ${wouldEvict.map((m) => measureDisplayName(m.id, "en", m.name)).join(", ")}`,
                  )}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {trackCoversNothing ? (
        <p
          className="text-[10px] leading-tight text-amber-600 dark:text-amber-400"
          data-track-covers-nothing
        >
          {t(
            "선택한 공사에는 이 지원 재원이 적용되지 않습니다 — 태양광은 신재생에너지 보급사업 소관입니다.",
            "This financing does not apply to the chosen work — solar is funded by a separate programme (신재생에너지 보급사업).",
          )}
        </p>
      ) : null}
    </div>
  );
}
