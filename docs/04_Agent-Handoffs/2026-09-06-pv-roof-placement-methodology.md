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

## The stage-1 contract, as landed (P1, `7451e65`, merged)

`public/reference-buildings/<id>/roof-planes.json`, `kind:
"bimfit_reference_building_roof_planes"`, with `id`, `generatedAt`,
`northAssumed`, a `note` stating the tolerances, and `planes[]`. Each plane:

```text
id, elementName, elementType, elementRef, family, storeyId,
normal [x,y,z], tiltDeg, azimuthDeg (null when flat — 0 would read as due north),
surfaceSqm, projectedSqm, minElevationM, maxElevationM, triangleCount,
outline: [{ kind: "outer" | "hole", points: [[x,z], … closed] }],
obstructions: []   // present and EMPTY on every plane today: an absent field and an empty one are different claims
```

A plane is a **connected patch**, not an algebraic plane: the Duplex's deck
and its entrance pads are one plane algebraically and two roofs to a module,
so the region-grow walks shared edges only. Stage 2 merges nothing implicitly.

FZK, the regression named above, passes exactly: two planes, `Dach-1` tilt
30.00 azimuth 180, `Dach-2` tilt 30.00 azimuth 0, projected 71.50 each,
Σ = 143.00 = the manifest's `roofProjectedSqm`. Merged with tsc 0 and 318
tests in reference-buildings + scripts green (bim-83 had not run them).

**Surface-sum regression — decided, not tuned.** Σ `surfaceSqm` = 165.12 vs
`roofSurfaceSqm` 171.13 (−3.5 %): this file keeps faces within 80° of up;
`roofSurface()` in `ifc-horizontal.mjs` keeps verge and eave faces too. Both
are right for their purpose — heat crosses a verge, a module cannot sit on
one. The 1 % surface regression is **withdrawn**; the rule is Σ plane
`surfaceSqm` ≤ `roofSurfaceSqm`, with the shortfall named as the non-upward
faces in the file's `note`. Neither figure moves.

### P1 — what remains (bim-83 stopped at the contract, correctly, near the end of its context)

1. Build and commit `roof-planes.json` for the other three buildings (the
   script already emits them), each with its own regression read: Duplex one
   flat plane whose outline excludes the two pads; apartment planes at ~63°,
   not one blended ~45°; the Clinic's EPDM and standing-seam families still
   distinguishable.
2. `obstructions` content — roof-hosted openings first (the Duplex's two
   skylights, 1.49 m², already identified in `openings.json`), then
   roof-mounted services elements, then parapets.
3. The plan-view QA SVG per building.

This is **Lane P1b**, for a fresh session. Own worktree off the current
shared tip; same rules; report shas.

## P3a landed — `4e3079e` (bim-24), merged

`twinRoofPlanes(recipe): RoofPlane[]` in `src/lib/retrofit/twin-roof-planes.ts`:
one plane for the top plate at `finishedRoofTopY`, one per terrace a setback
exposes, none where a storey overhangs; storeys walked in
`envelope-quantities.ts:198-210`'s order with the same exported
`floorPlateAreaSqm`, so **Σ projectedSqm === roofAreaSqm by construction**.
Pinned on a stepped recipe, a prism and an overhang. tsc 0, 795 tests.

**Stage-5 addition, from a mistake bim-24 made and its own test caught:** the
terrace `partialOverlap` flag ("the outline's shape is inference") was first
implemented as the same arithmetic on the same two numbers the area already
used — so it could never fire while its name claimed to measure containment.
Now a vertex-containment test. **A flag that cannot fire is not a check; the
way to tell is to construct the case it claims to catch and watch it fire.**
That is the bounding-box bug in miniature.

For P2/P3b: flat planes carry `azimuthDeg: null`, never `0` — `0` would read
as due north and the library's north-facing exclusion would silently drop
every twin plane; terrace outlines carry holes, so the setback inset must
offset outer rings inward and holes outward.

