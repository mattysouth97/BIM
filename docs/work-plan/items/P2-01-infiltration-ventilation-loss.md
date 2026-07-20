---
id: P2-01
title: Add infiltration/ventilation heat loss to energy model
priority: P2
area: energy
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-05, UC-06]
---

# P2-01 — Add infiltration/ventilation heat loss to energy model

## 1. Requirement (RE)
- **Problem**: `calculateHeatLoss` (src/lib/energy/heat-loss.ts:56-106) sums only Walls/Windows/Roof/Ground-Floor. `materials.envelope.airtightness.ach50` (src/lib/material-types.ts:79-83; inferred per era in src/lib/material-inference.ts:101,218-220) and `hvac.ventilation { type, heatRecoveryEfficiency, airflowRate }` (src/lib/material-types.ts:98-102) exist but are never consumed by the thermal balance. (Brief cited annual-demand.test.ts:53,58 — corrected: fixture fields are at src/lib/energy/__tests__/annual-demand.test.ts:35 (ach50) and :40 (ventilation).)
- **Impact**: Korean code-minimum apartments lose ~10-30% of heat to air exchange; all heating-demand results are systematically low, and HRV/weatherization retrofits (hvac-retrofits.ts assumes a flat 15% saving at :94) cannot be modeled honestly.
- **Use case**: As a retrofit analyst I want infiltration and ventilation losses included with HRV efficiency honored so that airtightness and HRV measures show real, differentiated savings.

## 2. Specification (SDD)
- **Context pack** (read in order): src/lib/energy/heat-loss.ts; src/lib/energy/annual-demand.ts; src/lib/material-types.ts:75-108; src/lib/material-inference.ts:95-105,215-225; src/lib/energy/__tests__/heat-loss.test.ts; src/lib/energy/__tests__/annual-demand.test.ts.
- **BDD scenarios**:
  1. Given a building with ach50=3.0, natural ventilation, no HRV, When heat loss is computed, Then an "Infiltration/Ventilation" element appears with Q = 0.34 × ACH × V × ΔT (W) and total increases by that amount.
  2. Given ventilation.type="heat-recovery" with heatRecoveryEfficiency=0.8, When computed, Then the ventilation portion is reduced by the efficiency (effective ACH × (1−η) on the mechanical share).
  3. Given ach50=0 and airflowRate=0, When computed, Then the element is zero and results equal the pre-change baseline (backward compatibility).
  4. Given the standard 15-floor test fixture (annual-demand.test.ts:53-75), When computed, Then infiltration share of total heat loss falls within 5-35% (sanity band, not a fabricated constant).
- **Formula**: Q_inf = 0.34 × ACH × V × ΔT, V = footprintArea × floorHeight × floors (m³); ACH derived from ach50 via n≈ach50/20 (standard rule of thumb, document as assumption) plus mechanical airflowRate when present.

## 3. Constraints (CDD)
- **Design constraints**: pure functions only in src/lib/energy (no 'use client', no React); keep `ElementHeatLoss` shape — add a new element, do not break existing consumers (report-stage.tsx:243,383 reads ach50 separately); document every empirical constant (0.34, /20 rule) as an inline assumption comment.
- **May touch**: src/lib/energy/heat-loss.ts, src/lib/energy/annual-demand.ts (if signature/aggregation needed), src/lib/energy/__tests__/**, src/lib/energy/eco2-export.ts (only if the new element must surface there).
- **Must not**: change U-values, climate data, or retrofit measure definitions; no UI changes; do not alter golden-corpus fixtures in the same change (see P2-05).
- **Fitness functions**: heat-loss.test.ts fixtures with zero airtightness reproduce old totals exactly; no new 'use client' in src/lib; `HeatLossResult.elements` still an array of the same interface.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: src/lib/energy/__tests__/heat-loss.test.ts — new cases for scenarios 1-4 above; annual-demand.test.ts — assert heating demand rises when ach50>0 and drops when HRV efficiency rises.
- **Gates**: `pnpm test -- heat-loss annual-demand`; `pnpm test`; `pnpm lint`; `pnpm build`.
- **Security / honesty checklist**: no fabricated ACH values — every path derives from model fields or documented era defaults; assumptions commented; no silently clamped negatives.
- **Acceptance criteria**:
  - [ ] Infiltration/ventilation element in every HeatLossResult
  - [ ] HRV efficiency reduces the ventilation term
  - [ ] Zero-airtightness backward compatibility holds
  - [ ] All 902 existing tests still pass (or are updated with justification)
- **Done when**: heating demand includes a sourced infiltration/ventilation term and HRV retrofits produce measurable, test-covered demand deltas.
