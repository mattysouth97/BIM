# Retrospective

Living document tracking what worked, what didn't, and patterns across milestones.

## Milestone: v4.0 — GIS-Composite Realistic Drafts

**Shipped:** 2026-04-12
**Phases:** 3 | **Plans:** 7

### What Was Built
- proj4 site-specific TM projection with <1m accuracy at 2km radius
- earcut polygon triangulation for concave/L-shaped cadastral footprints
- Real cadastral polygon extrusion with per-floor heights
- Facade system adapted for N-sided polygon buildings
- Parallel fetch pipeline (ledger + footprint via useQueries)
- Graceful rectangular fallback when footprint unavailable

### What Worked
- TDD approach for earcut-extrude.ts — 11 tests caught winding and triangulation bugs before visual testing
- Discuss-skip for infrastructure phases — Phase 19 was pure plumbing, no user decisions needed
- Prop-drilling footprint data from page to scene kept data flow explicit and debuggable
- Site-specific TM projection (vs EPSG:5179) solved Float32 precision elegantly

### What Was Inefficient
- Phase 21 ROADMAP checkbox not updated after plan 21-02 completed — caused audit to see stale state
- SAOPass dark halos on polygon geometry required emergency disable — should have tested post-processing earlier
- REQUIREMENTS.md traceability table had stale "Pending" entries for GIS-03 and CP-02 despite work being done
- VWorld `.env` had whitespace after `=` sign causing 500 errors — fragile env var handling

### Patterns Established
- `extractPolygon()` returns raw WGS84 rings, projection happens client-side — clean separation of concerns
- `BuildingRecipe.footprintPolygon` as `[number,number][][]` (GeoJSON-style) — standard format for polygon data
- `useCompositeBuilding` parallel fetch pattern with `useQueries` — reusable for future data composition
- Guard pattern: `if (footprintPolygon?.length >= 1 && footprintPolygon[0].length >= 3)` for polygon validity

### Key Lessons
- Always test post-processing (SAOPass, bloom, etc.) with new geometry types early — not after integration
- Update ROADMAP checkboxes and traceability tables in the same commit as plan summaries
- Env var values with whitespace are a silent failure mode — validate at startup

### Cost Observations
- Sessions: 2 (v4.0 phases 19-21 in session 1, audit+completion in session 2)
- Model mix: primarily sonnet for execution, opus for verification and planning
- Notable: All 3 phases completed in a single session (~2 hours), audit in second session

---

## Cross-Milestone Trends

| Metric | v2.0 | v3.0 | v4.0 |
|--------|------|------|------|
| Phases | 5 | 5 | 3 |
| Plans | 11 | 16 | 7 |
| Duration | ~2 days | ~3 days | ~1 day |
| Req Coverage | 100% | 100% | 100% |

**Recurring themes:**
- Traceability tables falling out of sync with actual work (v2.0, v4.0)
- Post-processing/visual effects need testing with each new geometry type
- TDD consistently catches geometry/math bugs that would be hard to debug visually
