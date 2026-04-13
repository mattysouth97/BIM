"use client";

// src/components/workspace/scene-outliner.tsx
// Retrofit Recommendations panel — "Twin Insights" left dock.
// Generates and displays prioritised retrofit measures from envelope, HVAC,
// lighting, and solar generators using inferred material/recipe data.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useRecipeStore } from "@/store/recipe-store";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { generateEnvelopeRetrofits, KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";
import { generateHvacRetrofits } from "@/lib/retrofit/hvac-retrofits";
import { generateLightingRetrofits } from "@/lib/retrofit/lighting-retrofits";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import { assembleRetrofitReport } from "@/lib/retrofit/retrofit-report";
import type { RetrofitMeasure, RetrofitCategory } from "@/lib/retrofit/retrofit-types";
import { Sun, Thermometer, Lightbulb, Building2 } from "lucide-react";

interface SceneOutlinerProps {
  /** Optional override — if omitted, derives from the material store. */
  buildingPk?: string;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatKRW(value: number): string {
  if (value >= 100_000_000) {
    return `₩${(value / 100_000_000).toFixed(1)}억`;
  }
  if (value >= 10_000) {
    return `₩${(value / 10_000).toFixed(0)}만`;
  }
  return `₩${value.toLocaleString()}`;
}

function formatKWh(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} GWh`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} MWh`;
  }
  return `${value.toFixed(0)} kWh`;
}

// ── Category icon/label ───────────────────────────────────────────────────────

function CategoryIcon({ category, className }: { category: RetrofitCategory; className?: string }) {
  switch (category) {
    case "envelope":
      return <Building2 className={className} />;
    case "hvac":
      return <Thermometer className={className} />;
    case "lighting":
      return <Lightbulb className={className} />;
    case "renewable":
      return <Sun className={className} />;
  }
}

const CATEGORY_LABELS: Record<RetrofitCategory, string> = {
  envelope: "외피 단열",
  hvac: "HVAC",
  lighting: "조명",
  renewable: "신재생",
};

const CATEGORY_COLORS: Record<RetrofitCategory, string> = {
  envelope: "bg-orange-100 text-orange-700",
  hvac: "bg-blue-100 text-blue-700",
  lighting: "bg-yellow-100 text-yellow-700",
  renewable: "bg-green-100 text-green-700",
};

// ── Priority badge ────────────────────────────────────────────────────────────

function priorityFromPayback(paybackYears: number): "high" | "medium" | "low" {
  if (paybackYears < 5) return "high";
  if (paybackYears <= 10) return "medium";
  return "low";
}

const PRIORITY_BORDER: Record<"high" | "medium" | "low", string> = {
  high: "border-l-green-500",
  medium: "border-l-yellow-400",
  low: "border-l-gray-300",
};

const PRIORITY_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "우선",
  medium: "보통",
  low: "낮음",
};

const PRIORITY_BADGE: Record<"high" | "medium" | "low", string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-500",
};

// ── Individual measure card ───────────────────────────────────────────────────

