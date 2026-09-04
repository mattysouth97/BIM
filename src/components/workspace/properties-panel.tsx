"use client";

import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingPk, useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import {
  deliveredFromDemand,
  buildingTypeFromMaterials,
  isResidentialOccupancy,
} from "@/lib/energy/delivered-from-demand";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useEngineResult } from "@/hooks/use-engine-result";
import { useReviewHighlightStore } from "@/store/review-highlight-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { useActualEnergy } from "@/hooks/use-actual-energy";
import { useWeatherData } from "@/hooks/use-weather-data";
import { useTwinFidelity } from "@/hooks/use-twin-fidelity";
import { useEditorModeStore } from "@/store/editor-mode-store";
import { FloorStackEditor } from "./floor-stack-editor";
import { SlotPlan } from "./slot-plan";
import { EquipmentScheduleIngest } from "./equipment-schedule-ingest";
import { FidelityBadge } from "@/components/twin/fidelity-badge";
import { FidelityDetailPanel } from "@/components/twin/fidelity-detail-panel";
import { deriveInputProvenance } from "@/lib/fidelity/input-provenance";
import { loadCalibration } from "@/lib/fidelity/building-calibration-loader";
import type { FootprintSource } from "@/lib/fidelity/input-provenance";
import { calibrateEnergy } from "@/lib/energy/calibration";
import { compareToBenchmark } from "@/lib/energy/benchmark-comparison";
import {
  scoreGreenCertification,
  type BuildingCertificationInput,
} from "@/lib/compliance/green-certification";
import type { CertificationVersion } from "@/lib/compliance/certification-types";
import {
  calculateEfficiencyRating,
  GRADE_LABELS,
} from "@/lib/compliance/efficiency-rating";
import { Loader2 } from "lucide-react";
import { EquipmentInfoPanel } from "./equipment-info-panel";
import { EquipmentInsightCard } from "./equipment-insight-card";
import { RevitIdentityCard } from "./revit-identity-card";
import { BimPropertiesInspector } from "./bim-properties-inspector";

// ── Grade color map for efficiency rating ────────────────────────────────────

const EFFICIENCY_GRADE_COLORS: Record<string, string> = {
  "1+++": "#16a34a",
  "1++": "#22c55e",
  "1+": "#4ade80",
  "1": "#86efac",
  "2": "#facc15",
  "3": "#fb923c",
  "4": "#f97316",
  "5": "#ef4444",
  "6": "#dc2626",
  "7": "#991b1b",
};

const CERTIFICATION_GRADE_LABELS: Record<string, { en: string; ko: string }> = {
  excellent: { en: "Excellent (최우수)", ko: "최우수 (Excellent)" },
  best: { en: "Best (우수)", ko: "우수 (Best)" },
  good: { en: "Good (우량)", ko: "우량 (Good)" },
  general: { en: "General (일반)", ko: "일반 (General)" },
  "not-assessable": { en: "Not Assessable", ko: "평가 불가" },
};

const PERFORMANCE_COLORS: Record<string, string> = {
  excellent: "text-green-600",
  good: "text-green-500",
  average: "text-yellow-600",
  "below-average": "text-orange-500",
  poor: "text-red-500",
};

interface PropertiesPanelProps {
  /**
   * P2-27: footprint source from VWorld or CAD ingest — threaded from the
   * page level so no second fetch is needed. Absent for CAD-draft buildings.
   */
  footprintSource?: FootprintSource;
  /**
   * P2-27: ledger 'heit' field (meters). AFF-6: 0 means unavailable.
   * Threaded from the page's titleData.heit so we don't re-fetch.
   */
  ledgerHeit?: number;
  /**
   * P2-27: VWorld measured building height (buld_hg, meters). Null when absent.
   */
  measuredHeightM?: number | null;
}

/**
 * Properties panel — renders in the right dock of WorkspaceShell.
 * Shows analytics dashboard with fidelity, calibration, benchmark,
 * certification, and efficiency rating for the current building.
 */
