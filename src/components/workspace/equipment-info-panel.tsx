"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { useSelectionStore } from "@/store/selection-store";
import { useT } from "@/lib/i18n";
import { MEP_SUB_CONFIGS } from "@/lib/layers/types";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useMaterialStore } from "@/store/material-store";
import { useScenarioStore } from "@/store/scenario-store";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { resolveHeatingFuel, type Fuel } from "@/lib/retrofit/economic-model";
import { buildEquipmentStory } from "@/lib/retrofit/equipment-story";
import { formatKrw, formatYears } from "@/lib/twin-formatters";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

/**
 * EquipmentInfoPanel — the "object story" for a clicked MEP mesh, in three
 * acts (P2-19):
 *   1. What is it       — category, location, efficiency grade
 *   2. How it runs now  — capacity, install year, consumption, PRICED annual cost
 *   3. What upgrading returns — retrofit measures for this equipment's system
 *      category, from the SAME engine as the Twin scenario rail (identical
 *      numbers), with savings/payback/NPV.
 *
 * Per EQ-02 (ROADMAP.md): no value appears as measured data.
 *   - Every numeric row carries an inline amber "추정" badge.
 *   - A card-footer disclaimer covers savings figures too.
 * Per STD-01: Korean 1~5등급 grade badge per KS B 6364 or KSC IEC 62301.
 *
 * IMPORTANT: This component does NOT import EFFICIENCY_GRADE_COLORS or
 * EnergyGrade from properties-panel.tsx — those are the building-level
 * certification grades (1+++ to 7). Equipment grades are a separate
 * 1~5 scale defined in equipment-specs.ts (D-04 / Pitfall 3).
 */

const FUEL_LABELS: Record<Fuel, { ko: string; en: string }> = {
  electricity: { ko: "전기", en: "electricity" },
  gas: { ko: "가스", en: "gas" },
  districtHeating: { ko: "지역난방", en: "district heating" },
};

