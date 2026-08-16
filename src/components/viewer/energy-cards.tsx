"use client";

// src/components/viewer/energy-cards.tsx
// Floating energy metric cards overlaid on the 3D viewer (bottom-left).
// Shows energy grade, annual demand, CO2 emissions, and heat loss breakdown.
// When actual energy data is available, shows modeled vs actual comparison with delta indicators.

import { useRef, useEffect, useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useActualEnergy } from "@/hooks/use-actual-energy";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateECO2Input, downloadECO2File, buildSubSystems } from "@/lib/energy/eco2-export";
import { parseECO2Result } from "@/lib/energy/eco2-import";
import { useMaterialStore } from "@/store/material-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import type { EnergyGrade } from "@/lib/energy/energy-grade";

interface EnergyCardsProps {
  buildingPk: string;
  /** `strip` sits in the twin instrument frame. `stack` is the old overlay pile. */
  variant?: "strip" | "stack";
}

/** Korean grade names */
const GRADE_NAME_KO: Record<EnergyGrade, string> = {
  "1+++": "1+++등급",
  "1++": "1++등급",
  "1+": "1+등급",
  "1": "1등급",
  "2": "2등급",
  "3": "3등급",
  "4": "4등급",
  "5": "5등급",
  "6": "6등급",
  "7": "7등급",
};

/** Animated number display -- smoothly transitions to new value */
function AnimatedValue({
  value,
  decimals = 1,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const currentRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = currentRef.current;
    const end = value;
    const duration = 400; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      currentRef.current = current;

      if (ref.current) {
        // Animate the number only — never concatenate the unit into
        // textContent. JSX unicode escapes in a suffix string have
        // rendered as literal `\u00B2` in the live overlay.
        ref.current.textContent = current.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, decimals, suffix]);

  return (
    <span>
      <span ref={ref}>
        {value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </span>
      {suffix}
    </span>
  );
}

/** Delta indicator with color coding */
function DeltaIndicator({
  modeled,
  actual,
  suffix = "",
  decimals = 1,
}: {
  modeled: number;
  actual: number;
  suffix?: string;
  decimals?: number;
}) {
  const delta = modeled - actual;
  // Green when modeled <= actual (conservative estimate), red when modeled > actual (optimistic)
  const isConservative = delta <= 0;
  const color = isConservative ? "text-green-600" : "text-red-500";
  const sign = delta > 0 ? "+" : "";

  return (
    <span className={`text-[10px] font-medium tabular-nums ${color}`}>
      {"\u0394"}
      {sign}
      {delta.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Small badge indicating actual data presence */
function ActualDataBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 text-[8px] font-medium px-1.5 py-0.5 leading-none">
      {label}
    </span>
  );
}

function SkeletonCards() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16 w-52 rounded-lg" />
      ))}
    </div>
  );
}