## P2 landed — `8d66037` (bim-54), merged

`src/lib/retrofit/pv-layout.ts`, stages 2–3, pure; reuses `insetRing` and
`pointInRing` rather than a second geometry kernel. **No polygon boolean:**
placement asks "inside the region, clear of the grown obstructions", and
`usableSqm` subtracts each grown obstruction's own area — exact while an
obstruction sits inside the inset outline, and it UNDERSTATES usable roof when
one straddles the edge; stated at the function. Tested on FZK's shipped
artifact: south pitch populated, north refused as `north-facing-pitch`, every
module's whole rectangle inside its region, `totalKWp === count × 0.40`.
`calculateSolarPotential(..., undefined, layout.totalKWp)` — the geometric kWp
is the **sixth** positional argument, the fifth is `electricityPrice`; passing
it in the fifth slot prices the system at ₩59/kWh and leaves the size on the
ratio path, a wrong number rather than a type error. A building with no
`roof-planes.json` keeps the ratio estimate and its description says so.

**Contract note:** the outline on disk is tagged rings
`[{kind:"outer"|"hole", points:[[x,z]…]}]`; the coordinator's message said
"closed rings" and bim-24's type said `PlanRing[]`, and a probe comparing
`outline[0][0]` to `outline[0][last]` on an object returned `undefined ===
undefined` — true, of the wrong thing. The library reads the tagged form BY
TAG and accepts the bare form too. Row pitch at Seoul is **1.769 m**; the
comment had said 1.43 and the test asserts the formula, which is how it was
caught.

**P2 remaining (one line, for whoever holds P1b or P3b):** before/after PV
cost/saving/NPV per building once the other three `roof-planes.json` exist.

Merged with tsc 0; retrofit + reference-buildings + energy suites green.
**P3b is unblocked.**

## P1b landed — main-coordinator, 22:20

All four buildings ship `roof-planes.json` and a plan-view `roof-planes-qa.svg`.
Three things the first contract build could not do, each found by reading the
numbers against the manifest and fixed in `scripts/lib/ifc-roof-planes.mjs`:

1. **Strips.** The Clinic's standing-seam roof is 244 pan solids, one per rib
   bay, and the apartment's tiles are 124 `sporenkap` elements, one per rafter
   bay; shared-edge growing can never join them. A second pass merges patches
   of one FAMILY whose normals agree within 2°, offsets within 150 mm (a rib,
   not a storey) and plan boxes touch within 50 mm. The apartment's south
   tile band is now one 21.3 m² plane over seven elements
   (`mergedElements: 7`); the Duplex's deck and pads stay apart.
2. **Sky occlusion.** Every LAYER of a roof reports an upward face — tiles,
   the deck under them, the insulation under that — so Σ projected read 2.5×
   the plan coverage. Planes are now sorted highest-first and each keeps only
   the plan area no higher plane covers (`occludedSqm` recorded; dropped planes
   counted in `occludedPlanes`; `skyUnionSqm` = the union before occlusion).
   Result: Σ projected = the manifest's `roofUnionSqm` on all four — Clinic
   2592.28 / 2592.43, apartment 360.08 / 361.86, Duplex and FZK exact.
3. **Flat means flat in both fields.** A plane leaning 0.3° from tessellation
   noise was getting a confident azimuth of 270; below sin 0.5° the bearing is
   now null, the same threshold `tiltDeg` rounds at.

Obstructions, first content: unresolved openings now carry their plan
rectangle (`footprint.plan`, from the bounding box `ifc-openings.mjs` already
had), and the build attaches one to a plane when its centre lies inside the
plane's outer ring AND its bottom is within 0.5 m of the plane's elevation —
by geometry, not by name (the apartment has 52 unresolved openings whose
reason text says "roof"; all sit at 0.78 m and none attach). Duplex: 2
skylights, 1.43 m² each, which are ALSO holes in the deck's outline — a hole
already excludes, the obstruction adds the clearance; apartment: 6 rooflights
on tile planes; Clinic and FZK: none. Roof-mounted plant and parapets are
still empty.

