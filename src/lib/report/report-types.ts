// src/lib/report/report-types.ts
// Type definitions for the PDF report engine.

export type ReportType = 'energy-audit' | 'compliance' | 'retrofit';

export interface ReportSection {
  title: string;
  titleKo: string;
  content: ReportSectionContent;
}

export type ReportSectionContent =
  | { type: 'text'; text: string }
  | { type: 'key-value'; items: { label: string; value: string }[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'metric'; label: string; value: string; unit: string; trend?: 'up' | 'down' | 'neutral' };

export interface ReportData {
  type: ReportType;
  buildingName: string;
  buildingAddress: string;
  generatedAt: string; // ISO date
  fidelityLevel: 1 | 2 | 3;
  sections: ReportSection[];
  disclaimer: string;
}
