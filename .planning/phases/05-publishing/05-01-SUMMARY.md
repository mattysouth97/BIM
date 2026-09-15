# Phase 05 backend execution summary

## Delivered

- `a6eba35`: strict reviewed publication, immutable atomic Neon storage, read-only APIs, public field/unit dictionary, operator CLI.
- `bc38e53`: full UTF-8 streaming transport for exports/large record pages, correct gross-site energy labels, missing-credentials test and ADR-008.
- Final fix preserves exact approved JSON text alongside JSONB projections, preventing database key ordering from changing digest reproduction.

## Real release

Release `0.1.0-pilot`: 71 accepted baselines / 4 exclusions from 75 real source rows. Source commit `4e44b1b5a0dbb01d475a466a6e23dd3b5e03cdc4`; published `2026-09-15T10:36:01.764Z`. Snapshot SHA-256 `211ed326bca2b4ce48c8731457c1368ba87304a65a09be5681f26f6836c67bbc`. Root independently reviewed the concrete corrected snapshot before publication. Review and licence decisions are recorded in the feature review document. External artifacts remain in BIM-corpus-data; real records/artifacts are stored in Neon, not git. No synthetic test fixture was inserted.

## Verification

30 backend tests pass, including unknown/private fields, empty/incomplete generation, lineage, exact coverage, energy denominators, mixed assumption descriptions, hash-bound review, parameterized filters, missing credentials, redacted errors, dictionary leaf coverage, streaming beyond 4.5 MB with Korean/emoji boundaries, and JSONB key-order preservation. Scoped ESLint passes. Standalone worktree TypeScript has only an inherited capexBudgetKrw fixture mismatch from base03f5a6e; parent integrates against its corrected current branch.

Actual local Next.js on port3005 with real Neon passed: list200; pre-publication empty state; malformed-query400; POST405; dictionary200; full streamed download4,868,243bytes and original digest; pageSize100 returning all71; non-overlapping pagination; all3region,7use and6era filters matching source rows; all71immutable record URLs; empty literal search. Indexed JSONB storage initially reordered keys; deep readback caught it, guarded text preservation repaired only the approved representation, and complete hash/readback verification then passed.

## Limits and integration

This is the backend portion of Phase5. The parallel gallery worker owns /corpus browsing UI and its browser verification. Parent owns clean deployment and actual Vercel full-download verification. Do not substitute local streaming evidence for deployed transport evidence. Corpus accuracy is unvalidated against independent Korean stock observations; coverage is the bounded pilot. Much larger artifacts still require memory/storage measurement because the server serializes each query result before streaming byte chunks.