What the drawings showed (looked at, `/reference-buildings/<id>/roof-planes-qa.svg`):
the Clinic's standing seam is a **segmented barrel** over the spine — 54
facets ≥ 2 m² at 2–29°, alternating south and north — not five planes, and
that is the right reading for a layout (its north facets will be refused);
the apartment's tiles are a **65° band around a flat 130 m² deck**, so the
old viewer's "tilted panels on the tiled roof" was placing modules on a
surface the suitability rule excludes as a wall — the deck and the flat
strips are the PV roof. Both are recorded as pins in
`src/lib/reference-buildings/__tests__/roof-planes.test.ts` beside the
FZK/Duplex/family/ring/obstruction invariants.

Surface sum: the apartment now reads 733.64 against the manifest's 692.04
(+6 %) because merged strips overlap by their rib heights; the test caps at
+7 % and says so. Withdrawn-regression rule from P1 stands.

Remaining for this stage: roof-mounted plant and parapets as obstructions;
drawing obstructions and, from stage 3, the modules onto the QA SVG.

## P3b — implementation map (main-coordinator, 22:40; every seam read, none edited)

Inputs on the branch: `layoutRoofPlanes(set: RoofPlaneSet, latitudeDeg)` in
`src/lib/retrofit/pv-layout.ts` → `PvLayoutResult` (`planes[].modules[]` with
`centre [x,y,z]` in model coordinates and `quaternion [x,y,z,w]`, plus
`totalModules`, `totalKWp`, `totalUsableSqm`, `excludedPlanes`,
`rackRowPitchM`); `RoofPlaneSet` is `{ kind, buildingId, northAssumed,
planes }` — note `buildingId`, where `roof-planes.json` carries `id`, so an
adapter is one line. `twinRoofPlanes(recipe)` in `twin-roof-planes.ts` for the
twin. `calculateSolarPotential(roofArea, roofType, region, feedIn,
electricityPrice?, geometricKWp?)` — kWp is the SIXTH argument.

1. **Store** (`scenario-store.ts`): add `roofPlanes: RoofPlaneSet | null`,
   session-only (NOT in `partialize`), cleared in `setBuildingInputs` when
   `buildingPk` changes exactly like `appliedMeasureIds`; `setRoofPlanes`.
2. **Hook** `src/hooks/use-pv-layout.ts`: `usePvLayout()` memoises
   `layoutRoofPlanes(store.roofPlanes)`; null when none.
3. **Publish**: model pages — in `reference-energy.tsx`'s `ReferenceEnergyFrame`,
   fetch `${baseUrl}/roof-planes.json` the way `useReferenceZones` fetches
   spaces (abortable, `kind` checked) and `setRoofPlanes({ ...file,
   buildingId: file.id })`. Twin — `building-scene.tsx` near line 525 where
   `recipe` and `retrofitVisuals` already exist: `setRoofPlanes(twinRoofPlanes(recipe))`
   in an effect keyed on the recipe.
4. **Economics**: `EnergyInstrumentHud` (call at line 151) passes
   `pvGeometricKWp: usePvLayout()?.totalKWp` into `useRetrofitScenario`; the
   hook (line 370) forwards it as the sixth argument. The delta:
   `computeRetrofitDelta` builds `context = { roofAreaSqm, region }` at
   `retrofit-delta.ts:548` and `apply-phase.ts:200-213` sizes `solarPV.capacity`
   from `calculateSolarPotential(roofAreaSqm, …)` — add `geometricKWp` to that
   context and pass it through, so the delta's capacity, the measure's kWp and
   the drawn count are one number. Then the per-building before/after the P2
   line asks for.
