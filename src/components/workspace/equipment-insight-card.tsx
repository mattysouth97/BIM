"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CalendarDays,
  Clock3,
  Gauge,
  Info,
  TrendingDown,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
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

const FUEL_LABELS: Record<Fuel, { ko: string; en: string }> = {
  electricity: { ko: "전기", en: "electricity" },
  gas: { ko: "가스", en: "gas" },
  districtHeating: { ko: "지역난방", en: "district heating" },
};

/**
 * Decision-oriented selected-object card:
 * identity → current cost → best upgrade → supporting evidence.
 */
export function EquipmentInsightCard() {
  const { t, lang } = useT();
  const info = useSelectionStore((s) => s.selectedEquipment);
  const clearEquipment = useSelectionStore((s) => s.clearEquipment);
  const buildingPk = useActiveBuildingPk();
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const publishedInputs = useScenarioStore((s) => s.buildingInputs);
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);
  const cardRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!info) return;
    const frame = window.requestAnimationFrame(() => {
      const card = cardRef.current;
      card?.focus({ preventScroll: true });
      card?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [info]);

  if (!info || !story) return null;

  const { specs, subLayerId, componentType, floorNo } = info;
  const subConfig = MEP_SUB_CONFIGS[subLayerId];
  const bestUpgrade = story.upgrades[0] ?? null;
  const fuelLabel = t(FUEL_LABELS[story.fuel].ko, FUEL_LABELS[story.fuel].en);

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      className="m-3 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_16px_42px_rgba(15,23,42,0.12)]"
      aria-live="polite"
      aria-label={t("선택된 설비 정보", "Selected equipment information")}
    >
      <div
        className="h-1"
        style={{
          background: `linear-gradient(90deg, ${subConfig.color}, ${subConfig.color}66 58%, transparent)`,
        }}
      />

      <header className="border-b border-border/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="size-2 rounded-full ring-4 ring-muted"
                style={{ backgroundColor: subConfig.color }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t(subConfig.nameKo, subConfig.name)}
              </span>
            </div>
            <h3 className="text-base font-semibold leading-tight">
              {t(specs.categoryKo, specs.categoryEn)}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {friendlyComponentType(componentType)}
              <span aria-hidden="true"> · </span>
              {floorNo !== null
                ? t(`${floorNo}층`, `Floor ${floorNo}`)
                : t("공용 설비", "Shared plant")}
            </p>
          </div>
          <button
            type="button"
            onClick={clearEquipment}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("닫기", "Close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-2 py-1 text-[11px] font-bold shadow-sm"
            style={{
              backgroundColor: specs.gradeColor,
              color: readableForeground(specs.gradeColor),
            }}
          >
            {specs.efficiencyGradeLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {specs.standardRef}
          </span>
        </div>
      </header>

      <div className="p-4">
        <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("모델링된 시스템 연간 에너지 비용", "Modeled system annual energy cost")}
            </span>
            <EstimateBadge t={t} />
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatKrw(story.currentAnnualCostKrw, lang)}
            </p>
            <p className="pb-0.5 text-[11px] text-muted-foreground">
              / {t("년", "yr")} · {fuelLabel}
            </p>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
            {t(
              "건물 모델에서 추론한 하위 시스템 전체 값이며, 선택한 3D 개별 설비의 계측값이 아닙니다.",
              "Scope: subsystem total inferred from the building model, not a meter reading for this individual 3D instance."
            )}
          </p>
        </div>

        <SectionLabel label={t("시스템 단위 운전 기준", "System-level operating baseline")} />
        <div className="grid grid-cols-3 gap-2">
          <MetricTile
            icon={Gauge}
            label={t("용량", "Capacity")}
            value={specs.capacity}
            t={t}
          />
          <MetricTile
            icon={Zap}
            label={t("연간 사용량", "Annual use")}
            value={compactEnergy(specs.annualKwh)}
            detail="kWh/yr"
            t={t}
          />
          <MetricTile
            icon={CalendarDays}
            label={t("설치 연도", "Installed")}
            value={`${specs.installYear}`}
            t={t}
          />
        </div>

        <SectionLabel
          label={t("건물 단위 개선 기회", "Building-level upgrade opportunity")}
        />
        {bestUpgrade ? (
          <BestUpgradeCard measure={bestUpgrade} lang={lang} t={t} />
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4">
            <p className="text-xs font-medium">
              {t("적용 가능한 직접 개선안 없음", "No direct upgrade match")}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {scenario.allMeasures.length === 0
                ? t(
                    "건물 입력이 준비되면 개선안과 재무 효과를 계산합니다.",
                    "Upgrade and financial impacts appear once building inputs are ready."
                  )
                : t(
                    "현재 사양 기준으로 적용 가능한 개선안이 없습니다.",
                    "No upgrade is applicable at the current specification."
                  )}
            </p>
          </div>
        )}

        {story.upgrades.length > 1 && (
          <p className="mt-2 text-right text-[10px] text-muted-foreground">
            {t(
              `대안 ${story.upgrades.length - 1}개가 시나리오 목록에 있습니다.`,
              `${story.upgrades.length - 1} more ${
                story.upgrades.length === 2 ? "option is" : "options are"
              } available in the scenario list.`
            )}
          </p>
        )}

        <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p className="text-[10px] leading-relaxed">
            {t(
              "운전값과 절감·회수기간은 모델 추정치이며 계측 데이터가 아닙니다.",
              "System totals, building-level savings, and payback are model estimates—not measured equipment data."
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </div>
  );
}

function EstimateBadge({ t }: { t: Translate }) {
  return (
    <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
      {t("추정", "Est.")}
    </span>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  t,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  t: Translate;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background/70 p-2.5">
      <div className="flex items-start justify-between gap-1">
        <Icon className="size-3 text-muted-foreground" />
        <EstimateBadge t={t} />
      </div>
      <p className="mt-2 truncate text-sm font-semibold tabular-nums">{value}</p>
      {detail && <p className="truncate text-[9px] text-muted-foreground">{detail}</p>}
      <p className="mt-1 truncate text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function BestUpgradeCard({
  measure,
  lang,
  t,
}: {
  measure: RetrofitMeasure;
  lang: "ko" | "en";
  t: Translate;
}) {
  const financials = measure.financials;
  const payback =
    financials && Number.isFinite(financials.discountedPayback)
      ? financials.discountedPayback
      : measure.paybackYears;

  return (
    <article className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="flex items-start justify-between gap-3 border-b border-emerald-500/20 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            {t("권장 건물 시나리오", "Recommended building scenario")}
          </p>
          <h4 className="mt-0.5 truncate text-xs font-semibold">{measure.name}</h4>
        </div>
        <EstimateBadge t={t} />
      </div>

      <div className="p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground">
              {t("예상 연간 절감", "Expected annual saving")}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatKrw(measure.annualCostSaving, lang)}
              <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                /{t("년", "yr")}
              </span>
            </p>
          </div>
          <TrendingDown className="mb-1 size-5 text-emerald-600" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <ImpactMetric
            icon={Clock3}
            label={t("할인 회수기간", "Discounted payback")}
            value={formatYears(payback, lang)}
            t={t}
          />
          <ImpactMetric
            icon={WalletCards}
            label="NPV"
            value={financials ? formatKrw(financials.npv, lang) : "—"}
            t={t}
          />
        </div>
      </div>
    </article>
  );
}

function ImpactMetric({
  icon: Icon,
  label,
  value,
  t,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  t: Translate;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-background/70 p-2">
      <div className="flex items-center justify-between gap-1">
        <Icon className="size-3 text-emerald-600" />
        <EstimateBadge t={t} />
      </div>
      <p className="mt-1.5 text-xs font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

type Translate = (ko: string, en: string) => string;

function compactEnergy(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return Math.round(value).toLocaleString();
}

function friendlyComponentType(value: string): string {
  return value
    .replace(/^(cooling|heating|vent|dhw|lighting)-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readableForeground(background: string): string {
  const hex = background.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";

  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const darkContrast = (luminance + 0.05) / 0.05;
  const lightContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= lightContrast ? "#111827" : "#ffffff";
}
