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

Committed/pushed as `23f8f49`; clean detached deployment is READY and aliased to
`https://bim-self.vercel.app`. `/api/health` verified the full commit SHA and
`region: icn1` on 2026-09-07 00:10 KST.

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

## Milestone 2 — collection, datasets and canvas controls

Committed/pushed as `dae269e`; clean production deployment verified on
2026-09-07 00:36 KST. Health reports that commit and `icn1`; nine live smoke
checks passed for downloads/hashes, both canvas routes and old funding state.

- Fifth source model: licensed KIT Office IFC example (fictional validation
  building), 82 modeled spaces / 2,266.66 m², 269.1 kWh/(m²·yr), grade 5 under
  the declared assumptions. Conditioned basement/attic and uninsulated roof
  bias is visible; curved-roof PV exclusions are preserved. No meter data.
- Per-building and catalogue JSON/CSV downloads on the existing gallery/model
  pages. Records include source licences/attribution, units, source/manifest/
  input/payload SHA-256 hashes, code revision, assumptions, partial extraction
  status, modeled outputs and null metered consumption.
- Schependomlaan partial opening extraction is explicitly distinguished from
  the still-active 115.5/40 m² stand-ins. No partial quantity is promoted to a
  complete envelope measurement.
- Independent accessible top/bottom panel collapse preserves local input and
  chosen work. Bottom control relocated after the content because runtime
  testing found the rendering toolbar intercepted its earlier position.
- Removed support-program controls from model/twin/diagnostics/generative
  economics and their shared store. Old localStorage funding selections are
  ignored; report, outliner, equipment and work costs use unsubsidized defaults.
  DCF, chosen measures and optional budgets remain.

Validation: 5,255 unit tests passed, 4 existing skips. TypeScript clean; src/e2e
ESLint 0 errors and 6 existing warnings. Full browser run 101 passed/1 CAD setup
timeout; the full five-test CAD rerun passed. All five legacy funding regression tests
pass. Dataset download/hashes, all five model pages, panel state and PV checks
passed in the full run. KIT and demo screenshots inspected with zero pageerrors.
Earlier failing tests were resolved: actual bottom-control pointer interception,
five new regression assertions mistakenly waiting on a nonexistent attribute,
and an in-flight unit run reading a pre-edit wording assertion. None skipped.

## Milestone 3 — material explanations and source detail

Local implementation adds 2,989 source architectural elements across all five
models, independent default-on detail controls and recoverable detail loading.
Material cards show actual source names/thickness, illustrative texture samples
and thermal assumptions. MEP coverage is inventoried for every source; the
apartment now publishes 73 source drainage/vent elements. Dataset schema 1.1
adds downloadable geometry and MEP coverage. No assumed MEP network is drawn.

Full unit validation: 5,321 passed, 4 existing skips. TypeScript clean;
ESLint src/e2e: 0 errors and 6 existing warnings. Paired Clinic/Schependomlaan
detail-on/off roof screenshots inspected; geometry and PV remain aligned.
Browser integration: 63/69 passed initially; five old row-count expectations
omitted the new details control and one test clicked before hydration. Counts
now include source details and the gated-load test waits for client readiness;
all six reruns passed. Committed/pushed as `347636d`; clean production READY,
health SHA and `icn1` verified on 2026-09-07 00:55 KST. Twelve live smoke tests
passed for source detail, material cards and dataset downloads.

Next work: source-bound material expression on the model, concise categorized
model navigation, and additional licensed public TalTech/Klassiqua models.

## Milestone 4 — focused information and thin-layer stability

Four mounted categories organize model exploration: Overview, Materials,
Layers and Data. Core energy/material facts remain prominent; source detail
and repeated process explanations move into the relevant category/disclosure.
Keyboard navigation, hash links, Back, preserved state/scroll and actual global
KO/EN preference work. Mobile keeps the model visible and initially collapses
its energy rails without resetting later user choices.

The thin-layer shimmer report was checked against the source GLBs. Most exact
core/detail coincidences are opposing contact faces; deleting them is not
justified. The camera's old near/far range cannot distinguish 0.1mm layers at
the tested viewing distances. A model-relative range now updates with camera
movement and improves numerical separation over 100-fold in those cases.
Clipping tests keep all measured corners visible during exterior orbit/zoom;
inside inspection retains a 2cm near plane. Five real model orbit/zoom browser
checks pass with no page errors, and Clinic/apartment/FZK screenshots inspected.

Validation so far: 169 UX unit tests, 36 material/source-property tests and
12 camera/shadow tests; TypeScript clean, ESLint 0 errors/6 existing warnings.
UX browser run 66/71 initially passed; five assertions still expected the old
blanket conductivity assumption label. All six material tests passed after
checking the truthful per-layer source/assumption wording, and final five
navigation checks passed. Full unit run: 5,343 passed, 4 existing skips
(443 passed files, 1 skipped). Committed/pushed as `95f9ada`; clean production
READY, health SHA and `icn1` verified on 2026-09-07 01:15 KST. Ten live
navigation and camera orbit/zoom checks passed.

## Milestone 5 — material rendering, sixth model and source solar orientation

Klassiqua Office 1970 adds a licensed synthetic research archetype with 48
geometry-measured spaces and source document whole-envelope thermal values.
The source review corrected table/page citations, retained the 1.03 insulation
design factor, and quantified the door and floor-edge modeling limitations.
Source MEP inventory states zero typed occurrences without inventing systems.

All six models now default to source-bound material expression. Source surface
selection opens its exact assembly; source/assumed thermal values remain separate
from illustrative finishes. Loading errors preserve the original model and Retry
clears the relevant failed caches. Resource tests protect shared GPU caches.

Actual Blender Lab MCP comparison rejected a mesh roundtrip and lossy default
compression. The accepted byte-preserving Meshopt workflow reduces material
payloads from 7,456,144 to 3,418,856 bytes, retaining 263 draw calls and every
decoded attribute, index, instance transform, source graph and binding. Negative
publish tests reject altered names, index order and transforms. Reproducible
commands and source/tool pins are in `Blender Material Optimization.md`.

Independent source-axis checks corrected roof downslope and true-north bearing;
FZK now fits 44 modules / 17.6 kWp under the existing orientation policy.
Flat racks face true south. Actual cell-face clearance was checked against each
PV-capable source GLB, including Klassiqua. This is separate from camera depth.

Validation: 5,425 unit tests passed, 4 existing skips; TypeScript clean; ESLint
0 errors and 6 existing warnings. Full Chromium 149/150 passed; the sole old
gallery expectation still counted five models. Updated the explicitly reviewed
six-card set, and its rerun passed. Six compressed views inspected; all 11
material loading/picking/retry checks and six camera orbit/zoom checks passed.
Production verification pending.
