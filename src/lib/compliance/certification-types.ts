// src/lib/compliance/certification-types.ts
// Korean Green Building Certification (G-SEED / 녹색건축물 인증) types.
// Supports both pre-2024 and 2024 updated standards.

export type CertificationVersion = "pre-2024" | "2024";

export type CertificationGrade =
  | "excellent"
  | "best"
  | "good"
  | "general"
  | "not-assessable";

export interface CategoryScore {
  id: string;
  nameKo: string;
  nameEn: string;
  maxPoints: number;
  earnedPoints: number;
  /** Whether we can score this category from available building data */
  assessable: boolean;
  /** Explanation of why this category is or is not assessable */
  assessmentNote: string;
}

export interface CertificationResult {
  version: CertificationVersion;
  /** Sum of all category maxPoints (always 100) */
  totalMaxPoints: number;
  /** Sum of maxPoints for assessable categories only */
  assessableMaxPoints: number;
  earnedPoints: number;
  /** Percentage of total score we can assess (earnedPoints / totalMaxPoints * 100) */
  assessablePercentage: number;
  grade: CertificationGrade;
  categories: CategoryScore[];
  /** Legal disclaimer for automated pre-assessment */
  disclaimer: string;
}