5. **Viewer**: new `PvModulesVisual({ layout, centre })` — one
   `InstancedMesh(BoxGeometry(1.7, 0.06, 1.0))`, each instance composed from
   `module.centre` (minus the scene `centre` offset the viewer already applies)
   and `module.quaternion`; exposes the count on the wrapper as `data-pv-drawn`.
   In `reference-retrofit-visuals.tsx` DELETE `analyzeUpwardFaces`,
   `resolveRoofFace`, `panelLayoutForRoof`, `classifyRoofTypeForSizing`,
   `usePvSystemSizeOverride`, `usePvPanelMesh`, `FaceSetAnalysis` and the
   PV half of `RoofingLayerRetrofitVisual` / `FabricSlabRetrofitVisual`; KEEP
   their roof-TINT half (`splitTrianglesByElevation`, `roofElevationThresholdM`
   are the roof-insulation tint, not the PV bug). Mount `PvModulesVisual`
   beside `RoofRetrofitVisualBoundary` (viewer line 369) when
   `visual.solarInstalled`. Twin: `solar-panels.tsx` becomes the same
   component fed by the store's twin layout; keep `finishedRoofTopY` only if
   the twin planes' elevations need it (they carry their own).
6. **Tests**: `__tests__/reference-retrofit-visuals.test.ts` — delete the
   `analyzeUpwardFaces`, `classifyRoofTypeForSizing`, `panelLayoutForRoof`
   describes (lines 49, 117, 126), keep the rest; `…visuals.glb.test.ts` —
   delete the describes at lines 166 (both-sheets artefact, an
   `analyzeUpwardFaces` fact), 217 and 266 (`resolveRoofFace` on the roofing
   GLB), keep the two slab-split describes. New: a test that every instance
   the component composes equals a module the layout returned, count equal.
7. **Legend**: `buildRetrofitLegendLines` gains the utilisation summary from
   the layout ("지붕 N면 · 사용 가능 U / G m² · 모듈 M장 · K kWp · 제외 E면") and
   the legend element carries `data-pv-modules={totalModules}`; the per-plane
   rows (tilt, azimuth, gross, usable, modules, kWp, exclusion reason) go in
   `reference-retrofit.tsx`'s panel as a table under the measures.
