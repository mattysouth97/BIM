# Corpus licence and publication review

Review date: 2026-09-15. Status: implementation review completed; release 0.1.0-pilot stored and read back from Neon. Public deployment verification is separate.

## Register-derived records

The [MOLIT Building HUB building-register API listing](https://www.data.go.kr/data/15134735/openapi.do), updated 2026-07-10 and checked on the review date, states unrestricted reuse permission and no charge. Its advertised development traffic is 10,000; operating traffic may be increased through an application. This advertised figure does not establish this account's measured allowance. The listing also warns that register primary keys changed during migration to Building HUB.

The corpus will retain the source URL, retrieval date, source record identifier and allowlisted title-input hash. Its licence statement must identify the provider's unrestricted-reuse declaration without inventing a Creative Commons licence or extending a curated IFC model's licence to register records. Project calculations are derived screening outputs; no provider endorsement is implied.

## Privacy and publication scope

Publish an explicit field allowlist: stable corpus identifier, release/version lineage, coarse region, use classification, construction era, geometric building quantities, modeled energy and named assumptions. Exclude owner names, contact details, household/unit identifiers, exact street addresses, raw API credentials and unrestricted raw responses. Source identifiers are retained only for building-level traceability. Store raw pilot evidence privately outside git; the public API serves the reviewed projection.

A release must pass the field allowlist and secret checks before its index becomes publicly reachable. This is a product data-minimization decision, not a claim that all possible register payloads are free of personal information.

## Curated models remain separate

Each reference model retains its own declared licence, attribution and source hashes. Model geometry rights and meter-series rights are checked independently. Adding a model to the gallery does not license consumption data or establish a calibrated anchor.

## Claims and remaining release checks

- Internal consistency is established only by executable comparisons with the application calculation chain.
- Accuracy against Korean building stock remains unvalidated without suitable independent observations. Corpus coverage is the actual generated sample and its exclusions, not national representativeness.
- Before publication, inspect the concrete snapshot, coverage, exclusion and assumption-prevalence tables; record its hash and verify downloads, filters, pagination and stable record URLs.
- Records and generated release artifacts must reside outside the git repository. A local artifact directory alone does not establish production persistence or public availability.


## First concrete release decision

- Licence decision: `2026-09-15-register-derived-corpus-license`.
- Publication review: `2026-09-15-corpus-pilot-publication-review`.
- Reviewer: `Codex (implementation review)`. This is not human or legal-counsel signoff.
- Reviewed/published timestamp: `2026-09-15T10:36:01.764Z`.
- Release: `0.1.0-pilot`, schema `1.0.0`, engine `existing-2026.08+honest-physics`.
- Source code: `4e44b1b5a0dbb01d475a466a6e23dd3b5e03cdc4`.
- Reviewed snapshot SHA-256: `211ed326bca2b4ce48c8731457c1368ba87304a65a09be5681f26f6836c67bbc`.

The concrete snapshot contains 71 generated screening records and 4 exclusions from 75 observed title rows: 3 represented regions, 7 main-use codes and 6 eras. Coverage is limited to the actual pilot samples; all unlisted geography/use/era combinations and national representativeness are excluded. All records retain named assumptions and their original record-specific descriptions. Aggregate families with multiple descriptions explicitly say that their basis varies by record. No metered-energy validation is claimed.

The root reviewer independently recomputed the validated hash and inspected the draft's coverage, omissions, licences, separate claims and field allowlist before authorizing the final storage action under the user's existing publication instruction. No exact address, owner, household/contact field or API credential appears in the allowed projection. Source input hashes describe sanitized title inputs, not raw-response hashes.

Neon contains the immutable release and indexed records. Exact reviewed artifact JSON text is retained alongside JSONB query projections: JSONB key reordering must not alter reproducible review hashing. A guarded representation repair required the matching reviewed digest and full JSONB semantic equality; the approved record content, release metadata and original hash were unchanged.

Local Next.js runtime against real Neon passed full 4,868,243-byte streamed JSON download and snapshot hash reproduction, all 71 stable record URLs, all 3 region/7 use/6 era filters, a 100-record page returning the complete 71-record set, stable pagination and literal empty-search behavior. This is durable-storage and local API evidence; production-route/download verification must be recorded separately after deployment.
