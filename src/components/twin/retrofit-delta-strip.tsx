"use client";

// src/components/twin/retrofit-delta-strip.tsx
// What the 그린리모델링 chips actually change, under the energy strip that
// says what the building is now.
//
// Takes no props on purpose. The HUD's own numbers are already published to
// `scenario-store` (buildingInputs, and the chosen work via
// `useEffectiveMeasureIds`), and the climate comes from `useActiveSigunguCd()`
// — the same source `EnergyCards` uses — so the row above and this row are one
// engine on one climate. Mounting it is one line.
//
// It reports on the work the USER chose, not on the knapsack's optimum: the
// measure chips above are the selection, and this says what that selection
// does to the building.
//
// It also carries the 제안 미리보기 switch, which is what makes the twin's 3D
// retrofit visuals reachable at all: `measure-visuals.ts` reads
// `useProposalVisualIds()`, and this is the only control that writes the flag
// behind it.
//
// Honesty rules this component exists to hold, both from AGENTS.md:
//  - A measure the engine cannot price is rendered as a stated absence with
//    its reason, never dropped. LED and PV are exactly that today.
//  - Every sentence beside a number is built from the number. The change
//    chips are `summaryKo`/`summaryEn` off the delta, not hand-written prose.

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  useScenarioStore,
  useProposalVisualIds,
  useEffectiveMeasureIds,
} from "@/store/scenario-store";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { usePvLayout } from "@/hooks/use-pv-layout";
import { getClimateData } from "@/lib/energy/climate-data";
import { getGradeColor } from "@/lib/energy/energy-grade";
import type { EnergyGrade } from "@/lib/energy/energy-grade";
import {
  computeRetrofitDelta,
  zeroDeltaReason,
} from "@/lib/retrofit/retrofit-delta";
import type { RetrofitPhysicalChange } from "@/lib/retrofit/retrofit-delta";

/** A signed number with its unit, coloured by whether it is an improvement. */
function DeltaValue({
  value,
  decimals,
  unit,
}: {
  value: number;
  decimals: number;
  unit: string;
}) {
  const improved = value < 0;
  const flat = Math.abs(value) < 10 ** -decimals / 2;
  return (
    <span
      className={
        flat
          ? "tabular-nums text-muted-foreground"
          : improved
            ? "tabular-nums text-emerald-600 dark:text-emerald-400"
            : "tabular-nums text-amber-600 dark:text-amber-400"
      }
    >
      {flat ? "±0" : `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(decimals)}`}
      {` ${unit}`}
    </span>
  );
}

function ChangeChip({ change, lang }: { change: RetrofitPhysicalChange; lang: string }) {
  const summary = lang === "ko" ? change.summaryKo : change.summaryEn;
  const reason = lang === "ko" ? change.unpricedReasonKo : change.unpricedReasonEn;
  return (
    <span
      title={reason}
      className={
        change.pricedByEngine
          ? "shrink-0 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-foreground"
          : "shrink-0 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
      }
    >
      {summary}
    </span>
  );
}

