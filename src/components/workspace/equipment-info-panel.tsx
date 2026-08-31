"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useSelectionStore } from "@/store/selection-store";
import { useT } from "@/lib/i18n";
import { MEP_SUB_CONFIGS } from "@/lib/layers/types";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useMaterialStore } from "@/store/material-store";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { useScenarioStore } from "@/store/scenario-store";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { resolveHeatingFuel, type Fuel } from "@/lib/retrofit/economic-model";
import { buildEquipmentStory } from "@/lib/retrofit/equipment-story";
import { formatKrw, formatYears } from "@/lib/twin-formatters";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import { Button } from "@/components/ui/button";

/**
 * EquipmentInfoPanel — the "object story" for a clicked MEP mesh, in three
 * acts (P2-19):
 *   1. What is it       — category, location, efficiency grade
 *   2. How it runs now  — capacity, install year, consumption, PRICED annual cost
 *   3. What upgrading returns — retrofit measures for this equipment's system
 *      category, from the SAME engine as the Twin scenario rail (identical
 *      numbers), with savings/payback/NPV.
 *
 * Plus a HITL confirm-spec form so the operator can replace estimates with
 * measured capacity / install year (stored as user-input provenance).
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
  const overrideProperty = useMaterialStore((s) => s.overrideProperty);
  const patchProvenance = useTwinProvenanceStore((s) => s.patch);
  const confirmed = materials?.source === "user-input";
  const [cap, setCap] = useState("");
  const [year, setYear] = useState("");

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

      {/* ── MEP network record (canonical graph, §25) ─────────────────── */}
      {info.mep ? (
        <div className="mb-3">
          <SectionHeader label={t("배관·덕트 정보", "MEP network")} />
          <div className="space-y-0.5">
            <SpecRow
              label={t("계통", "System")}
              value={t(info.mep.systemNameKo, info.mep.systemName)}
            />
            {info.mep.role ? (
              <SpecRow label={t("역할", "Role")} value={mepRoleLabel(info.mep.role, lang)} />
            ) : null}
            {info.mep.sizeLabel ? (
              <SpecRow label={t("규격", "Size")} value={info.mep.sizeLabel} />
            ) : null}
            {info.mep.flowLabel ? (
              <SpecRow label={t("설계 유량", "Design flow")} value={info.mep.flowLabel} />
            ) : null}
          </div>
          {info.mep.basis ? (
            <div className="mt-1 text-[10px] text-amber-600">
              {t(
                `산정 근거: ${mepBasisLabel(info.mep.basis, "ko")} — 실측이 아닌 설계 추정값입니다`,
                `Basis: ${mepBasisLabel(info.mep.basis, "en")} — engineering estimate, not a measurement`,
              )}
            </div>
          ) : null}
        </div>
      ) : null}

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

      <div className="mt-2 space-y-1.5 border-t pt-2">
        <p className="text-[10px] font-semibold text-muted-foreground">
          {t("사양 확인", "Confirm spec")}
        </p>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {t("용량 kW", "Capacity kW")}
          <input
            type="number"
            min={1}
            className="h-6 flex-1 rounded border bg-background px-1.5 text-xs tabular-nums"
            placeholder={specs.capacity}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {t("설치연도", "Year")}
          <input
            type="number"
            min={1960}
            max={2030}
            className="h-6 flex-1 rounded border bg-background px-1.5 text-xs tabular-nums"
            placeholder={String(specs.installYear)}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="h-6 w-full text-[10px]"
          disabled={!cap && !year}
          onClick={() => {
            const isHeat =
              info.subLayerId === "mep-hvac" &&
              (info.componentType.includes("heat") ||
                info.componentType.includes("boiler"));
            if (cap) {
              const n = Number(cap);
              if (Number.isFinite(n)) {
                overrideProperty(
                  buildingPk,
                  isHeat ? "hvac.heating.capacity" : "hvac.cooling.capacity",
                  n,
                );
              }
            }
            if (year) {
              const y = Number(year);
              if (Number.isFinite(y)) {
                patchProvenance(buildingPk, { equipmentInstallYear: y });
              }
            }
          }}
        >
          {t("확인 — 입력으로 저장", "Confirm — save as input")}
        </Button>
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

      {/* Card-level disclaimer — second layer of EQ-02; cyan when confirmed */}
      <div className={`mt-3 rounded border px-2 py-1.5 ${
        confirmed
          ? "border-cyan-500/30 bg-cyan-500/10"
          : "border-amber-500/30 bg-amber-500/10"
      }`}>
        <p className={`text-[10px] leading-relaxed ${
          confirmed
            ? "text-cyan-700 dark:text-cyan-400"
            : "text-amber-700 dark:text-amber-400"
        }`}>
          {confirmed
            ? t(
                "일부 값은 사용자 입력입니다. 등급이 이 값을 사용합니다.",
                "Some values are user input. The grade uses them.",
              )
            : t(
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
const MEP_ROLE_LABELS: Record<string, { ko: string; en: string }> = {
  service: { ko: "인입", en: "service entry" },
  riser: { ko: "입상관", en: "riser" },
  main: { ko: "주관", en: "main" },
  branch: { ko: "분기관", en: "branch" },
  runout: { ko: "말단 연결", en: "terminal runout" },
  connector: { ko: "장비 연결", en: "equipment hookup" },
};

const MEP_BASIS_LABELS: Record<string, { ko: string; en: string }> = {
  calculated: { ko: "계산값", en: "calculated" },
  estimated: { ko: "추정값", en: "estimated" },
  defaulted: { ko: "규격 기본값", en: "catalog default" },
  imported: { ko: "도면 근거", en: "imported from drawing" },
  user: { ko: "사용자 입력", en: "user input" },
};

function mepRoleLabel(role: string, lang: string): string {
  const entry = MEP_ROLE_LABELS[role];
  if (!entry) return role;
  return lang === "ko" ? entry.ko : entry.en;
}

function mepBasisLabel(basis: string, lang: "ko" | "en"): string {
  const entry = MEP_BASIS_LABELS[basis];
  if (!entry) return basis;
  return entry[lang];
}

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
