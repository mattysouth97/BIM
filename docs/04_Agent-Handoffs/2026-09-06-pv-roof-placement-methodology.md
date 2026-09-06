# PV roof placement — methodology, and the lanes that implement it

Written 2026-09-06 20:25 by **main-coordinator** (`497d5c`), on the user's
instruction, verbatim: *"Look at how the PV panels are not placed accurately
to the roofs. Please define a methodology to calculate and evaluate the roof
area and make accurate placement of the pv panels."*

Base: `feat/design-stage-energy-diagnostics` at `74fd9fe` (production `223736a`).

## Why the panels are wrong today (read from the code, not the screenshot)

Both placements are **bounding-box grids**, and a bounding box is not a roof.

- `reference-retrofit-visuals.tsx` `analyzeUpwardFaces` takes every
  upward-facing triangle of the roof set, sums their area, blends their tilts
  into one **area-weighted mean angle**, and returns the set's **XZ bounding
  box** and apex. `panelLayoutForRoof` then picks a ridge direction from the
  box's longer side, sizes a count from kWp, and centres a rectangular grid
  in that box at one tilt about one axis, clipped only by an `EDGE_MARGIN`
  from the box's edges. So: an L- or T-shaped roof (the Clinic's wings) gets
  modules over the notch; a roof with lower pads (the Duplex's entrances)
  gets modules above air; a gable (FZK, the apartment's 63° tiles) gets one
  representative plane where the roof has two facing opposite ways; hips get
  one plane where they have four; and nothing knows about skylights, plant,
  parapets, or the north-facing half of a pitch.
- `viewer/solar-panels.tsx` (the twin) does the same on
  `footprintWidth × footprintDepth`, i.e. a rectangle even when P2-30 gave the
  building per-storey plates and a polygon footprint.
- The module **count** comes from `calculateSolarPotential`, which turns an
  AREA into kWp by a usable-area ratio and a density, and the grid then places
  as many modules as the box allows up to that count. The count and the
  geometry never meet: the economics can price 373 kWp on the Clinic while
  the grid draws whatever fits a box that includes courtyards.

The user's complaint is exact. The fix is not a better box; it is per-plane
geometry, and it has to be measured at build time like every other envelope
figure here, so that the picture, the count, and the economics agree by
construction.

## Methodology

Five stages. Each produces a named, testable artifact, and each stage's
output is the only input the next stage reads.

### 1 · Roof planes, measured from the model (build time)

For each roof element the manifest already lists in `roofs[]` (IfcRoof,
IfcSlab ROOF, IfcCovering ROOFING), take its tessellated triangles and:

1. Keep upward-facing triangles (`n·ŷ > cos 80°`), as the extractor already
   does for `tiltDeg` / `upFacingProjectedSqm`.
2. **Cluster into planes**: two triangles belong to one plane when their unit
   normals agree within 2° and the plane offsets (`n·p`) agree within 20 mm,
   and they are edge-connected through such triangles. Region-grow; a plane
   is a connected patch, so two parallel patches at different heights are two
   planes.
3. For each plane emit: `elementName`, `elementType`, `normal`, `tiltDeg`
   (= acos(n·ŷ)), `azimuthDeg` (bearing of the downslope direction, measured
   from the model's project north — carry `northAssumed` from the manifest;
   a flat plane has no azimuth), `surfaceSqm` (Σ triangle areas),
   `projectedSqm` (Σ |n·ŷ| × area), `minElevationM`, `maxElevationM`, and the
   **outline**: the boundary of the union of the triangles' plan projections
   as one or more closed rings in metres (outer ring counter-clockwise, holes
   clockwise), simplified to 10 mm.
4. **Obstructions on the plane**: (a) roof-hosted openings — the skylight rows
   `openings.json` already lists as roof-hosted or unresolved (the Duplex
   names two, 1.49 m²); (b) roof-mounted plant — any element of the
   building's services layers whose bounding box bottom lies within 0.5 m
   above the plane and whose footprint overlaps the outline (the Clinic's
   roof units); (c) parapets and upstands — wall elements whose base sits on
   the plane, as a strip along the outline. Emit each as a plan polygon with
   a `kind` and the element it came from.

Write `public/reference-buildings/<id>/roof-planes.json`
(`kind: "bimfit_reference_building_roof_planes"`) beside the manifest, from
the same `--generated-at`, byte-stable.

**Regression, per building:** Σ `projectedSqm` over planes of one roof
family = the manifest's `roofProjectedByFamilySqm` for that family within
1 %; Σ `surfaceSqm` = `roofSurfaceSqm` within 1 %; the Clinic's EPDM and
standing-seam families stay distinguishable; FZK yields exactly two planes at
30° facing opposite azimuths; the Duplex yields one flat plane whose outline
excludes the two entrance pads; the apartment's tiled roof yields planes at
~63°, not one blended ~45° (the angle bim-7c already found to be physically
nonexistent).

### 2 · Usable area per plane (pure library)

`src/lib/retrofit/pv-layout.ts`, a pure module with no THREE and no React:

1. **Suitability**: exclude a plane when `tiltDeg > 60°` (it is a wall in
   all but name), when `projectedSqm` is below one module's footprint, or
   when it is pitched (`tiltDeg ≥ 10°`) and its azimuth is within ±45° of
   north — in the northern hemisphere a north-facing pitch is not a PV
   surface. Every exclusion is a **named reason** on the plane, rendered,
   never a silent drop.
2. **Setback**: inset the outline by `s` — 1.0 m on a flat roof (parapet
   access and wind-uplift edge zone, the same idea as the twin's
   `ROOF_MARGIN`), 0.3 m on a pitched plane from eaves, ridge and verges.
   These two figures are **assumptions** (`A-PV-SETBACK`) until someone
   cites a Korean standard for them; say so in the assumption list. Use a
   proper polygon offset (miter-limited, the way `insetRing` already does
   it), not a bbox shrink.
3. **Obstructions**: offset each obstruction polygon outward by 0.5 m
   (working clearance, `A-PV-CLEARANCE`) and subtract it from the inset
   outline. The result is the **usable polygon set** for the plane, possibly
   several disjoint pieces.
4. Report per plane: `grossProjectedSqm`, `usableSqm`, `usableRatio`, and
   the list of subtractions with their areas, so the reader can see where
   the roof went.

### 3 · Module layout per plane (same library)

Module: 1.70 × 1.00 m, 0.40 kWp (`PV_PANEL_RATED_KWP`, already an assumption
in the code — keep one constant, cite the datasheet class it stands for).

- **Pitched plane (10° ≤ tilt ≤ 60°)** — flush mount. Work in the plane's own
  2D frame: `u` along the strike (horizontal, ⟂ to the downslope direction),
  `v` up the slope. Modules **portrait** (1.0 m along `u`, 1.7 m along `v`)
  with 20 mm gaps; rows stacked up-slope with 100 mm gaps. Grid origin at
  the usable polygon's lower-left in (u,v). A module is placed only if its
  **whole rectangle**, mapped back to plan, lies inside a usable piece. Its
  3D pose is the plane's normal and azimuth; its elevation comes from the
  plane equation at its centre, plus module thickness.
- **Flat plane (tilt < 10°)** — racked. Tilt β = 30° (`PV_FIXED_RACK_TILT_DEG`,
  Korean fixed-rack convention, already in the code), modules landscape,
  facing **south** in the climate's frame (the model's project north, with
  `northAssumed` carried into the legend). Rows run east-west. **Row pitch**
  from the no-shading rule at the winter solstice: with module slope length
  L = 1.0 m, `pitch = L·cos β + L·sin β / tan α`, where the solar altitude at
  solar noon on the solstice is `α = 90° − φ − 23.45°` at the climate's
  latitude φ (Seoul 37.57° → α ≈ 29°, pitch ≈ 1.77 m; the buildings are
  all under the Seoul climate assumption, so that is the latitude to use and
  the reason to state). Place a module only when its rack's plan footprint
  lies wholly inside a usable piece.
- **Count and capacity**: `kWp = count × 0.40`. This geometric kWp becomes
  the **system size the economics prices** — `calculateSolarPotential`
  keeps its yield and cost physics but receives the count-derived kWp
  rather than deriving one from an area and a ratio. That will move the
  PV measure's cost, saving and NPV on every page; report the before/after
  per building and put the reason in the measure's basis line.

Output per plane: the module instances (centre, quaternion, module id,
plane id) and the metrics; per building: total count, kWp, and a
**roof-utilisation table** — one row per plane with gross / usable /
placed-module area / kWp / reason-if-excluded.

### 4 · Rendering (the two viewers)

- Model pages: `reference-retrofit-visuals.tsx` reads `roof-planes.json`
  (fetched like `spaces.json`), runs the library, and instances modules at
  the returned poses. `analyzeUpwardFaces`, `resolveRoofFace` and
  `panelLayoutForRoof` are deleted, not kept as a fallback — a fallback to a
  bounding box is the bug wearing a different name. A building with no
  `roof-planes.json` renders no PV and the legend says the roof was not
  measured.
- Twin: `solar-panels.tsx` builds one flat plane per top plate from
  `applyLevelPlates` / the footprint polygon (P2-30 already gives per-storey
  plates and terrace differences) and runs the same library. The rectangle
  path goes.
- Legend, per building: the utilisation table's summary — "지붕 4면 · 사용
  가능 312 / 611 m² · 모듈 148장 · 59.2 kWp · 북향 1면 제외" — with the
  per-plane rows behind 자세히.

### 5 · Evaluation — how we know it is right

Three kinds of check, none optional:

1. **Geometric invariants (unit, on the library):** every module's plan
   rectangle is inside its usable piece; no two modules overlap; every
   module respects the setback and clearance; on a flat plane no module's
   rack shades the next at solar noon on the solstice (pitch ≥ formula);
   pitched modules' normals equal the plane's normal; `count × module area
   ≤ usableSqm`; kWp = count × rating exactly.
2. **Per-building pins (unit, on the shipped `roof-planes.json`):** plane
   count, tilts and azimuths per building as measured; utilisation table
   values; the four regressions in stage 1. These go red when the
   extraction moves, which is the point.
3. **Looking at it (e2e + a QA image):** `e2e/reference-buildings.spec.ts`
   asserts the legend's count equals the instanced count the viewer
   exposes on a `data-pv-modules` attribute, per building. And a build-time
   **plan-view QA image** per building — outline, usable polygons,
   obstructions, and module rectangles drawn to scale as SVG under
   `public/reference-buildings/<id>/roof-planes-qa.svg` — so a person can
   see in one glance whether the modules sit on the roof, which is the
   check the bounding box failed and no test caught.

Acceptance: on all four buildings, no module outside a roof plane, no module
over a void or a north-facing pitch, both FZK pitches populated on the south
side only, the Clinic's two roof families laid out separately with the plant
avoided, the Duplex's pads excluded, and the economics' PV kWp equal to the
drawn count × 0.40.

## Lanes

| lane | who | delivers | files |
|---|---|---|---|
| **P1 · planes** | bim-83 | stage 1 + the QA SVG + per-building pins | `scripts/lib/ifc-roof-planes.mjs` (new), `scripts/build-reference-building.mjs` (one call + one output), `public/reference-buildings/*/roof-planes{.json,-qa.svg}`, `manifest.ts` (type for the new file), tests under `src/lib/reference-buildings/__tests__/` |
| **P2 · library** | bim-54 | stages 2–3 as a pure module with the invariant tests, and the economics wired to the geometric kWp with before/after per building | `src/lib/retrofit/pv-layout.ts` (new) + tests, `src/lib/retrofit/solar-potential.ts` (accept a kWp), the PV measure's basis line, `A-PV-SETBACK` / `A-PV-CLEARANCE` in the assumption lists |
| **P3a · twin planes** | bim-24 | a pure module turning a recipe's plates into the stage-1 `RoofPlane[]` shape — one flat plane per top plate and per terrace difference, reusing `envelopeQuantities`' walk (`envelope-quantities.ts:202-210`) so the planes and the frame's roof m² are one roof; elevation from `finishedRoofTopY`; test pins plane count and Σ projected = `roofAreaSqm` on the demo recipe | `src/lib/retrofit/twin-roof-planes.ts` (new) + test |
| **P3b · render** | **a fresh session, after P2 lands** (bim-24 declined at ~68 % context, correctly: a local stand-in layout would be the box renamed) | stage 4 on both viewers, the legend, `data-pv-modules`, the e2e assertion | `reference-retrofit-visuals.tsx`, `viewer/solar-panels.tsx`, `e2e/reference-buildings.spec.ts` (the one assertion — bim-83 owns the file; coordinate) |

Scouting for P3b, from bim-24 (20:23): `FloorSpec.plate?: [number, number][][]` is the twin's plane source (ring sets with holes, per storey); `applyLevelPlates` lives at `src/lib/cad-reconstruction/ledger-bridge.ts:314`, **not** under `src/lib/procedural/`, called from `building-scene.tsx:395`; `viewer/solar-panels.tsx` grids `footprintWidth × footprintDepth` with `ROOF_MARGIN` 1.2, `MAX_PANELS` 600, tilt 30°, and `finishedRoofTopY(recipe)` for elevation — keep that datum. Housekeeping: the lane worktrees' `node_modules` are junctions to the main checkout — unlink the junction in PowerShell before `git worktree remove`, or the shared modules go with it.

Order: P1 and P2 start now on the interface in stage 1 (the JSON shape above
is the contract — P2 builds against a hand-written fixture of it until P1's
artifacts land); P3 starts on the twin's plate path immediately and takes
the model pages when P1 + P2 are merged. Rules as in the parity brief: own
worktree, path-scoped commits, `--generated-at 2026-09-04T00:00:00.000Z`,
byte-identical checks against the git blob, tsc unpiped, and **look at the
QA SVG and the page** before reporting. Report shas to main-coordinator; I
merge, run the full suites, and deploy.

Every session on this round is past 60 % context. If yours cannot finish a
lane, land what is green with the remaining steps written into this file,
and say so — a fresh session picks the lane up from here, not from your
transcript.

## Outcome

_(filled in as lanes land)_