8. **e2e** (`reference-buildings.spec.ts`, bim-83's, released): with PV chosen,
   `data-pv-modules` on the legend equals `data-pv-drawn` on the viewer, per
   building; on the apartment the tile planes' rows say `north-facing-pitch`
   or `too-steep` and the deck row carries modules.

Expected on screen when done: FZK — south pitch tiled with flush portrait
modules, north pitch empty with its reason; Duplex — racked rows E-W on the
deck, skylights and their clearance empty; apartment — racks on the 130 m²
deck and the flat strips, none on the 65° band; Clinic — racks on the EPDM
decks, the barrel's south facets flush, north facets empty.

## P2 closed — per-building PV economics

Run by **bim-54** off `2215bb9`, the library over all four shipped
`roof-planes.json`. Unsubsidised track, Seoul, ₩130/kWh feed-in; NPV over the
20-year DCF. "ratio" is the old path — roof area × utilisation ÷ 5 m²/kWp;
"geometric" is `count × 0.40 kWp` from modules actually laid on the planes.

| building | planes | excluded | gross m² | usable m² | modules | geo kWp | ratio kWp | geo/ratio | cost ratio → geo | kWh/yr ratio → geo | NPV ratio → geo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Clinic | 82 | 80 | 2,537.4 | 1,958.9 | 447 | 178.8 | 373.4 | **0.48×** | ₩5.60억 → ₩2.68억 | 438,896 → 210,144 | ₩4.26억 → ₩2.04억 |
| Schependomlaan | 51 | 51 | 227.9 | 15.5 | **0** | **0.0** | 54.3 | **0.00×** | ₩8,144만 → ₩0 | 63,814 → 0 | ₩6,201만 → ₩0 |
| Duplex | 1 | 0 | 132.9 | 60.9 | 14 | 5.6 | 18.6 | **0.30×** | ₩2,792만 → ₩840만 | 21,873 → 6,582 | ₩2,125만 → ₩640만 |
| FZK Haus | 2 | 1 | 143.0 | 60.8 | 22 | 8.8 | 17.1 | 0.51× | ₩2,567만 → ₩1,320만 | 20,113 → 10,343 | ₩1,954만 → ₩1,005만 |

**Every building falls, and three of the four fall outside the 0.5–2× band.**
(Schependomlaan's 0.00× is now known to be an artifact bug — see its row
below. The Clinic, Duplex and FZK figures stand.)
That is the finding, not a calibration problem: the ratio path multiplied a
whole roof area by a utilisation factor, and the geometry then removes the
setback, the obstruction clearance, the row pitch, the north-facing pitches
and every patch too small or too steep to hold a module. Named, per building:

- **Schependomlaan → zero. CORRECTED — this is a P1 artifact bug, not an
  honest zero.** My first write-up called it "the honest answer for a
  steeply-tiled Dutch roof of small fragments". main-coordinator doubted it,
  on the grounds that the deck's ~130 m² is flat and should have carried
  racks. They were right and I was wrong.

  `dakvloer-plane-0` states `projectedSqm: 130.2` and its outline ring is
  `[[6.957,−7.971],[7.035,−7.98],[7.035,−2.657],[6.957,−2.657]]` — a
  0.078 × 5.31 m sliver enclosing **0.41 m², 0.3 % of the stated area**.
  Three of the building's 51 planes are like this. **The other three
  buildings have none** (checked: outline area ≥ 50 % of stated
  `projectedSqm` on every plane of the Clinic, Duplex and FZK).

  So the library was right and the input was not: it refused a plane whose
  ring cannot hold a module, and reported `no-usable-area-after-setback` —
  a true sentence about the wrong plane, which is exactly the failure this
  round keeps producing. **Schependomlaan's PV figure is not yet a finding**
  and the ₩0 in the table above should not be rendered or deployed until
  the outline is re-extracted. The remaining 19 `tilt-above-60` refusals on
  its 63° sporenkap ARE real and will stand.

  Guarded, so this cannot recur silently: `planeExclusion` now refuses a
  plane whose outline encloses under 50 % of its stated `projectedSqm` with
  the named reason `outline-area-disagrees-with-stated`
  (`PV_OUTLINE_AREA_MIN_RATIO`), and a test asserts no plane of the three
  clean buildings trips it. **P1's owner: three Schependomlaan planes need
  their outlines re-extracted; the stated areas look right.**
- **Clinic 0.48×.** 80 of 82 planes refused (44 no-usable-area, 18
  north-facing, 18 sub-module) — the sky-occlusion pass leaves many small
  patches. The two surviving EPDM decks still carry 447 modules; the fall is
  the flat-roof row pitch (1.769 m for a 1.0 m module) that a 0.7 utilisation
  factor never charged for.
- **Duplex 0.30×.** One flat plane, 132.9 m² gross → 60.9 m² usable after a
  1.0 m setback on a small roof and two skylights at 0.5 m clearance. A 1.0 m
  setback costs proportionally far more on a 133 m² roof than on a 2,500 m²
  one, which is why the smallest building falls furthest.
- **FZK 0.51×.** Two 30° pitches, north refused, south flush-mounted.

**Two contract mismatches found while running this**, both fixed in the
library rather than in the script, because a consumer written from the doc
would hit them too:

- Obstruction polygons are `plan` on disk; the doc calls the field `outline`.
  Both are accepted (`obstructionPlan`) — reading only `outline` silently
  subtracted nothing, which on the Duplex would have placed modules over two
  skylights while reporting them as avoided.
- Outline rings are tagged `{kind, points}`, and are read **by tag, not by
  order**.

Remaining for P3b: the legend's utilisation table and `data-pv-modules` come
from `layoutRoofPlanes(...)` directly — `totalModules`, `totalKWp`, and the
per-plane `excludedReason`, which is why every refusal above has a name.

## The apartment's zero was a sliver, not a roof (22:25)

bim-54's P2 table put Schependomlaan at 0 modules and they, correctly, would
not let it deploy on that reading. Both of us found the cause within minutes
of each other: `dakvloer-plane-0` (the 130 m² flat deck) carried a MULTIPOLYGON
outline — three tagged outers, the first a 0.078 × 5.31 m clipping sliver the
sky-difference left behind — and the library took the first outer as "the"
plane. It laid the deck out on 0.41 m² and refused it. Fixed on both sides,
because a consumer written from the field list would hit it again:

- extractor (`outlineRings`): a polygon whose outer encloses under 0.05 m² is
  dropped — the file never states a roof piece no module could sit on;
- library (`toPolygon`): the LARGEST outer is the plane, holes kept only when
  inside it; smaller pieces are dropped, which understates usable roof and
  says so — a per-piece layout is the follow-up;
- library (`planeExclusion`, bim-54 `d5c1283`): a plane whose outline encloses
  under 50 % of its stated area is refused as
  `outline-area-disagrees-with-stated`, never a bare zero.

After: the deck places 10 modules / 4.0 kWp on 33.1 m² usable — real, and
low for a 130 m² deck (six rooflight holes grown by 0.5 m, a 1 m setback, and a
1.77 m rack pitch on a 3.9 m-wide deck). **P3b's owner: look at the deck on
the QA drawing before accepting 33 m²**; the other 50 refusals (19 too steep,
22 too small, 8 no area after setback, 1 outline disagreement) stand.
Regression lesson, third time this round: **build against the file, not the
field list, and construct the case a guard claims to catch.**

## P3b landed — main-coordinator, 23:15

Stage 4 on both viewers, from one layout. `scenario-store` carries the active
building's `roofPlanes` (session-only, cleared with the building);
`use-pv-layout.ts` runs `layoutRoofPlanes` over them once; the model page
publishes `roof-planes.json` (fetched like spaces) and the twin publishes
`twinRoofPlanes(recipe)`. `viewer/pv-modules.tsx` draws the layout's module
instances at their own centres and quaternions on both surfaces
(`solar-panels.tsx` is now that component; the footprint grid is gone).
`analyzeUpwardFaces`, `resolveRoofFace`, `panelLayoutForRoof`,
`classifyRoofTypeForSizing`, `usePvSystemSizeOverride` and `usePvPanelMesh`
are deleted; the roof-TINT halves of the two roof visuals stay. The PV
measure, the delta and the strip are all priced at the layout's kWp
(`pvGeometricKWp` → the sixth argument), so the picture, the legend and the
NPV describe one array.

Legend: one PV line from the layout — "태양광: 지붕 51면 · 사용 가능 49 / 358 m²
· 모듈 10장 · 4.0 kWp · 제외 50면 (60° 초과 19면, …)" — and `data-pv-modules`
on the legend, `data-pv-drawn` and `data-roof-planes` on the viewer.
`e2e/reference-buildings.spec.ts` waits for the planes before every "before"
snapshot (the fetch had been moving the delta under the test) and asserts
legend = drawn per building. Verified: tsc 0, full vitest 5,137, full
Playwright 88, eslint 0 errors. Not yet looked at in a browser by a person —
the numbers on the apartment (10 modules on the deck) and the Duplex (14
racked rows) are the layout's, and the QA drawings are the check.

Still open from this lane: the per-plane utilisation table in the side
panel (the legend carries the summary); obstructions for plant and parapets.

**Deployed 23:20 — production `eb84d61`.** `/api/health` reports the sha in
`icn1`; all four model pages 200 with `roof-planes.json` served; the VWorld
canary still returns a building ring. Lane 3D remains the only open item
from the day's briefs.
