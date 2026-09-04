"use client";

// src/components/viewer/energy-breakdown-chart.tsx
// Horizontal bar chart showing HVAC / Lighting / DHW / Plug energy attribution.
// Consumes Phase 23's useEnergyBreakdown hook; derives percentages in useMemo.
// Amber badge rendered whenever any value carries dataSource === "estimated-ratio".

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnergyBreakdown } from "@/hooks/use-energy-breakdown";
import { useT } from "@/lib/i18n";
import type { EnergyDataSource } from "@/lib/energy/system-breakdown";

interface EnergyBreakdownChartProps {
  buildingPk: string;
}

// P1-07 (d): --chart-1..5 are already complete oklch() colors in globals.css,
// so wrapping the token in an hsl() call produced invalid CSS and bars fell
// back to black. Use the token directly. Exported for unit testing.
export const chartConfig = {
  hvac:      { label: "HVAC",     color: "var(--chart-1)" },
  lighting:  { label: "Lighting", color: "var(--chart-2)" },
  dhw:       { label: "DHW",      color: "var(--chart-3)" },
  plugLoads: { label: "Plug",     color: "var(--chart-4)" },
} satisfies ChartConfig;

export function EnergyBreakdownChart({ buildingPk }: EnergyBreakdownChartProps) {
  const { t } = useT();
  const breakdown = useEnergyBreakdown(buildingPk);

  // Derive percentages in useMemo — always called before any early return (Rules of Hooks).
  // Deps: [breakdown, t] ONLY — not buildingPk or individual store slices.
  // breakdown reference is stable per Phase 23 guarantee, so camera rotation cannot invalidate this.
  const chartData = useMemo(() => {
    if (!breakdown || breakdown.total <= 0) return [];
    const pct = (v: number) => (v / breakdown.total) * 100;
    const fmtKwh = (v: number) => (v / 1000).toFixed(1);
    return [
      {
        system: t("냉난방", "HVAC"),
        percent: pct(breakdown.hvac),
        mwh: fmtKwh(breakdown.hvac),
        source: breakdown.hvacDataSource as EnergyDataSource,
        colorVar: "var(--color-hvac)",
      },
      {
        system: t("조명", "Lighting"),
        percent: pct(breakdown.lighting),
        mwh: fmtKwh(breakdown.lighting),
        source: breakdown.lightingDataSource as EnergyDataSource,
        colorVar: "var(--color-lighting)",
      },
      {
        system: t("급탕", "DHW"),
        percent: pct(breakdown.dhw),
        mwh: fmtKwh(breakdown.dhw),
        source: breakdown.dhwDataSource as EnergyDataSource,
        colorVar: "var(--color-dhw)",
      },
      {
        system: t("콘센트", "Plug"),
        percent: pct(breakdown.plugLoads),
        mwh: fmtKwh(breakdown.plugLoads),
        source: breakdown.plugLoadsDataSource as EnergyDataSource,
        colorVar: "var(--color-plugLoads)",
      },
    ];
  }, [breakdown, t]);

  // Null guard after all hooks — matches energy-cards.tsx SkeletonCards pattern.
  if (!breakdown) return <Skeleton className="h-48 w-full rounded-md" />;

  // Rendering invariant (D-04): amber banner renders whenever ANY value is estimated-ratio.
  const anyEstimated = chartData.some((d) => d.source === "estimated-ratio");

  return (
    <div className="space-y-2">
      {anyEstimated && (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-amber-400 text-amber-700 bg-amber-50 text-[10px] px-1.5"
          >
            {t("추정 비율", "Estimated")}
          </Badge>
          <span className="text-[9px] text-muted-foreground">
            {/* "ASHRAE 90.1 ratios" overclaims when no profile matched this
                building's use code: the split is then the mixed-use average,
                chosen because the use type is unknown to the table rather than
                because it was looked up. Say which one the reader is seeing. */}
            {breakdown.ratioProvenance.source === "generic_default"
              ? t(
                  `주용도코드 ${breakdown.ratioProvenance.useCodePrefix || "미상"} 자료 없음 — 일반 평균값 적용`,
                  `No profile for use code ${breakdown.ratioProvenance.useCodePrefix || "unknown"} — generic average applied`,
                )
              : t("ASHRAE 90.1 기반 비율", "ASHRAE 90.1 ratios")}
          </span>
        </div>
      )}

      <ChartContainer config={chartConfig} className="h-48 w-full">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="system"
            tick={{ fontSize: 10 }}
            width={52}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="percent" radius={[0, 3, 3, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.system} fill={entry.colorVar} />
            ))}
            <LabelList
              dataKey="percent"
              position="right"
              formatter={(v: string | number | boolean | null | undefined) =>
                typeof v === "number" ? `${v.toFixed(0)}%` : ""
              }
              className="fill-foreground"
              style={{ fontSize: 10 }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>

      <p className="text-[9px] text-muted-foreground pl-1">
        {t("총 연간 수요", "Total annual demand")}:{" "}
        <span className="tabular-nums font-medium text-foreground">
          {(breakdown.total / 1000).toFixed(1)} MWh
        </span>
      </p>
    </div>
  );
}
