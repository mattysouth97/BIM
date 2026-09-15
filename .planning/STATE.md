---
gsd_state_version: "1.0"
milestone: v6.0
milestone_name: Building Energy Repository
current_phase: 03
current_phase_name: Model Anchors
status: in_progress
stopped_at: Quick-task 260916-0bz COMPLETE 2026-09-16 (GLBs migrated to Vercel Blob, production evidence gate green); milestone v6.0 stays open on ANCH-03 + SWEEP-01 only
last_updated: "2026-09-16T04:15:00.000Z"
last_activity: 2026-09-16
last_activity_desc: Completed quick task 260916-0bz — 52 GLBs (470.12 MB) moved to bim-reference-glbs Blob store (icn1, public); production serves them through the next.config.ts rewrite; evidence gate 200 + glTF + icn1; e2e 3/3 against production; restore + 751 vitest green
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 12
  completed_plans: 10
  percent: 60
---

# Project State

## Current position

Phases 1, 2 and 5 are production-verified. Production serves eleven
gallery models (`region: icn1`) with GLBs delivered from the
`bim-reference-glbs` Blob store through the `/reference-buildings/:id/:file.glb`
rewrite. Branch `feat/design-stage-energy-diagnostics` HEAD is `9965c9d`,
pushed to origin. Nothing is mid-flight.
The milestone stays open because ANCH-03 and SWEEP-01 remain unmet.

## Completed outcomes

- Honest named-end-use physics, LPD/PV grade effects, shared retrofit core,
  schema 2.0.0 reference datasets with executed before/after evidence.
- Vertical Work/Energy drawers on desktop; bottom-navigation sheets on mobile.
- One model registry and eleven gallery models, including two licensed hotels
  with unresolved envelopes, West Riverside Hospital (geometry-only), and
  Sixty5 (geometry-only after the plot-marker floor-area fix).
- Resumable 75-row pilot: 71 records, 4 exclusions, full provenance/assumptions.
- Reviewed 0.1.0-pilot stored outside git; streaming bulk JSON, immutable record
  URLs, read-only filter/pagination API, dictionary and /corpus browser.

## Remaining external requirements

- ANCH-03: no Korean building IFC with sufficient source bytes and reuse rights.
- SWEEP-01: actual account daily quota not established. Successful bounded pilot
  throughput and completeness do not establish the ceiling or authorize a full sweep.
- User answered "nope" when asked whether either missing input was available.
  Do not repeat the question or relabel these requirements complete.

## Decisions

- User approved bilingual full wrapping and the recommended regional climate basis.
- User asked for Phase3 parallel work and completion of all phases as quickly as possible.
- Corpus pilot scope is explicit; calibration and peer benchmarking remain next-milestone work.
- Publishing review keeps register-derived rights separate from curated model licences.
- Root owns final integration; unrelated settings/GSD runtime changes are preserved.

## Verification

Full units5,656passed+4existing skips; subsequent focused tests59passed; TypeScript
passed. Browser failures from stale drawer/model assumptions were fixed and rerun.
See phase verification reports and docs/04_Agent-Handoffs/CURRENT.md for release evidence.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260916-0bz | Move published reference-building GLBs out of public/ into blob or CDN storage so model twelve does not hit a third Vercel ceiling | 2026-09-16 | 9965c9d | [260916-0bz-move-published-reference-building-glbs-o](./quick/260916-0bz-move-published-reference-building-glbs-o/) |

## Session continuity

Last session: 2026-09-16
Quick-task `260916-0bz` is COMPLETE: 52 GLBs (492,954,436 bytes) uploaded to
`bim-reference-glbs` (store_yXzRFh8Uh3cegN8p, public, icn1), removed from git
(`9965c9d`, pushed), and served in production through the rewrite — evidence
gate 200 + glTF magic + X-Vercel-Id icn1; production e2e 3/3; local restore +
751 vitest green. `public/` is now 77.29 MB (was 547.4 MB).
User deviation: Enhanced Build Machines stays ON; the clean 8 GB builder proof
is deferred (one toggle-off + one clean build completes it later).
Resume file: `.planning/.continue-here.md` + `.planning/HANDOFF.json`

## Resume

Production serves eleven models with GLBs from the `bim-reference-glbs` Blob
store (icn1) through the rewrite; 85 browser cases against the deployed site.
The build-memory cause is REMOVED: `public/` is 77.29 MB (was 549 MB of binary
geometry). Enhanced Build Machines stays ON by explicit user choice (2026-09-16),
not necessity; the clean 8 GB builder proof is deferred, not failed.
Do not archive v6.0 as fully complete while ANCH-03 and SWEEP-01 remain open.
`init.milestone-op` reports all phases complete because it counts SUMMARY files;
trust `init.manager` instead.
