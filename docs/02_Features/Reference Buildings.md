# Reference Buildings

`/models/[id]` — a published IFC model carrying the app's full energy
treatment, with every figure marked as read from the file or assumed.

Written 2026-09-06 (Lane 2 of the gallery-consistency brief). Before this
there was no feature document for `/models/*` at all.

## What a reference building is, and is not

It is a real, licensed, publicly-available IFC model, extracted once by
`scripts/build-reference-building.mjs` into `public/reference-buildings/<id>/`
(a manifest, GLB layers, a spaces file), plus a hand-written energy-inputs
file that hands the engine a `BuildingRecipe` and a `MaterialProperties`.

It is **not** a 건축물대장 building. It has no register row, so it has no
official floor area, no 주용도 the app read from a title, and no site. The
things a register would have supplied are supplied by the model — measured off
its own solids — or are named assumptions. `AGENTS.md`'s stated-versus-assumed
rule applies unchanged; only the source of "stated" moves from the register to
the IFC.

Six are integrated: `bs-medical-dental-clinic`, `schependomlaan`,
`duplex-apartment`, `fzk-haus`, `kit-office` and `klassiqua-office-1970`.
The KIT examples and Klassiqua research archetype are synthetic buildings;
a public IFC does not establish a real occupied site.
`REFERENCE_BUILDING_IDS` in `src/lib/reference-buildings/manifest.ts` is the
list, and a building missing from it does not route.

## The information contract

Every `/models/[id]` uses the same four information categories. Missing source
data is stated explicitly in the relevant category; silence is not confirmation.

| Category | Content | URL fragment |
|---|---|---|
| Overview | Core quantities, energy profile, bias, retrofit | `#overview` |
| Materials | Source layer stacks, thermal basis, illustrative samples | `#materials` |
| Layers | Fabric/details/services, MEP coverage, analysis overlays and flow | `#layers` |
| Data | Dataset exports, detailed quantities, source notes and attribution | `#data` |

Tab content stays mounted, preserving selections and independent scroll.
Explicit changes create browser history entries; Back and keyboard navigation
work. Camera controls and category navigation stay outside the scrolling body.
Global Korean/English preference controls the sidebar as well as the energy HUD.
On mobile the model and information area share the viewport; reference-model
energy rails initially collapse below 768px and retain later user choices.
The ordinary building twin keeps its existing expanded defaults.

Over the canvas, the frame (`EnergyInstrumentHud`, shared verbatim with
`/building/[id]`) carries **에너지 평가**: the scenario rail, the 그린리모델링
track chips, the notice band, the grade/kWh/CO₂/heat-loss strip, the grade
basis line, and the CAPEX grip.

The 2026-09-07 integration adds independent default-on architectural detail
controls and source MEP coverage to Layers. Materials now shows thickness-scaled
illustrative samples, actual IFC names and per-layer thermal assumptions with
unknown values explicitly unresolved. Base-file exclusions are labelled as
applying to the base fabric file, since detail and service layers are separate.
See [[Reference Architectural Details]], [[Reference MEP Coverage]] and
[[Building Energy Datasets]].

Source-bound material expression defaults on for all six models. The independent
material fabric replaces the base only after geometry and textures are ready;
errors preserve the base and expose Retry. Clicking a surface opens its source
assembly in Materials; an orbit drag does not select it. The toggle, selection,
X-ray and proposal state survive category navigation. Geometry and transforms
remain those of the source, with owned UV/material resources and cache-safe
cleanup. Source-assigned assemblies use their thickest stated layer as an
illustrative material sample, explicitly not a verified outer finish. Unsupported,
ambiguous and unassigned surfaces stay neutral. Textures do not supply λ or U.

The material GLBs retain per-element IFC association references in a separate
index. Occurrence associations take priority over type associations; neither
missing nor conflicting evidence is guessed. Blender MCP lossless compression
reduces the six files from 7,456,144 to 3,418,856 bytes while preserving every
decoded buffer, source graph and material binding. See
[[../03_Development/Blender Material Optimization|Blender Material Optimization]].

