# Phase 24: Energy Breakdown Dashboard — Research

**Researched:** 2026-04-12
**Domain:** Recharts bar/donut chart inside shadcn/ui config panel; memoization to prevent R3F render-thrash; TypeScript discriminated union for estimated-ratio labels
**Confidence:** HIGH (all integration points verified against codebase; recharts version confirmed against npm registry)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EA-02 | Energy breakdown dashboard displays system-level distribution (HVAC, lighting, plug loads, DHW) as a chart with percentage attribution | Recharts BarChart + shadcn ChartContainer pattern; `useEnergyBreakdown` hook consuming `SystemBreakdown` from Phase 23 |
</phase_requirements>

---

## Summary

Phase 24 adds an energy breakdown chart to the existing `ConfigPanel` — a bar or donut showing HVAC/lighting/DHW/plug attribution percentages that update when material property sliders change and do not re-render during camera rotation.

The chart lives in the existing `ConfigPanel` tab system (`src/components/viewer/config-panel.tsx`) as a new **"Energy" tab** — the fifth tab alongside Building / Envelope / Systems / Layers. It renders `<EnergyBreakdownChart buildingPk={buildingPk} />`, a thin component that calls `useEnergyBreakdown(buildingPk)` (delivered by Phase 23) and renders via `<ChartContainer>` wrapping a Recharts `<BarChart>`.

The "amber estimated label" requirement is enforced at the TypeScript level via a discriminated union on `EnergyBreakdownItem.source: EnergyDataSource`. Any component that renders a value with `source === "estimated-ratio"` must co-render an amber `<Badge>`. This is checked at render-time by a required prop — not by convention. The UI treatment follows the existing `EnergyCards` provenance pattern exactly.

Camera-rotation isolation follows the established `useEnergyMetrics` pattern: subscribe to individual stable Zustand primitives, derive output in `useMemo`, and ensure no Three.js `useFrame` callback can invalidate the memo's dependencies.

**Primary recommendation:** Install `recharts@^3.8.1` + `npx shadcn@latest add chart`, add a fifth "Energy" tab to `ConfigPanel`, and implement `<EnergyBreakdownChart>` using the existing `EnergyDataSource` type from PITFALLS.md Pitfall 3.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | `^3.8.1` | BarChart, PieChart (donut), XAxis, YAxis, Tooltip, Cell | shadcn/ui's official chart primitive is built on Recharts; `npx shadcn add chart` installs `ChartContainer`/`ChartTooltip` wrappers that use Recharts internally. 3.8.1 is the current release (verified npm registry 2026-04-12). React 19 compat confirmed (recharts/recharts#4558). |

**Current status:** recharts is NOT YET INSTALLED in this project. Wave 0 must install it.

### Supporting (already installed — no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `radix-ui` | `^1.4.3` | Tabs primitive (already powers `ConfigPanel`) | Tabs component already exists at `src/components/ui/tabs.tsx` — no additional install |
| shadcn `Badge` | built-in | Amber "estimated" label, blue "actual" label | Already in `src/components/ui/badge.tsx` |
| shadcn `Skeleton` | built-in | Loading state for chart | Already used in `energy-cards.tsx` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts via shadcn chart | Chart.js / react-chartjs-2 | Canvas renderer; shadcn chart system is SVG-based. Canvas requires separate theming; SVG is correct for ≤15 data points |
| Recharts via shadcn chart | Tremor | Also Recharts-based but adds its own abstraction. This project uses raw shadcn primitives — Tremor would create a mixed component system |
| shadcn `ChartContainer` wrapper | Raw Recharts imports | Wrapper handles CSS variable color theming (`hsl(var(--chart-N))`), tooltip positioning, legend — use wrapper exclusively |

**Installation (Wave 0 task):**

```bash
pnpm add recharts@^3.8.1
npx shadcn@latest add chart
```

