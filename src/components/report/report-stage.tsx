"use client";

// src/components/report/report-stage.tsx
// Report stage content — renders in place of the 3D viewer when workflow stage = "report".
// Provides Energy Audit and Compliance report previews with PDF, CSV, and JSON export.

import React, { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useMaterialStore } from "@/store/material-store";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useRecipeStore } from "@/store/recipe-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { useActualEnergy } from "@/hooks/use-actual-energy";
import { EnergyAuditPreview } from "@/components/report/energy-audit-preview";
import { CompliancePreview } from "@/components/report/compliance-preview";
import { buildComplianceReportSections } from "@/lib/report/templates/compliance-report";
import { assembleEnergyAuditReport, assembleComplianceReport } from "@/lib/report/report-engine";
import { generateBuildingCSV } from "@/lib/export/csv-export";
import { generateTwinJSON } from "@/lib/export/json-export";
import {
  scoreGreenCertification,
  type BuildingCertificationInput,
} from "@/lib/compliance/green-certification";
import {
  calculateEfficiencyRating,
  GRADE_LABELS,
} from "@/lib/compliance/efficiency-rating";
import { calibrateEnergy } from "@/lib/energy/calibration";
import { compareToBenchmark } from "@/lib/energy/benchmark-comparison";
import type { EnergyAuditInput } from "@/lib/report/templates/energy-audit";
import type { ComplianceReportInput } from "@/lib/report/templates/compliance-report";
import type { CertificationVersion } from "@/lib/compliance/certification-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, FileJson, Sheet } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type ReportTab = "energy-audit" | "compliance";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReportStage() {
  const isKo = useAppStore((s) => s.language) === "ko";
  const [activeTab, setActiveTab] = useState<ReportTab>("energy-audit");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [certVersion] = useState<CertificationVersion>("2024");

  // ── Derive active building from material store ──
  const buildingPk = useActiveBuildingPk();

  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);
  const metrics = useEnergyMetrics(buildingPk);
  const actual = useActualEnergy(buildingPk);
  const actualData = actual.data ?? [];
  const hasActual = actualData.length > 0;

  // Derive effective recipe (same pattern as properties-panel)
  const effectiveRecipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return {
      ...baseRecipe,
      ...(overrides.footprintWidth !== undefined
        ? { footprintWidth: overrides.footprintWidth }
        : {}),
      ...(overrides.footprintDepth !== undefined
        ? { footprintDepth: overrides.footprintDepth }
        : {}),
      ...(overrides.wallThickness !== undefined
        ? { wallThickness: overrides.wallThickness }
        : {}),
      ...(overrides.facade
        ? { facade: { ...baseRecipe.facade, ...overrides.facade } }
        : {}),
      ...(overrides.slab
        ? { slab: { ...baseRecipe.slab, ...overrides.slab } }
        : {}),
      ...(overrides.column
        ? { column: { ...baseRecipe.column, ...overrides.column } }
        : {}),
      ...(overrides.roof
        ? { roof: { ...baseRecipe.roof, ...overrides.roof } }
        : {}),
    };
  }, [baseRecipe, overrides]);

  // ── Calibration (optional) ───────────────────────────────────────────────
  const calibration = useMemo(() => {
    if (!metrics || !hasActual || actualData.length === 0) return undefined;
    const mostRecent = actualData.reduce((a, b) => (b.year > a.year ? b : a));
    if (mostRecent.total_kwh <= 0) return undefined;
    return calibrateEnergy(
      {
        heating: metrics.demand.heatingDemand,
        cooling: metrics.demand.coolingDemand,
        lighting: metrics.demand.totalDemand * 0.15,
        dhw: metrics.demand.totalDemand * 0.1,
        total: metrics.demand.totalDemand,
      },
      {
        electric_kwh: mostRecent.electric_kwh ?? 0,
        gas_kwh: mostRecent.gas_kwh ?? 0,
        total_kwh: mostRecent.total_kwh,
      }
    );
  }, [metrics, hasActual, actualData]);

  // ── Benchmark (optional) ─────────────────────────────────────────────────
  const benchmark = useMemo(() => {
    if (!metrics) return undefined;
    const useType =
      materials?.occupancy?.occupancyDensity !== undefined &&
      materials.occupancy.occupancyDensity > 0.1
        ? "residential"
        : "office";
    const codeYear = materials?.codeYear ?? 2000;
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
    return compareToBenchmark(metrics.demand.demandPerSqm, useType, era);
  }, [metrics, materials]);

  // ── Green Certification ──────────────────────────────────────────────────
  const certification = useMemo(() => {
    if (!materials || !metrics) return undefined;
    const avgWallU =
      materials.envelope.walls.reduce((sum, w) => sum + w.uValue, 0) /
      Math.max(materials.envelope.walls.length, 1);
    const input: BuildingCertificationInput = {
      wallUValue: avgWallU,
      windowUValue: materials.envelope.windows.uValue,
      roofUValue: materials.envelope.roof.uValue,
      energyGrade: metrics.grade,
      primaryEnergyDemand: metrics.demand.demandPerSqm,
      renewableCapacity: materials.renewable?.solarPV?.capacity ?? 0,
      windowToWallRatio: materials.envelope.windows.windowToWallRatio?.S ?? 0.3,
      structureCode: undefined,
    };
    return scoreGreenCertification(input, certVersion);
  }, [materials, metrics, certVersion]);

  // ── Efficiency Rating ────────────────────────────────────────────────────
  const efficiencyRating = useMemo(() => {
    if (!metrics || !effectiveRecipe || !materials) return undefined;
    const totalArea =
      effectiveRecipe.footprintWidth *
      effectiveRecipe.footprintDepth *
      effectiveRecipe.floors.length;
    if (totalArea <= 0) return undefined;
    const isRes =
      materials?.occupancy?.occupancyDensity !== undefined &&
      materials.occupancy.occupancyDensity > 0.1;
    return calculateEfficiencyRating(
      {
        electric: metrics.demand.coolingDemand + metrics.demand.totalDemand * 0.15,
        gas: metrics.demand.heatingDemand + metrics.demand.totalDemand * 0.1,
        districtHeating: 0,
        districtCooling: 0,
        renewable: 0,
      },
      totalArea,
      isRes ? "residential" : "non-residential"
    );
  }, [metrics, effectiveRecipe, materials]);

  // ── Derive building name/address from recipe (fallback to pk) ───────────
  const buildingName = baseRecipe?.buildingName ?? buildingPk ?? "Unknown Building";
  const buildingAddress = baseRecipe?.address ?? "";
  const totalArea =
    effectiveRecipe
      ? effectiveRecipe.footprintWidth *
        effectiveRecipe.footprintDepth *
        effectiveRecipe.floors.length
      : 0;

  // ── Energy Audit input ───────────────────────────────────────────────────
  const energyAuditInput = useMemo<EnergyAuditInput | null>(() => {
    if (!metrics || !materials || !effectiveRecipe) return null;

    const avgWallU =
      materials.envelope.walls.reduce((sum, w) => sum + w.uValue, 0) /
      Math.max(materials.envelope.walls.length, 1);

    return {
      building: {
        name: buildingName,
        address: buildingAddress,
        useType: baseRecipe?.mainPurpsCd ?? "Unknown",
        era: String(materials.codeYear ?? "Unknown"),
        area: totalArea,
        floors: effectiveRecipe.floors.length,
      },
      fidelityLevel: 1,
      dataSources: ["Korean Building Ledger (건축물대장)"],
      envelope: {
        wallU: avgWallU,
        roofU: materials.envelope.roof.uValue,
        windowU: materials.envelope.windows.uValue,
        airtightness: materials.envelope.airtightness.ach50,
      },
      energy: {
        heatingDemand: metrics.demand.heatingDemand / Math.max(totalArea, 1),
        coolingDemand: metrics.demand.coolingDemand / Math.max(totalArea, 1),
        totalDemand: metrics.demand.demandPerSqm,
        energyGrade: metrics.grade,
        demandPerArea: metrics.demand.demandPerSqm,
      },
      co2: {
        total: metrics.co2.totalCO2,
        perArea: metrics.co2.co2PerSqm,
      },
      heatLossBreakdown: {
        walls:
          metrics.heatLoss.elements.find((e) => e.element === "Walls")?.heatLoss ?? 0,
        roof:
          metrics.heatLoss.elements.find((e) => e.element === "Roof")?.heatLoss ?? 0,
        windows:
          metrics.heatLoss.elements.find((e) => e.element === "Windows")?.heatLoss ?? 0,
        floor:
          metrics.heatLoss.elements.find((e) => e.element === "Floor")?.heatLoss ?? 0,
        ventilation:
          metrics.heatLoss.elements.find((e) => e.element === "Ventilation")?.heatLoss ?? 0,
      },
      calibration: calibration
        ? { overallDelta: calibration.overallDelta, insight: calibration.insight }
        : undefined,
      benchmark: benchmark
        ? {
            percentile: benchmark.percentile,
            performance: benchmark.performance,
            insight: benchmark.insight,
          }
        : undefined,
    };
  }, [
    metrics,
    materials,
    effectiveRecipe,
    buildingName,
    buildingAddress,
    totalArea,
    calibration,
    benchmark,
  ]);

  // ── Compliance input ─────────────────────────────────────────────────────
  const complianceInput = useMemo<ComplianceReportInput | null>(() => {
    if (!certification || !efficiencyRating || !materials) return null;

    return {
      building: {
        name: buildingName,
        address: buildingAddress,
        useType: baseRecipe?.mainPurpsCd ?? "Unknown",
        era: String(materials.codeYear ?? "Unknown"),
        area: totalArea,
      },
      certification: {
        version: certVersion,
        earnedPoints: certification.earnedPoints,
        assessableMaxPoints: certification.assessableMaxPoints,
        grade: certification.grade,
        categories: certification.categories,
      },
      efficiencyRating: {
        primaryEnergyPerArea: efficiencyRating.primaryEnergyPerArea,
        grade: efficiencyRating.grade,
        gradeLabel: GRADE_LABELS[efficiencyRating.grade] ?? efficiencyRating.grade,
      },
      disclaimer: certification.disclaimer,
    };
  }, [certification, efficiencyRating, materials, buildingName, buildingAddress, totalArea, certVersion]);

  // ── PDF download ─────────────────────────────────────────────────────────
  const handleDownloadEnergyPdf = async () => {
    if (!metrics || !energyAuditInput) return;
    setPdfLoading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ReportPDF } = await import("@/lib/report/pdf-renderer");
      const reportData = assembleEnergyAuditReport(
        { name: buildingName, address: buildingAddress, fidelityLevel: 1 },
        metrics,
        calibration ?? undefined,
        benchmark ?? undefined
      );
      const blob = await pdf(<ReportPDF data={reportData} />).toBlob();
      downloadBlob(blob, `energy-audit-${buildingPk.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadCompliancePdf = async () => {
    if (!certification || !efficiencyRating) return;
    setPdfLoading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ReportPDF } = await import("@/lib/report/pdf-renderer");
      const reportData = assembleComplianceReport(
        { name: buildingName, address: buildingAddress, fidelityLevel: 1 },
        certification,
        efficiencyRating
      );
      const blob = await pdf(<ReportPDF data={reportData} />).toBlob();
      downloadBlob(blob, `compliance-${buildingPk.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  };

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!metrics || !materials) return;
    const avgWallU =
      materials.envelope.walls.reduce((sum, w) => sum + w.uValue, 0) /
      Math.max(materials.envelope.walls.length, 1);

    const csv = generateBuildingCSV([
      {
        name: buildingName,
        address: buildingAddress,
        useType: baseRecipe?.mainPurpsCd ?? "",
        era: String(materials.codeYear ?? ""),
        area: totalArea,
        floors: effectiveRecipe?.floors.length ?? 0,
        energyDemand: metrics.demand.totalDemand,
        energyPerArea: metrics.demand.demandPerSqm,
        energyGrade: metrics.grade,
        co2Total: metrics.co2.totalCO2,
        co2PerArea: metrics.co2.co2PerSqm,
        wallU: avgWallU,
        roofU: materials.envelope.roof.uValue,
        windowU: materials.envelope.windows.uValue,
        airtightness: materials.envelope.airtightness.ach50,
        fidelityLevel: 1,
        dataQualityScore: 60,
      },
    ]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `building-data-${buildingPk.slice(0, 8)}.csv`);
  };

  // ── JSON export ──────────────────────────────────────────────────────────
  const handleExportJSON = () => {
    if (!metrics || !effectiveRecipe || !materials) return;
    const json = generateTwinJSON({
      metadata: {
        buildingPk,
        name: buildingName,
        address: buildingAddress,
        useType: baseRecipe?.mainPurpsCd ?? "",
        era: String(materials.codeYear ?? ""),
      },
      recipe: effectiveRecipe,
      materials,
      energyMetrics: metrics,
      benchmarkResult: benchmark ?? undefined,
    });
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    downloadBlob(blob, `twin-export-${buildingPk.slice(0, 8)}.json`);
  };

  // ── No building loaded ───────────────────────────────────────────────────
  if (!buildingPk || !materials) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <FileText className="h-12 w-12 opacity-30" />
        <div className="text-center">
          <p className="text-sm font-medium">
            {isKo ? "건물을 먼저 선택하세요" : "Select a building first"}
          </p>
          <p className="mt-1 text-xs opacity-70">
            {isKo
              ? "검색 단계에서 건물을 검색한 후 다시 시도하세요."
              : "Search for a building in the Search stage, then return here."}
          </p>
        </div>
      </div>
    );
  }

  // ── Loading state (metrics not yet computed) ─────────────────────────────
  if (!metrics) {
    return <ReportSkeleton />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Top bar: tab switcher + export buttons ─────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2 gap-3">
        {/* Tab buttons */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("energy-audit")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "energy-audit"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {isKo ? "에너지 감사" : "Energy Audit"}
          </button>
          <button
            onClick={() => setActiveTab("compliance")}
            disabled={!complianceInput}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              activeTab === "compliance"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {isKo ? "준법 인증" : "Compliance"}
          </button>
        </div>

        {/* Export action buttons */}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleExportCSV}
            title={isKo ? "CSV로 내보내기" : "Export as CSV"}
          >
            <Sheet className="size-3" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleExportJSON}
            title={isKo ? "JSON으로 내보내기" : "Export as JSON"}
          >
            <FileJson className="size-3" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={pdfLoading}
            onClick={
              activeTab === "energy-audit"
                ? handleDownloadEnergyPdf
                : handleDownloadCompliancePdf
            }
            title={isKo ? "PDF 다운로드" : "Download PDF"}
          >
            <Download className="size-3" />
            {pdfLoading
              ? isKo
                ? "생성 중..."
                : "Generating..."
              : "PDF"}
          </Button>
        </div>
      </div>

      {/* ── Scrollable report preview area ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "energy-audit" && energyAuditInput && (
          <div className="p-4">
            <EnergyAuditPreview input={energyAuditInput} />
          </div>
        )}

        {activeTab === "energy-audit" && !energyAuditInput && (
          <ReportSkeleton />
        )}

        {activeTab === "compliance" && complianceInput && (
          <CompliancePreview
            input={complianceInput}
            onDownloadPdf={handleDownloadCompliancePdf}
          />
        )}

        {activeTab === "compliance" && !complianceInput && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
            <p className="text-sm">
              {isKo
                ? "준법 인증 데이터를 불러오는 중..."
                : "Loading compliance data..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
