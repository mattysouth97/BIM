---
phase: 24-energy-breakdown-dashboard
plan: 01
subsystem: ui
tags: [recharts, shadcn-chart, energy, dashboard, zustand, react-hooks]

# Dependency graph
requires:
  - phase: 23-per-floor-energy-model
    provides: useEnergyBreakdown hook returning SystemBreakdown with absolute kWh/yr fields + DataSource provenance

provides:
  - recharts 3.8.1 installed in dependencies
  - src/components/ui/chart.tsx (shadcn ChartContainer / ChartTooltip / ChartTooltipContent)
  - src/components/viewer/energy-breakdown-chart.tsx — horizontal BarChart showing HVAC/Lighting/DHW/Plug attribution with amber estimated badge
  - src/components/viewer/config-panel.tsx — fifth "Energy" tab (value="energy") hosting EnergyBreakdownChart

affects: [25-floor-energy-heatmap, 26-equipment-panel, plan-02-human-verify]

# Tech tracking
tech-stack:
  added:
    - recharts@3.8.1
    - shadcn chart (src/components/ui/chart.tsx — ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend)
  patterns:
    - useMemo([breakdown, isKo]) for chart data derivation — deps never include buildingPk or store slices directly
    - LabelList formatter typed as (v: string | number | boolean | null | undefined) to match recharts RenderableText
    - anyEstimated flag as rendering invariant — amber banner when ANY DataSource === "estimated-ratio"
    - All hooks called before early return (Rules of Hooks compliance)

key-files:
  created:
    - src/components/viewer/energy-breakdown-chart.tsx
    - src/components/ui/chart.tsx
  modified:
    - src/components/viewer/config-panel.tsx
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "LabelList formatter param typed as full RenderableText union (string|number|boolean|null|undefined) — recharts 3.x LabelFormatter is stricter than plan's (v: number) annotation"
  - "useMemo placed before null guard to satisfy React Rules of Hooks — plan's early-return-first ordering corrected"
  - "chartConfig uses hsl(var(--chart-N)) colors — ChartStyle injects --color-{key} CSS vars at runtime"

patterns-established:
  - "Recharts via shadcn ChartContainer: always use ChartContainer wrapper for CSS variable theming; never bypass with raw ResponsiveContainer"
  - "RenderableText pattern: LabelList.formatter must accept string|number|boolean|null|undefined — not just number"

requirements-completed:
  - EA-02

# Metrics
duration: 25min
completed: 2026-04-12
---

# Phase 24 Plan 01: Energy Breakdown Dashboard Summary

**Horizontal recharts BarChart in a 5th ConfigPanel tab showing HVAC/Lighting/DHW/Plug kWh attribution with amber ASHRAE-ratio badge, consuming Phase 23's useEnergyBreakdown hook**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-12T00:20:00Z
- **Completed:** 2026-04-12T00:45:00Z
- **Tasks:** 3
- **Files modified:** 5 (package.json, pnpm-lock.yaml, chart.tsx, energy-breakdown-chart.tsx, config-panel.tsx)

## Accomplishments

- recharts 3.8.1 installed; shadcn chart primitive (chart.tsx) created with ChartContainer / ChartTooltip / ChartTooltipContent
- EnergyBreakdownChart component built: horizontal BarChart, percentages derived in useMemo from absolute kWh/yr fields, amber "Estimated / 추정 비율" banner rendered as rendering invariant when any DataSource is "estimated-ratio"
- Fifth "Energy / 에너지" tab added to ConfigPanel with BarChart2 icon, hosting EnergyBreakdownChart; existing 4 tabs untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Install recharts + shadcn chart primitive** - `a4cc27c` (chore)
2. **Task 2: Build EnergyBreakdownChart component** - `c4a897f` (feat)
3. **Task 3: Add Energy tab to ConfigPanel** - `64e54d2` (feat)

## Files Created/Modified

- `src/components/ui/chart.tsx` — shadcn ChartContainer / ChartTooltip / ChartTooltipContent / ChartLegend wrappers (created by npx shadcn@latest add chart)
- `src/components/viewer/energy-breakdown-chart.tsx` — EnergyBreakdownChart component (new, 146 lines)
- `src/components/viewer/config-panel.tsx` — added BarChart2 + EnergyBreakdownChart imports, 5th TabsTrigger + TabsContent
- `package.json` — recharts@3.8.1 added to dependencies
- `pnpm-lock.yaml` — lock file updated

## shadcn chart CSS variables

