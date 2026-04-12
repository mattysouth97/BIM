# Phase 24: Energy Breakdown Dashboard - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Auto-generated from research (UI phase with clear technical contract)

<domain>
## Phase Boundary

Bar/donut chart in the config panel displaying HVAC/lighting/DHW/plug energy attribution with amber "estimated" labels on every estimated-ratio value. Chart reactively updates on material slider changes but does NOT re-render during camera rotation.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Location
- **Fifth ConfigPanel tab: "Energy"** — uses existing radix-ui Tabs structure in config-panel.tsx
- ConfigPanel is a DOM overlay outside Canvas — camera rotation cannot trigger its re-renders
- Hosts `<EnergyBreakdownChart buildingPk={buildingPk} />`

### Chart Library
- **recharts ^3.8.1** (needs install via `pnpm add recharts@^3.8.1`)
- **shadcn chart component** via `npx shadcn@latest add chart`
- Do NOT install @types/recharts — v3.x ships bundled types

### Chart Type
- **Horizontal BarChart** (w-96 panel narrow; donut harder to label cleanly)
- Show HVAC/Lighting/DHW/Plug as horizontal bars with percentage + absolute kWh/m² labels

### Amber Label Enforcement
- **TypeScript discriminated union** — EnergyBreakdownItem requires `source: EnergyDataSource`
- Chart component renders amber Badge for every `estimated-ratio` item (rendering invariant, not conditional)
- All four system values will be estimated-ratio initially (ASHRAE 90.1 from Phase 23)

### Memoization
- Subscribe to individual Zustand primitives (materials, baseRecipe, overrides) — NOT getters
- Derive chart data in useMemo (Phase 23 hook already provides memoized SystemBreakdown)
- Verify via React DevTools Profiler: zero EnergyBreakdownChart commits during 5-sec orbit

### Phase 23 Coupling
- **Wave 0 stub:** If Phase 23 not yet delivered, stub useEnergyBreakdown with fixed ratios (HVAC 55%, Lighting 25%, DHW 10%, Plug 10%) all tagged source: "estimated-ratio"
- Phase 23 is now complete — use real hook directly

### Claude's Discretion
- Exact chart styling (colors, spacing) — match existing energy-cards.tsx visual language
- Tooltip content on bar hover — minimum: system name, absolute kWh/m², percentage
- Empty state when buildingPk is null — show placeholder message

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/viewer/config-panel.tsx` — 4-tab radix structure to extend
- `src/hooks/use-energy-breakdown.ts` — from Phase 23 (memoized SystemBreakdown)
- `src/components/ui/tabs.tsx` — shadcn Tabs primitive
- `src/components/ui/badge.tsx` — shadcn Badge for amber "estimated" label
- `src/components/viewer/energy-cards.tsx` — visual language reference

### Established Patterns
- ConfigPanel tabs: radix-ui Tabs with TabsList/TabsTrigger/TabsContent
- Energy value formatting: `kwh.toFixed(1)` + " kWh/m²" units
- Bilingual labels: isKo ? ko : en pattern

### Integration Points
- `src/components/viewer/config-panel.tsx` — add 5th tab "Energy"
- `src/components/viewer/energy-breakdown-chart.tsx` — NEW component
- `package.json` — recharts dependency + shadcn chart

</code_context>

<specifics>
## Specific Ideas

- Amber color for "estimated" badge should match existing warning/amber palette (text-amber-700 bg-amber-50)
- Chart performance: BarChart is cheaper than donut, use it
- No camera-rotation re-render — ConfigPanel is DOM overlay, this is already guaranteed

</specifics>

<deferred>
## Deferred Ideas

- Time-series charts (monthly consumption) — defer to future milestone
- Compare baseline vs modified scenario — deferred to v5.x (CTRL-03)
- Sub-system heatmap filter integration — deferred to v5.x (ADV-01)

</deferred>
