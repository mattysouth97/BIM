# Phase 18: Guidance + Energy Feedback - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users always know what to do next via status bar prompts and onboarding, and see live energy impact as they author. This is the final polish phase of v3.0.

</domain>

<decisions>
## Implementation Decisions

### Guidance UX
- **D-01:** Status bar renders in the bottom shelf of WorkspaceShell — persistent 32px strip below the viewport
- **D-02:** Prompt strings mapped per drawingMode/annotationMode (e.g., "Draw Wall" → "Click start point — Escape to cancel")
- **D-03:** driver.js onboarding tour with `hasSeenTour` flag in app-store (Zustand persist) — runs once on first visit to building detail page
- **D-04:** 4 tour steps: stepper → viewport → left dock (outliner) → right dock (properties)

### Energy Feedback
- **D-05:** Energy status bar inside bottom shelf, left-aligned — shows "~XX.X kWh/m²" with "간이 모델" (simplified model) badge
- **D-06:** useEnergyDelta hook: snapshot on slider focus, diff on blur, show "+X.X kWh/m²" annotation next to slider
- **D-07:** REGIONAL_HDD lookup table keyed by sido code prefix (17 regions) in a new constants file
- **D-08:** "~" prefix + "간이 모델" badge distinguishes from certified ECO2 results

### Claude's Discretion
- Exact prompt string content per mode
- Tour step descriptions and styling
- Energy delta annotation styling and positioning
- Regional HDD values source (KMA data)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/ENERGY_FEEDBACK.md` — Calculation model scope, UI placement, approximate vs certified
- `.planning/research/STACK.md` — driver.js v1.4.0 integration pattern

### Energy Calculation
- `src/hooks/use-energy-metrics.ts` — Existing degree-day calculation (if exists)
- `src/lib/korean-building-codes.ts` — Material inference engine

### Workspace
- `src/components/workspace/workspace-shell.tsx` — Bottom shelf slot for status bar + energy bar
- `src/store/workspace-store.ts` — bottomShelfOpen state
- `src/store/app-store.ts` — hasSeenTour flag goes here (persisted)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/hooks/use-energy-metrics.ts` — Existing energy calculation hook (degree-day method, <0.5ms)
- `src/store/app-store.ts` — Zustand persist store for app-level flags
- `src/hooks/use-hydration.ts` — SSR hydration guard
- `src/store/workspace-store.ts` — bottomShelfOpen toggle

### Established Patterns
- Zustand persist for durable state (app-store)
- shadcn/ui Badge, Separator components
- Bottom shelf exists as empty collapsible slot (Phase 15)

### Integration Points
- Bottom shelf in WorkspaceShell is currently an empty placeholder
- Properties panel sliders (Phase 17) need delta annotations
- Energy calculation hook exists but uses Seoul-only HDD

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-guidance-energy-feedback*
*Context gathered: 2026-03-30*
