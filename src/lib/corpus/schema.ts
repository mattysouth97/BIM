export const CORPUS_SCHEMA_VERSION = "1.0.0";
export interface CorpusRecord {
  id: string; permalink: string; releaseId: string; schemaVersion: string;
  engineVersion: string; sourceCommit: string; generatedAt: string;
  source: { provider: "MOLIT Building Register"; endpoint: string; recordId: string; retrievedAt: string; inputHash: string };
  licence: { id: string; url: string; decisionId: string };
  evidenceTier: "register-derived-assumed-baseline";
  building: { regionCode: string; useTypeCode: string; era: string; approvalYear: number | null; floorAreaSqm: number; footprintAreaSqm: number; floorsAbove: number; heightM: number | null };
  energy: { siteKwh: number; siteKwhPerSqm: number; primaryKwh: number; primaryKwhPerSqm: number; grade: string; co2Tonnes: number; pvGenerationKwh: number };
  assumptions: { id: string; title: string }[];
  provenance: { key: string; status: string; assumptionId: string | null; sourceRefCount: number }[];
  limitations: string[];
}
export interface CorpusExclusion { id: string; recordId: string; releaseId: string; generatedAt: string; reason: string; detail: string }
export type CorpusOutcome = { status: "generated"; record: CorpusRecord } | { status: "excluded"; exclusion: CorpusExclusion };
export interface CorpusGenerationContext { releaseId: string; sourceCommit: string; generatedAt: string; retrievedAt: string; licenceDecisionId: string }
export interface CorpusReleaseManifest {
  generationStatus: "complete" | "partial";
  releaseId: string; schemaVersion: string; engineVersion: string; sourceCommit: string; generatedAt: string;
  recordCount: number; exclusionCount: number;
  coverage: { regionCodes: string[]; useTypeCodes: string[]; eras: string[]; description: string };
  assumptionPrevalence: { id: string; title: string; count: number; fraction: number }[];
  exclusionsByReason: Record<string, number>;
  limitations: string[];
}