The camera now updates near/far clipping against the model bounds on orbit,
pan and zoom. The old `distance/800` near plane wasted depth precision at
building scale: a 0.1mm gap fell below one 24-bit depth increment in tested
views. The adaptive range gives over 100 times finer separation while keeping
measured bounds visible. Source triangles and contact faces are unchanged.

### Rows that state an absence

These exist because the alternative is a blank, and a blank is not a claim:

- **흐름 방향, apartment.** All of its service models declare no distribution
  ports, so there is no port graph and no animation. The heading used to stand
  alone with nothing under it; it now says why, where the question is asked.
- **측정 상태.** The apartment says `측정 대기 · 자리표시자 N개` with the
  composition of the stand-ins. The Clinic says `실측 완료`. Before 2026-09-06
  the Clinic said nothing, and the absence of a warning is not a statement.
- **지붕 형태.** A building whose energy file states no `roof` renders "this
  building's file states no roof typology … a stand-in, not a reading" in the
  retrofit basis rather than being silently priced as a flat deck.

## Energy: one baseline

Schependomlaan still uses **115.50 m² glazing and 40.00 m² doors as named
stand-ins**. This does not mean that aperture extraction is absent. Its
committed `openings.json` records 51 counted windows / 106.06 m² and 16
counted doors / 81.03 m², resolved against the current exterior-wall set.
Twelve further sized windows / 19.49 m² sit by omitted knee/dormer walls,
four corner/splayed windows / 5.57 m² remain unresolved, and ten rooflights
have no stated dimensions. Only 6 of 100 conditioned spaces have solids
for the boundary probe. These totals are a selected-host subset, so they
must not replace the whole-envelope stand-ins as completed measurements.
Resolve the wall and opening scope together (`A-WALL-SET-SCOPE`) before
promoting them; the three pending-input records remain in force.

The frame's kWh/m² and its NPV are computed from **one** engine run.

`EnergyInstrumentHud` calls `useEnergyMetrics(buildingPk, sigunguCd)` with the
same arguments `EnergyCards` uses — the active-building store's `sigunguCd`,
falling back to the caller's 시도 prefix — so the two memoise to one answer
rather than to two that happen to agree. It then passes:

- `engineDemand` — the engine's own `AnnualDemand`. Without it
  `useRetrofitScenario` falls back to `floorArea × 120` and `× 30`, which is
  1.35× the Clinic's real heating demand and 3.30× the apartment's.
- `engineEnvelopeAreas` — the areas the engine actually priced, read off its
  heat-loss elements by `engineEnvelopeAreasFrom`. The side panel's retrofit
  section calls the same function, so the two surfaces cannot drift.

### The unit trap in `engineDemand`

`AnnualDemand.heatingDemand` is **delivered** energy (useful ÷ η, cooling ÷
COP) because that is what a meter reads. `generateHvacRetrofits` documents its
input as **useful** heat and divides by η itself. Passing the engine's figure
straight through applies the same η twice and inflates every heating-side
saving by 1/η — 18 % on the Clinic's 0.85 boiler.

`usefulDemandFromEngine` converts back and mirrors `annual-demand.ts`'s
normalisation and its 0.3–6 clamp. A test rebuilds `heatingRaw` from the
heat-loss elements and fails if the two ever drift apart.

### Measure areas

| Measure | Area | Why not the obvious thing |
|---|---|---|
| Roof insulation, PV | `heatLoss` "Roof" — the measured roof **surface** | It was `footprintArea`, the ground slab. The apartment's roof is 542.96 m² over a 345.81 m² footprint: 36 % short. PV also goes on the roof, not the footprint. |
| Floor insulation | `heatLoss` "Ground Floor" | — |
| Window replacement | `heatLoss` "Windows" = gross × the mean WWR | It was the NET wall × the ratio, which understates the aperture by the ratio itself. |
| Wall insulation | "Walls" − `exteriorDoorSqm` | The engine's wall element is `gross − aperture` with doors inside it (`A-DOORS`, since it knows walls and windows and nothing between). Nobody insulates a door, so a **stated** door area comes off; where none is stated, nothing is guessed. |

### The window-to-wall mean

`meanWindowToWallRatio` (`src/lib/energy/heat-loss.ts`) is the single function
both `calculateHeatLoss` and `useRetrofitScenario` use.

