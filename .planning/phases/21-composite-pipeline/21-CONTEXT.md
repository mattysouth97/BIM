# Phase 21: Composite Pipeline - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Building selection triggers a parallel fetch of building ledger data and VWorld footprint polygon, and the composite 3D scene renders within 3 seconds of selection. Graceful fallback to rectangular model if VWorld data unavailable. Loading indicator during fetch.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from research:
- Use TanStack Query `useQueries` for parallel fetch orchestration
- Building ledger fetch and VWorld footprint fetch must fire simultaneously
- Fallback to rectangular BoxGeometry if footprint polygon is null/error
- Loading indicator visible during fetch, hidden on render
- Performance target: <3 seconds from data arrival to first paint (excluding network)
- The footprint pipeline (Phase 20) already handles projection and extrusion — this phase wires the fetch timing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/hooks/use-building-footprint.ts` — existing footprint fetch hook (useQuery)
- `src/lib/api-client.ts` — client-side fetch wrapper
- `src/components/viewer/building-scene.tsx` — already consumes footprint data
- TanStack Query already installed and configured

### Established Patterns
- `useQuery` hooks in `src/hooks/` for API data fetching
- Building data fetched via server-side proxy routes at `src/app/api/`

### Integration Points
- `building-scene.tsx` currently fetches footprint separately from building ledger data
- Need to parallelize these fetches so they start at the same time
- Loading states already partially managed in building-scene.tsx

</code_context>

<specifics>
## Specific Ideas

No specific requirements — refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
