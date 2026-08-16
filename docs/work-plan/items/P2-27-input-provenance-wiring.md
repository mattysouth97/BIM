---
id: P2-27
title: Wire footprint/height provenance into the fidelity badge
priority: P2
area: viewer
status: in-review
owner: claude-fable-5-session
effort: S
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-05]
---

# P2-27 — Wire InputProvenance into the fidelity badge

`InputProvenance` (added by P2-12) is accepted by `FidelityBadge` but no call
site passes real data — every badge tooltip shows the default (no provenance
section). P2-25 added `source: 'building' | 'parcel' | null` and
`attributes.height` to the VWorld footprint result. This item derives
provenance from those real signals and threads it to all badge call sites.

## 1. Requirement (RE)

- A pure, server/test-agnostic function `deriveInputProvenance` maps available
  signals to `InputProvenance` (`footprint` / `heights` / `facade`, each
  `'measured'` or `'estimated'`).
- **footprint**: `'measured'` for `cad | ifc | building` (actual building
  outlines); `'estimated'` for `parcel` (lot boundary ≠ building, AFF-6) and
  `null` (era box).
- **heights**: `'measured'` when `ledgerHeit > 0` OR `measuredHeightM > 0` OR
  `calibrationApplied`; else `'estimated'`.
- **facade**: `'measured'` only when `calibrationApplied` (P2-12 calibration
  semantics); `'estimated'` otherwise.
- Both `FidelityBadge` instances (in `PropertiesPanel` and
  `FidelityDetailPanel`) receive the derived provenance via prop threading
  — no new fetches.

## 2. Specification (SDD) — BDD scenarios

**S1 — building source.** Given `footprintSource = 'building'`, then
`footprint = 'measured'`.

**S2 — parcel fallback.** Given `footprintSource = 'parcel'`, then
`footprint = 'estimated'` (AFF-6: lot boundary ≠ building outline).

**S3 — era box.** Given `footprintSource = null`, then
`footprint = 'estimated'`.

**S4 — VWorld height only.** Given `ledgerHeit = 0` and
`measuredHeightM = 12.5`, then `heights = 'measured'`.

**S5 — ledger height.** Given `ledgerHeit = 18`, then `heights = 'measured'`.

**S6 — calibration implies facade.** Given `calibrationApplied = true`, then
`facade = 'measured'` and `heights = 'measured'`.

**S7 — no signals.** Given all signals absent/zero, then all three fields
`'estimated'`.

## 3. Constraints (CDD)

- **May touch**: `src/lib/fidelity/input-provenance.ts` (new pure module),
  `src/components/twin/fidelity-detail-panel.tsx`,
  `src/components/workspace/properties-panel.tsx`,
  `src/components/workspace/workspace-shell.tsx`,
  `src/app/building/[id]/building-workspace.tsx`,
  `docs/work-plan/` (this file + README + glossary).
- **Must not**: add `'use client'` to any `src/lib/**` module (AFF-1); change
  `FidelityBadge` rendering or its existing props/tests; introduce new fetches
  or new Zustand stores; soften parcel → measured (AFF-6).
- **Fitness**: `pnpm vitest run` ≥ baseline; `pnpm lint` 0 errors;
  `pnpm build` green.

## 4. Evaluation (EDD)

- **Tests written first (RED → GREEN)**:
  - `src/lib/fidelity/__tests__/input-provenance.test.ts` — 13 pure-function
    truth-table cases (≥6 required by brief).
  - `src/components/workspace/__tests__/properties-panel-provenance.test.tsx`
    — 4 RTL tests mounting the REAL call site (`PropertiesPanel` with
    `footprintSource`/`ledgerHeit`/`measuredHeightM` props) asserting the badge
    tooltip shows the derived provenance (source=building → footprint measured;
    parcel → all estimated; VWorld-height-only → heights measured; default →
    all estimated). Verified to FAIL when the panel's
    `provenance={inputProvenance}` threading is removed (review fix: the
    initial call-site test rendered `FidelityBadge` directly with a literal
    and could not catch broken threading — replaced and relocated here).
- **Gates (all green)**:
  - Targeted: 25/25 tests across 3 files.
  - Full suite: 1387/1387 tests (baseline 1343 + 44 new from concurrent items;
    P2-27 adds 16 tests).
  - `pnpm lint`: 0 errors (11 pre-existing react-hooks warnings in untouched
    files).
  - `pnpm build`: Compiled successfully.
- **Call sites wired**:
  1. `PropertiesPanel` (standalone panel) — new optional props
     `footprintSource`, `ledgerHeit`, `measuredHeightM` threaded through
     `WorkspaceShell` from `LedgerWorkspace`. `calibrationApplied` resolved
     via sync `loadCalibration(buildingPk)` (no fetch).
  2. `FidelityDetailPanel` — new optional `provenance` prop forwarded to its
     inner `FidelityBadge` accordion trigger.
- **Facade signal note**: `fidelity-assessor.ts` (`assessFidelity`) tracks
  data-source breadth (hasIfcModel, hasEnergyBills, …) at the `FidelityReport`
  level — it does NOT expose a per-input facade measurement signal. The
  `calibrationApplied` flag is the correct facade signal, consistent with
  P2-12's intent (calibration overrides carry traceable source documents for
  facade/material properties). This matches the brief's specification verbatim.
- **Security/honesty**: no new data fabricated; parcel explicitly `'estimated'`
  (AFF-6); `calibrationApplied` is a pure registry lookup (null = not
  calibrated = estimated, the expected path for most buildings).
- **Done when**: badge tooltips in the twin viewer show real measured/estimated
  status for footprint, heights, and facade based on actual data sources.