- Where `recipe.measuredEnvelope` exists, the four cardinal ratios are
  **area-weighted** by each orientation's own measured wall. An unweighted
  mean gives a 74.12 m² south elevation the same say as a 148.90 m² north one
  and stops reproducing the building's aperture the moment they differ.
- Everywhere else — every 건축물대장 building, whose per-orientation areas are
  an extrusion of one footprint — the unweighted mean stays. Weighting an
  extrusion by its own extrusion learns nothing.

Both published buildings currently hand the engine one identical ratio on all
four cardinals (`A-WWR-DENOMINATOR`), so weighted equals unweighted and
**neither building's kWh/m² moved** when this landed. The change is what makes
a real per-sector split safe to land.

### What the grade is

The badge renders a bare `1+++`. Three things about it are not inferable from
the frame, and the `energy-grade-basis` row states all three:

1. It is a **Korean** 건축물 에너지효율등급, on a US clinic and a Dutch
   apartment, under a Seoul climate neither is in (`A-CLIMATE`).
2. It is struck on **primary** energy, not the site kWh/m² printed beside it.
   The apartment reads 40.5 next to a grade struck at 65.7.
3. It is read off the residential or the non-residential threshold table.

**Fixed 2026-09-06, and it moved grades.** Which table is used was decided by
`isResidentialOccupancy` — occupant density above 0.1 persons/m² — and that
test is backwards for dwellings, which are the least densely occupied
buildings there are. Three of the four published buildings are dwellings
(`mainPurpsCd` 02000, 02000, 01000) and all three were graded on the 비주거용
table, whose 1+++ band is 80 kWh/m²·yr against the 주거용 60.

`buildingTypeForGrade(materials, mainPurpsCd?)` now lets the use code decide
where there is one. Site kWh/m² did not change anywhere — the table is a
scale, not a physics change — but the grades did:

| building | use code | grade |
|---|---|---|
| Clinic | 09000 | 1+ → 1+ (unchanged) |
| Schependomlaan | 02000 | 1+++ → **1++** |
| Duplex Apartment | 02000 | 1 → **4** |
| FZK Haus | 01000 | 1+ → **2** |

건축물대장 rows whose register says 단독/공동주택 move the same way; an
업무시설 row does not. A code the app cannot classify — 09000 의료시설 returns
`"default"` from `ledgerUseCategory` — is **not** a decision and falls through
to occupancy rather than being silently read as non-residential. That case is
the one the grade row still discloses.

## Retrofit

`ReferenceRetrofitPanel` lists **every candidate**, grouped by
`RETROFIT_CATEGORY_ORDER` (envelope → hvac → lighting → renewable), using
`MeasureCard` from `src/components/retrofit/measure-card.tsx` — the same card
`scene-outliner.tsx` renders on `/building/[id]`, extracted rather than copied.

Every measure not in the selected set carries the reason, read off the three
facts the knapsack itself used (unsubsidized CAPEX, NPV, budget):

- NPV < 0 → the saving never repays the outlay on these terms.
- NPV ≥ 0 but effective CAPEX > budget → it would pay, it does not fit.
- One of a mutually-exclusive pair → the alternative is already in the set.
- Otherwise → another combination within the same budget sums to a higher NPV.

The budget is optional and defaults to no ceiling. Recommendations then include
NPV-positive work; a supplied budget applies the knapsack. The user's chosen
work is seeded once and is not silently replaced by later budget changes.
Support-program controls were removed on 2026-09-07; costs are unsubsidized.

### What these measures do NOT do to the engine

Three disclosures in the basis list, each measured rather than assumed:

- **Lighting and PV move NPV and cannot move kWh/m² or the grade.**
  `deliveredFromDemand` derives lighting as a flat 15 % of total demand and
  hard-codes `renewable: 0`, so `lightingPowerDensity` and `solarPV` reach
  neither the degree-day run nor the grade path.
- **The HRV's saving comes from `hvac-retrofits.ts`, not from this engine.**
  `mechanicalAch` returns 0 while `ventilation.type` is `"natural"`, so
  switching to heat recovery makes the engine read `airflowRate` for the first
  time and the modelled air-exchange loss RISES while the measure claims a
  saving. Open, and scheduled outside this brief — the fix is in
  `heat-loss.ts` and would move every ledger building.
