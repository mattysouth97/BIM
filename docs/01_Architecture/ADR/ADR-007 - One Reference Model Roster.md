# ADR-007 — One reference-model roster

Date: 2026-09-15. Status: accepted for local implementation.

## Problem

The gallery and route/dataset allowlist enumerated seven models separately.
Gallery quantities were hand-written copies of extracted evidence. Updating an
IFC manifest could leave the public card unchanged.

## Decision

`src/lib/reference-buildings/registry.json` owns runtime registration and editorial
metadata. Route validation, catalogue enumeration and gallery iteration derive
their IDs from its keys. Energy-input bindings are a partial map: no binding means
no energy baseline, never a default recipe. Source-extraction configurations
remain per-model build instructions, not a second public roster.

The gallery imports a compact generated projection rather than full manifests
or a server filesystem module. The projection contains only manifest-derived
figures and datums plus full licence attribution. A content check rejects stale
projections. Canonical JSON hashes avoid false evidence drift from Windows
checkout newline conversion.

Unknown exterior classification is explicit (`envelopeStatus: unresolved`). Its
empty extractor sets are diagnostics, not measured zero quantities. The viewer
and exporter must carry this distinction. Meter-data linkage is an independent
claim from measured model geometry.

## Consequences

Adding an entry requires real committed artifacts, source rights, a regenerated
catalogue and all-model contract checks. Energy treatment is added only when its
own evidence is ready. The client bundle does not include full IFC manifests or
Node filesystem imports.

