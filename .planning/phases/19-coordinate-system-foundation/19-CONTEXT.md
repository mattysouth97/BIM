# Phase 19: Coordinate System Foundation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

All GIS coordinate transforms are accurate to <1m at 2km radius using proj4 with proper EPSG:5179 projection, and the VWorld API key is managed via environment variable. This is the foundation that all subsequent GIS phases (20, 21) depend on.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from research:
- Use proj4@^2.20.8 (ships own TS types, no @types/proj4 needed)
- Use site-specific Transverse Mercator centered on building centroid (avoids float32 large-coordinate problem)
- Local origin subtraction keeps Three.js coords under 100m magnitude
- Korean peninsula bounding box: lat 33-43, lon 124-132
- Existing extractPolygon() in footprint/route.ts uses equirectangular approximation — replace with proj4

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/vworld/footprint/route.ts` — existing VWorld proxy with hardcoded API key and equirectangular `extractPolygon()`
- `src/lib/building-geometry.ts` — pure functions converting API data to 3D geometry

### Established Patterns
- Next.js App Router API routes at `src/app/api/`
- Pure utility functions in `src/lib/`
- Environment variables via `.env.local`

### Integration Points
- `footprint/route.ts` currently has hardcoded VWorld API key `98E6A75B-...` and `domain: "localhost"`
- The `extractPolygon()` function returns `[x, z]` meter-space coordinates using equirectangular math

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
