---
id: P1-08
title: State consistency — one effective-recipe hook, guard-aware stepper, real active building
priority: P1
area: state
status: done
owner: claude-fable-5-ultrawork
effort: L
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-05, UC-06, UC-08]
---

# P1-08 — State consistency

Four related store/architecture defects. (a) is a silent data-loss bug; (b)–(d)
are consistency faults that make different panels compute different answers for
the same building. Suggested order: (c) → (a) → (d) → (b), because (d)'s
call-site parity fix wants the active-building store from (c).

## 1. Requirement (RE)

- **Problem**:
  - **(a) Effective-recipe merge duplicated 5× and diverged — uploaded CAD
    polygons silently dropped.** The canonical merge
    `mergeRecipeOverrides` handles `footprintPolygon`
    (`src/lib/procedural/recipe.ts:222-237`, polygon line :230) and is used by
    the store getter (`src/store/recipe-store.ts:45-51`). But **five** hand-copied
    merge blocks exist that do NOT merge `footprintPolygon`:
    `src/hooks/use-energy-metrics.ts:56-83`,
    `src/hooks/use-energy-breakdown.ts:47-74` (its own SYNC NOTE at :9-11 admits
    the copy-paste contract),
    `src/components/report/report-stage.tsx:95-122`,
    `src/components/workspace/properties-panel.tsx:92-119`, and — correction to
    the brief, which counted four copies — a fifth at
    `src/components/viewer/energy-cards.tsx:154-178`.
    CAD uploads write the polygon via
    `setOverride(buildingPk, "footprintPolygon", rings)`
    (`src/components/upload/upload-stage.tsx:227`), so the 3D geometry (which
    reads through `getEffectiveRecipe` /
    `src/components/viewer/config-tabs/building-tab.tsx:28`) sees it, while every
    energy, breakdown, report, and export consumer silently computes from the
    rectangular base footprint.
  - **(b) Workflow guards bypassed by the stepper.**
    `src/components/workspace/workflow-stepper.tsx:47` (path correction: brief
    omitted the directory; actual path is `src/components/workspace/…`) calls
    `useWorkflowStore.getState().setStage(stageId)` directly — `setStage` is a
    raw setter (`src/store/workflow-store.ts:36`). The tested DAG guard
    (`upload` requires a ≥3-point `footprintPolygon`,
    `src/lib/workflow/stages.ts:29-32`) only fires via `advance()`
    (`src/store/workflow-store.ts:45-56`, used at `upload-stage.tsx:228`). Users
    can click "Twin"/"Report" in the stepper and skip the upload requirement;
    locked stages give no feedback about *why*.
  - **(c) Active-building resolution is an insertion-order lottery.**
    `src/hooks/use-active-building-pk.ts:20-22` returns
    `Object.keys(properties)[0]` — whichever building happened to be written to
    the material store first. Meanwhile `selection-store` already carries a
    `buildingPk` field (`src/store/selection-store.ts:33-34`) that nothing
    consults for this purpose. In multi-building (campus) sessions, every panel
    scoped by `useActiveBuildingPk()` can silently show the wrong building.
  - **(d) `useEnergyMetrics` call-site parity broken.**
    `src/components/report/report-stage.tsx:89`,
    `src/components/viewer/energy-cards.tsx:147`, and
    `src/components/workspace/properties-panel.tsx:80` call
    `useEnergyMetrics(buildingPk)` with no `sigunguCd`, while
    `src/components/workspace/status-bar.tsx:57` passes it — so the PDF report
    computes Seoul-default HDD (`getClimateData(undefined)` at
    `src/hooks/use-energy-metrics.ts:89`) while the status bar computes regional
    values for the same building. Correction/amplification: the only `StatusBar`
    mount is `<StatusBar buildingPk="" />` at
    `src/components/workspace/workspace-shell.tsx:124`, which also omits
    `sigunguCd` — so today **no** production call site actually supplies it;
    the regional value exists only in `src/app/building/[id]/page.tsx:32-41`
    (`decodeBuildingId`) and is never threaded into the workspace. Also,
    `report-stage.tsx:90-91` fetches `useActualEnergy(buildingPk)` but never
    passes the data into `useEnergyMetrics`, so `predictedVsActualDelta`
    (`src/hooks/use-energy-metrics.ts:106-115`) is structurally always `null`
    in the report.
