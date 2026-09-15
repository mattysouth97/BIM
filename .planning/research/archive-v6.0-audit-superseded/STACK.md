# Stack Research

**Domain:** Energy systems observability & control added to existing Three.js BIM viewer — heatmap rendering, equipment data models, dashboard charting, real-time scenario feedback (Korean BIM EMS v5.0)
**Researched:** 2026-04-12
**Confidence:** HIGH (versions verified against npm registry; integration points verified against existing codebase)

---

## Context: What This Research Covers

The existing validated stack (Next.js 16.2, React 19.2, Three.js 0.183, R3F 9, @react-three/drei 10, Zustand 5, TanStack Query 5, shadcn/ui, Tailwind v4, postprocessing 6.39, @react-three/postprocessing 3.0.4, proj4, earcut) is NOT re-researched.

This document covers only the NEW libraries required for v5.0 Energy Systems Observability & Control.

The six new capability gaps to fill:

1. **Dashboard charting** — bar chart (system breakdown), donut/pie (% split), area/line (year-over-year trend) inside the shadcn/ui panel system
2. **3D energy heatmap** — per-floor color gradient on building geometry with explicit vertex color buffer (NOT setColorAt on structural InstancedMesh)
3. **Equipment data model** — typed `EquipmentSpec` + `SelectedEquipmentInfo` records (pure TypeScript, no new library)
4. **Scenario/equipment state store** — isolated scenario overrides separate from `recipe-store.overrides` (Zustand slice addition, no new library)
5. **MEP sub-layer visibility** — nested `MepSubLayer` type + `mepSubVisibility` record (type extension, no new library)
6. **Energy data provenance** — `EnergyDataSource` type enforced in UI (TypeScript, no new library)

---

## Recommended Stack: New Additions Only

### New Libraries to Install

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `recharts` | `^3.8.1` | Bar, donut/pie, area charts for the energy breakdown dashboard | shadcn/ui's official chart primitive is built on Recharts — `npx shadcn add chart` installs the `ChartContainer`/`ChartTooltip` wrappers that use Recharts under the hood. Recharts 3.x is React 19 compatible (confirmed in recharts/recharts#4558). shadcn/ui Recharts v3 compat issue #7669 was resolved and merged (PR #8486). 3.8.1 is the current release as of April 2026. Use shadcn chart primitives, not raw Recharts components — this keeps the visual language consistent with the existing shadcn/ui panel system. |

**Total new dependency surface: 1 package.**

### No New Library Needed For

| Capability | Why No New Library |
|------------|--------------------|
| 3D energy heatmap | Use `THREE.Mesh` (not InstancedMesh) with `vertexColors: true` and a `Float32BufferAttribute` color buffer per floor plane. This is standard Three.js 0.183 — no extra library. The `energy-zones` layer group is already the correct parent for this geometry. See PITFALLS.md Pitfall 1 for why `setColorAt` on structural InstancedMesh must NOT be used. |
| Heatmap color gradient | Pure JavaScript: map a kWh/m² scalar to a CSS/THREE.Color using linear interpolation between grade-anchored colors (Grade 7 = 320 kWh/m² → red `#ef4444`, Grade 1+++ = 60 kWh/m² → blue `#3b82f6`). No color-scale library needed for 7 anchor points. |
| Equipment data model | Plain TypeScript interfaces (`EquipmentSpec`, `SelectedEquipmentInfo`) added to `src/lib/layers/types.ts` alongside the existing `LayerId` and `LayerConfig` types. No ORM, schema library, or external model. |
| Scenario store / equipment state | Zustand 5 slice additions to existing stores. Scenario overrides go into `recipe-store` as `scenarioOverrides: Record<string, Record<string, RecipeOverrides>>` (pk → scenarioId → overrides). Equipment control state goes into `workflow-store` as `scenarioActive: boolean` + `equipmentOverrides: Record<string, EquipmentState>`. No new store file, no new library. |
| MEP sub-layer visibility | New `MepSubLayerId` union type + `mepSubVisibility: Record<MepSubLayerId, boolean>` added to `layer-store.ts`. The `mep` THREE.Group gets named child groups for each sub-system. Visibility controlled imperatively on child groups — `ALL_LAYER_IDS` stays at 5 entries. No new library. |
| Equipment raycasting | `THREE.Raycaster` already in Three.js 0.183. `structural-tooltip.tsx` implements the hit-test + hover popup pattern already — extend it or clone it for MEP sub-layer objects. No new library. |
| Energy data provenance labels | `EnergyDataSource = "modeled" | "actual" | "estimated-ratio"` TypeScript type. UI uses existing shadcn/ui `Badge` component for visual treatment (blue = actual, grey = modeled, amber = estimated-ratio). No new library. |
| Per-floor energy breakdown computation | Extend `calculateAnnualDemand()` in `src/lib/energy/annual-demand.ts` to accept a `floors` array and return per-floor demand. All math is degree-day arithmetic already in the codebase. No new library. |
| Year-over-year trend aggregation | `useActualEnergy` already returns `AnnualConsumption[]` from TanStack Query with `staleTime: 5 * 60 * 1000`. Wrap normalization in `useMemo([data])`. The trend array feeds directly into a shadcn chart `<ChartContainer>` with a Recharts `<AreaChart>`. No new library beyond recharts. |
| Loading states during heatmap compute | Existing `<Skeleton>` from shadcn/ui (already used in `energy-cards.tsx`). Heatmap computation is synchronous CPU work (100–500ms) — wrap in a `useMemo` with a `useTransition` / `startTransition` if needed to keep the UI responsive. No new library. |
| Korean energy label grades per equipment | `energy-grade.ts` already implements the 1+++~7 grade system. Extend `getEnergyGrade()` with an optional `demandPerSqm` override per equipment type. No new library. |

