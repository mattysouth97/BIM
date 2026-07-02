"use client";

// src/components/report/compliance-preview.tsx
// In-app HTML preview for the compliance certification report.
// Renders all sections from ComplianceReportInput in a card layout.

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComplianceReportInput } from "@/lib/report/templates/compliance-report";

// ---------------------------------------------------------------------------
// Grade colour helpers
// ---------------------------------------------------------------------------

function efficiencyGradeColor(grade: string): string {
  switch (grade) {
    case "1+++":
    case "1++":
      return "bg-emerald-600 text-white";
    case "1+":
    case "1":
      return "bg-green-500 text-white";
    case "2":
    case "3":
      return "bg-yellow-400 text-gray-900";
    case "4":
    case "5":
      return "bg-orange-400 text-white";
    case "6":
    case "7":
    default:
      return "bg-red-500 text-white";
  }
}

function certGradeColor(grade: string): string {
  switch (grade) {
    case "excellent":
      return "bg-emerald-600 text-white";
    case "best":
      return "bg-green-500 text-white";
    case "good":
      return "bg-yellow-400 text-gray-900";
    case "general":
      return "bg-blue-400 text-white";
    default:
      return "bg-gray-400 text-white";
  }
}

const CERTIFICATION_GRADE_LABEL: Record<string, string> = {
  excellent: "최우수 (Excellent)",
  best: "우수 (Best)",
  good: "우량 (Good)",
  general: "일반 (General)",
  "not-assessable": "해당없음 (N/A)",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  titleKo,
  children,
}: {
  title: string;
  titleKo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{titleKo}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      <span className="w-56 shrink-0 text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function BuildingOverview({
  building,
}: {
  building: ComplianceReportInput["building"];
}) {
  return (
    <SectionCard title="Building Overview" titleKo="건물 개요">
      <div className="divide-y divide-gray-50">
        <KVRow label="Building Name / 건물명" value={building.name} />
        <KVRow label="Address / 주소" value={building.address} />
        <KVRow label="Use Type / 용도" value={building.useType} />
        <KVRow label="Construction Era / 준공연도" value={building.era} />
        <KVRow
          label="Gross Floor Area / 연면적"
          value={
            building.area > 0 ? `${building.area.toLocaleString()} m²` : "-"
          }
        />
      </div>
    </SectionCard>
  );
}

