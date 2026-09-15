---
gsd_state_version: "1.0"
milestone: v6.0
milestone_name: Building Energy Repository
current_phase: 03
current_phase_name: Model Anchors
status: in_progress
stopped_at: Phases1/2/5 production-verified at 79a5d1b; phases3/4 still await external evidence
last_updated: "2026-09-15T10:44:44.824Z"
last_activity: 2026-09-15
last_activity_desc: Integrated physics, vertical drawers, nine models and71-record pilot
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 12
  completed_plans: 10
  percent: 60
---

# Project State

## Current position

Phases1 and2 are verified. Phase5's reviewed pilot is stored in Neon and its
local API/browser checks pass; clean production release verification follows.
The milestone stays open because ANCH-03 and SWEEP-01 remain unmet.

## Completed outcomes

- Honest named-end-use physics, LPD/PV grade effects, shared retrofit core,
  schema2.0.0 reference datasets with executed before/after evidence.
- Vertical Work/Energy drawers on desktop; bottom-navigation sheets on mobile.
- One model registry and nine gallery models, including two licensed hotels with
  unresolved envelopes and no fabricated energy grades.
- Resumable75-row pilot:71 records,4 exclusions, full provenance/assumptions.
- Reviewed0.1.0-pilot stored outside git; streaming bulk JSON, immutable record
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

## Session continuity

Session resumed 2026-09-15 19:45. The local checkpoint was re-verified here
(5,657 unit tests, 183 local browser cases, TypeScript clean, ESLint 0 errors)
and committed as `e4e8350`, `181523a` and `79a5d1b`. Production was then
deployed and verified at `79a5d1b` — health SHA, `icn1`, corpus digest and68
production browser cases. Phases1,2 and5 are production-verified.

## Resume

Production release verification is complete. Acquire actual source/quota evidence
before closing phases3/4: ANCH-03 needs a Korean IFC/DXF with redistribution
rights, SWEEP-01 needs the account's actual daily quota. Do not archive v6.0 as
fully complete while those remain open.