export function EnergyCards({ buildingPk, variant = "strip" }: EnergyCardsProps) {
  const { t } = useT();
  const narrow = useNarrowViewport();
  const leftDockOpen = useWorkspaceStore((s) => s.leftDockOpen);
  // P1-08 (d): same regional climate as every other panel.
  const sigunguCd = useActiveSigunguCd();
  const metrics = useEnergyMetrics(buildingPk, sigunguCd);
  const actual = useActualEnergy(buildingPk);
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // P1-08 (a): single canonical merge — the ECO2 export now carries
  // footprintPolygon overrides instead of silently dropping them.
  const effectiveRecipe = useEffectiveRecipe(buildingPk);

  const handleExport = useCallback(() => {
    if (!materials || !effectiveRecipe || !metrics) return;
    const subSystems = buildSubSystems(materials);
    const content = generateECO2Input(materials, effectiveRecipe, metrics, { subSystems });
    const fileName = `eco2-input-${buildingPk.slice(0, 8)}.json`;
    downloadECO2File(content, fileName);
  }, [materials, effectiveRecipe, metrics, buildingPk]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const result = parseECO2Result(text);
        if (result) {
          const gradeLabel = t(
            `등급: ${result.grade}, 수요: ${result.demand.toFixed(1)} kWh/m2yr, CO2: ${result.co2.toFixed(1)} kgCO2/m2yr`,
            `Grade: ${result.grade}, Demand: ${result.demand.toFixed(1)} kWh/m2yr, CO2: ${result.co2.toFixed(1)} kgCO2/m2yr`
          );
          alert(t(
            `ECO2 결과 가져오기 성공\n${gradeLabel}`,
            `ECO2 result imported successfully\n${gradeLabel}`
          ));
        } else {
          alert(t(
            "ECO2 파일을 파싱할 수 없습니다.",
            "Could not parse ECO2 result file."
          ));
        }
      };
      reader.readAsText(file);

      // Reset input so same file can be imported again
      e.target.value = "";
    },
    [t]
  );

  if (narrow) return null;

  if (!metrics) {
    if (variant === "strip") return null;
    return (
      <div
        className={`absolute bottom-4 z-10 transition-[left] duration-200 ${
          leftDockOpen ? "hidden 2xl:block 2xl:left-[368px]" : "left-4"
        }`}
      >
        <SkeletonCards />
      </div>
    );
  }

  const { grade, gradeColor, demand, co2, heatLoss } = metrics;
  const actualData = actual.data ?? [];
  const hasActual = actualData.length > 0;
  // Grade and certified demand are not available from the consumption API
  const hasActualGrade = false;
  const hasActualDemand = false;

  // Tree equivalent: 1 tree absorbs ~22 kg CO2/yr
  const treeEquivalent = co2.co2PerSqm > 0 ? co2.co2PerSqm / 22 : 0;

  // Heat loss breakdown percentages
  const totalHL = heatLoss.totalHeatLoss;
  const breakdown = heatLoss.elements.map((el) => ({
    label: el.element,
    pct: totalHL > 0 ? (el.heatLoss / totalHL) * 100 : 0,
  }));

  if (variant === "strip") {
    return (
      <div className="flex items-center gap-3 overflow-x-auto border-b border-border px-3 py-2">
        <span
          className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-2 text-sm font-bold text-white"
          style={{ backgroundColor: gradeColor }}
        >
          {grade}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-foreground">
          <AnimatedValue value={demand.demandPerSqm} suffix=" kWh/m²·yr" />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <AnimatedValue value={co2.co2PerSqm} suffix=" kgCO₂/m²·yr" />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <AnimatedValue value={heatLoss.totalHeatLoss} decimals={0} suffix=" W" />
        </span>
        <div className="ml-auto flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={handleExport}>
            <Download className="mr-1 h-3 w-3" />
            ECO2
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={handleImport}>
            <Upload className="mr-1 h-3 w-3" />
            {t("가져오기", "Import")}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  return (
    <div
      className={`absolute bottom-4 z-10 flex-col gap-2 pointer-events-auto transition-[left] duration-200 ${
        leftDockOpen ? "hidden 2xl:flex 2xl:left-[368px]" : "left-4 flex"
      }`}
    >
      {/* Actual data badge */}
      {hasActual && (
        <div className="flex items-center gap-1.5">
          <ActualDataBadge label={t("실측 데이터", "Actual data")} />
          {actual.isLoading && (
            <span className="text-[9px] text-muted-foreground animate-pulse">
              {t("로딩...", "Loading...")}
            </span>
          )}

        </div>
      )}

      {/* Card 1: Energy Grade */}
      <div className="rounded-lg border bg-card/90 backdrop-blur shadow-md px-3 py-2 w-56">
        <p className="text-[10px] text-muted-foreground mb-1">
          {t("에너지효율등급", "Energy Grade")}
        </p>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-md text-white font-bold text-lg px-2.5 py-0.5 min-w-[3rem]"
            style={{ backgroundColor: gradeColor }}
          >
            {grade}
          </span>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {t(`${GRADE_NAME_KO[grade]} (모델)`, `Grade ${grade} (modeled)`)}
            </span>
            {hasActualGrade ? null : hasActual ? (
              <span className="text-[9px] text-muted-foreground/60 italic">
                {t("등급 데이터 없음", "No grade data")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Card 2: Annual Energy Demand */}
      <div className="rounded-lg border bg-card/90 backdrop-blur shadow-md px-3 py-2 w-56">
        <p className="text-[10px] text-muted-foreground mb-1">
          {t("연간 에너지 수요", "Annual Energy Demand")}
        </p>
        <p className="text-sm font-semibold tabular-nums">
          <AnimatedValue value={demand.demandPerSqm} suffix=" kWh/m²·yr" />
        </p>
        {hasActual ? (
          <p className="text-[9px] text-muted-foreground/60 italic mt-0.5">
            {t("실측 수요 데이터 없음", "No actual demand data")}
          </p>
        ) : null}
        {hasActualDemand ? (
          <DeltaIndicator modeled={demand.demandPerSqm} actual={0} suffix=" kWh/m²·yr" />
        ) : null}
        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
          <span>
            {t("난방", "Heat")}{" "}
            <span className="font-medium text-foreground tabular-nums">
              {demand.heatingDemand > 0
                ? (demand.heatingDemand / 1000).toFixed(1)
                : "0.0"}{" "}
              MWh
            </span>
          </span>
          <span>
            {t("냉방", "Cool")}{" "}
            <span className="font-medium text-foreground tabular-nums">
              {demand.coolingDemand > 0
                ? (demand.coolingDemand / 1000).toFixed(1)
                : "0.0"}{" "}
              MWh
            </span>
          </span>
        </div>
      </div>

      {/* Card 3: CO2 Emissions */}
      <div className="rounded-lg border bg-card/90 backdrop-blur shadow-md px-3 py-2 w-56">
        <p className="text-[10px] text-muted-foreground mb-1">
          {t("CO₂ 배출량", "CO₂ Emissions")}
        </p>
        <p className="text-sm font-semibold tabular-nums">
          <AnimatedValue value={co2.co2PerSqm} suffix=" kgCO₂/m²·yr" />
        </p>
        {null}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {"≈ "}
          {treeEquivalent.toFixed(1)}{" "}
          {t("그루 나무/m² 필요", "trees/m² needed")}
        </p>
      </div>

      {/* Card 4: Heat Loss (no actual comparison) */}
      <div className="rounded-lg border bg-card/90 backdrop-blur shadow-md px-3 py-2 w-56">
        <p className="text-[10px] text-muted-foreground mb-1">
          {t("열손실", "Heat Loss")}
        </p>
        <p className="text-sm font-semibold tabular-nums">
          <AnimatedValue
            value={heatLoss.totalHeatLoss}
            decimals={0}
            suffix=" W"
          />
        </p>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {breakdown.map((b) => (
            <span key={b.label}>
              {t(
                b.label === "Walls" ? "벽" : b.label === "Windows" ? "창" : b.label === "Roof" ? "지붕" : "바닥",
                b.label.split(" ")[0]
              )}
              {" "}
              <span className="font-medium text-foreground tabular-nums">
                {b.pct.toFixed(0)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Export/Import buttons */}
      <div className="flex gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-[10px] flex-1"
          onClick={handleExport}
          title={t("ECO2 입력 파일 내보내기", "Export ECO2 Input File")}
        >
          <Download className="h-3 w-3 mr-1" />
          {t("ECO2 내보내기", "ECO2 Export")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-[10px] flex-1"
          onClick={handleImport}
          title={t("ECO2 결과 가져오기", "Import ECO2 Result")}
        >
          <Upload className="h-3 w-3 mr-1" />
          {t("ECO2 가져오기", "ECO2 Import")}
        </Button>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