- **Impact**: Uploaded CAD footprints produce beautiful 3D twins whose energy
  numbers, grades, benchmarks, and PDF reports all describe the *old*
  rectangular footprint (silent data loss presented as correct results); users
  skip mandatory workflow steps; campus sessions show crossed building data;
  regional climate is never applied and the predicted-vs-actual widget is dead
  code in the report.
- **Use case**: As a user who uploads a CAD footprint, I want every energy
  number, grade, and report to describe that footprint; as a campus user, I want
  every panel to show the building I actually selected; as a workflow user, I
  want locked steps to tell me what is missing.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/lib/procedural/recipe.ts:214-242` (`mergeRecipeOverrides`) +
     `src/lib/procedural/types.ts` (`BuildingRecipe`, `RecipeOverrides`)
  2. `src/store/recipe-store.ts` (full file — note the infinite-loop warning
     pattern documented in `src/hooks/use-energy-metrics.ts:5-6` and
     `use-energy-breakdown.ts:5-7`: never call `getEffectiveRecipe` inside a
     Zustand selector)
  3. The five merge copies (RE (a)) + `src/components/upload/upload-stage.tsx:212-229`
  4. `src/hooks/use-active-building-pk.ts`, `src/store/selection-store.ts`,
     `src/store/material-store.ts:18-62`, `src/app/building/[id]/page.tsx`
     (sigunguCd source), `src/components/viewer/building-scene.tsx:237`
     (`buildingPk = String(title.mgmBldrgstPk || "unknown")`)
  5. `src/lib/workflow/stages.ts` (full file), `src/store/workflow-store.ts`
     (full file), `src/components/workspace/workflow-stepper.tsx` (full file),
     `src/store/__tests__/workflow-store.test.ts` (existing guard tests)
  6. `src/hooks/use-energy-metrics.ts` (full file) + all four call sites +
     `src/hooks/use-energy-delta.ts:48-53`
- **BDD scenarios**:
  1. *(a)* Given a base recipe with a rectangular footprint and a
     `footprintPolygon` override set via `setOverride`, when
     `useEnergyMetrics`, `useEnergyBreakdown`, the report stage, the properties
     panel, and the ECO2 export compute, then every consumer uses the polygon
     footprint (total floor area / envelope derived from the override), and
     `grep` finds zero hand-copied merge blocks.
  2. *(b)* Given the workflow at `upload` with no `footprintPolygon`, when the
     user clicks "Twin" or "Report" in the stepper, then navigation is blocked
     and a reason (e.g. "도면 업로드 필요 / CAD footprint required") is
     surfaced; given the polygon present, when clicked, then navigation
     proceeds. Given a completed earlier stage, when clicking backward, then
     navigation always works (retreat is unguarded).
  3. *(c)* Given two buildings in the material store, when the user selects a
     search result (navigation to `/building/[id]`), then the active-building
     store is set to that building's `mgmBldrgstPk` and every panel scoped by
     the active-building hook shows that building — regardless of material-store
     insertion order.
  4. *(d)* Given a building in Busan (non-Seoul sigunguCd), when the status bar,
     energy cards, properties panel, and PDF report render, then all compute
     HDD/CDD from the same regional climate; given actual consumption data
     present, when the report renders, then `predictedVsActualDelta` is
     non-null and shown.
  5. *(a,b combined regression)* Given a CAD polygon uploaded, when the user
     advances via the stepper to Report, then the report's efficiency rating
     area (`report-stage.tsx:189-193`) reflects the polygon area.

## 3. Constraints (CDD)

- **Design constraints**:
  - (a) Create ONE reactive hook — `useEffectiveRecipe(pk)` (suggested home:
    `src/hooks/use-effective-recipe.ts`) — that subscribes to
    `baseRecipes[pk]` and `overrides[pk]` as separate slices and merges in
    `useMemo` via `mergeRecipeOverrides` (never a hand copy). The
    subscribe-to-slices-then-useMemo pattern from
    `use-energy-metrics.ts:50-55` MUST be preserved — do not call
    `getEffectiveRecipe()` inside a selector (infinite-loop pitfall documented
    at `use-energy-metrics.ts:5` and `use-energy-breakdown.ts:6-7`). Delete all
    five hand copies; delete the SYNC NOTE comment in
    `use-energy-breakdown.ts:9-11` once the copy is gone.
    `mergeRecipeOverrides` stays the single merge implementation
    (`recipe.ts:222`); do not extend `RecipeOverrides` without extending it
    there too.
  - (b) Route ALL stepper navigation through guard-aware logic: add a
    guard-aware navigation path (e.g. extend the workflow store with
    `goToStage(stage, ctx)` that applies the *current* stage's forward guard
    before allowing forward jumps, and always allows backward moves), and make
    the stepper surface the lock reason (disabled state + tooltip/title). Keep
    `STAGE_GUARDS` pure and store-free (`stages.ts:17-23` comment); the stepper
    builds `StageGuardContext` from the recipe store
    (`footprintPolygon` override for the active building).
  - (c) Introduce a real active-building store (new small zustand store, e.g.
    `src/store/active-building-store.ts`, holding `buildingPk` + `sigunguCd`)
    — do NOT overload `selection-store.buildingPk`, which tracks 3D-scene
    click selection (`selection-store.ts:29-48`). Set it where a building is
    actually chosen: on search-result navigation / building-page resolution
    (`src/app/building/[id]/page.tsx`, where `decodeBuildingId` yields
    `sigunguCd` and `title.mgmBldrgstPk` yields the pk,
    `building-scene.tsx:237`). Re-implement `useActiveBuildingPk` on top of the
    new store, falling back to the legacy first-key behavior ONLY when the
    store is empty (back-compat for existing flows) — and mark that fallback
    with a TODO to remove.
  - (d) After (c), all `useEnergyMetrics` call sites pass `sigunguCd` from the
    active-building store (status-bar, report-stage, properties-panel,
    energy-cards, and `use-energy-delta` pass-through); pass
    `useActualEnergy(buildingPk).data` into `useEnergyMetrics` at
    `report-stage.tsx:89-91` so `predictedVsActualDelta` computes.
  - Keep all hooks' null-on-missing-data behavior (`use-energy-metrics.ts:87`).
- **May touch**:
  - New: `src/hooks/use-effective-recipe.ts`, `src/store/active-building-store.ts`
  - `src/hooks/use-energy-metrics.ts`, `src/hooks/use-energy-breakdown.ts`,
    `src/hooks/use-active-building-pk.ts`, `src/hooks/use-energy-delta.ts`
  - `src/components/report/report-stage.tsx`,
    `src/components/workspace/properties-panel.tsx`,
    `src/components/viewer/energy-cards.tsx`,
    `src/components/workspace/status-bar.tsx`,
    `src/components/workspace/workspace-shell.tsx` (StatusBar mount, :124)
  - `src/components/workspace/workflow-stepper.tsx`,
    `src/store/workflow-store.ts`, `src/lib/workflow/stages.ts` (additive only
    — e.g. guard-reason metadata)
  - `src/app/building/[id]/page.tsx` (set active building on resolution)
  - Tests under `src/hooks/__tests__/`, `src/store/__tests__/`,
    `src/components/**/__tests__/`
- **Must not**:
  - Do not change `mergeRecipeOverrides` semantics or `RecipeOverrides` shape
    (coordinate with P1-05, which also edits `use-energy-metrics.ts` — land
    sequentially, not in parallel branches).
  - Do not remove the `StageGuardContext` purity rule (no store imports in
    `stages.ts`).
  - Do not persist the active-building store to localStorage unless hydration
    is handled (mirror the `useHydration` pattern at
    `workflow-stepper.tsx:21-31` if persisted).
  - Do not break the `useEnergyBreakdown` referential-stability guarantee
    (`use-energy-breakdown.ts:28-31`) — the heatmap depends on it.
- **Fitness functions**:
  - `grep -rn "overrides.footprintWidth" src` → exactly 1 match
    (`src/lib/procedural/recipe.ts`).
  - `grep -rn "getEffectiveRecipe()" src/components src/hooks` inside selector
    callbacks → 0 matches (selector must return slices, not merged objects).
  - `grep -n "Object.keys(properties)" src/hooks/use-active-building-pk.ts` →
    0 matches outside the legacy fallback branch.
  - All `useEnergyMetrics(` call sites pass ≥ 2 arguments where an active
    building is resolved (grep + read).
  - `workflow-stepper.tsx` contains no direct `setStage(` call.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/hooks/__tests__/use-effective-recipe.test.ts(x)` (new): merges all
    override kinds including `footprintPolygon`; returns base when no
    overrides; undefined when no base; referential stability across re-renders
    with unchanged deps.
  - `src/hooks/__tests__/use-energy-metrics.test.ts(x)` (new/extend) —
    **regression test for (a)**: set `footprintPolygon` override via
    `useRecipeStore.setOverride` (as `upload-stage.tsx:227` does), assert
    metrics reflect the polygon footprint (e.g. floor area / demand differ
    from the rectangular base). This test must FAIL before the fix.
  - `src/store/__tests__/workflow-store.test.ts` (extend — file exists):
    `goToStage` forward jump blocked by failing guard, allowed by passing
    guard; backward jump always allowed; guard context with
    `footprintPolygon` rings < 3 points blocks.
  - `src/components/workspace/__tests__/workflow-stepper.test.tsx` (new):
    stepper click on a locked stage does not change stage and exposes the
    reason; click on an unlocked stage navigates.
  - `src/store/__tests__/active-building-store.test.ts` (new) +
    `use-active-building-pk` tests: store value wins over insertion order;
    legacy fallback when store empty.
  - `src/hooks/__tests__/use-energy-metrics.test.ts(x)`: `sigunguCd` plumbed →
    different HDD than default; `actualConsumption` passed →
    `predictedVsActualDelta` non-null with correct sign
    (`use-energy-metrics.ts:106-115`).
- **Gates**:
  - `pnpm test -- src/hooks src/store src/components`
  - `pnpm test` (full suite green — 902+ tests)
  - `pnpm lint`
  - `pnpm build`
- **Security / honesty checklist**:
  - No fabricated metrics: null paths must stay null when materials/recipe are
    absent.
  - Lock reasons shown to users must match the real guard condition
    (`stages.ts:29-32`) — no hard-coded strings divorced from guard logic.
  - The regression test for (a) must genuinely fail pre-fix (prove it in the
    PR description).
- **Acceptance criteria**:
  - [x] (a) `useEffectiveRecipe(pk)` is the only merge path in hooks/components;
        five hand copies deleted (a **sixth**, missed by the review, was found by the
        fitness grep in `building-layers.tsx` and deleted too); footprintPolygon
        regression test passes.
  - [x] (b) Stepper navigation is guard-aware with visible lock reasons;
        direct `setStage` gone from the stepper.
  - [x] (c) Active-building store set on building selection; panels no longer
        depend on material-store insertion order.
  - [x] (d) All `useEnergyMetrics` call sites pass `sigunguCd`; report passes
        actual consumption so `predictedVsActualDelta` renders.
  - [x] New tests pass; full suite, lint, build green.
- **Done when**: one merge implementation serves every consumer, the stepper
  cannot skip guards, panels track the user-selected building, and all energy
  consumers compute from identical inputs.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- Landed in the suggested order (c)→(a)→(d)→(b). New: `src/store/active-building-store.ts`
  (pk + sigunguCd, not persisted, set on building-page resolution),
  `src/hooks/use-effective-recipe.ts` (canonical merge via `mergeRecipeOverrides`,
  slice-subscribe + useMemo, referentially stable), `useActiveSigunguCd()` helper.
- **Six** (not five) hand-copied merge blocks deleted — the extra one in
  `src/components/viewer/building-layers.tsx:49-61` (heatmap sizing) was caught by the
  fitness grep; may-touch extended to that file under the item's own fitness mandate.
- (b): `stages.ts` gains pure `getBlockingStage` + `STAGE_LOCK_REASONS`; store gains
  `goToStage` (backward always allowed; forward requires every intermediate guard);
  stepper disables locked stages with the real guard reason (도면 업로드 필요 / CAD
  footprint required) — no `setStage` call remains in the stepper.
- (d): report-stage now passes `sigunguCd` + `actual.data` (predictedVsActualDelta no
  longer structurally null); properties-panel/energy-cards pass `sigunguCd`; status-bar
  falls back to the active building's sigunguCd when its prop is absent.
- **Spec correction (BDD 1)**: the degree-day engine does not consume `footprintPolygon`
  numerically — the honest regression surface is the effective-recipe *object* reaching
  consumers (ECO2/JSON exports, heatmap, future polygon-aware physics), proven by the
  `useEffectiveRecipe` polygon test; energy numbers themselves change only via
  width/depth overrides.
- Gates: targeted 73/73 (8 files) · `pnpm test` **1005 passed / 1 skipped** · `pnpm lint`
  0 errors · `pnpm build` green · fitness greps: exactly 1 `overrides.footprintWidth`
  (recipe.ts), 0 `setStage(` in stepper, legacy `Object.keys(properties)` only in the
  documented fallback branch.
- Test-infra note: RTL auto-cleanup doesn't run under vitest with globals off — the
  stepper test registers `afterEach(cleanup)` explicitly.