`npx shadcn@latest add chart` skipped globals.css — the `--chart-1` through `--chart-5` CSS variables were already present in both the `@theme inline` block and `:root` / `.dark` blocks from a prior shadcn setup. No new CSS variables were added.

## EnergyBreakdownChart prop signature

```typescript
interface EnergyBreakdownChartProps {
  buildingPk: string;
}

export function EnergyBreakdownChart({ buildingPk }: EnergyBreakdownChartProps)
```

## Decisions Made

- **LabelList formatter type:** Plan specified `(v: number) => string` but recharts 3.x `LabelFormatter` is `(label: RenderableText) => RenderableText` where `RenderableText = string | number | boolean | null | undefined`. Fixed to `(v: string | number | boolean | null | undefined) => string` to satisfy TypeScript.
- **useMemo before null guard:** Plan instructed an early return before useMemo, but that violates React Rules of Hooks. Restructured: useMemo always runs first, null guard placed after all hooks. The useMemo handles `!breakdown` internally by returning `[]`.
- **chartConfig colors:** Used `hsl(var(--chart-N))` in chartConfig so ChartStyle injects `--color-hvac`, `--color-lighting`, `--color-dhw`, `--color-plugLoads` CSS variables at render time. Bar `Cell` fills use `var(--color-{key})`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved useMemo before early return to fix Rules of Hooks violation**
- **Found during:** Task 2 (EnergyBreakdownChart implementation)
- **Issue:** Plan specified early return `if (!breakdown) return <Skeleton/>` before the `useMemo` call. Calling a hook after a conditional return violates React Rules of Hooks and would cause a React runtime error.
- **Fix:** Moved `useMemo` to run unconditionally before the null guard. The memo handles `!breakdown` by returning `[]`. Null guard placed after all hooks.
- **Files modified:** src/components/viewer/energy-breakdown-chart.tsx
- **Verification:** pnpm build passes; no React hook ordering warnings.
- **Committed in:** c4a897f (Task 2 commit)

**2. [Rule 1 - Bug] Fixed LabelList formatter type to match recharts RenderableText**
- **Found during:** Task 2 — TypeScript build error
- **Issue:** `LabelFormatter = (label: RenderableText) => RenderableText` where `RenderableText = string | number | boolean | null | undefined`. The plan's `(v: number) => string` annotation is incompatible.
- **Fix:** Changed formatter signature to `(v: string | number | boolean | null | undefined) => string` with a `typeof v === "number"` guard.
- **Files modified:** src/components/viewer/energy-breakdown-chart.tsx
- **Verification:** pnpm build passes with no type errors.
- **Committed in:** c4a897f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in plan's type/hook-order assumptions)
**Impact on plan:** Both fixes required for correctness. No scope creep; all plan invariants preserved.

## Issues Encountered

- Build failed twice on `LabelList.formatter`: first attempt used `string | number | undefined`, second used `string | number | null | undefined` — both missing `boolean`. Resolved by reading recharts type definitions directly (`node_modules/recharts/types/component/Label.d.ts`).

## Known Stubs

None — the EnergyBreakdownChart renders live data from Phase 23's `useEnergyBreakdown` hook. All four DataSource values are `"estimated-ratio"` (hardcoded in `calculateSystemBreakdown` lines 130-133 of system-breakdown.ts). The amber banner is the correct intended display until Phase 26 introduces sub-metered "actual" values.

## User Setup Required

None — no external service configuration required.

## Known Gaps (deferred to Plan 02 human-verify checkpoint)

- **Camera-rotation isolation:** React DevTools Profiler verification (SC4) — requires a running browser session. ConfigPanel is a DOM overlay outside `<Canvas>`, so isolation is architecturally guaranteed, but profiler confirmation is deferred.
- **Slider reactivity:** Material-store slider → chart re-render verification (SC3) requires live browser interaction.
- **Tab overflow at 384px:** Visual verification that 5 tabs fit in the w-96 panel without text wrapping. Short Korean "에너지" (3 chars) + icon should fit at ~76px/tab.

## Next Phase Readiness

- EA-02 requirement delivered: energy distribution chart is live with amber estimated labels
- Phase 25 (floor energy heatmap) can reference `useEnergyBreakdown` — the hook's `perFloor` array and stability guarantee are already wired
- Plan 02 human-verify checkpoint: open browser, navigate to Energy tab, confirm chart renders with amber badge and 4 bars summing to 100%

---
*Phase: 24-energy-breakdown-dashboard*
*Completed: 2026-04-12*