function EfficiencyRatingCard({
  rating,
}: {
  rating: ComplianceReportInput["efficiencyRating"];
}) {
  return (
    <SectionCard
      title="Energy Efficiency Rating"
      titleKo="건축물 에너지효율등급"
    >
      <div className="flex items-start gap-6">
        {/* Large grade badge */}
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl font-bold ${efficiencyGradeColor(rating.grade)}`}
        >
          {rating.grade}
        </div>

        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-gray-700">{rating.gradeLabel}</p>
          <p className="text-xs text-gray-500">
            Primary energy demand / 1차 에너지 소요량
          </p>
          <p className="text-2xl font-semibold text-gray-900">
            {rating.primaryEnergyPerArea > 0
              ? `${rating.primaryEnergyPerArea.toFixed(1)}`
              : "—"}
            <span className="ml-1 text-sm font-normal text-gray-500">
              kWh/m²·year
            </span>
          </p>
          <p className="text-xs text-gray-400">
            기준: 건축물 에너지효율등급 인증 및 제로에너지건축물 인증 기준
            (MOTIE/KEMCO)
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function CertificationOverview({
  certification,
}: {
  certification: ComplianceReportInput["certification"];
}) {
  const versionLabel =
    certification.version === "pre-2024"
      ? "G-SEED 2013–2023 (구버전)"
      : "G-SEED 2024 (현행)";

  const gradeLabel =
    CERTIFICATION_GRADE_LABEL[certification.grade] ?? certification.grade;

  return (
    <SectionCard
      title="Green Certification Pre-Assessment"
      titleKo="녹색건축물 인증 사전평가"
    >
      <div className="flex items-start gap-6">
        {/* Grade badge */}
        <div
          className={`flex h-16 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-bold ${certGradeColor(certification.grade)}`}
        >
          {gradeLabel}
        </div>

        <div className="flex-1">
          <div className="divide-y divide-gray-50">
            <KVRow label="Standard Version / 기준 버전" value={versionLabel} />
            <KVRow
              label="Earned Points / 취득 점수"
              value={certification.earnedPoints.toFixed(1)}
            />
            <KVRow
              label="Assessable Max / 평가가능 최대점수"
              value={certification.assessableMaxPoints.toFixed(1)}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function CategoryBreakdown({
  categories,
}: {
  categories: ComplianceReportInput["certification"]["categories"];
}) {
  return (
    <SectionCard title="Category Breakdown" titleKo="항목별 점수">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="pb-2 pr-4">Category (Korean)</th>
              <th className="pb-2 pr-4">Category (English)</th>
              <th className="pb-2 pr-3 text-right">Max</th>
              <th className="pb-2 pr-3 text-right">Earned</th>
              <th className="pb-2 text-center">Assessable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {categories.map((cat) => (
              <tr key={cat.nameEn} className="text-gray-800">
                <td className="py-2 pr-4 font-medium">{cat.nameKo}</td>
                <td className="py-2 pr-4 text-gray-600">{cat.nameEn}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {cat.maxPoints}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {cat.assessable ? cat.earnedPoints.toFixed(1) : "—"}
                </td>
                <td className="py-2 text-center">
                  {cat.assessable ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      No
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function AssessabilityExplanation({
  categories,
}: {
  categories: ComplianceReportInput["certification"]["categories"];
}) {
  const assessable = categories.filter((c) => c.assessable);
  const notAssessable = categories.filter((c) => !c.assessable);

  return (
    <SectionCard
      title="Assessable vs Non-Assessable Categories"
      titleKo="평가 가능 / 불가능 항목"
    >
      <div className="space-y-4">
        {assessable.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
              Scored remotely ({assessable.length} categories)
            </p>
            <ul className="space-y-2">
              {assessable.map((cat) => (
                <li key={cat.nameEn} className="text-sm">
                  <span className="font-medium text-gray-800">
                    {cat.nameKo}
                  </span>{" "}
                  <span className="text-gray-500">— {cat.assessmentNote}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {notAssessable.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Requires site visit ({notAssessable.length} categories)
            </p>
            <ul className="space-y-2">
              {notAssessable.map((cat) => (
                <li key={cat.nameEn} className="text-sm">
                  <span className="font-medium text-gray-800">
                    {cat.nameKo}
                  </span>{" "}
                  <span className="text-gray-500">— {cat.assessmentNote}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function DisclaimerCard({ disclaimer }: { disclaimer: string }) {
  return (
    <SectionCard title="Disclaimer" titleKo="면책 조항">
      <p className="text-sm leading-relaxed text-gray-600">{disclaimer}</p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface CompliancePreviewProps {
  input: ComplianceReportInput;
  onDownloadPdf?: () => void;
}

export function CompliancePreview({
  input,
  onDownloadPdf,
}: CompliancePreviewProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Compliance Certification Report
          </h2>
          <p className="text-sm text-gray-500">준법 인증 보고서</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onDownloadPdf}
          disabled={!onDownloadPdf}
        >
          <Download className="size-4" />
          PDF 다운로드
        </Button>
      </div>

      {/* Sections */}
      <BuildingOverview building={input.building} />
      <EfficiencyRatingCard rating={input.efficiencyRating} />
      <CertificationOverview certification={input.certification} />
      <CategoryBreakdown categories={input.certification.categories} />
      <AssessabilityExplanation categories={input.certification.categories} />
      <DisclaimerCard disclaimer={input.disclaimer} />
    </div>
  );
}
