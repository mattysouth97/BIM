// src/lib/compliance/certification-weights-legacy.ts
// G-SEED pre-2024 category weights (녹색건축물 인증 구 기준).
// Total: 100 points across 8 categories.
// Grade thresholds: ≥80 = excellent, ≥70 = best, ≥60 = good, ≥50 = general

export interface CategoryDefinition {
  id: string;
  nameKo: string;
  nameEn: string;
  maxPoints: number;
}

export const LEGACY_CATEGORIES: CategoryDefinition[] = [
  {
    id: "land-transport",
    nameKo: "토지이용 및 교통",
    nameEn: "Land Use & Transport",
    maxPoints: 12,
  },
  {
    id: "energy-pollution",
    nameKo: "에너지 및 환경오염",
    nameEn: "Energy & Pollution",
    maxPoints: 24,
  },
  {
    id: "materials-resources",
    nameKo: "재료 및 자원",
    nameEn: "Materials & Resources",
    maxPoints: 14,
  },
  {
    id: "water",
    nameKo: "물순환 관리",
    nameEn: "Water Management",
    maxPoints: 10,
  },
  {
    id: "maintenance",
    nameKo: "유지관리",
    nameEn: "Maintenance",
    maxPoints: 10,
  },
  {
    id: "ecology",
    nameKo: "생태환경",
    nameEn: "Ecological Environment",
    maxPoints: 10,
  },
  {
    id: "indoor",
    nameKo: "실내환경",
    nameEn: "Indoor Environment",
    maxPoints: 14,
  },
  {
    id: "innovation",
    nameKo: "혁신적 설계",
    nameEn: "Innovation",
    maxPoints: 6,
  },
];

/** Grade thresholds for pre-2024 standard (score out of 100) */
export const LEGACY_GRADE_THRESHOLDS = {
  excellent: 80,
  best: 70,
  good: 60,
  general: 50,
} as const;
