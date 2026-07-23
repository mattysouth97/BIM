---
id: P2-17
title: Make CAD upload optional — explicit skip path to the twin on the public-data footprint
priority: P2
area: ux
status: done
owner: claude-fable-5-session
effort: S
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-01, UC-04, UC-05]
---

# P2-17 — CAD-less path through the workflow

Users without a CAD drawing (DXF/DWG/PDF) were hard-blocked at the upload
stage: the `upload` forward guard only passed with a ≥3-point committed
footprint, and the stage's "Continue to Twin" button stayed disabled. But the
twin never *required* CAD — `footprintPolygon` is an optional recipe override,
and without it the viewer already renders the public-data footprint
(building-ledger dimensions / VWorld cadastral polygon via
`use-building-footprint`). CAD only raises fidelity.

## 1. Requirement (RE)
- A user with no CAD file must be able to proceed from upload → twin/report
  through an explicit, informed choice — not silently, and not by weakening
  the guard for everyone.

## 2. Specification (SDD)
- `StageGuardContext` gains `cadSkipped?: boolean`; the `upload` guard passes
  with a valid footprint OR an explicit skip.
- Workflow store gains a transient per-building `cadSkipped` map +
  `skipCad(buildingPk)`. Deliberately NOT persisted (excluded from
  partialize), mirroring the transient footprint override it substitutes for:
  after a reload both paths retreat to upload via `WorkflowStageRecovery`
  (P2-16), where re-skipping is one click.
- Upload stage gains a "CAD 없이 계속 / Continue without CAD" button (always
  enabled once a building is active) plus a caveat line that the twin will use
  the less precise public-data footprint. No footprint override is written on
  skip, so P2-13 accuracy-path badges keep reporting the honest source.
- Stepper and recovery build their guard context with the active building's
  skip flag — a skip on building A never unlocks building B.

## 3. Constraints (CDD)
- **May touch**: `stages.ts` guard/context, workflow store, upload stage UI,
  stepper/recovery guard-context construction.
- **Must not**: persist the skip flag; invent a fake footprint override;
  change existing action signatures.
- **Fitness**: skip advances to twin with zero footprint override written;
  guard still blocks users who neither uploaded nor skipped.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [x] Upload guard passes on explicit skip (unit-tested, falsy skip ignored)
  - [x] Skip button advances upload → twin, records the per-building flag,
        writes no footprint override; blocked with an error when no building
        is active
  - [x] Stepper forward jumps (twin/report) unlock after skip; lock reason
        text now mentions both paths
  - [x] Reload behavior unchanged: skip is transient, recovery retreats to
        upload; another building's skip is not accepted as proof
- **Done when**: a CAD-less user reaches the twin/report on public-data
  geometry via one explicit click, with no regression for the CAD path.
