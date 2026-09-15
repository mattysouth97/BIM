# Corpus licence and publication review

Review date: 2026-09-15. Status: source terms reviewed; final release artifact inspection pending.

## Register-derived records

The [MOLIT Building HUB building-register API listing](https://www.data.go.kr/data/15134735/openapi.do), updated 2026-07-10 and checked on the review date, states unrestricted reuse permission and no charge. Its advertised development traffic is 10,000; operating traffic may be increased through an application. This advertised figure does not establish this account's measured allowance. The listing also warns that register primary keys changed during migration to Building HUB.

The corpus will retain the source URL, retrieval date, source record identifier and response hash. Its licence statement must identify the provider's unrestricted-reuse declaration without inventing a Creative Commons licence or extending a curated IFC model's licence to register records. Project calculations are derived screening outputs; no provider endorsement is implied.

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