---

## Installation

```bash
# Only one new runtime dependency for the entire v5.0 milestone
pnpm add recharts@^3.8.1

# shadcn chart component (copies chart.tsx into src/components/ui/)
npx shadcn@latest add chart
```

No new devDependencies. Recharts 3.x ships its own TypeScript definitions. No separate `@types/recharts` needed.

---

## Integration Points with Existing Stack

### recharts + shadcn chart → energy breakdown dashboard

Use the shadcn `<ChartContainer>` wrapper exclusively. Do NOT import Recharts primitives directly in dashboard components — the wrapper handles `ChartTooltip`, `ChartLegend`, and the CSS variable color system that matches the existing Tailwind v4 theme.

```typescript
// src/components/viewer/energy-breakdown-chart.tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

// Chart config uses CSS variable tokens — matches shadcn/ui design system
const chartConfig = {
  hvac:     { label: "냉난방", color: "hsl(var(--chart-1))" },
  lighting: { label: "조명",   color: "hsl(var(--chart-2))" },
  dhw:      { label: "급탕",   color: "hsl(var(--chart-3))" },
  plug:     { label: "콘센트", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig;
```

Data source: `useMemo` over `calculateAnnualDemand()` output with ASHRAE 90.1 system attribution ratios. Never call `calculateAnnualDemand()` directly in the render body — see PITFALLS.md Pitfall 8.

### THREE.Mesh vertex colors → energy heatmap

```typescript
// src/lib/layers/energy-heatmap-mesh.ts
// Creates a per-floor plane geometry with vertex colors baked from kWh/m² scalar.
// Parent: LayerManager's "energy-zones" THREE.Group.
// Never attaches to structural InstancedMesh.

import * as THREE from "three";

const GRADE_COLORS: Array<{ threshold: number; color: THREE.Color }> = [
  { threshold: 60,  color: new THREE.Color("#3b82f6") }, // Grade 1+++ (blue)
  { threshold: 90,  color: new THREE.Color("#22c55e") }, // Grade 1++ (green)
  { threshold: 120, color: new THREE.Color("#84cc16") }, // Grade 1+
  { threshold: 160, color: new THREE.Color("#eab308") }, // Grade 1
  { threshold: 200, color: new THREE.Color("#f97316") }, // Grade 2
  { threshold: 260, color: new THREE.Color("#ef4444") }, // Grade 3+
  { threshold: 320, color: new THREE.Color("#dc2626") }, // Grade 7 (red)
];

export function kwhmToColor(kwh: number): THREE.Color {
  // Linear interpolation between grade anchor points
  for (let i = 0; i < GRADE_COLORS.length - 1; i++) {
    const lo = GRADE_COLORS[i];
    const hi = GRADE_COLORS[i + 1];
    if (kwh <= hi.threshold) {
      const t = (kwh - lo.threshold) / (hi.threshold - lo.threshold);
      return lo.color.clone().lerp(hi.color, Math.max(0, Math.min(1, t)));
    }
  }
  return GRADE_COLORS[GRADE_COLORS.length - 1].color.clone();
}
```

