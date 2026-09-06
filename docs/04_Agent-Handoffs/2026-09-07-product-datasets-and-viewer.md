# Product evolution — 2026-09-07

User direction: continue CURRENT.md, improve core product and 3D quality,
commit/push/deploy every major verified finish, grow the model collection,
and make BIMFIT useful for accurate and varied building-energy datasets.

Execution prompt:

> Read the verified handoff and runtime implementation, then deliver a complete
> improvement to BIMFIT's core digital-twin experience. Make solar placement,
> rendered geometry, module counts, and retrofit pricing agree. Improve 3D
> lighting, panel detail, and roof inspection without inventing building facts.
> Preserve the four-step workflow and distinguish measurements from assumptions.
> Inspect the reference models, run relevant tests and repository checks, update
> the handoff, then commit, push, and deploy each verified milestone from a clean
> worktree. Expand the collection with a licensed distinct building and publish
> consistent reusable dataset records whose calculated demand is explicitly not
> metered consumption. Confirm production and report remaining limitations.

## Milestone 1 — roof geometry and an inspectable model

Verified locally; production deployment follows this commit:

- Full unit run: 5,184 passed, 4 skipped (429 passed files, 1 skipped).
- Full Chromium E2E run: 92 passed. Final changed geometry/labels/camera tests:
  96 passed. TypeScript clean; ESLint src/e2e: 0 errors, 6 existing warnings.
- All four exterior and roof screenshots inspected with no browser page errors.
- First E2E pass: 87 passed, 5 failed (four new tests checked a zero-size wrapper
  rather than its visible absolute-positioned panel; one unrelated diagnostic
  test timed out). Corrected the new test locator; the 54-test focused rerun and
  then all 92 tests passed. No failing test was skipped.

- All disconnected outer rings survive PV layout. Holes and overlapping
  obstruction clearances are clipped for area accounting. Collapsed narrow
  setbacks cannot become inverted usable polygons.
- The actual renderer's 1.70 × 1.00 m box is aligned with the portrait layout on
  pitches. Every transformed underside corner on all four shipped models fits
  a usable piece and clears its roof. Flat racks are lifted by their geometry,
  instead of half the module cutting through the roof. No mounting survey is
  claimed.
- The sidebar, measure chip and delta strip use fitted capacity, and module
  **surface** area is module count × 1.70 m². The apartment had priced 4.0 kWp
  while its chip claimed 54.3 kWp and its area label claimed 271 m²; these now
  read 4.0 kWp and 17 m².
- Expandable per-plane PV table includes excluded roofs, outline plan area,
  usable area, module surface area, counts, capacity, and assumption/omission
  statements. A positive but un-packable area is not labelled zero area.
- Reference GLTF meshes cast/receive directional shadows when opaque; shadow
  bounds scale with the measured building. Glass/ghost fabric does not cast an
  opaque silhouette. Cached mesh flags are restored on release. Environment
  map loading has its own failure boundary.
- Sidebar controls fit the exterior or look down at the roof. Focus mode hides
  energy overlays while keeping their state/effects mounted; restoring them
  preserves chosen work. Camera fitting checks all measured corners and aspect.
- Shared panels use two instanced batches (frame + cell face), a local procedural
  cell texture and normal-aligned thickness; no external texture request.

Geometric totals (counts independently reconciled with rendered instances):

| Building | Modules before → after | kWp after | Usable plan m² after |
|---|---:|---:|---:|
| Clinic | 447 → 453 | 181.2 | 1693.558 |
| Schependomlaan | 10 → 10 | 4.0 | 73.825 |
| Duplex | 14 → 14 | 5.6 | 80.155 |
| FZK | 22 → 22 | 8.8 | 60.760 |

Usable areas changed because removed areas are now clipped and unioned, not
because the measured roof artifacts changed. Gross is the outline's shoelace
area; it can differ slightly from the extractor's unsimplified triangle area.

Open: roof plant/parapet obstructions, structural/load feasibility and full
shading survey; setbacks, module class and Seoul climate remain assumptions.
The modelled energy path still does not credit LED/PV in kWh or grade.

## Next milestone — collection and reusable records

In progress separately, not yet verified or published: KIT office example
(explicit fictional site), and versioned per-building/catalogue dataset
downloads carrying source licences, hashes, measurement status, assumptions,
climate, calculated outputs and missing metered consumption.
