# Corpus publication API

## Release contract

The corpus serves immutable register-derived screening snapshots. Generated records and whole-release artifacts reside in dedicated Neon PostgreSQL tables outside git. Public routes export GET only. Migration and publication are explicit operator CLI actions; a public request cannot create or modify a release.

Before storage, strict schemas reject unknown/private fields, empty or incomplete jobs, inconsistent lineage/coverage, incorrect energy denominators, duplicate records, misleading assumption aggregates, secret-like text, and an approval digest that does not match the validated bytes. Publication inserts the manifest, full artifact and indexed records in one transaction with no overwrite path. A release ID cannot be reused. This establishes implementation consistency, not accuracy against measured Korean stock.

## Read API

- `/api/corpus/releases`: dated manifests, newest first; `{releases:[]}` before first publication.
- `/api/corpus/releases/{releaseId}`: coverage, excluded scope, changelog, source version, review and separate consistency/accuracy statements.
- `/api/corpus/records`: exact `releaseId`, `region`, `useType`, `era` filters; optional `q` searches ID/code/era literally; `page` starts at 1 and `pageSize` is 1–100 (default 20). Stable record-ID order and total counts.
- `/api/corpus/releases/{releaseId}/records/{id}`: immutable record URL.
- `/api/corpus/releases/{releaseId}/download`: whole JSON `{release,records}` attachment.
- `/api/corpus/dictionary`: every public record/release field, unit and null convention.

Invalid queries return 400; missing published releases/records return 404; database failures return 503 without SQL or credentials. The dictionary remains available without a database. A release digest hashes the strict validated `{manifest,records}` with records sorted by ID; it excludes publication/review metadata and is not a checksum of the complete download bytes.

## Operator flow

Use `node --conditions=react-server --env-file=<private-env> scripts/publish-corpus.cjs` with one action:

1. `initialize`: create only the namespaced corpus tables and indexes.
2. `inspect <external-release-dir>`: validate `manifest.json` and `records.ndjson`, print the concrete review hash.
3. `prepare <dir> <external-review-options.json> <external-artifact.json>`: write a new reviewable artifact without overwriting an existing file.
4. `publish <external-artifact.json> <reviewed-sha256>`: revalidate, insert atomically and read back the stored release.

Review options include `publishedAt`, `previousReleaseId`, `changelog`, `omittedCoverage`, and `review` (`decisionId`, `reviewedAt`, `reviewedBy`, `reviewedSha256`, `licenceDecisionId`, `privacy: approved`). Review labels identify implementation review, not human/legal-counsel approval. Source licence decisions are documented separately from curated IFC licences. Private source responses and credentials must never enter this public projection.

The existing Neon connection was verified with SELECT 1; empty corpus tables were initialized and read back with zero releases on 2026-09-15. Actual first publication is recorded in the Phase 5 verification summary once the concrete release review and readback pass.

Protocol source: [Neon official HTTP adapter](https://github.com/neondatabase/serverless/blob/main/src/httpQuery.ts). This JSON-only adapter uses the existing runtime fetch API and parameterized queries, with no dependency changes. Database URL validation permits only HTTPS requests derived from configured `.neon.tech` hosts and rejects redirects.

## Streaming transport

Whole downloads and record pages stream UTF-8 byte chunks; they are not buffered function responses. The actual first-pilot records exceed the hosting provider's 4.5 MB buffered-response ceiling. Chunking preserves all provenance and Korean text, including multibyte characters crossing chunk boundaries. The implementation still materializes the queried JSON in server memory; it is not a constant-memory database cursor. The bounded pilot is covered; much larger releases need a measured storage/export scaling decision. See the [official Vercel response-size guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