Dispose pattern: call `geometry.dispose()` and `material.dispose()` inside `LayerManager.disposeLayer("energy-zones")` before rebuilding. Never share geometry between the structural layer and the heatmap layer.

### Scenario overrides → recipe-store extension

Add to `src/store/recipe-store.ts` without touching the existing `overrides` record:

```typescript
// New slice — scenario overrides are isolated from user material edits
scenarioOverrides: Record<string, Record<string, RecipeOverrides>>;
setScenarioOverride: (pk: string, scenarioId: string, path: string, value: unknown) => void;
clearScenario: (pk: string, scenarioId: string) => void;
```

Effective recipe for scenario: `merge(baseRecipe, overrides[pk], scenarioOverrides[pk][activeScenarioId])`. The `overrides[pk]` record is NEVER touched by equipment control actions. Ctrl+Z via `CommandHistory` applies ONLY to `overrides[pk]`, never to `scenarioOverrides`.

### Equipment state → workflow-store extension

Add to `src/store/workflow-store.ts`:

```typescript
scenarioActive: boolean;
activeScenarioId: string | null;
equipmentOverrides: Record<string, EquipmentControlState>; // key: equipmentId
enterScenarioMode: (scenarioId: string) => void;
exitScenarioMode: () => void;
setEquipmentOverride: (equipmentId: string, state: EquipmentControlState) => void;
```

When `scenarioActive` is `true`, the 3D viewport renders an amber banner: "시나리오 모드 — 실제 데이터가 아님". This flag is the single source of truth for visual mode distinction (see PITFALLS.md Pitfall 4).

### MEP sub-layer visibility → layer-store extension

Add to `src/store/layer-store.ts`:

```typescript
export type MepSubLayerId =
  | "mep-electrical"
  | "mep-hvac"
  | "mep-lighting"
  | "mep-dhw";

// Extend layer-store state:
mepSubVisibility: Record<MepSubLayerId, boolean>;
toggleMepSub: (id: MepSubLayerId) => void;
```

