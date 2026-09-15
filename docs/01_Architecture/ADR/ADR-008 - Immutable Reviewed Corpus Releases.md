# ADR-008: Immutable reviewed corpus releases

Date: 2026-09-15. Status: accepted implementation decision; each concrete release still requires its recorded review.

## Context

Corpus records need persistent storage outside git, stable versioned links, filtering, bulk downloads and a privacy/licence gate. The project already has a reachable Neon PostgreSQL database. A local file alone would not provide durable deployed access, and a mutable latest-only table would lose release reproducibility.

## Decision

Use namespaced Neon tables for immutable release manifests, whole JSON artifacts and indexed record projections. Publication validates a strict field allowlist, source/version consistency, nonempty complete generation, exact sample coverage, energy denominators and assumption aggregate claims. A review is bound to the validated snapshot SHA-256. Insert the release and its indexed records in one transaction; duplicate release IDs fail without overwriting prior content.

Expose only GET routes. An explicit operator CLI performs table initialization and publication; no public request can mutate storage. Requests use parameterized SQL over Neon's HTTPS JSON protocol, bounded pagination and literal search. Missing data and database unavailability are distinct responses. Database diagnostics never expose credentials or upstream SQL.

The release carries the provider's actual unrestricted-reuse declaration for register data, independent of every curated model's licence. Public records omit exact addresses, owners, household identifiers and unrestricted upstream payloads. A pipeline-consistency statement and an independent-stock-accuracy statement remain separate fields; no corpus size or software test result becomes a calibration claim.

## Consequences

Release URLs and downloads remain reproducible while a new release can supersede them explicitly. Both full artifacts and indexed records consume database storage, which is acceptable for the bounded pilot and must be measured before a much larger sweep. Runtime persistence depends on the existing Neon database and server environment; the dictionary remains available without it. Public API construction does not create tables. Model-rights and meter matching continue as separate intake decisions.

The small JSON-only adapter avoids a new dependency and is tested against the [official Neon HTTP protocol implementation](https://github.com/neondatabase/serverless/blob/main/src/httpQuery.ts). It is not a general PostgreSQL wire driver: hosts are restricted to configured Neon domains, redirects are rejected, and query parameters are JSON scalar values.

## Exact reviewed bytes versus indexed projections

Neon JSONB projections reorder object keys. Keep the approved artifact's exact JSON string in a text column as well, and use that text for bulk download. Explicit SQL text parameter casts prevent PostgreSQL from inferring JSONB for the shared parameter before storing the original string. Filter indexes and individual records may use semantic JSONB projections; release digest reproduction uses the preserved artifact. The first release's representation was repaired only after matching both its reviewed SHA and its full existing JSONB content, without changing approved data.