export function PropertiesPanel({
  footprintSource,
  ledgerHeit,
  measuredHeightM,
}: PropertiesPanelProps = {}) {
  const { t } = useT();

  const buildingPk = useActiveBuildingPk();
  // HITL review highlight — clicking a flag pulses that element category in 3D.
  const highlightKind = useReviewHighlightStore((s) => s.highlightKind);
  const toggleHighlightKind = useReviewHighlightStore((s) => s.toggleHighlightKind);

  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  // P1-08 (d): same regional climate as every other panel.
  const sigunguCd = useActiveSigunguCd();
  const metrics = useEnergyMetrics(buildingPk, sigunguCd);
  const currentMode = useEditorModeStore((s) => s.currentMode);
  const actual = useActualEnergy(buildingPk);
  const actualData = actual.data ?? [];
  const hasActual = actualData.length > 0;
  const { report: fidelityReport, checklist: upgradeChecklist } =
    useTwinFidelity(buildingPk, hasActual);
  // KMA ASOS weather (previous year, Seoul station default). Disabled
  // without an API key; the section below renders only on success.
  const weather = useWeatherData();

  const [certVersion, setCertVersion] =
    useState<CertificationVersion>("2024");

  // P1-08 (a): single canonical merge (carries footprintPolygon overrides).
  const effectiveRecipe = useEffectiveRecipe(buildingPk);

  // ── Agentic BIM Engine (Task 8) ───────────────────────────────────────────
  // Must run unconditionally (before the early-return below) — hooks can't
  // be called conditionally. `effectiveRecipe` may be undefined; the hook
  // treats that as `available: false` (needs-outline), same as a
  // "parcel"/null footprintSource.
  const engine = useEngineResult({
    buildingPk,
    recipe: effectiveRecipe,
    footprintSource: footprintSource ?? null,
    ledgerHeit: ledgerHeit ?? 0,
  });

  // ── Input provenance (P2-27) ──────────────────────────────────────────────
  // calibrationApplied: sync registry lookup — no fetch (loadCalibration returns
  // null for unknown buildingPk, which is the expected path for most buildings).
  const inputProvenance = useMemo(() => {
    const calibrationApplied = !!loadCalibration(buildingPk);
    return deriveInputProvenance({
      footprintSource: footprintSource ?? null,
      ledgerHeit: ledgerHeit ?? 0,
      measuredHeightM: measuredHeightM ?? null,
      calibrationApplied,
    });
  }, [buildingPk, footprintSource, ledgerHeit, measuredHeightM]);

  // ── Calibration ──────────────────────────────────────────────────────────

  const calibration = useMemo(() => {
    if (!metrics || !hasActual || actualData.length === 0) return null;
    const mostRecent = actualData.reduce((a, b) => (b.year > a.year ? b : a));
    if (mostRecent.total_kwh <= 0) return null;

    // Predicted stack must be WHOLE-building (the meter total includes
    // lighting/DHW/plug) — comparing HVAC-only vs meter always "under-predicts".
    return calibrateEnergy(
      {
        heating: metrics.demand.heatingDemand,
        cooling: metrics.demand.coolingDemand,
        lighting: metrics.breakdown.lighting,
        dhw: metrics.breakdown.dhw,
        total: metrics.siteTotal,
      },
      {
        electric_kwh: mostRecent.electric_kwh ?? 0,
        gas_kwh: mostRecent.gas_kwh ?? 0,
        total_kwh: mostRecent.total_kwh,
      }
    );
  }, [metrics, hasActual, actualData]);

  // ── Benchmark comparison ─────────────────────────────────────────────────

  const benchmark = useMemo(() => {
    if (!metrics) return null;
    // P1-05: benchmark dataset is PRIMARY energy — compare primary intensity.
    const useType = isResidentialOccupancy(materials) ? "residential" : "office";
    const codeYear = materials?.codeYear ?? 2000;
    // Benchmark DB has no pre-1990 rows — map to the NEAREST era (1990s),
    // not the newest (the default fallback picks 2020+, the worst match).
    const era =
      codeYear >= 2020
        ? "2020+"
        : codeYear >= 2010
          ? "2010s"
          : codeYear >= 2000
            ? "2000s"
            : codeYear >= 1990
              ? "1990s"
              : "pre-1990";
    return compareToBenchmark(metrics.primaryEnergyPerArea, useType, era);
  }, [metrics, materials]);

  // ── Green Certification ──────────────────────────────────────────────────

  const certification = useMemo(() => {
    if (!materials || !metrics) return null;
    const avgWallU =
      materials.envelope.walls.reduce((sum, w) => sum + w.uValue, 0) /
      Math.max(materials.envelope.walls.length, 1);

    const input: BuildingCertificationInput = {
      wallUValue: avgWallU,
      windowUValue: materials.envelope.windows.uValue,
      roofUValue: materials.envelope.roof.uValue,
      energyGrade: metrics.grade,
      // P1-05: this field is PRIMARY energy — was mislabeled with delivered.
      primaryEnergyDemand: metrics.primaryEnergyPerArea,
      renewableCapacity: materials.renewable?.solarPV?.capacity ?? 0,
      windowToWallRatio:
        materials.envelope.windows.windowToWallRatio?.S ?? 0.3,
      structureCode: undefined,
    };
    return scoreGreenCertification(input, certVersion);
  }, [materials, metrics, certVersion]);

  // ── Efficiency Rating ────────────────────────────────────────────────────

  const efficiencyRating = useMemo(() => {
    if (!metrics || !effectiveRecipe || !materials) return null;
    const totalArea = envelopeQuantities(effectiveRecipe).intensityFloorAreaSqm;
    if (totalArea <= 0) return null;

    // P1-05: shared fuel-split + building-type helpers — same computation
    // path as metrics.grade, so the two can never disagree.
    return calculateEfficiencyRating(
      deliveredFromDemand(metrics.demand),
      totalArea,
      buildingTypeFromMaterials(materials)
    );
  }, [metrics, effectiveRecipe, materials]);

  // ── No data state ────────────────────────────────────────────────────────

  if (!buildingPk || !materials) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-4">
        <Loader2 className="h-8 w-8 opacity-40 animate-spin" />
        <p className="text-xs text-center leading-relaxed">
          {t("건물 데이터를 불러오는 중...", "Loading building data...")}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {currentMode === "floor-edit" && <FloorStackEditor buildingPk={buildingPk} />}
      {currentMode === "object-edit" && <SlotPlan buildingPk={buildingPk} />}
      <RevitIdentityCard />
      <BimPropertiesInspector />
      <EquipmentInfoPanel />
      <EquipmentInsightCard />
      <EquipmentScheduleIngest buildingPk={buildingPk} />
      <Accordion
        type="multiple"
        defaultValue={["fidelity", "benchmark", "efficiency"]}
        className="px-3"
      >
        {/* ── Section 1: Twin Fidelity ─────────────────────────────────── */}
        <AccordionItem value="fidelity">
          <AccordionTrigger className="text-xs font-semibold py-3">
            {t("트윈 충실도", "Twin Fidelity")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <FidelityBadge
                level={fidelityReport.level}
                completeness={fidelityReport.completeness}
                provenance={inputProvenance}
              />
              <FidelityDetailPanel
                report={fidelityReport}
                checklist={upgradeChecklist}
                provenance={inputProvenance}
                hitlFlags={engine.result?.hitlFlags}
                onExportIfc={engine.exportIfc}
                exporting={engine.exporting}
                engineUnavailableReason={engine.unavailableReason}
                onFlagClick={toggleHighlightKind}
                activeHighlightKind={highlightKind}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 2: Energy Calibration (conditional) ──────────────── */}
        {hasActual && calibration && (
          <AccordionItem value="calibration">
            <AccordionTrigger className="text-xs font-semibold py-3">
              {t("에너지 보정", "Energy Calibration")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-xs">
                {/* Overall delta */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("전체 차이", "Overall Delta")}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      calibration.overallDelta > 0
                        ? "text-red-500"
                        : calibration.overallDelta < -5
                          ? "text-green-600"
                          : "text-yellow-600"
                    }`}
                  >
                    {calibration.overallDelta > 0 ? "+" : ""}
                    {calibration.overallDelta.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {calibration.overallDelta > 0
                    ? t(
                        `예측보다 ${Math.abs(calibration.overallDelta).toFixed(0)}% 더 적게 사용`,
                        `${Math.abs(calibration.overallDelta).toFixed(0)}% less than predicted`,
                      )
                    : t(
                        `예측보다 ${Math.abs(calibration.overallDelta).toFixed(0)}% 더 많이 사용`,
                        `${Math.abs(calibration.overallDelta).toFixed(0)}% more than predicted`,
                      )}
                </p>

                {/* Largest discrepancy */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("최대 차이 항목", "Largest Discrepancy")}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {calibration.largestDiscrepancy}
                  </Badge>
                </div>

                {/* Insight */}
                <p className="text-[10px] text-muted-foreground/80 italic leading-relaxed border-t pt-2 mt-1">
                  {calibration.insight}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Section 2b: Weather (conditional — needs KMA data) ───────── */}
        {weather.data && (
          <AccordionItem value="weather">
            <AccordionTrigger className="text-xs font-semibold py-3">
              {t("기상 데이터", "Weather Data")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("난방도일 (HDD 18.3°C)", "Heating Degree Days (18.3°C)")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {weather.data.hdd.toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("냉방도일 (CDD 24°C)", "Cooling Degree Days (24°C)")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {weather.data.cdd.toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("연평균 기온", "Mean Temperature")}
                  </span>
                  <span className="font-medium tabular-nums">
                    {weather.data.avgTemp.toFixed(1)}°C
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/80 border-t pt-2 mt-1">
                  {t(
                    `${weather.data.year}년 KMA ASOS 서울 관측 기준`,
                    `${weather.data.year} KMA ASOS observations (Seoul station)`,
                  )}
                  {weather.data.dataCompleteness < 0.9 &&
                    t(
                      ` · 데이터 완전성 ${(weather.data.dataCompleteness * 100).toFixed(0)}% — 신뢰도 낮음`,
                      ` · ${(weather.data.dataCompleteness * 100).toFixed(0)}% complete — low reliability`,
                    )}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Section 3: Benchmark Comparison ──────────────────────────── */}
        {benchmark && (
          <AccordionItem value="benchmark">
            <AccordionTrigger className="text-xs font-semibold py-3">
              {t("벤치마크 비교", "Benchmark Comparison")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-xs">
                {/* Percentile */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("백분위", "Percentile")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Math.round(benchmark.percentile)}
                    {t("번째 백분위", "th percentile")}
                  </span>
                </div>

                {/* Performance tier */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("성능 등급", "Performance Tier")}
                  </span>
                  <span
                    className={`font-semibold capitalize ${
                      PERFORMANCE_COLORS[benchmark.performance] ?? ""
                    }`}
                  >
                    {benchmark.performance}
                  </span>
                </div>

                {/* Peer group context */}
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {benchmark.peerGroup.useType}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {benchmark.peerGroup.era}
                  </Badge>
                </div>

                {/* Insight */}
                <p className="text-[10px] text-muted-foreground/80 italic leading-relaxed border-t pt-2 mt-1">
                  {benchmark.insight}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Section 4: Green Certification ───────────────────────────── */}
        {certification && (
          <AccordionItem value="certification">
            <AccordionTrigger className="text-xs font-semibold py-3">
              {t("녹색건축물 인증", "Green Certification")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-xs">
                {/* Score */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("획득 점수", "Earned Points")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {certification.earnedPoints.toFixed(1)} /{" "}
                    {certification.assessableMaxPoints}
                  </span>
                </div>

                {/* Grade */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("등급", "Grade")}
                  </span>
                  <Badge
                    variant={
                      certification.grade === "excellent" ||
                      certification.grade === "best"
                        ? "default"
                        : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {t(
                      CERTIFICATION_GRADE_LABELS[certification.grade]?.ko ?? "",
                      CERTIFICATION_GRADE_LABELS[certification.grade]?.en ?? "",
                    )}
                  </Badge>
                </div>

                {/* Version toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("기준 버전", "Version")}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCertVersion("pre-2024")}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        certVersion === "pre-2024"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      Pre-2024
                    </button>
                    <button
                      onClick={() => setCertVersion("2024")}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        certVersion === "2024"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      2024
                    </button>
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed border-t pt-2 mt-1">
                  {certification.disclaimer}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ── Section 5: Energy Efficiency Rating ──────────────────────── */}
        {efficiencyRating && (
          <AccordionItem value="efficiency">
            <AccordionTrigger className="text-xs font-semibold py-3">
              {t("에너지효율등급", "Efficiency Rating")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-xs">
                {/* Grade prominently */}
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center justify-center rounded-md text-white font-bold text-lg px-3 py-1 min-w-[3.5rem]"
                    style={{
                      backgroundColor:
                        EFFICIENCY_GRADE_COLORS[efficiencyRating.grade] ??
                        "#6b7280",
                    }}
                  >
                    {efficiencyRating.grade}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">
                      {GRADE_LABELS[efficiencyRating.grade]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t("건축물 에너지효율등급", "Building Energy Efficiency")}
                    </span>
                  </div>
                </div>

                {/* Primary energy demand */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t("1차 에너지 수요", "Primary Energy Demand")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {efficiencyRating.primaryEnergyPerArea.toFixed(1)} kWh/m
                    {"\u00B2"}{"\u00B7"}yr
                  </span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