`ALL_LAYER_IDS` in `types.ts` stays at 5 entries. The `mep` THREE.Group gets four named child groups. `LayerManager.updateAnimations()` traversal is unchanged. The `LayerPanel` renders the MEP row as an expandable section with four sub-toggle rows inside.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `d3` (data-driven documents) | Full D3 is 70KB+ of DOM manipulation primitives. For this dashboard, only color interpolation and simple chart scales are needed — both handled by Recharts internals and the `kwhmToColor()` function above. D3 and Recharts use incompatible rendering models (D3 mutates SVG directly; Recharts owns the SVG). Mixing them causes unpredictable re-render behavior. | Recharts via shadcn chart component |
| `visx` / `nivo` / `victory` | Alternative React chart libraries. Visx is D3-based (same conflict above). Nivo and Victory are valid alternatives but have no first-class shadcn/ui integration — custom theming would require CSS variable bridging work. Recharts is already the shadcn-blessed choice. | Recharts via shadcn chart component |
| `@react-three/postprocessing` N8AO | SAOPass is intentionally disabled (PITFALLS.md Pitfall 6). N8AO (`n8ao` package) would be the eventual replacement but is NOT needed for v5.0. Adding it now risks reintroducing the polygon-footprint halo artifact. The project already has `@react-three/postprocessing ^3.0.4` installed — N8AO is a separate package and would be an additive install. Defer to a dedicated visual quality phase. | No AO in v5.0; document the disable reason in code |
| `@react-three/cannon` / `rapier` / physics | Energy heatmap visualization does not require physics simulation. Adding a physics engine for "realistic equipment placement" is scope creep. The heatmap is a data overlay, not a simulation. | None needed |
| `react-query` mutations for equipment control | Equipment control in v5.0 is purely local scenario simulation — there is no building control API. Using TanStack Query mutations implies a server round-trip that does not exist. Equipment state lives in `workflow-store` as local transient state. | Zustand `workflow-store` `equipmentOverrides` |
| `zustand/middleware/immer` | The existing stores use explicit spread merges (no immer). Adding immer to new slices creates a mixed pattern — some stores use immer, others use spreads. The scenario and equipment slices are simple enough that immer provides no meaningful ergonomic benefit. Keep the store authoring pattern consistent. | Plain Zustand set() with spread merges |
| Separate Zustand stores for scenario and equipment | Current store count is 7. PITFALLS.md Pitfall 7 explicitly warns against adding new stores for derived energy state. Scenario overrides belong in `recipe-store` (same data shape as existing `overrides`). Equipment control state belongs in `workflow-store` (same lifecycle as workflow stages). No new store files. | Slices added to existing stores |
| `heatmap.js` / `h337` / web heatmap libraries | These are 2D canvas-based heatmap renderers for mouse tracking / analytics use cases. They produce a flat canvas image, not Three.js geometry. They cannot integrate with the existing R3F scene or the `energy-zones` layer group. | Custom `THREE.Mesh` with vertex color buffer |
| IoT data libraries (`mqtt.js`, `bacnet`, socket streaming) | FEATURES.md explicitly marks real-time IoT as an anti-feature for v5.0. The GX team audits buildings they do not operate — they have no IoT access. Adding real-time data infrastructure addresses a use case (facility management) that is not in scope. | `useActualEnergy` for annual totals from data.go.kr; modeled estimates from energy engine |
| `@types/recharts` (npm) | Recharts 3.x ships its own TypeScript definitions. The `@types/recharts` package on npm is community-maintained and targets Recharts 1.x — it is incompatible with Recharts 3.x and should not be installed. | Bundled types from `recharts` package |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Recharts 3.x via shadcn chart | Tremor | Tremor's chart components are also Recharts-based but add their own abstraction layer. Since this project already uses raw shadcn/ui primitives (Button, Badge, Skeleton, Tabs), using Tremor would mix two component system abstractions. shadcn chart is the thinner, more consistent choice. |
| Recharts 3.x via shadcn chart | Chart.js / react-chartjs-2 | Chart.js uses a Canvas renderer; Recharts uses SVG. The shadcn chart system is designed for SVG (CSS variable theming, tooltip positioning). Canvas rendering would require separate theming work. Chart.js is the right choice for large datasets (>10K points) where SVG performance degrades — the energy dashboard has at most 15 floor data points and 36 months of trend data, well within SVG range. |
| `THREE.Mesh` vertex colors per floor | `setColorAt` on structural InstancedMesh | PITFALLS.md Pitfall 1 documents exactly why this fails: cannot express spatial gradient within a face, full buffer re-upload on every change, entangles energy state with structural geometry. The separate `EnergyHeatmapMesh` per floor is the only correct approach. |
| Zustand slice additions to existing stores | New `useScenarioStore` + `useEquipmentStore` | PITFALLS.md Pitfall 7: cross-store subscription cascades. Every new store means `useEnergyMetrics` must subscribe to more stores, increasing the risk of infinite loop from new object references. Slices in existing stores preserve the current subscription topology. |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `recharts` | `^3.8.1` | React 19.2, Next.js 16.2, shadcn/ui | React 19 compat confirmed (recharts/recharts#4558 resolved). shadcn chart Recharts v3 compat confirmed (shadcn-ui/ui#7669 merged via PR #8486). Recharts ships its own TypeScript definitions in 3.x. Do not install `@types/recharts`. |

---

## Sources

- `recharts` npm registry: version 3.8.1, current as of April 2026 — HIGH confidence (WebSearch verified)
- recharts/recharts#4558: React 19 compatibility — resolved — HIGH confidence (WebSearch verified)
- shadcn-ui/ui#7669: Recharts v3 support — resolved, merged via PR #8486 — HIGH confidence (WebFetch verified)
- shadcn/ui chart docs: https://ui.shadcn.com/docs/components/radix/chart — install via `npx shadcn@latest add chart` — HIGH confidence
- `@react-three/postprocessing` docs: N8AO is NOT included in the pmndrs wrapper package — confirmed separate `n8ao` package — HIGH confidence (WebFetch verified)
- Existing `package.json`: `postprocessing ^6.39.0`, `@react-three/postprocessing ^3.0.4` confirmed (Read tool) — HIGH confidence
- PITFALLS.md Pitfall 1: heatmap on InstancedMesh anti-pattern, Pitfall 6: SAOPass disabled, Pitfall 7: store count warning — HIGH confidence (codebase-grounded)
- FEATURES.md: IoT as explicit anti-feature, recharts use case scope (15 floor data points, 36 months trend) — HIGH confidence (codebase-grounded)
- Codebase: `src/lib/layers/types.ts` — `ALL_LAYER_IDS` at 5 entries confirmed; `src/store/recipe-store.ts` — `overrides` record shape confirmed; `src/store/workflow-store.ts` — stage-based store confirmed (Read tool) — HIGH confidence

---
*Stack research for: Korean BIM EMS v5.0 — Energy Systems Observability & Control (new capabilities only)*
*Researched: 2026-04-12*