- **Window replacement is priced on the heating side only.** Its SHGC is left
  unchanged, so no cooling change is claimed.

## Adding a building

1. A config block in `scripts/build-reference-building.mjs`, and the artifacts
   under `public/reference-buildings/<id>/`. **Licence and rights holder read
   from the source repository first** — no artifact ships without them.
2. The id in `REFERENCE_BUILDING_IDS`, in the same commit as the artifacts.
3. `<id>-energy.ts` beside the other two, same exports, every figure MEASURED
   (naming the extraction), PLACEHOLDER (in `pendingMeasurements`, with an
   `envelopeBias`) or ASSUMED (in the assumptions array, with the reason).
4. An entry in `energy-inputs.ts`. **State `roof` and `exteriorDoorSqm`** —
   both are optional and both render as a declared absence if omitted, which
   is honest but worse than reading them.
5. A gallery card in `src/lib/landing/gallery.ts`.

The page needs no per-building code. A building with no `energy-inputs.ts`
entry renders its model and says nothing about energy, which is the honest
state for one whose inputs have not been built — a frame with defaults would
be a number nobody derived.

## Where things live

### Roof inspection and PV accounting (2026-09-07)

`ReferencePvUtilisation` exposes every plane from `usePvLayout`, including
exclusions, in an expandable table. Gross and usable areas are plan areas
derived from the roof outlines; module area is panel surface area. The sidebar
candidate, measure chip, delta strip, legend and drawn instances use the same
geometric capacity. No data means zero priced capacity until the measured
planes arrive; the default chosen set waits for that arrival.

Disconnected roof pieces are laid out separately. Setbacks and obstruction
clearances are clipped/unioned for accounting; transformed module corners are
tested against the roof geometry. Plant and parapet obstacles remain absent
and are disclosed as potentially reducing fitted capacity.

The sidebar offers exterior fit, roof view and model-focus mode. Focus mode
hides the energy panels without unmounting their data/state effects. Opaque
GLTF meshes receive and cast scale-fitted directional shadows; ghosted fabric
does not cast an opaque silhouette. PV cells and frames share two instanced
batches and the layout's exact poses.

Implementation record and before/after values:
[[2026-09-07-product-datasets-and-viewer]].

| Path | What |
|---|---|
| `src/components/reference-building/reference-building-workspace.tsx` | The two halves, section order |
| `src/components/reference-building/reference-energy.tsx` | Seed, frame, 에너지 프로파일 panel, badge + grade sentences |
| `src/components/reference-building/reference-retrofit.tsx` | 리트로핏 section, exclusion reasons, basis lines |
| `src/components/retrofit/measure-card.tsx` | The one card, the formatters, `RETROFIT_CATEGORY_ORDER` |
| `src/components/twin/energy-instrument-hud.tsx` | The frame, shared with `/building/[id]` |
| `src/hooks/use-retrofit-scenario.ts` | Measures, `usefulDemandFromEngine`, `engineEnvelopeAreasFrom` |
| `src/lib/energy/heat-loss.ts` | `meanWindowToWallRatio` |
| `src/lib/reference-buildings/energy-inputs.ts` | The registry, and the shape a new building fills in |

### Canvas panels and dataset reuse (2026-09-07)

Top investment/work and bottom energy panels collapse independently using
keyboard-accessible buttons. Contents remain mounted, preserving the budget,
chosen measures and open details; each collapsed panel retains a reopen button.

The gallery and every model page provide JSON and CSV published-baseline
downloads. See [[Building Energy Datasets]] for units, scope, provenance, hashes
and the distinction between calculated energy and absent metered consumption.

The fifth model is KIT Office, a licensed fictional IFC example with 82 modeled
spaces. Source-based floor/roof quantities are separate from conditioning and
uninsulated-roof assumptions; their direction of bias is visible beside the
measurement badge. Its curved roof does not fit modules under the current
layout assumptions; the per-plane table records exclusions rather than
inventing solar capacity. See [[2026-09-07-kit-office-ingestion]].
