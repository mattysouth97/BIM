---
id: P2-20
title: Scenario-driven visuals — clicking retrofit measures transforms the 3D model
priority: P2
area: ux
status: done
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-09-04
use_cases: [UC-04, UC-06, UC-07, UC-08]
---

# P2-20 — Click a remodeling scenario, see the building change

User direction: "The major userflow should be clicking on the remodeling
scenarios and the visuals change accordingly." Previously the manifest was a
read-only list (knapsack recommendation only) and no code path linked a
measure to the model's appearance.

## 1. Requirement (RE)
- Clicking a measure in the retrofit manifest applies/unapplies it and the
  3D model visibly responds, per measure family.

## 2. Specification (SDD)
- `scenario-store`: session-only `appliedMeasureIds` + `toggleAppliedMeasure`
  (+ cleared on building switch / reset) — independent of the knapsack's
  budget recommendation.
- New pure `src/lib/retrofit/measure-visuals.ts`: `deriveVisualState(ids)` →
  per-family flags (walls/roof/windows/floors/hvac/lighting/solar) keyed on
  generator ID prefixes; exported tint constants.
- Visual responses:
  - windows → glass re-tinted clean low-e blue, clearer (userData.type
    "glass" targeting; materials cloned per mesh, originals restored on
    un-apply).
  - walls/roof/floors → renewed emerald tint on panels+mullions / roof
    group / slabs (procedural-building-model traverse effect).
  - hvac/lighting → `sub-mep-hvac` / `sub-mep-lighting` sub-groups recolored
    "new equipment" green (building-layers effect; ShaderMaterial animation
    children untouched).
  - solar → new `SolarPanels` component: InstancedMesh PV array on the roof
    (30° tilt, row pitch against self-shading, 600-instance cap; clears
    pitched roofs via gableHeight).
- Manifest rows are now buttons (aria-pressed, keyboard operable): emerald
  applied state distinct from the cyan in-budget marker; header shows
  applied count; footer legend explains "click to apply in 3D".

## 3. Constraints (CDD)
- **Must not**: mutate shared materials in place (clone-and-restore only);
  affect campus-mode buildings with the active building's applied set;
  change the knapsack/ROI math (visual layer only).
- **Fitness**: toggling a measure on/off round-trips the model to baseline
  (no leaked clones); building switch clears applied visuals.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [x] deriveVisualState unit-tested (ID families, combinations, unknowns)
  - [x] Store toggle/building-switch/reset semantics unit-tested
  - [x] Measure click → tint/PV response wired for all 7 families
- **Done when**: the manifest is the primary interaction surface — clicking
  scenarios visibly remodels the twin. 1265 tests, lint 0 errors, build green.

### Post-sweep re-scope (2026-09-04, green [fe5dbc])

**Nothing in this item went stale.** Every module and symbol it names survives
`397882b`: `src/lib/retrofit/measure-visuals.ts`, `deriveVisualState` (4 files),
`appliedMeasureIds` (4), `toggleAppliedMeasure` (2), `SolarPanels` (3),
`building-layers` (8), and the `sub-mep-hvac` / `sub-mep-lighting` group IDs (3 / 2).

One forward-looking caution rather than a correction: `src/lib/retrofit/**` is under
active refactor by another session as of 2026-09-04. The measure-ID **prefix** contract
is what couples this item to that code — `deriveVisualState` keys the seven visual
families off generator-ID prefixes, so a rename of measure generator IDs silently
degrades the 3D response to "no families matched" without failing a type check. If that
refactor touches generator IDs, the `deriveVisualState` family tests are the guard that
has to be re-read, not just re-run.
