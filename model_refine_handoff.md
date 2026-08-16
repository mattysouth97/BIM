# Model Refinement Handoff

Verified: 2026-07-26

## Delivered outcome

The procedural building model now assembles structural, façade, roof, and annotation geometry without duplicate or intersecting parts. The HVAC view also includes a guided, animated airflow layer with cyan supply air and cool-gray return air.

## Geometry rules now enforced

- Façades support open or closed polygon rings and either winding direction.
- Wall panels are inset by half the wall thickness, keeping them inside the building footprint.
- Horizontal mullions meet slab and floor boundaries without penetrating them.
- Vertical mullions stop at the horizontal rails instead of overlapping them.
- Multi-section buildings generate a parapet only at the topmost section.
- Irregular and courtyard footprints use their real polygon for flat roofs instead of a bounding box.
- Structural columns are generated once and reused by the analysis overlay.
- Column sections must fit completely inside the footprint. Concave notches and courtyard edges are checked with full edge intersection, not only corner probes.
- Load arrows sit beside columns and above slabs. Foundation markers sit just above the slab surface.
- Duplicate physical floor records are removed before slabs and façades are generated.

## Airflow behavior

- Airflow is available under **Building layers → MEP → HVAC → Airflow**.
- The preference is enabled by default and persisted between visits.
- One batched line geometry renders all supply and return streamlines.
- Direction is shown with tapered animated pulses.
- Cubic Bézier paths remain inside their validated footprint envelope and cannot overshoot through façades.
- AHUs are positioned away from structural columns and fully contained inside regular, concave, and courtyard footprints.
- Multiple AHUs include clearance for supply and return duct stubs, preventing unit-to-unit overlap.
- The fan ring is seated on the AHU front face without cutting through the housing.
- Hidden airflow stops updating until it is shown again.
- Geometry is capped for tall buildings to keep rendering predictable.

## Verification evidence

- Focused regression suite: **83 tests passed across 7 test files**.
- Scoped lint: **passed**.
- Independent geometry review: **no remaining blocking findings**.
- Browser verification: the airflow control toggles correctly and the scene registers 18 deterministic streams for the verified sample building.
- No WebGL or shader compilation errors were observed.

The repository-wide TypeScript check still reports existing test-fixture issues outside this change:

- `workflow-stepper.test.tsx` and `workflow-store.test.ts` omit the existing `params` workflow stage.
- `accuracy-routing.test.ts` contains pre-existing nullable-result assertions.

## Operational notes

- The Building Ledger proxy now sends `Accept: application/json`, preventing successful upstream responses from arriving with an empty body.
- Keep `DATA_GO_KR_API_KEY` configured as a hosting environment variable. Do not place the key in source control.
- Production target: <https://greenretrofit-bim-nam.gnakkk.chatgpt.site/>
- The deployment must be built from the committed source archive so unrelated local worktree changes are excluded.

## Primary implementation areas

- `src/lib/procedural/` — façade, roof, column, and multi-section assembly.
- `src/lib/structural-codes.ts` — footprint-safe structural placement.
- `src/lib/layers/layer-15-structural.ts` — non-overlapping analysis annotations.
- `src/lib/layers/layer-5-ventilation.ts` — AHU placement and animated airflow.
- `src/lib/layers/layer-manager.ts` — visibility-aware animation updates.
- `src/components/viewer/` and `src/store/layer-store.ts` — airflow control and persistence.
- `src/lib/building-geometry.ts` — physical-floor filtering and deduplication.
- `src/lib/api-proxy.ts` — upstream JSON response negotiation.