export function RetrofitDeltaStrip() {
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(false);

  const buildingInputs = useScenarioStore((s) => s.buildingInputs);
  // The work in force — what the user chose, which is what every other
  // number on this frame is struck against.
  const chosenMeasureIds = useEffectiveMeasureIds();
  const previewProposal = useScenarioStore((s) => s.previewProposal);
  const setPreviewProposal = useScenarioStore((s) => s.setPreviewProposal);
  // Subscribed so the switch's effect on the model is visible from here even
  // though the flag alone would render the same; it also documents that this
  // component and the 3D read one gate.
  const proposalIds = useProposalVisualIds();

  const buildingPk = buildingInputs?.buildingPk ?? "";
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const recipe = useEffectiveRecipe(buildingPk);
  // Same climate the energy strip above used — not a second lookup.
  const sigunguCd = useActiveSigunguCd();
  const pvLayout = usePvLayout();

  const delta = useMemo(() => {
    if (!materials || !recipe) return null;
    return computeRetrofitDelta({
      materials,
      recipe,
      climate: getClimateData(sigunguCd),
      measureIds: chosenMeasureIds,
      pvGeometricKWp: pvLayout?.totalKWp ?? 0,
    });
  }, [materials, recipe, sigunguCd, chosenMeasureIds, pvLayout]);

  const priced = delta?.changes.filter((c) => c.pricedByEngine) ?? [];
  const unpriced = delta?.changes.filter((c) => !c.pricedByEngine) ?? [];
  const movedElements = delta?.elements.filter((e) => e.deltaHCoefficient !== 0) ?? [];

  // WHY the delta is zero — three different facts that used to share one
  // sentence. Found on /models/schependomlaan, where a selection made only of
  // unpriced measures rendered "the chosen work does not move this run's
  // kWh/m²". True of the run; false as stated about the work, which had
  // changed the building and moved NPV by ₩144만. `isZeroDelta` licenses a
  // claim about THIS MODULE, never about the building:
  //
  //  - nothing is chosen at all;
  //  - work is chosen, but every item of it is something this engine cannot
  //    price (LED, PV) — so the run is silent and the work is not;
  //  - work is chosen and priceable, but its targets are already met, so
  //    there is genuinely nothing left for it to change.
  const chosenEffects = delta?.measures ?? [];
  const unpricedMeasures = chosenEffects.filter(
    (m) => m.changes.length > 0 && !m.pricedByEngine,
  );
  const zeroReason = zeroDeltaReason(chosenMeasureIds.length, chosenEffects);

  const previewToggle = (
    <button
      type="button"
      onClick={() => setPreviewProposal(!previewProposal)}
      aria-pressed={previewProposal}
      data-retrofit-preview-toggle
      className={
        previewProposal
          ? "shrink-0 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-foreground"
          : "shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground"
      }
    >
      {t("제안 미리보기", "Preview proposal")} {previewProposal ? "ON" : "OFF"}
    </button>
  );

  if (!delta) {
    // No materials or no recipe yet: say which, rather than rendering an
    // empty bar that reads as "nothing changes".
    return (
      <div
        className="flex items-center gap-3 border-b border-border px-3 py-2 text-[11px] text-muted-foreground"
        data-retrofit-delta-strip
      >
        {previewToggle}
        <span>
          {t(
            "이 건물의 재료·형상이 아직 없어 제안 전후를 계산할 수 없습니다.",
            "No materials or geometry for this building yet, so the before/after cannot be computed.",
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-border" data-retrofit-delta-strip>
      <div className="flex items-center gap-3 overflow-x-auto px-3 py-2">
        {previewToggle}

        {delta.isZeroDelta ? (
          <span
            className="shrink-0 text-[11px] text-muted-foreground"
            data-zero-reason={zeroReason}
          >
            {zeroReason === "nothing-chosen"
              ? t(
                  "선택한 공사 없음 — 위에서 공사를 고르면 변화가 여기에 나타납니다.",
                  "No work chosen — pick work above and the change appears here.",
                )
              : zeroReason === "only-unpriced"
                ? t(
                    `이 실행이 반영할 수 있는 공사가 선택되어 있지 않습니다 — 선택한 ${unpricedMeasures.length}건은 아래 사유로 kWh/m²에 반영되지 않습니다. 건물과 NPV는 바뀝니다.`,
                    `No measure this run can price is selected — the ${unpricedMeasures.length} chosen are excluded for the reason below. The building and the NPV do change.`,
                  )
                : t(
                    "선택한 공사의 목표 성능을 이 건물이 이미 충족하고 있어 바뀌는 값이 없습니다.",
                    "This building already meets the targets of the chosen work, so nothing moves.",
                  )}
          </span>
        ) : (
          <>
            <span className="flex shrink-0 items-center gap-1 text-xs">
              <span
                className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-[11px] font-bold text-white"
                style={{ backgroundColor: getGradeColor(delta.before.grade as EnergyGrade) }}
              >
                {delta.before.grade}
              </span>
              <span className="text-muted-foreground">→</span>
              <span
                className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-[11px] font-bold text-white"
                style={{ backgroundColor: getGradeColor(delta.after.grade as EnergyGrade) }}
              >
                {delta.after.grade}
              </span>
            </span>
            <span className="shrink-0 text-xs">
              <DeltaValue value={delta.deltaSitePerSqm} decimals={1} unit="kWh/m²·yr" />
            </span>
            <span className="shrink-0 text-xs">
              <DeltaValue value={delta.deltaCo2PerSqm} decimals={1} unit="kgCO₂/m²·yr" />
            </span>
            <span className="shrink-0 text-xs">
              <DeltaValue value={delta.deltaTotalHCoefficient} decimals={0} unit="W/K" />
            </span>
          </>
        )}

        {(priced.length > 0 || unpriced.length > 0) && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? t("접기", "Less") : t("자세히", "Detail")}
          </button>
        )}
      </div>

      {/* Normally a disclosure. But when the ONLY thing to report is that the
          selected work is unpriceable by this run, the reason IS the answer —
          hiding it behind "자세히" leaves the headline sounding like a verdict
          on the work. In that state priced rows and moved elements are both
          empty, so this shows exactly the unpriced block and its explanation. */}
      {(expanded || zeroReason === "only-unpriced") && (
        <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
          {movedElements.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t("요소별 열손실", "Heat loss by element")}
              </span>
              {movedElements.map((el) => (
                <span
                  key={el.element}
                  className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px]"
                >
                  {lang === "ko" ? el.labelKo : el.labelEn}{" "}
                  <DeltaValue value={el.deltaHCoefficient} decimals={0} unit="W/K" />
                </span>
              ))}
            </div>
          )}

          {priced.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t("반영됨", "In the run")}
              </span>
              {priced.map((c) => (
                <ChangeChip key={`${c.measureId}:${c.field}`} change={c} lang={lang} />
              ))}
            </div>
          )}

          {unpriced.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t("이 실행에는 반영되지 않음", "Not in this run")}
                </span>
                {unpriced.map((c) => (
                  <ChangeChip key={`${c.measureId}:${c.field}`} change={c} lang={lang} />
                ))}
              </div>
              {/* The reason, spelled out rather than left in a tooltip: these
                  measures are bought and they do change the building, and the
                  page must say why the intensity did not move. */}
              <p className="text-[10px] leading-snug text-muted-foreground">
                {lang === "ko" ? unpriced[0].unpricedReasonKo : unpriced[0].unpricedReasonEn}
              </p>
            </div>
          )}

          {!previewProposal && proposalIds.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              {t(
                "3D 미리보기가 꺼져 있어 모델은 현재 상태를 보여줍니다. 위 숫자는 선택된 제안 기준입니다.",
                "The 3D preview is off, so the model shows the building as it stands. The figures above still describe the selected proposal.",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
