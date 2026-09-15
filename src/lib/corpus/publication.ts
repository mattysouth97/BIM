import { createHash } from "node:crypto";
import { z } from "zod";
import type { CorpusRecord, CorpusReleaseManifest } from "./schema";

const text = z.string().min(1).max(2000);
const token = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/);
const date = z.iso.datetime();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const nonnegative = z.number().finite().nonnegative();
const strict = z.strictObject;
// Strict objects deliberately reject newly introduced upstream/private fields.
export const publicCorpusRecordSchema = strict({
  id: z.string().regex(/^kr-ledger-[a-f0-9]{24}$/), permalink: text,
  releaseId: token, schemaVersion: z.literal("1.0.0"), engineVersion: text,
  sourceCommit: z.string().regex(/^[a-f0-9]{7,40}$/), generatedAt: date,
  source: strict({ provider: z.literal("MOLIT Building Register"), endpoint: z.literal("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"), recordId: z.string().regex(/^[a-zA-Z0-9_-]+$/), retrievedAt: date, inputHash: sha }),
  licence: strict({ id: z.literal("MOLIT-public-data-unrestricted"), url: z.literal("https://www.data.go.kr/data/15134735/openapi.do"), decisionId: token }),
  evidenceTier: z.literal("register-derived-assumed-baseline"),
  building: strict({ regionCode: z.string().regex(/^\d{2}$/), useTypeCode: z.string().regex(/^\d{5}$/), era: token, approvalYear: z.number().int().min(1800).max(2200).nullable(), floorAreaSqm: z.number().finite().positive(), footprintAreaSqm: z.number().finite().positive(), floorsAbove: z.number().int().positive(), heightM: z.number().finite().positive().nullable() }),
  energy: strict({ siteKwh: nonnegative, siteKwhPerSqm: nonnegative, primaryKwh: nonnegative, primaryKwhPerSqm: nonnegative, grade: text, co2Tonnes: nonnegative, pvGenerationKwh: nonnegative }),
  assumptions: z.array(strict({ id: text, title: text })).min(1),
  provenance: z.array(strict({ key: text, status: text, assumptionId: text.nullable(), sourceRefCount: z.number().int().nonnegative() })).min(1),
  limitations: z.array(text).min(1),
});
export const releaseManifestSchema = strict({
  generationStatus: z.literal("complete"),
  releaseId: token, schemaVersion: z.literal("1.0.0"), engineVersion: text,
  sourceCommit: z.string().regex(/^[a-f0-9]{7,40}$/), generatedAt: date,
  recordCount: z.number().int().positive(), exclusionCount: z.number().int().nonnegative(),
  coverage: strict({ regionCodes: z.array(text), useTypeCodes: z.array(text), eras: z.array(text), description: text }),
  assumptionPrevalence: z.array(strict({ id: text, title: text, count: z.number().int().nonnegative(), fraction: z.number().min(0).max(1) })),
  exclusionsByReason: z.record(text, z.number().int().nonnegative()), limitations: z.array(text).min(1),
});
export interface PublicationReview {
  decisionId: string; reviewedAt: string; reviewedBy: string; reviewedSha256: string;
  licenceDecisionId: string; privacy: "approved";
}
export interface PublishedCorpusRelease extends CorpusReleaseManifest {
  publishedAt: string; previousReleaseId: string | null; changelog: string[];
  snapshotSha256: string; review: PublicationReview;
  licence: { id: "MOLIT-public-data-unrestricted"; url: string; statement: string };
  claims: { internalConsistency: string; stockAccuracy: string };
  omittedCoverage: string[];
}
export interface CorpusSnapshot { manifest: CorpusReleaseManifest; records: CorpusRecord[] }
export interface PublishedCorpusArtifact { release: PublishedCorpusRelease; records: CorpusRecord[] }