export function EquipmentInfoPanel() {
  const { t, lang } = useT();
  const info = useSelectionStore((s) => s.selectedEquipment);
  const clearEquipment = useSelectionStore((s) => s.clearEquipment);

  const buildingPk = useActiveBuildingPk();
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const publishedInputs = useScenarioStore((s) => s.buildingInputs);
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);

  // Same input-sharing convention as SceneOutliner: prefer the ledger-derived
  // inputs the Twin overlay publishes; with nothing published the areas are 0
  // and the engine yields no measures (the story then explains why).
  const inputsMatch = publishedInputs?.buildingPk === buildingPk;
  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea: inputsMatch ? publishedInputs.totalFloorArea : 0,
    footprintArea: inputsMatch ? publishedInputs.footprintArea : 0,
    roofType: inputsMatch ? publishedInputs.roofType : "flat",
    sidoPrefix: inputsMatch ? publishedInputs.sidoPrefix : undefined,
    programTrack,
  });

  const story = useMemo(() => {
    if (!info) return null;
    const heatingFuel: Fuel = materials
      ? resolveHeatingFuel(materials.hvac.heating)
      : "gas";
    return buildEquipmentStory({
      componentType: info.componentType,
      annualKwh: info.specs.annualKwh,
      heatingFuel,
      allMeasures: scenario.allMeasures,
    });
  }, [info, materials, scenario.allMeasures]);

  if (!info || !story) return null;

  const { specs, subLayerId, componentType, floorNo } = info;
  const subConfig = MEP_SUB_CONFIGS[subLayerId];
  const fuelLabel = t(FUEL_LABELS[story.fuel].ko, FUEL_LABELS[story.fuel].en);

  return (
    <div className="m-3 rounded-lg border border-border bg-card p-3 text-xs shadow-sm">
      {/* ── Act 1: what is it ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-sm">
            {t(specs.categoryKo, specs.categoryEn)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {t(subConfig.nameKo, subConfig.name)}
            {" · "}
            {componentType}
            {floorNo !== null ? ` · ${floorNo}F` : ""}
          </div>
        </div>
        <button
          onClick={clearEquipment}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={t("닫기", "Close")}
          aria-label={t("닫기", "Close")}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Korean efficiency grade badge — 1~5등급 (NOT building grade 1+++~7) */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold text-white"
          style={{ backgroundColor: specs.gradeColor }}
        >
          {specs.efficiencyGradeLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">{specs.standardRef}</span>
      </div>

      {/* ── Act 2: how it runs now ────────────────────────────────────── */}
      <SectionHeader label={t("현재 운전 (추정)", "Current operation (est.)")} />
      <div className="space-y-0.5">
        <SpecRow label={t("용량", "Capacity")} value={specs.capacity} />
        <SpecRow
          label={t("설치연도", "Install Year")}
          value={`${t("약 ", "~")}${specs.installYear}${t("년", "")}`}
        />
        <SpecRow
          label={t("연간 소비", "Annual Use")}
          value={`${specs.annualKwh.toLocaleString()} kWh/${t("년", "yr")}`}
        />
        <SpecRow
          label={t("연간 에너지 비용", "Annual energy cost")}
          value={`${formatKrw(story.currentAnnualCostKrw, lang)} (${fuelLabel})`}
        />
      </div>

      {/* ── Act 3: what upgrading returns ─────────────────────────────── */}
      <SectionHeader
        label={t("업그레이드하면 (추정)", "If upgraded (est.)")}
        className="mt-3"
      />
      {story.upgrades.length > 0 ? (
        <div className="space-y-1.5">
          {story.upgrades.map((m) => (
            <UpgradeRow key={m.id} measure={m} lang={lang} t={t} />
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {story.category === null
            ? t(
                "이 설비 유형에는 카탈로그에 직접 대응하는 개선안이 없습니다.",
                "No direct upgrade measure in the catalog for this equipment type.",
              )
            : scenario.allMeasures.length === 0
              ? t(
                  "트윈 단계에서 건물 데이터가 준비되면 개선안이 계산됩니다.",
                  "Upgrade options are computed once the twin's building data is ready.",
                )
              : t(
                  "현재 사양 기준으로 적용 가능한 개선안이 없습니다 — 이미 효율적입니다.",
                  "No applicable upgrades at current specs — already efficient.",
                )}
        </p>
      )}

      {/* Card-level amber disclaimer — second layer of EQ-02 enforcement */}
      <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
          {t(
            "⚠ 모든 값(절감액·회수기간 포함)은 추정치입니다 — 실측 데이터가 아닙니다.",
            "⚠ All values (incl. savings and payback) are estimated — not measured data.",
          )}
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={`mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
    >
      {label}
    </div>
  );
}

/**
 * One upgrade measure: name (official Korean measure name, per i18n policy)
 * with year-1 saving, discounted payback, and NPV from the shared DCF engine.
 */
function UpgradeRow({
  measure,
  lang,
  t,
}: {
  measure: RetrofitMeasure;
  lang: "ko" | "en";
  t: (ko: string, en: string) => string;
}) {
  const fin = measure.financials;
  const payback =
    fin && Number.isFinite(fin.discountedPayback)
      ? fin.discountedPayback
      : measure.paybackYears;

  return (
    <div className="rounded border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{measure.name}</span>
        <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
          추정
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground tabular-nums">
        <span>
          {t("연간 절감", "Saves")}{" "}
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {formatKrw(measure.annualCostSaving, lang)}/{t("년", "yr")}
          </span>
        </span>
        <span>
          {t("회수", "Payback")} {formatYears(payback, lang)}
        </span>
        {fin && (
          <span>
            NPV {formatKrw(fin.npv, lang)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Single spec row with label, value, and mandatory amber "추정" badge.
 * Every value displayed in the equipment panel must carry this badge (EQ-02).
 */
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-medium tabular-nums">{value}</span>
        <span className="inline-flex items-center rounded px-1 py-px text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
          추정
        </span>
      </div>
    </div>
  );
}