function MeasureCard({ measure }: { measure: RetrofitMeasure }) {
  const priority = priorityFromPayback(measure.paybackYears);
  const paybackFinite = Number.isFinite(measure.paybackYears) && measure.paybackYears < 999;

  return (
    <div
      className={`border-l-4 ${PRIORITY_BORDER[priority]} bg-card rounded-r-md px-3 py-2 mb-2 last:mb-0`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CategoryIcon
            category={measure.category}
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
          <p className="text-xs font-medium leading-tight truncate">{measure.name}</p>
        </div>
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY_BADGE[priority]}`}
        >
          {PRIORITY_LABEL[priority]}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight line-clamp-2">
        {measure.description}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        <span className="text-muted-foreground">
          투자비:{" "}
          <span className="font-medium text-foreground">
            {formatKRW(measure.estimatedCost)}
          </span>
        </span>
        <span className="text-muted-foreground">
          회수:{" "}
          <span className="font-medium text-foreground">
            {paybackFinite ? `${measure.paybackYears.toFixed(1)}년` : "N/A"}
          </span>
        </span>
        <span className="text-muted-foreground">
          절감:{" "}
          <span className="font-medium text-foreground">
            {formatKWh(measure.annualEnergySaving)}/yr
          </span>
        </span>
        <span className="text-muted-foreground">
          CO₂:{" "}
          <span className="font-medium text-foreground">
            {measure.co2Reduction.toFixed(2)} tCO₂/yr
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Category section (accordion item) ────────────────────────────────────────

function CategorySection({
  category,
  measures,
}: {
  category: RetrofitCategory;
  measures: RetrofitMeasure[];
}) {
  if (measures.length === 0) return null;

  const totalSaving = measures.reduce((s, m) => s + m.annualEnergySaving, 0);

  return (
    <AccordionItem value={category} className="border-b-0">
      <AccordionTrigger className="px-3 py-2 hover:no-underline">
        <div className="flex items-center gap-2 flex-1">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[category]}`}
          >
            <CategoryIcon category={category} className="h-3 w-3" />
            {CATEGORY_LABELS[category]}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {measures.length}개
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto mr-2">
            {formatKWh(totalSaving)}/yr
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-2 pb-2 pt-0">
        {measures.map((m) => (
          <MeasureCard key={m.id} measure={m} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SceneOutliner({ buildingPk: buildingPkProp }: SceneOutlinerProps) {
  const buildingPk = useActiveBuildingPk(buildingPkProp);

  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  // Derive effective recipe (same pattern as use-energy-metrics.ts)
  const effectiveRecipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return {
      ...baseRecipe,
      ...(overrides.footprintWidth !== undefined ? { footprintWidth: overrides.footprintWidth } : {}),
      ...(overrides.footprintDepth !== undefined ? { footprintDepth: overrides.footprintDepth } : {}),
      ...(overrides.wallThickness !== undefined ? { wallThickness: overrides.wallThickness } : {}),
      ...(overrides.facade ? { facade: { ...baseRecipe.facade, ...overrides.facade } } : {}),
      ...(overrides.slab ? { slab: { ...baseRecipe.slab, ...overrides.slab } } : {}),
      ...(overrides.column ? { column: { ...baseRecipe.column, ...overrides.column } } : {}),
      ...(overrides.roof ? { roof: { ...baseRecipe.roof, ...overrides.roof } } : {}),
    };
  }, [baseRecipe, overrides]);

  const report = useMemo(() => {
    if (!materials || !effectiveRecipe) return null;

    const floorCount = effectiveRecipe.floors.length || 1;
    const footprintArea = effectiveRecipe.footprintWidth * effectiveRecipe.footprintDepth;
    const totalFloorArea = footprintArea * floorCount;
    const perFloorArea = footprintArea;

    // Envelope U-values from material properties
    const wallU = materials.envelope.walls[0]?.uValue ?? 0.5;
    const roofU = materials.envelope.roof.uValue ?? 0.3;
    const windowU = materials.envelope.windows.uValue ?? 2.0;
    const floorU = materials.envelope.groundFloor.uValue ?? 0.4;

    // Surface areas — derived from geometry
    const wallHeight = 3.0; // typical floor-to-floor
    const perimeterApprox =
      2 * (effectiveRecipe.footprintWidth + effectiveRecipe.footprintDepth);
    const grossWallArea = perimeterApprox * wallHeight * floorCount;
    const wwr = materials.envelope.windows.windowToWallRatio.S ?? 0.3;
    const windowArea = grossWallArea * wwr;
    const netWallArea = grossWallArea - windowArea;

    const envelopeMeasures = generateEnvelopeRetrofits(
      { wall: wallU, roof: roofU, window: windowU, floor: floorU },
      KOREAN_2020_TARGET_U_VALUES,
      {
        wall: netWallArea,
        roof: perFloorArea,
        window: windowArea,
        floor: perFloorArea,
      },
      3000, // HDD — Seoul average (°C·days/yr)
      materials.hvac.heating.efficiency
    );

    // HVAC — age not in material types, estimate from code year
    const codeYear = materials.codeYear ?? 2000;
    const systemAge = new Date().getFullYear() - codeYear;
    const hvacMeasures = generateHvacRetrofits(
      {
        heatingType: materials.hvac.heating.systemType,
        heatingEfficiency: materials.hvac.heating.efficiency,
        coolingType: materials.hvac.cooling.systemType,
        coolingEfficiency: materials.hvac.cooling.efficiency,
        age: systemAge,
      },
      totalFloorArea,
      // Estimate annual heating/cooling demand from area (kWh) — rough proxy
      totalFloorArea * 60, // ~60 kWh/m²·yr heating
      totalFloorArea * 30  // ~30 kWh/m²·yr cooling
    );

    const lightingLPD = materials.lighting.lightingPowerDensity ?? 12;
    const lightingMeasures = generateLightingRetrofits(
      lightingLPD,
      totalFloorArea,
      2500 // operating hours/yr — office default
    );

    const solarMeasure = calculateSolarPotential(
      perFloorArea,
      "flat",
      "seoul",
      80, // feed-in tariff KRW/kWh (Korean REC average)
      140
    );

    const allMeasures = [
      ...envelopeMeasures,
      ...hvacMeasures,
      ...lightingMeasures,
      solarMeasure,
    ];

    return assembleRetrofitReport(allMeasures);
  }, [materials, effectiveRecipe]);

  // ── No building selected ──────────────────────────────────────────────────

  if (!materials || !effectiveRecipe) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full min-h-[200px]">
        <Building2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground text-center">
          건물을 선택하면 개선 권장사항을 확인할 수 있습니다
        </p>
        <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
          Select a building to view retrofit recommendations
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-3">
        <p className="text-xs text-muted-foreground text-center py-4">
          분석 중...
        </p>
      </div>
    );
  }

  const { summary, byCategory } = report;
  const portfolioPaybackOk =
    summary.portfolioPayback > 0 && Number.isFinite(summary.portfolioPayback);

  const openCategories = (
    Object.keys(byCategory) as RetrofitCategory[]
  ).filter((c) => byCategory[c].length > 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="px-3 pt-3 pb-2 border-b shrink-0">
        <p className="text-xs font-semibold mb-1.5">개선 권장사항</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <span className="text-muted-foreground">
            총 투자비
            <span className="block font-semibold text-foreground text-sm">
              {formatKRW(summary.totalInvestment)}
            </span>
          </span>
          <span className="text-muted-foreground">
            연간 절감
            <span className="block font-semibold text-foreground text-sm">
              {formatKWh(summary.totalAnnualSaving)}/yr
            </span>
          </span>
          <span className="text-muted-foreground">
            포트폴리오 회수
            <span className="block font-medium text-foreground">
              {portfolioPaybackOk
                ? `${summary.portfolioPayback.toFixed(1)}년`
                : "—"}
            </span>
          </span>
          <span className="text-muted-foreground">
            CO₂ 감축
            <span className="block font-medium text-foreground">
              {summary.totalCO2Reduction.toFixed(1)} tCO₂/yr
            </span>
          </span>
        </div>
      </div>

      {/* ── Category accordions ── */}
      <div className="flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          defaultValue={openCategories}
          className="w-full"
        >
          <CategorySection category="envelope" measures={byCategory.envelope} />
          <CategorySection category="hvac" measures={byCategory.hvac} />
          <CategorySection category="lighting" measures={byCategory.lighting} />
          <CategorySection category="renewable" measures={byCategory.renewable} />
        </Accordion>
      </div>

      {/* ── Footer summary ── */}
      <div className="px-3 py-2 border-t bg-muted/30 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{report.measures.length}개 권장사항</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
            2020+ 기준
          </Badge>
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-0.5">
          연간 비용절감{" "}
          <span className="font-medium text-foreground">
            {formatKRW(summary.totalAnnualCostSaving)}
          </span>
        </p>
      </div>
    </div>
  );
}