No `@types/recharts` needed — Recharts 3.x ships its own TypeScript definitions.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/viewer/
│   ├── config-panel.tsx               # ADD "energy" tab (5th tab)
│   ├── energy-breakdown-chart.tsx     # NEW — chart component
│   └── config-tabs/
│       └── energy-tab.tsx             # NEW — tab wrapper (optional, may inline in config-panel)
├── hooks/
│   └── use-energy-breakdown.ts        # Delivered by Phase 23 — consume here
├── lib/energy/
│   └── system-breakdown.ts            # Delivered by Phase 23 — SystemBreakdown type
└── components/ui/
    └── chart.tsx                      # Added by npx shadcn add chart
```

### Pattern 1: ChartContainer + BarChart (recommended for this phase)

A horizontal bar chart suits the 4-category breakdown better than a donut for a narrow panel (w-96). The `ChartContainer` wrapper applies the Tailwind v4 CSS variable color system (`--chart-1` through `--chart-4`).

```typescript
// src/components/viewer/energy-breakdown-chart.tsx
// Source: shadcn/ui chart docs + recharts BarChart API

"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnergyBreakdown } from "@/hooks/use-energy-breakdown";
import { useAppStore } from "@/store/app-store";

interface EnergyBreakdownChartProps {
  buildingPk: string;
}

const chartConfig = {
  hvac:     { label: "냉난방 (HVAC)", color: "hsl(var(--chart-1))" },
  lighting: { label: "조명",          color: "hsl(var(--chart-2))" },
  dhw:      { label: "급탕",          color: "hsl(var(--chart-3))" },
  plug:     { label: "콘센트",        color: "hsl(var(--chart-4))" },
} satisfies ChartConfig;

