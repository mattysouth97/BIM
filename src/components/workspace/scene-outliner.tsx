"use client";

// src/components/workspace/scene-outliner.tsx
// Retrofit Recommendations panel — "Twin Insights" left dock.
//
// D₃ unification: measures come from `useRetrofitScenario` — the SAME hook
// (and the same scenario-store inputs, budget, and 그린리모델링 track) that
// drives the Twin-stage overlay — so both surfaces always agree. When the
// Twin overlay hasn't published ledger-derived inputs yet (e.g. standalone
// usage), floor areas fall back to the recipe-store geometry.

import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useRecipeStore } from "@/store/recipe-store";
import { useScenarioStore } from "@/store/scenario-store";
import { useRetrofitScenario } from "@/hooks/use-retrofit-scenario";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { assembleRetrofitReport } from "@/lib/retrofit/retrofit-report";
import type { RetrofitMeasure, RetrofitCategory } from "@/lib/retrofit/retrofit-types";
import type { ProgramTrack } from "@/lib/retrofit/cost-database";
import { Sun, Thermometer, Lightbulb, Building2, CheckCircle2 } from "lucide-react";

interface SceneOutlinerProps {
  /** Optional override — if omitted, derives from the material store. */
  buildingPk?: string;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatKRW(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) {
    return `${sign}₩${(abs / 100_000_000).toFixed(1)}억`;
  }
  if (abs >= 10_000) {
    return `${sign}₩${(abs / 10_000).toFixed(0)}만`;
  }
  return `${sign}₩${abs.toLocaleString()}`;
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

const TRACK_BADGE_LABELS: Record<ProgramTrack, string | null> = {
  none: null,
  "public-seoul-or-central": "공공 50%",
  "public-local": "공공 70%",
  "private-base": "민간 4.5%p",
  "private-high-perf": "민간 5.5%p",
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

function MeasureCard({ measure, selected }: { measure: RetrofitMeasure; selected: boolean }) {
  const priority = priorityFromPayback(measure.paybackYears);
  const paybackFinite = Number.isFinite(measure.paybackYears) && measure.paybackYears < 999;
  const npv = measure.financials?.npv;

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
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
              <CheckCircle2 className="h-2.5 w-2.5" />
              예산 내
            </span>
          )}
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[priority]}`}
          >
            {PRIORITY_LABEL[priority]}
          </span>
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
          {npv !== undefined ? (
            <>
              NPV:{" "}
              <span className={`font-medium ${npv >= 0 ? "text-foreground" : "text-orange-600"}`}>
                {formatKRW(npv)}
              </span>
            </>
          ) : (
            <>
              CO₂:{" "}
              <span className="font-medium text-foreground">
                {measure.co2Reduction.toFixed(2)} tCO₂/yr
              </span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// ── Category section (accordion item) ────────────────────────────────────────

function CategorySection({
  category,
  measures,
  selectedIds,
}: {
  category: RetrofitCategory;
  measures: RetrofitMeasure[];
  selectedIds: Set<string>;
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
          <MeasureCard key={m.id} measure={m} selected={selectedIds.has(m.id)} />
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

  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const programTrack = useScenarioStore((s) => s.programTrack);
  const publishedInputs = useScenarioStore((s) => s.buildingInputs);

  // Recipe-derived fallback geometry, used only when the Twin overlay hasn't
  // published ledger-derived inputs for this building.
  const fallbackAreas = useMemo(() => {
    if (!baseRecipe) return null;
    const footprintWidth = overrides?.footprintWidth ?? baseRecipe.footprintWidth;
    const footprintDepth = overrides?.footprintDepth ?? baseRecipe.footprintDepth;
    const floorCount = baseRecipe.floors.length || 1;
    const footprintArea = footprintWidth * footprintDepth;
    return {
      footprintArea,
      totalFloorArea: footprintArea * floorCount,
    };
  }, [baseRecipe, overrides]);

  // Prefer the shared ledger-derived inputs (guaranteed to match the Twin
  // overlay); fall back to recipe geometry otherwise.
  const inputsMatch = publishedInputs?.buildingPk === buildingPk;
  const totalFloorArea = inputsMatch
    ? publishedInputs.totalFloorArea
    : fallbackAreas?.totalFloorArea ?? 0;
  const footprintArea = inputsMatch
    ? publishedInputs.footprintArea
    : fallbackAreas?.footprintArea ?? 0;

  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea,
    footprintArea,
    roofType: inputsMatch ? publishedInputs.roofType : "flat",
    sidoPrefix: inputsMatch ? publishedInputs.sidoPrefix : undefined,
    programTrack,
  });

  const selectedIds = useMemo(
    () => new Set(scenario.selection?.selected.map((m) => m.id) ?? []),
    [scenario.selection],
  );

  // Aggregate the unified measure list for the header/footer summary.
  const report = useMemo(() => {
    if (scenario.allMeasures.length === 0) return null;
    return assembleRetrofitReport(scenario.allMeasures);
  }, [scenario.allMeasures]);

  const trackBadge = TRACK_BADGE_LABELS[programTrack];

  // ── No building selected ──────────────────────────────────────────────────

  if (!materials || totalFloorArea <= 0) {
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
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold">개선 권장사항</p>
          {trackBadge && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-cyan-300 text-cyan-700">
              그린리모델링 {trackBadge}
            </Badge>
          )}
        </div>
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
          <CategorySection category="envelope" measures={byCategory.envelope} selectedIds={selectedIds} />
          <CategorySection category="hvac" measures={byCategory.hvac} selectedIds={selectedIds} />
          <CategorySection category="lighting" measures={byCategory.lighting} selectedIds={selectedIds} />
          <CategorySection category="renewable" measures={byCategory.renewable} selectedIds={selectedIds} />
        </Accordion>
      </div>

      {/* ── Footer summary ── */}
      <div className="px-3 py-2 border-t bg-muted/30 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {report.measures.length}개 권장사항 · 예산 내 {selectedIds.size}개
          </span>
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
