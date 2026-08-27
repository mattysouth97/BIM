---
type: feature
status: partial
last_verified: 2026-08-27
---

# Twin Energy Model (the 간이 모델 path)

## Purpose

Recompute the building's energy profile **live** as the user types into step 3.
This is the calculation behind every number the twin, the status bar, the CAPEX
HUD and the report show.

## User / System Outcome

The user drags 벽체 열관류율, 창호 열관류율, SHGC, 창면적비, 지붕/바닥 열관류율
or ACH50, and the annual demand, the efficiency grade and the CO₂ intensity move
on the next render. No save, no submit, no round trip.

## Current Status

**partial — and the UI says so.** The chain works and is heavily tested, but it
is the *older simplified* path. The status bar renders a literal 「간이 모델」
badge beside the grade
([status-bar.tsx:154](../../src/components/workspace/status-bar.tsx)).

The source-traceable canonical engine
([[Traceable Energy Diagnostics]]) is **not** what step 3 calls. Grep proves the
separation: `src/lib/energy-diagnostics/*` is imported only by
`src/components/energy-diagnostics/*` plus one landing component. Nothing in
`components/viewer`, `components/workspace`, `components/report` or `src/hooks`
touches it. **Wiring the canonical engine into step 3 is the top outstanding
work item.**

## Workflow

Step 3 — 디지털 트윈, and it carries straight into step 4: `ReportStage` imports
`useEnergyMetrics` too, so the report grade and the status-bar grade are the same
number by construction.

## Architecture

```mermaid
flowchart LR
  CP["ConfigPanel<br/>6 tabs"] --> MS["material-store<br/>+ recipe-store"]
  MS --> ER[useEffectiveRecipe]
  ER --> EQ["envelopeQuantities<br/>⚠ one ring × total height"]
  EQ --> HL["calculateHeatLoss<br/>ISO 13789-style, per element ΔT"]
  CD["getClimateData(sigunguCd)"] --> HL
  HL --> AD["calculateAnnualDemand<br/>degree-day · HDD 18 / CDD 24"]
  AD --> SB[calculateSystemBreakdown]
  SB --> DF["deliveredFromDemand<br/>shared fuel split (P1-05)"]
  DF --> GR["calculateEfficiencyRating<br/>official MOTIE/KEMCO primary-energy grade"]
  DF --> CO[CO₂]
  GR --> UI["status bar · energy cards · report"]
```

`src/lib/energy/` is 20 pure modules and ~3 100 lines. Two grade concepts are
deliberately kept apart: `energy-grade.ts` is marked in-file as an
**internal colour scale, not the official rating**; the official rating is
[efficiency-rating.ts](../../src/lib/compliance/efficiency-rating.ts).
`delivered-from-demand.ts` is the single shared fuel-split and building-type
derivation, used by both the grade path and the report so they cannot disagree.

Note that `src/lib/energy/` is consumed by **both** paths: this hook path and the
canonical adapter. The physics core is shared; the *inputs and provenance* are
what differ.

## State Ownership

- `useMaterialStore` (persist `bim-material-properties`) — `MaterialProperties` per pk. `envelope-tab.tsx` writes through `overrideProperty(pk, "envelope.walls.<i>.uValue" | "envelope.windows…" | "envelope.roof…")`. `activePk` is deliberately not persisted.
- `useRecipeStore` (persist `bim-recipe-overrides`) — base recipes + overrides, including `footprintPolygon` from [[CAD Drawing Ingest]].
- `useActiveBuildingStore` — the pk and sigunguCd that scope the whole calculation.

Nothing here is server state. The entire energy model is client-side and
recomputed from stores on every render.

## Implementation

- [use-energy-metrics.ts](../../src/hooks/use-energy-metrics.ts) — the hook every twin/report number resolves through
- [envelope-quantities.ts](../../src/lib/energy/envelope-quantities.ts) — the geometry→area seam, and the known limitation below
- [heat-loss.ts](../../src/lib/energy/heat-loss.ts) · [annual-demand.ts](../../src/lib/energy/annual-demand.ts) · [system-breakdown.ts](../../src/lib/energy/system-breakdown.ts) · [delivered-from-demand.ts](../../src/lib/energy/delivered-from-demand.ts)
- [envelope-tab.tsx](../../src/components/viewer/config-tabs/envelope-tab.tsx) — the step-3 sliders
- [use-effective-recipe.ts](../../src/hooks/use-effective-recipe.ts) — the merge seam

## Relevant Tests

62 test files touch `src/lib/energy` by path. The load-bearing ones:

- [envelope-quantities.test.ts](../../src/lib/energy/__tests__/envelope-quantities.test.ts)
- [heat-loss.test.ts](../../src/lib/energy/__tests__/heat-loss.test.ts) · [annual-demand.test.ts](../../src/lib/energy/__tests__/annual-demand.test.ts)
- [delivered-from-demand.test.ts](../../src/lib/energy/__tests__/delivered-from-demand.test.ts)
- [energy-grade-normalization.test.ts](../../src/lib/energy/__tests__/energy-grade-normalization.test.ts)
- `src/hooks/__tests__/` — the hook-level derivations

## Failure Modes

- **Efficiency-unit ambiguity.** A documented historical defect: `HVAC_DEFAULTS`
  stored heating efficiency as fractions (0.85) while `annual-demand` divided by
  100, clamping to 0.5 and inflating heating consumption 70–76 %. Fixed by
  `normalizeEfficiency()` — ≤ 10 is treated as a fraction/COP as-is, > 10 as a
  percentage, bounded to [0.3, 6] so heat-pump COPs still pass. Any new
  efficiency input must go through it.
- No footprint polygon → `envelopeQuantities` reports `source: "bbox"` rather
  than fabricating a plan.
- `classifyEra` silently returns `"1990-1999"` for a blank or short date. This
  path still imports the unsafe version
  ([material-inference.ts:8](../../src/lib/material-inference.ts)); the
  traceable path uses `classifyEraExplicit` instead.

## Known Limitations

1. **`envelopeQuantities` is whole-building, not per-storey.**
   `grossWallAreaSqm = wallLengthM × totalHeight` and
   `volumeM3 = planAreaSqm × totalHeight` — one ring, one height. Per-storey
   plans therefore *cannot* move the number until this function sums per storey.
   Courtyard holes do shrink plan area and add to wall length, and a
   `footprintPolygon` with ≥ 3 outer points switches `source` from `bbox` to
   `polygon`.
2. **No below-grade heat path.** There is no ISO 13370 implementation in
   `src/lib/energy/`, so every storey is priced against outdoor air.
3. **No provenance.** Unlike the canonical model, nothing here records *where* a
   U-value came from. That is the whole reason the canonical engine exists.
4. `useEffectiveRecipe` is defined **twice** — once in
   [use-effective-recipe.ts](../../src/hooks/use-effective-recipe.ts), which
   documents itself as "THE single reactive effective-recipe hook" and warns
   against re-inlining the merge, and again, byte-equivalent, in
   [use-twin-fidelity.ts](../../src/hooks/use-twin-fidelity.ts). Two workspace
   components import the second copy. Behaviour matches today because both call
   `mergeRecipeOverrides`, but the stated single-source invariant is not enforced.

## Related Systems

[[Traceable Energy Diagnostics]] · [[Digital Twin Viewer]] · [[Retrofit Economics]] · [[Report and Export]]
