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

Two are published: `bs-medical-dental-clinic` and `schependomlaan`.
`REFERENCE_BUILDING_IDS` in `src/lib/reference-buildings/manifest.ts` is the
list, and a building missing from it does not route.

## The information contract

Every `/models/[id]` page renders **the same sections in the same order with
the same row set**, and a row the building's file cannot supply is rendered as
a row that says so. Omission is how the two pages came to differ in the first
place: one had a warning, the other had silence, and silence read as "fine".

Order down the side panel:

| # | Section | `data-testid` | Source |
|---|---|---|---|
| 1 | Title, name, summary | — | `manifest.name`, `manifest.summary` |
| 2 | 디지털 트윈 레이어 | `reference-model-layers` | `manifest.model`, `manifest.serviceLayers` |
| 3 | 흐름 방향 | `reference-model-flow-absent` when no layer states ports | `serviceLayers[].flow` |
| 4 | 외피 구성 · U-값 | `reference-model-constructions` | `constructions.ts`, solved from the model's own `IfcMaterialLayerSet` |
| 5 | **에너지 프로파일** | `reference-model-energy` | `ReferenceEnergyPanel` |
| 6 | **리트로핏** | `reference-model-retrofit` | `ReferenceRetrofitPanel` |
| 7 | 연면적 / 외벽(순) / 지상층 / 구성 | — | `manifest.areas`, `manifest.counts` |
| 8 | Location note, attribution | `reference-model-attribution` | `manifest.site`, `manifest.licence` |

Over the canvas, the frame (`EnergyInstrumentHud`, shared verbatim with
`/building/[id]`) carries **에너지 평가**: the scenario rail, the 그린리모델링
track chips, the notice band, the grade/kWh/CO₂/heat-loss strip, the grade
basis line, and the CAPEX grip.

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
facts the knapsack itself used (post-subsidy CAPEX, NPV, budget):

- NPV < 0 → the saving never repays the outlay on these terms.
- NPV ≥ 0 but effective CAPEX > budget → it would pay, it does not fit.
- One of a mutually-exclusive pair → the alternative is already in the set.
- Otherwise → another combination within the same budget sums to a higher NPV.

This matters more than it sounds. At the default ₩2.5억 with no subsidy the
Clinic selects **0 of its 6** measures. Six cards each saying why is an answer;
an empty list under "0개 선택 · NPV ₩0" reads as a broken panel.

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
