import type { CorpusRecord } from "@/lib/corpus/schema";
import type { PublishedCorpusRelease } from "@/lib/corpus/publication";

// Synthetic transport fixtures only. Never imported by production code.
export const releaseFixture: PublishedCorpusRelease = {
  generationStatus: "complete", releaseId: "ui-contract-2026-09-15", schemaVersion: "1.0.0", engineVersion: "fixture-engine",
  sourceCommit: "1234567", generatedAt: "2026-09-15T00:00:00Z", publishedAt: "2026-09-15T01:00:00Z",
  recordCount: 21, exclusionCount: 1,
  coverage: { regionCodes: ["11", "26"], useTypeCodes: ["02000", "03000"], eras: ["pre-1980", "post-2016"], description: "Synthetic browser test coverage; not a published population." },
  assumptionPrevalence: [{ id: "wall-era", title: "Era-indexed wall assumption", count: 21, fraction: 1 }],
  exclusionsByReason: { missing_floor_area: 1 }, limitations: ["No metered energy calibration."],
  previousReleaseId: "ui-contract-prior", changelog: ["Updated assumption table."], snapshotSha256: "a".repeat(64),
  review: { decisionId: "fixture", reviewedAt: "2026-09-15T00:30:00Z", reviewedBy: "test", reviewedSha256: "a".repeat(64), licenceDecisionId: "fixture", privacy: "approved" },
  licence: { id: "MOLIT-public-data-unrestricted", url: "https://www.data.go.kr/data/15134735/openapi.do", statement: "Fixture reuse statement; curated model licences are separate." },
  claims: { internalConsistency: "Fixture calculations check shared input/output consistency.", stockAccuracy: "Accuracy against Korean building stock has not been validated." },
  omittedCoverage: ["All unlisted regions and eras; no national representation."],
};
export function recordFixture(index = 1): CorpusRecord {
  return {
    id: `kr-ledger-${String(index).padStart(24, "0")}`, permalink: `/api/corpus/releases/${releaseFixture.releaseId}/records/kr-ledger-${String(index).padStart(24, "0")}`,
    releaseId: releaseFixture.releaseId, schemaVersion: "1.0.0", engineVersion: "fixture-engine", sourceCommit: "1234567", generatedAt: releaseFixture.generatedAt,
    source: { provider: "MOLIT Building Register", endpoint: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo", recordId: "fixture-source", retrievedAt: "2026-09-14T00:00:00Z", inputHash: "b".repeat(64) },
    licence: { id: "MOLIT-public-data-unrestricted", url: releaseFixture.licence.url, decisionId: "fixture" },
    evidenceTier: "register-derived-assumed-baseline",
    building: { regionCode: "11", useTypeCode: "02000", era: "pre-1980", approvalYear: null, floorAreaSqm: 1000, footprintAreaSqm: 200, floorsAbove: 5, heightM: null },
    energy: { siteKwh: 123456.789, siteKwhPerSqm: 123.456789, primaryKwh: 200000, primaryKwhPerSqm: 200, grade: "2", co2Tonnes: 34.567, pvGenerationKwh: 0 },
    assumptions: [{ id: "wall-era", title: "Era-indexed wall assumption" }], provenance: [{ key: "wallUValue", status: "assumed", assumptionId: "wall-era", sourceRefCount: 0 }],
    limitations: ["Assumed envelope values are not stated by the building register. No metered energy calibration."],
  };
}
