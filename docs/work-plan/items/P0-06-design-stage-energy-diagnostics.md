---
id: P0-06
title: Source-traceable design-stage energy diagnosis vertical slice
priority: P0
area: energy
status: in-review
owner: codex-gpt5
effort: XL
created: 2026-08-23
updated: 2026-08-24
use_cases: [UC-12]
---

# P0-06 — Source-traceable design-stage energy diagnosis

## 1. Requirement (RE)

Extend the existing generative/schematic/CAD → BIM → degree-day energy path
with a versioned canonical energy model. The first integrated slice accepts a
representative small office drawing set, classifies and extracts energy facts,
keeps source evidence/conflicts/missing values visible, validates readiness,
runs the existing screening engine, maps zone/envelope results into the existing
viewer, compares a non-destructive alternative, and survives save/reload.

The feature is progressive: Tier 1 drawings produce an explicitly uncertain
early estimate; missing Tier 2/3 drawings do not erase valid work. Unsupported
physics and recognition stages remain named limitations, never fabricated
results.

## 2. Specification (SDD) — BDD scenarios

**S1 — representative vertical slice.** Given the bundled seven-document office
set, when the diagnosis workspace ingests it, then it identifies the plan,
elevation, section, window/envelope/HVAC/lighting schedules; extracts at least
one floor plate, opening, thermal zone, envelope value and system value; and
every material engine input links to source evidence or a visible assumption.

**S2 — readiness blocks honestly.** Given a required fact is missing or a
blocking conflict is unresolved, when preflight runs, then simulation is
blocked with the affected fact/object and a corrective action. Applying and
confirming an allowed assumption or resolving the conflict makes the relevant
category ready without silently replacing competing evidence.

**S3 — real deterministic simulation and alternative.** Given a ready model,
when baseline and a supported U-value/COP scenario run, then the adapter invokes
the existing degree-day functions, stores exact versioned inputs and logs, keeps
the baseline facts immutable, and returns reproducible annual results. Ratio
end uses and area-apportioned zones are labelled approximations; unavailable
monthly/peak outputs remain unavailable rather than zero.

**S4 — source/3D round trip.** Given a zone, fact, result row, or source region
is selected, then the same stable canonical ID synchronizes the drawing review,
fact inspector, and existing 3D energy overlay. Missing/conflicted states use
text/pattern as well as colour, and the legend states unit, period, and method.

**S5 — persistence and regression.** Given a completed diagnosis is saved and
reopened, then facts, source references, conflict resolutions, scenario deltas,
exact engine inputs and results reproduce unchanged while source bytes remain
stored separately by hash. Existing prompt generation, schematic generation,
DWG/DXF/SVG import, project loading, viewer layers, language switch and energy
calculation tests remain operational.

## 3. Constraints (CDD)

- **May touch**: new `src/lib/energy-diagnostics/**` and
  `src/components/energy-diagnostics/**`; additive wiring in Studio, landing,
  selection and energy-zone overlay; focused `e2e/**`; required documentation,
  fixtures, and QA scripts/evidence.
- **Must not**: replace the degree-day engine; mutate baseline facts for a
  scenario; create a second 3D viewer; treat current area apportionment as zonal
  simulation; emit cost/carbon without explicit factors; rasterize vector input
  as the geometry authority; send drawings to an external model without a
  disclosed consent path; change existing persisted-record contracts without a
  migration; touch or discard unrelated dirty files.
- **AFFs**: pure diagnosis modules have no `use client` (AFF-1); file/store
  boundaries validate inputs; unavailable outputs remain explicit (AFF-6).
- **Quantitative fitness**: controlled vector floor area and zone volume within
  1%; deterministic reruns identical; supported metamorphic scenarios move in
  the expected direction.

## 4. Evaluation (EDD)

- **Tests written with implementation**:
  - canonical facts/source priority/conflict replacement;
  - units, polygons, adjacency, openings, zone volume and zoning edits;
  - drawing classification/hash/revision/duplicate and DXF-vector extraction;
  - canonical → degree-day input and result mapping contracts;
  - readiness, engine failure, deterministic and metamorphic scenarios;
  - IndexedDB save/reload and source-byte separation;
  - component and Playwright drawing → review → preflight → run → 3D → compare
    → save/reload journey plus protected-flow regression anchors.
- **Gates**: targeted Vitest, `tsc --noEmit`, full Vitest, coverage, lint,
  `ci:check`, production build, Playwright, local production smoke, visual QA,
  and verified production deployment after every green implementation loop.
- **Honesty/security**: all visible metrics map to the exact stored engine input
  or a named approximation; no source content/API key in logs; source bytes are
  hash-addressed separately from derived project records.