function fail(message: string): never { throw new Error(`Invalid corpus publication: ${message}`); }
function sameSet(actual: string[], expected: string[]) {
  return JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...new Set(expected)].sort());
}
function scanSecrets(value: unknown): void {
  if (typeof value === "string" && /(?:postgres(?:ql)?:\/\/|(?:service[_-]?key|api[_-]?key|password|authorization)\s*[=:]|-----BEGIN .*PRIVATE KEY|Bearer\s+[a-z0-9._-]{10})/i.test(value)) fail("secret-like content");
  if (Array.isArray(value)) value.forEach(scanSecrets);
  else if (value && typeof value === "object") Object.values(value).forEach(scanSecrets);
}
export function validateSnapshot(input: unknown): CorpusSnapshot {
  const parsed = strict({ manifest: releaseManifestSchema, records: z.array(publicCorpusRecordSchema).min(1) }).parse(input);
  const { manifest, records } = parsed;
  scanSecrets(parsed);
  if (manifest.recordCount !== records.length || new Set(records.map(r => r.id)).size !== records.length) fail("count or duplicate record ID");
  for (const record of records) {
    for (const field of ["releaseId", "schemaVersion", "engineVersion", "sourceCommit", "generatedAt"] as const) if (record[field] !== manifest[field]) fail(`record ${field} differs from release`);
    if (record.permalink !== `/api/corpus/releases/${manifest.releaseId}/records/${record.id}`) fail("unstable permalink");
    for (const [total, intensity] of [[record.energy.siteKwh, record.energy.siteKwhPerSqm], [record.energy.primaryKwh, record.energy.primaryKwhPerSqm]]) {
      if (Math.abs(total - intensity * record.building.floorAreaSqm) > Math.max(0.01, total * 1e-9)) fail("energy denominator mismatch");
    }
  }
  if (!sameSet(manifest.coverage.regionCodes, records.map(r => r.building.regionCode)) || !sameSet(manifest.coverage.useTypeCodes, records.map(r => r.building.useTypeCode)) || !sameSet(manifest.coverage.eras, records.map(r => r.building.era))) fail("coverage differs from records");
  if (Object.values(manifest.exclusionsByReason).reduce((a,b) => a+b,0) !== manifest.exclusionCount) fail("exclusion count differs");
  const assumptions = new Map<string, number>();
  const assumptionTitles = new Map<string, Set<string>>();
  for (const r of records) for (const id of new Set(r.assumptions.map(a => a.id))) assumptions.set(id, (assumptions.get(id) ?? 0)+1);
  for (const r of records) for (const a of r.assumptions) {
    const titles = assumptionTitles.get(a.id) ?? new Set<string>();
    titles.add(a.title); assumptionTitles.set(a.id,titles);
  }
  if (!sameSet([...assumptions.keys()], manifest.assumptionPrevalence.map(a => a.id))) fail("assumption coverage differs");
  if (new Set(manifest.assumptionPrevalence.map(a => a.id)).size !== manifest.assumptionPrevalence.length) fail("duplicate assumption aggregate");
  for (const a of manifest.assumptionPrevalence) {
    if (a.count !== assumptions.get(a.id) || Math.abs(a.fraction - a.count/records.length) > 1e-9) fail("assumption prevalence differs");
    const titles = assumptionTitles.get(a.id)!;
    const expectedTitle = titles.size === 1 ? [...titles][0] : "Varies by record; see each record's named assumption.";
    if (a.title !== expectedTitle) fail("aggregate assumption title misstates record-specific bases");
  }
  return { manifest, records: records.sort((a,b) => a.id.localeCompare(b.id)) };
}
export function snapshotSha256(snapshot: CorpusSnapshot): string {
  return createHash("sha256").update(JSON.stringify(validateSnapshot(snapshot))).digest("hex");
}
export function preparePublication(snapshot: CorpusSnapshot, options: {
  publishedAt: string; previousReleaseId: string | null; changelog: string[];
  omittedCoverage: string[]; review: PublicationReview;
}): PublishedCorpusArtifact {
  const clean = validateSnapshot(snapshot);
  const metadata = strict({ publishedAt: date, previousReleaseId: token.nullable(), changelog: z.array(text).min(1), omittedCoverage: z.array(text).min(1), review: strict({ decisionId: token, reviewedAt: date, reviewedBy: text, reviewedSha256: sha, licenceDecisionId: token, privacy: z.literal("approved") }) }).parse(options);
  scanSecrets(metadata);
  const digest = snapshotSha256(clean);
  if (metadata.review.reviewedSha256 !== digest) fail("review is for different bytes");
  if (Date.parse(metadata.review.reviewedAt) > Date.parse(metadata.publishedAt) || Date.parse(clean.manifest.generatedAt) > Date.parse(metadata.review.reviewedAt)) fail("invalid review chronology");
  if (metadata.previousReleaseId === clean.manifest.releaseId) fail("release cannot supersede itself");
  if (clean.records.some(r => r.licence.decisionId !== metadata.review.licenceDecisionId)) fail("licence review mismatch");
  return { records: clean.records, release: { ...clean.manifest, ...metadata, snapshotSha256: digest,
    licence: { id: "MOLIT-public-data-unrestricted", url: "https://www.data.go.kr/data/15134735/openapi.do", statement: "Provider declares unrestricted reuse of register data. Derived screening calculations imply no provider endorsement. Curated IFC model licences are separate." },
    claims: { internalConsistency: "Records use the application's shared calculation chain; release tests check input/output consistency.", stockAccuracy: "Accuracy against Korean building stock has not been validated with independent measured observations. This sample is not nationally representative." },
  } };
}
