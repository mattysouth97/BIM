# Retrospective

Living document tracking what worked, what didn't, and patterns across milestones.

## Milestone: v5.0 — Energy Systems Observability & Control

**Shipped:** 2026-04-12
**Phases:** 7 (22-28) | **Plans:** 16

### What Was Built
- 4 togglable MEP utility sub-layers + persisted visibility
- Per-floor energy model with system-level attribution (ASHRAE 90.1 ratios)
- Energy breakdown dashboard (recharts BarChart) + amber estimated badges
- Energy consumption heatmap on 3D building (Korean grade colors)
- Equipment info panel with click selection + Korean efficiency grades + useRef Raycaster (no per-frame alloc)
- ECO2 export extended with sub-system fields
- Distinct procedural 3D models for chiller/boiler/AHU/DHW/lighting (mergeGeometries + InstancedMesh)
- Equipment configuration tab with reactive procedural parameter sliders

### What Worked
- Parallel agent execution after Phase 22 — 4 researchers + 4 planners + 4 executors ran simultaneously where files didn't conflict
- Comprehensive front-loaded research before planning (3 of 4 v5.0 research files pre-existed) sped up decomposition
- TypeScript discriminated unions for "estimated" vs "actual" data — caught at compile time
- Reusing existing patterns (mergeGeometries from layer-5, useMemo from use-energy-metrics, Zustand persist) kept implementation consistent
- The autonomous workflow's discuss → plan → execute pipeline worked smoothly when files were read before edit

### What Was Inefficient
- **Critical gap discovered late:** MEP layer generators (CoolingLayer, HeatingLayer, etc.) existed in code but were NEVER invoked in production until Phase 28 gap-wiring. Phases 22, 26 were "completed" with empty geometry — not detected until visual verification. Process improvement: phases that introduce generators MUST verify integration as part of that phase, not assume downstream phases will wire them.
- **Snapshot caching bug from getter-based selectors:** `useEquipmentStore((s) => s.getParams(pk))` returns new JSON.parse object each render → infinite loop. Pattern to avoid: never call store getters that return new references inside React selectors. Use `s.params[pk] ?? STABLE_DEFAULT`.
- **Background agent Write-vs-Edit confusion:** Plan 28-02 worker hit a Read-before-Edit hook when using Write to overwrite read files, stalled mid-task. Required retry with explicit Edit tool guidance.
- **Phase 24 Plan 24-02 was a human-verify checkpoint with no SUMMARY** until forced by audit — checkpoint plans should auto-generate trivial summaries.

### Patterns Established
- **MepSubLayerId as parallel type, not extending LayerId** — prevents cross-subscriber re-render cascades
- **EnergyDataSource discriminated union** as single source of truth for data provenance (re-exported, not re-defined)
- **useRef Raycaster** at component top level (not per-frame) — fixed the structural-tooltip anti-pattern
- **mergeGeometries + InstancedMesh** combo for procedural equipment — keeps draw calls under budget
- **Zustand store divergence on missing pk:** equipment-store.overrideParam initializes from defaults (vs material-store which silently drops) — prevents data loss
- **Dual-dependency useEffect for visibility sync:** depend on both child state AND parent state to handle parent-toggle restore

### Key Lessons
- **Defined ≠ wired.** Generator/utility code with no production integration is dead code. Verify integration as the FIRST phase that uses it, not the last.
- **Selector returning a new object every render = guaranteed infinite loop.** React's useSyncExternalStore enforces stable snapshots.
- **Background agent failures need explicit recovery instructions** — when Write blocks, fallback to Edit needs to be in the prompt, not hoped for.
- **Procedural model design follows structural clarity, not photorealism** — recognizable silhouettes (cylinder + flue = boiler) suffice. Lighting fixtures need ≥0.08m height to be visible at scene distance.

### Cost Observations
- Sessions: 1 (with mid-session GSD update from 1.30.0 → 1.34.2)
- Model mix: opus for planners, sonnet for researchers + executors
- Notable: 4-6 parallel agents at once kept wall time low; gap-wiring phase added ~15 min but unblocked all downstream phases

---

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
