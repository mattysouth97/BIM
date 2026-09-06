---
type: adr
status: planned
last_verified: 2026-09-07
---

# ADR-005 — Publish reproducible reference energy datasets

## Status

Proposed record of implementation choices for the user's authorized dataset
expansion (2026-09-07). Human acceptance of this ADR is not recorded.

## Context

The user asked to make BIMFIT useful as a source of building-energy datasets,
improving accuracy and variety. Existing reference pages combine model
measurements, assumed operating inputs, and calculated energy. Exporting their
visible numbers without these distinctions would turn a screening calculation
into apparent observed consumption and conceal partial extraction scope.

## Decision

Expose versioned, read-only JSON records and a CSV catalogue for the published
reference baselines, linked from the existing gallery and model pages. These
are downloads inside the existing product, not a new diagnostic entry route.

Build records on the server from the committed manifest and baseline input
registry, using the same energy functions as the viewer. Browser edits,
retrofit selections and financing do not change these datasets. Include source
licence/attribution, source hashes, manifest/input/payload hashes, deployment
revision, model context, assumptions, missing values, partial-scope caveats,
climate, method and units. Source-file declarations and engine inputs remain
separate when they disagree.

Energy outputs are explicitly modeled and uncalibrated; metered consumption is
null. Real-building models, fictional validation examples and unverified
real-world status are distinct categories. A measured IFC quantity describes
the model's selected scope, not necessarily a complete surveyed building.

## Consequences

New registered buildings automatically enter the catalogue and must satisfy its
tests. A missing registered artifact fails the catalogue instead of silently
dropping a record. API IDs are allowlisted before filesystem reads; manifest
JSON is explicitly traced into serverless functions. CSV quotes fields and
neutralizes spreadsheet formula prefixes; exact text remains available in JSON.

Schema shape uses semantic versions. Provenance hashes and the deployment SHA
identify a particular baseline when values change without a schema change.
Cross-building comparisons still require considering climate and scope; a
common export format does not make assumed inputs equivalent to observations.

## Alternatives

- Export browser stores: rejected because edits and scenario state would make
  a download irreproducible as the published baseline.
- Check in duplicate derived dataset files: rejected because manifest/input
  updates could leave them stale. Server derivation has one source chain.
- Export only a flat CSV: rejected because nested assumptions, partial-scope
  notes and source files cannot be preserved adequately in a comparison row.

## Related

[[Reference Buildings]] · [[ADR-002 - Provenance as a Construction-Time Invariant]] ·
[[ADR-004 - The Landing Page Is a Model Gallery]]
