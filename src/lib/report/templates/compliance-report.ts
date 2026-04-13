// src/lib/report/templates/compliance-report.ts
// Pure function template for green certification + energy efficiency rating report.
// Produces ReportSection[] consumable by the PDF engine and the in-app preview.

import type { ReportSection } from "@/lib/report/report-types";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ComplianceReportInput {
  building: {
    name: string;
    address: string;
    useType: string;
    era: string;
    area: number;
  };
  certification: {
    /** 'pre-2024' | '2024' */
    version: string;
    earnedPoints: number;
    assessableMaxPoints: number;
    grade: string;
    categories: Array<{
      nameKo: string;
      nameEn: string;
      maxPoints: number;
      earnedPoints: number;
      assessable: boolean;
      assessmentNote: string;
    }>;
  };
  efficiencyRating: {
    primaryEnergyPerArea: number;
    /** '1+++' through '7' */
    grade: string;
    gradeLabel: string;
  };
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Grade display helpers
// ---------------------------------------------------------------------------

const CERTIFICATION_GRADE_LABEL: Record<string, string> = {
  excellent: "최우수 (Excellent)",
  best: "우수 (Best)",
  good: "우량 (Good)",
  general: "일반 (General)",
  "not-assessable": "해당없음 (N/A)",
};

function certGradeLabel(grade: string): string {
  return CERTIFICATION_GRADE_LABEL[grade] ?? grade;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildingOverviewSection(
  building: ComplianceReportInput["building"]
): ReportSection {
  return {
    title: "Building Overview",
    titleKo: "건물 개요",
    content: {
      type: "key-value",
      items: [
        { label: "Building Name / 건물명", value: building.name },
        { label: "Address / 주소", value: building.address },
        { label: "Use Type / 용도", value: building.useType },
        { label: "Construction Era / 준공연도", value: building.era },
        {
          label: "Gross Floor Area / 연면적",
          value:
            building.area > 0 ? `${building.area.toLocaleString()} m²` : "-",
        },
      ],
    },
  };
}

function efficiencyRatingSection(
  rating: ComplianceReportInput["efficiencyRating"]
): ReportSection {
  return {
    title: "Energy Efficiency Rating",
    titleKo: "건축물 에너지효율등급",
    content: {
      type: "key-value",
      items: [
        { label: "Grade / 등급", value: rating.grade },
        { label: "Grade Label / 등급명", value: rating.gradeLabel },
        {
          label: "Primary Energy Demand / 1차 에너지 소요량",
          value:
            rating.primaryEnergyPerArea > 0
              ? `${rating.primaryEnergyPerArea.toFixed(1)} kWh/m²·year`
              : "-",
        },
        {
          label: "Standard / 기준",
          value:
            "건축물 에너지효율등급 인증 및 제로에너지건축물 인증 기준 (MOTIE/KEMCO)",
        },
      ],
    },
  };
}

function certificationOverviewSection(
  cert: ComplianceReportInput["certification"]
): ReportSection {
  const versionLabel =
    cert.version === "pre-2024"
      ? "G-SEED 2013–2023 (구버전)"
      : "G-SEED 2024 (현행)";

  return {
    title: "Green Certification Pre-Assessment",
    titleKo: "녹색건축물 인증 사전평가",
    content: {
      type: "key-value",
      items: [
        { label: "Standard Version / 기준 버전", value: versionLabel },
        {
          label: "Earned Points / 취득 점수",
          value: cert.earnedPoints.toFixed(1),
        },
        {
          label: "Assessable Max Points / 평가가능 최대점수",
          value: cert.assessableMaxPoints.toFixed(1),
        },
        {
          label: "Overall Grade / 종합 등급",
          value: certGradeLabel(cert.grade),
        },
      ],
    },
  };
}

function categoryBreakdownSection(
  categories: ComplianceReportInput["certification"]["categories"]
): ReportSection {
  const headers = [
    "Category (Korean)",
    "Category (English)",
    "Max Points",
    "Earned",
    "Assessable",
  ];

  const rows = categories.map((cat) => [
    cat.nameKo,
    cat.nameEn,
    cat.maxPoints.toString(),
    cat.assessable ? cat.earnedPoints.toFixed(1) : "—",
    cat.assessable ? "Yes" : "No",
  ]);

  return {
    title: "Category Breakdown",
    titleKo: "항목별 점수",
    content: {
      type: "table",
      headers,
      rows,
    },
  };
}

function assessabilityExplanationSection(
  categories: ComplianceReportInput["certification"]["categories"]
): ReportSection {
  const assessable = categories
    .filter((c) => c.assessable)
    .map((c) => `${c.nameKo} (${c.nameEn})`)
    .join(", ");

  const notAssessable = categories
    .filter((c) => !c.assessable)
    .map((c) => `${c.nameKo} (${c.nameEn})`)
    .join(", ");

  const lines: string[] = [
    "This automated pre-assessment can only score categories where building data is available remotely.",
    "",
    `Assessable categories (scored): ${assessable || "None"}`,
    "",
    `Non-assessable categories (require site visit / authorized assessor): ${notAssessable || "None"}`,
    "",
    "Non-assessable categories include items such as site ecology, water systems, indoor environment " +
      "measurements, and operational maintenance records. These require physical inspection or " +
      "documentation that cannot be inferred from building ledger data alone.",
  ];

  return {
    title: "Assessable vs Non-Assessable Categories",
    titleKo: "평가 가능 / 불가능 항목",
    content: {
      type: "text",
      text: lines.join("\n"),
    },
  };
}

function disclaimerSection(disclaimer: string): ReportSection {
  return {
    title: "Disclaimer",
    titleKo: "면책 조항",
    content: {
      type: "text",
      text: disclaimer,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build all report sections for a compliance certification report.
 * Pure function — no side effects, no I/O.
 */
export function buildComplianceReportSections(
  input: ComplianceReportInput
): ReportSection[] {
  return [
    buildingOverviewSection(input.building),
    efficiencyRatingSection(input.efficiencyRating),
    certificationOverviewSection(input.certification),
    categoryBreakdownSection(input.certification.categories),
    assessabilityExplanationSection(input.certification.categories),
    disclaimerSection(input.disclaimer),
  ];
}