export function EnergyBreakdownChart({ buildingPk }: EnergyBreakdownChartProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const breakdown = useEnergyBreakdown(buildingPk);

  // Derive chart data in useMemo — never inline in render body
  const chartData = useMemo(() => {
    if (!breakdown) return null;
    return [
      { system: isKo ? "냉난방" : "HVAC",    value: breakdown.hvacPct,     source: breakdown.hvacSource },
      { system: isKo ? "조명" : "Lighting",  value: breakdown.lightingPct, source: breakdown.lightingSource },
      { system: isKo ? "급탕" : "DHW",       value: breakdown.dhwPct,      source: breakdown.dhwSource },
      { system: isKo ? "콘센트" : "Plug",    value: breakdown.plugPct,     source: breakdown.plugSource },
    ];
  }, [breakdown, isKo]);

  if (!breakdown || !chartData) {
    return <Skeleton className="h-40 w-full rounded-md" />;
  }

  const allEstimated = chartData.every((d) => d.source === "estimated-ratio");

  return (
    <div className="space-y-2">
      {/* Amber estimated label — required when any value is estimated-ratio */}
      {allEstimated && (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-amber-400 text-amber-600 bg-amber-50 text-[10px] px-1.5"
          >
            {isKo ? "추정 비율" : "Estimated Ratio"}
          </Badge>
          <span className="text-[9px] text-muted-foreground">
            {isKo ? "ASHRAE 90.1 기반" : "Based on ASHRAE 90.1"}
          </span>
        </div>
      )}

      <ChartContainer config={chartConfig} className="h-40 w-full">
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="system" tick={{ fontSize: 10 }} width={48} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={entry.system}
                fill={Object.values(chartConfig)[i].color}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
```

### Pattern 2: ConfigPanel Fifth Tab

`config-panel.tsx` already has 4 tabs (Building / Envelope / Systems / Layers) using `radix-ui` Tabs. Add a 5th "Energy" tab with a `BarChart2` icon from lucide-react.

```typescript
// In config-panel.tsx — additive change only
import { BarChart2 } from "lucide-react";
import { EnergyBreakdownChart } from "./energy-breakdown-chart";

// Add to TabsList:
<TabsTrigger value="energy" className="gap-1 text-xs">
  <BarChart2 className="h-3.5 w-3.5" />
  {isKo ? "에너지" : "Energy"}
</TabsTrigger>

// Add TabsContent after "layers":
<TabsContent value="energy" className="mt-3">
  <EnergyBreakdownChart buildingPk={buildingPk} />
</TabsContent>
```

**Tab count concern:** 5 tabs in a w-96 panel may be tight. Use icon-only mode or reduce text labels on mobile. At 384px width with 5 equal-width tabs each tab is ~76px — sufficient for 2-char Korean labels with icon.

### Pattern 3: useEnergyBreakdown Hook (consumed from Phase 23)

Phase 24 CONSUMES this hook — it does not implement it. The hook signature expected by the chart component:

```typescript
// Produced by Phase 23 — src/hooks/use-energy-breakdown.ts
export interface SystemBreakdown {
  hvacPct: number;        // percentage 0-100
  lightingPct: number;
  dhwPct: number;
  plugPct: number;
  hvacSource: EnergyDataSource;
  lightingSource: EnergyDataSource;
  dhwSource: EnergyDataSource;
  plugSource: EnergyDataSource;
  // Percentages must sum to 100 (enforced by Phase 23)
}

export function useEnergyBreakdown(buildingPk: string): SystemBreakdown | null;
```

If Phase 23 is not yet delivered when Phase 24 ships, create a stub hook with hardcoded ASHRAE 90.1 ratios (HVAC 55%, Lighting 25%, DHW 10%, Plug 10%) all tagged `source: "estimated-ratio"`.

### Anti-Patterns to Avoid

- **Raw Recharts imports without ChartContainer:** Loses CSS variable theming and tooltip positioning. Use `ChartContainer` exclusively.
- **Computing breakdown data inside component render body:** Causes re-computation on every render including hover/camera frames. Always `useMemo`.
- **Subscribing to `useEnergyMetrics(buildingPk)` inside `EnergyBreakdownChart`:** Creates a second independent subscription chain. Phase 23's `useEnergyBreakdown` already subscribes correctly — do not double-subscribe.
- **Storing breakdown percentages in Zustand:** Derived data belongs in `useMemo`, not in store. PITFALLS.md Pitfall 7 explicitly warns against this.
- **Amber label as optional/conditional on non-obvious logic:** Label must render for every value where `source === "estimated-ratio"`. Make it a required visual contract, not a dev decision per value.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bar/donut chart SVG | Custom SVG bar chart | Recharts via shadcn ChartContainer | Tooltip, axis labeling, responsive sizing, CSS variable colors — all handled |
| Color interpolation between grade anchors | Custom lerp function | Recharts `Cell` + chartConfig color tokens | Chart colors come from Tailwind CSS variables, not manual hex values |
| "Estimated" badge UI treatment | New component | Existing `shadcn Badge` with amber variant classes | Already proven in `EnergyCards` pattern |
| Percentage-to-pixel label positioning | Manual transform | Recharts built-in `<LabelList>` or `Cell` label prop | Recharts manages label overflow and clipping |

---

## Memoization Strategy — Camera Rotation Isolation

### Root Cause of Re-render During Camera Rotation

R3F's `useFrame` runs every animation frame (~60fps). If any component higher in the React tree calls `setState` or invalidates context during `useFrame`, child components including `EnergyBreakdownChart` will re-render at 60fps regardless of whether their data changed.

The existing architecture already has a working solution: `useEnergyMetrics` subscribes to individual Zustand primitives and wraps computation in `useMemo`. The chart component must follow the same pattern.

### Isolation Strategy (THREE-LAYER)

**Layer 1 — Zustand subscriptions:** Subscribe to stable primitives only. Never subscribe to a selector that returns a new object on every call.

```typescript
// CORRECT — stable primitives
const materials = useMaterialStore((s) => s.properties[buildingPk]);
const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

// WRONG — returns new object every call, fires on every frame
const metrics = useEnergyMetrics(buildingPk); // called inside a subscribing component
```

**Layer 2 — useMemo dependency pinning:** `useEnergyBreakdown` (Phase 23) must have `useMemo` dependencies that are stable across camera frames. Camera rotation does NOT touch `material-store` or `recipe-store` — so as long as memo deps are only those stores, camera rotation will not invalidate the memo.

**Layer 3 — Component boundary:** `EnergyBreakdownChart` must NOT be a child of a component that re-renders on `useFrame`. In the current layout, `ConfigPanel` is a DOM overlay (positioned absolute, outside the R3F Canvas). R3F `useFrame` only re-renders components inside `<Canvas>` — ConfigPanel and its tabs are safe by default.

**Verification step (React DevTools profiler):**

1. Open ConfigPanel to the Energy tab
2. Start React DevTools Profiler recording
3. Orbit camera for 5 seconds
4. Stop recording
5. Filter commit list — `EnergyBreakdownChart` must appear in 0 commits

If it appears, find which parent is re-rendering and apply `React.memo()` on `EnergyBreakdownChart` with default shallow comparison.

### Selector-Based vs Shallow Comparison

The project uses selector-based isolation (following `useEnergyMetrics` pattern). Do NOT introduce `useShallow` from Zustand — it is not currently used in this codebase, and adding it creates an inconsistent subscription pattern. Selector-based isolation (subscribing to individual values) is the established approach here.

---

## Amber "Estimated" Label — Enforcement Architecture

### TypeScript Discriminated Union (from PITFALLS.md Pitfall 3)

The `EnergyDataSource` type must be defined (or reused from Phase 23) in `src/lib/energy/system-breakdown.ts`:

```typescript
export type EnergyDataSource = "modeled" | "actual" | "estimated-ratio";

export interface EnergyBreakdownItem {
  label: string;
  value: number;       // percentage 0-100
  unit: string;        // "%"
  source: EnergyDataSource;
}
```

### Component-Level Enforcement

The chart component enforces the amber label rule by treating `source` as a required discriminant. The rendering logic for each bar cell checks `source` and renders an amber badge alongside or below the bar label:

```typescript
// Enforcement: every estimated-ratio value must render amber badge
// This is NOT optional — it is a rendering invariant
function SourceBadge({ source, isKo }: { source: EnergyDataSource; isKo: boolean }) {
  if (source === "actual") {
    return (
      <Badge className="bg-blue-100 text-blue-700 text-[8px]">
        {isKo ? "실측" : "Actual"}
      </Badge>
    );
  }
  if (source === "estimated-ratio") {
    return (
      <Badge className="border-amber-400 text-amber-600 bg-amber-50 border text-[8px]">
        {isKo ? "추정" : "Est."}
      </Badge>
    );
  }
  return (
    <span className="text-[8px] text-muted-foreground">
      {isKo ? "모델" : "Model"}
    </span>
  );
}
```

A panel-level amber banner (shown in Pattern 1 above) covers the case where all four values are `estimated-ratio` — which will be the initial state since Phase 23 uses ASHRAE 90.1 ratios. Individual per-bar source badges cover the future case where some values are actual sub-metered data.

**TypeScript enforcement rule:** Any function that accepts `EnergyBreakdownItem` MUST also render the `source` field. This is enforced via the interface requiring `source` — any renderer that destructures without `source` will produce a lint warning if `@typescript-eslint/no-unused-vars` is active on destructured parameters.

---

## Common Pitfalls

### Pitfall 1: Chart re-renders during camera rotation
**What goes wrong:** `EnergyBreakdownChart` is mounted inside a component that re-renders on R3F `useFrame`, causing the Recharts SVG to re-layout every frame at 60fps.
**Why it happens:** ConfigPanel floats above the 3D canvas; if the canvas root component calls `setState` in `useFrame`, the entire tree re-renders.
**How to avoid:** Keep chart components outside `<Canvas>`. Verify: `EnergyBreakdownChart` is in `config-panel.tsx` → `config-tabs/` chain, NOT inside `building-scene.tsx` or any R3F child. Current `ConfigPanel` is mounted in `building-viewer.tsx` outside `<Canvas>` — maintain this separation.
**Warning signs:** React DevTools profiler shows chart component in every commit during orbit.

### Pitfall 2: Unlabeled estimated values (Pitfall 3 from PITFALLS.md)
**What goes wrong:** Sub-system percentages are displayed without source attribution. GX auditors interpret ASHRAE 90.1 ratio estimates as metered data.
**Why it happens:** Chart looks authoritative; developer omits "estimated" label thinking it's obvious.
**How to avoid:** `source: EnergyDataSource` is required on every `EnergyBreakdownItem`. Chart component renders `<SourceBadge>` for every item — not conditionally. The amber panel banner covers the common case. Per-bar badges cover individual values.
**Warning signs:** Chart renders without any amber or blue badge near the values.

### Pitfall 3: Breakdown percentages computed inline in render
**What goes wrong:** `calculateSystemBreakdown()` is called inside the component body, running on every render including hover state changes and tooltip visibility toggles.
**Why it happens:** Direct function calls feel natural in React components.
**How to avoid:** All aggregation in `useMemo` with deps `[breakdown]` only. The `chartData` derivation in Pattern 1 above is already correctly wrapped.
**Warning signs:** `calculateAnnualDemand()` appears in the React Profiler flame graph during pointer movement.

### Pitfall 4: Five-tab panel overflow
**What goes wrong:** Adding a fifth tab to ConfigPanel pushes TabsList beyond w-96 panel width.
**Why it happens:** TabsList with equal flex distribution at 5 items: 96/5 = ~76px per tab — workable but tight if text labels are long.
**How to avoid:** Use icon + short Korean label (2 chars max per tab trigger): 건물/외피/설비/레이어/에너지 → abbreviate to 에너. Or use icon-only mode on the energy tab. Test at 384px viewport.
**Warning signs:** TabsTrigger text wraps or overflows the tab bar.

### Pitfall 5: `@types/recharts` conflict
**What goes wrong:** Developer installs `@types/recharts` alongside `recharts@^3.8.1`, causing type conflicts.
**Why it happens:** Legacy TypeScript habit for libraries without bundled types.
**How to avoid:** Do NOT install `@types/recharts`. Recharts 3.x ships its own `.d.ts` files. The `@types/recharts` package on npm targets Recharts 1.x and is incompatible.
**Warning signs:** TypeScript errors referencing duplicate type declarations for Recharts components.

---

## Code Examples

### ChartContainer + BarChart (verified pattern)

```typescript
// Source: shadcn/ui chart docs (https://ui.shadcn.com/docs/components/chart)
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";

const config: ChartConfig = {
  value: { label: "Share", color: "hsl(var(--chart-1))" },
};

<ChartContainer config={config} className="h-40">
  <BarChart data={data} layout="vertical">
    <XAxis type="number" />
    <YAxis type="category" dataKey="name" />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Bar dataKey="value" fill="var(--color-value)" />
  </BarChart>
</ChartContainer>
```

### useMemo pattern for chart data (matches use-energy-metrics.ts)

```typescript
// Derived in useMemo — never inline in render
// Source: existing pattern from src/hooks/use-energy-metrics.ts
const chartData = useMemo(() => {
  if (!breakdown) return null;
  return SYSTEM_KEYS.map((key) => ({
    system: LABELS[key][isKo ? "ko" : "en"],
    value: breakdown[`${key}Pct`],
    source: breakdown[`${key}Source`],
  }));
}, [breakdown, isKo]);
```

### React DevTools profiler verification command

```bash
# In browser DevTools:
# 1. Open React DevTools > Profiler tab
# 2. Click Record
# 3. Orbit camera in 3D viewer for 5 seconds
# 4. Click Stop
# 5. Inspect commits — filter by "EnergyBreakdown"
# Expected: 0 renders of EnergyBreakdownChart during camera orbit
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `recharts` | Chart rendering | NO — not installed | — | None; must install in Wave 0 |
| `shadcn chart` (chart.tsx) | ChartContainer wrapper | NO — not in src/components/ui/ | — | None; run `npx shadcn@latest add chart` in Wave 0 |
| `radix-ui` (Tabs) | 5th tab in ConfigPanel | YES | ^1.4.3 | — |
| `useEnergyBreakdown` hook | Chart data source | NOT YET — Phase 23 delivers it | — | Stub hook with ASHRAE 90.1 fixed ratios |

**Missing dependencies with no fallback:**
- `recharts@^3.8.1` — must be installed before `energy-breakdown-chart.tsx` can compile
- `chart.tsx` shadcn component — must be added via `npx shadcn@latest add chart`

**Missing dependencies with fallback:**
- `useEnergyBreakdown` — can use stub hook with hardcoded ratios (all `source: "estimated-ratio"`) until Phase 23 ships

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react (inferred from package.json `@testing-library/react ^16.3.2`) |
| Config file | None detected — Wave 0 gap |
| Quick run command | `pnpm test --run src/components/viewer/energy-breakdown-chart` |
| Full suite command | `pnpm test --run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EA-02 (SC1) | Chart renders 4 bars with percentage labels | unit | `pnpm test --run energy-breakdown-chart` | No — Wave 0 |
| EA-02 (SC2) | Every `estimated-ratio` item renders amber badge | unit | `pnpm test --run energy-breakdown-chart` | No — Wave 0 |
| EA-02 (SC3) | Chart re-renders when `material-store` changes | unit | `pnpm test --run use-energy-breakdown` | No — Wave 0 |
| EA-02 (SC4) | Chart does NOT re-render during camera rotation | manual | React DevTools Profiler — see Code Examples above | Manual only |

### Sampling Rate

- **Per task commit:** `pnpm test --run src/components/viewer/energy-breakdown-chart`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green + React DevTools profiler verification before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/viewer/__tests__/energy-breakdown-chart.test.tsx` — covers EA-02 SC1 + SC2
- [ ] `src/hooks/__tests__/use-energy-breakdown.test.ts` — covers EA-02 SC3 (if Phase 23 not yet shipping tests)
- [ ] `vitest.config.ts` or `jest.config.ts` — no test config file detected in project root
- [ ] Install: `pnpm add recharts@^3.8.1` + `npx shadcn@latest add chart`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw Recharts v1/v2 direct imports | Recharts 3.x wrapped in shadcn `ChartContainer` | shadcn chart release (2024) | CSS variable theming, tooltip, legend handled by wrapper — do not bypass |
| `@types/recharts` separate package | Bundled types in `recharts` 3.x | Recharts 3.0 | Never install `@types/recharts` for 3.x |
| Zustand selectors returning new objects | Primitive subscriptions + `useMemo` | Established in this codebase (use-energy-metrics.ts) | Camera-rotation isolation depends on this pattern |

**Deprecated/outdated:**
- `@types/recharts`: targets v1.x, incompatible with v3.x — do not install

---

## Open Questions

1. **Phase 23 delivery timing**
   - What we know: Phase 24 depends on `useEnergyBreakdown` from Phase 23
   - What's unclear: Whether Phase 23 ships before Phase 24 is planned/executed
   - Recommendation: Implement a stub `useEnergyBreakdown` in a Wave 0 task using fixed ASHRAE 90.1 ratios (HVAC 55%, Lighting 25%, DHW 10%, Plug 10%), all `source: "estimated-ratio"`. Replace with Phase 23's real hook when available. This decouples Phase 24 from Phase 23's schedule.

2. **Fifth tab vs accordion section in PropertiesPanel**
   - What we know: ConfigPanel (left overlay on 3D view) has 4 tabs today; PropertiesPanel (right dock) shows analytics accordions
   - What's unclear: Which panel is the better home for the breakdown chart. ARCHITECTURE.md says "Positioned below existing EnergyCards or in a new 'breakdown' tab in the config panel" — the tab approach keeps all building config in one place
   - Recommendation: Fifth tab in ConfigPanel is the correct placement per ARCHITECTURE.md. The PropertiesPanel already has benchmark/calibration/certification — adding breakdown there creates duplicate energy analytics in two panels.

3. **Donut vs bar chart**
   - What we know: Phase 24 success criteria says "bar or donut". The ARCHITECTURE.md shows `<BarChart>`.
   - What's unclear: Visual preference of GX team
   - Recommendation: Use horizontal `BarChart` — it shows absolute percentage values more legibly in a narrow panel (w-96). Donut is better for showing proportional share at a glance but harder to label percentages inside segments at small size. The planner can offer both and let the GX team choose during verification.

---

## Project Constraints (from CLAUDE.md)

- **Next.js 16 App Router + React 19** — no Pages Router patterns
- **`use client` directive required** on all interactive chart components
- **Three.js / R3F pattern:** Chart components must NOT be inside `<Canvas>`. They live in config-panel overlay.
- **Zustand subscription pattern:** Subscribe to individual store slices, not full store; derive in `useMemo` — see `use-energy-metrics.ts` reference implementation
- **InstancedMesh warning:** Chart has no 3D component, but if any visual feedback is added to the 3D scene, do NOT use `setColorAt` on structural InstancedMesh
- **SAOPass disabled:** Do not re-enable for any v5.0 geometry additions
- **SSR hydration:** use `useHydration()` before reading Zustand store in render (existing pattern in `workspace-shell.tsx`)
- **No `@types/recharts`:** Recharts 3.x has bundled types

---

## Sources

### Primary (HIGH confidence)
- npm registry — `recharts` version 3.8.1 confirmed current (2026-04-12), verified via `npm view recharts version`
- `C:/Users/Nam/BIM/src/components/viewer/config-panel.tsx` — ConfigPanel tab structure (4 tabs, radix-ui, w-96), read directly
- `C:/Users/Nam/BIM/src/hooks/use-energy-metrics.ts` — canonical memoization/subscription pattern, read directly
- `C:/Users/Nam/BIM/src/components/viewer/energy-cards.tsx` — existing provenance badge pattern (blue = actual, model label), read directly
- `C:/Users/Nam/BIM/.planning/research/PITFALLS.md` — Pitfall 3 (estimated data labeling), Pitfall 7 (store cascade), Pitfall 8 (dashboard aggregation on every frame), read directly
- `C:/Users/Nam/BIM/.planning/research/STACK.md` — recharts ^3.8.1 rationale, ChartContainer pattern, chartConfig example, read directly
- `C:/Users/Nam/BIM/.planning/research/ARCHITECTURE.md` — EnergyBreakdownChart placement decision ("config panel new tab"), read directly
- `C:/Users/Nam/BIM/src/components/ui/tabs.tsx` — uses `radix-ui` bundle (^1.4.3), no separate install needed, read directly
- `C:/Users/Nam/BIM/package.json` — recharts NOT installed, radix-ui ^1.4.3 installed, React 19.2.4, verified directly

### Secondary (MEDIUM confidence)
- shadcn/ui chart docs (https://ui.shadcn.com/docs/components/chart) — ChartContainer API, chartConfig satisfies ChartConfig pattern — verified in STACK.md research
- recharts/recharts#4558 — React 19 compatibility resolved — referenced in STACK.md (HIGH confidence per prior research)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — recharts version verified against npm registry; shadcn chart integration verified via STACK.md research; no alternative library ambiguity
- Architecture: HIGH — ConfigPanel tab structure read directly from source; memoization pattern verified from `use-energy-metrics.ts`; chart placement decision confirmed in ARCHITECTURE.md
- Pitfalls: HIGH — camera rotation isolation, estimated label enforcement, and aggregation-in-render all grounded in existing codebase patterns and PITFALLS.md

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (recharts is stable; shadcn chart API is stable; all other findings are codebase-grounded)
