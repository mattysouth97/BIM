# Clinic — exterior glazing (verified) and usage-profile sources

Written 2026-09-04 17:10 by main-coordinator. Everything below was either
measured on `Clinic_Architectural.ifc` by four independent routes and
adversarially verified, or read from a standards document extracted with
`pdfjs-dist` (digit-loss check clean on every file). Nothing is from memory.

## Exterior glazing — the number to use

| quantity | value | basis |
|---|---|---|
| Aperture (58 windows + 15 exterior storefronts) | **267.16 m²** | route A; independently re-derived at 266.78 (0.14% apart) |
| Second confirmed route (name-blind geometry) | 275.13 m² | includes 12 flush exterior doors' frames differently; both stand |
| Actual glass pane | **~225 m²** | 224.85 by the verifier's render-colour test (228.81 counted one opaque door leaf) |
| Below main roof datum +9.25 | ~152 m² aperture | against 1,909.56 m² opaque wall → **~7% glazed** |
| Above +9.25 (clerestory monitors over the concourse) | 114.43 m² | against 240.73 m² wall → ~32% |
| **Window-to-wall ratio, whole envelope** | **10.9%** | 267 / (2,150.30 + 267 + 37.06 doors) |

The 10.9% is a property of the **building**, not an undercount: a material
sweep finds exactly one glass `IfcMaterial` on 167 plates, all children of the
31 curtain walls, none missed. The occupied storeys are ~7% glazed and the
concourse is daylit from above. **Do not normalise the WWR upward** to an
outpatient norm.

Refuted: an IsExternal-property route at 315.89 m² — 81.00 m² of it was
second-floor screens onto an interior two-storey atrium. A host-wall route at
379.36 m² was likewise not confirmed.

Open items the verifiers surfaced:
- Opening #3329, 5.72 m² hole in exterior wall #195 with no filling element —
  neither wall, glazing nor door in this file. Already voided from 2,150.30.
- Two unglazed apertures (gable arch in #549; two-storey recess at X −2.45..+0.26).
- Curtain walls #879/#881 are a mirrored pair, counted once.
- The single "Dbl Glass" exterior door (4.21 m²) has no transparent geometry;
  excluded from pane, included in aperture.

## A false trap in my own brief

I told the workflow *"roughly 40 of 58 IfcWindow are interior vision panels."*
All four routes refuted it: all 58 are hosted in the 80-element exterior wall
set. The "40" was the count of windows carrying **no** `IfcRelSpaceBoundary` —
an absence, not an INTERNAL flag. Identical windows in the same host wall land
on both sides of that split, which is the proof it is an export artefact.
Recorded in AGENTS.md as the eighth instance of the label failure.

## Usage-profile sources (for the demo-style energy cards)

- **Lighting**: ASHRAE 90.1-2010 Table 9.5.1, Building Area Method,
  *Health-care clinic* **0.87 W/ft² ≈ 9.4 W/m²** (2016 edition: 0.82;
  2004: 1.0). Source list: search results 2026-09-04; vancouver.ca copy of the
  2010 table was 403 on fetch, values corroborated across three listings.
- **Ventilation**: ANSI/ASHRAE Addendum af to 62.1-2016, Table 6-1 additions
  for *Outpatient health care facilities* (extracted from the ASHRAE PDF):
  General examination room Rp 7.5 cfm/p (3.8 L/s·p), Ra 0.12 cfm/ft²
  (0.6 L/s·m²), default 20/1000 ft²; Dental operatory 10 / 0.18 / 20;
  Other dental treatment 5 / 0.06 / 5; Class 1 imaging 5 / 0.12 / 5.
  62.1-2007 Table 6-1 *Office space*: 5 cfm/p, 0.06 cfm/ft², 5/1000 ft².
- **Schedule** (ECO2's method family): DIN V 18599-10 profile 42
  *Arztpraxen und Therapeutische Praxen*, **08:00–18:00, 250 d/a**
  (baunormenlexikon Table A.40). Internal-gain and lx values are not public.
- 주용도코드 for 의료시설 is **09000**; `LIGHTING_DEFAULTS`/`OCCUPANCY_DEFAULTS`
  in `korean-building-codes.ts` have no 09000 row and fall to `default`
  (lpd 8, density 0.06, gain 8) with no cited source — do not use for the Clinic.

## Demo-style energy profiling — the path

`/building/demo` renders `<EnergyCards buildingPk>` → `useEnergyMetrics(pk,
sigunguCd)` reading `useMaterialStore.properties[pk]` and
`useEffectiveRecipe(pk)`; the demo feeds `getDemoRecipe()`. To give the Clinic
the same cards: a `BuildingRecipe` (footprint, 2 storeys at 0/4.57/9.25, WWR
0.109, orientation) + `MaterialProperties` (U wall 0.400, EPDM roof 0.317,
standing-seam 3.450, ground via ISO 13370, LPD 9.4) registered under a Clinic
pk, and `<EnergyCards>` mounted on `/models/bs-medical-dental-clinic`.
bim-72 was building the recipe/materials pair for `generateECO2Input`; asked
17:08 whether it exists before writing a second one.

## Demo-style profiling — landed (2026-09-04 evening)

`/models/bs-medical-dental-clinic` now carries the demo's whole instrument
frame (`EnergyInstrumentHud`, extracted from `TwinStageOverlay` unchanged):
CAPEX→ROI rail, program track, grade / kWh·m⁻²·yr / CO₂ / W strip, ECO2
export, plus the 외피 열손실 · 방위별 창면적비 · 에너지 존 legend. The path is
the demo's own — `useEnergyMetrics` over `useMaterialStore` +
`useRecipeStore` — seeded under the key `ref:bs-medical-dental-clinic`.

What made it honest rather than fitted:

- **`BuildingRecipe.measuredEnvelope`** (`src/lib/procedural/types.ts`).
  `envelopeQuantities(recipe)` returns it verbatim with `source: "measured"`
  instead of extruding the 52.66 × 56.90 bbox, and throws on a zero or NaN.
  The bbox stays a bbox.
- **WWR against GROSS wall.** The engine does `windows = gross × wwr` then
  prices `gross − windows` as wall, so gross = 2,150.30 opaque + 267.16
  glazing + 37.06 doors = 2,454.52 and wwr = 0.1088 (the 10.9 % above). The
  net-wall ratio 0.1242 that was first proposed would have landed the
  windows on 267.16 while unpricing 267 m² of wall. Doors end up at wall U
  (A-DOORS). Tests assert the engine's element areas: Windows 267.16,
  Walls 2,187.36, Roof 2,669.21, Ground 2,621.08, Ventilation 20,685.33.
- **Volume measured, not bracketed.** `scripts/lib/ifc-space-volume.mjs`
  takes the signed volume of every IfcSpace solid; `spaces.json` now ships
  beside the manifest with one row per space (area, storey, net and gross
  volume with basis, plan extent). Gross conditioned volume **20,685.33 m³**
  = floor area × storey floor-to-floor per room + the three OPEN TO BELOW
  voids as their own solids; the room solids themselves sum to
  **12,928.26 m³** because 150 of 153 first-floor rooms stop at a 2.80 m
  ceiling under a 4.57 m storey. The engine takes gross (ACH50 is quoted
  against the air barrier); the 37 % gap is the same suspended-ceiling
  mechanism as the morning's 37 % wall-area undercount from space boundaries.
- **Zones from the file.** `src/lib/reference-buildings/zones.ts` groups the
  259 floor-counting IfcSpace rows into storey × program by a keyword table
  over the room names (158 distinct; only ROOF and OPEN TO BELOW fall to
  기타, and neither is a zone). Demand is apportioned by area share, the
  same rule and the same disclaimer the twin prints.
- **Verified on screen, not only in tests** — and the first screenshot lied:
  an unfocused Chrome tab throttles `requestAnimationFrame`, so the strip's
  animated numbers froze at 3.8 % of their targets (−7.0 kWh/m², 6,565 W)
  and the R3F canvas stayed blank. One click into the tab and the strip read
  104.9 kWh/m²·yr, 22.3 kgCO₂/m²·yr, 173,839 W — the engine's own figures
  to the watt. Screenshot a background tab and you are looking at the
  animation, not the value.

Open: per-orientation glazing (the four WWR rows are the measured wall split
under one assumed ratio, and the legend says so); HVAC efficiencies from the
device data (A-HVAC is a placeholder); the ISO 13790 monthly kernel (bim-72's
brief, `iso-13790-monthly-kernel-brief.md`) is not yet wired to this page.

## The apartment (Schependomlaan) — published

The three locks were lifted 2026-09-04 ~17:28 on the user's ruling that the
page is educational use: artifacts committed in `f5091e7`, id in
`REFERENCE_BUILDING_IDS`, card linked. Its manifest keeps `attribution`
null and renders the reason. **It has no MEP layers because the archive has
no MEP model**: the design-model folder holds one architectural IFC, and the
"Coordination model and subcontractors models" folder's only services file,
`HB_Nutsvoorzieningen.ifc` (34 MB, SketchUp 2015), is 42
`IfcBuildingElementProxy` utility connections with no `IfcFlowSegment`, no
ports and no system — measured 2026-09-04 by entity count. Nothing to
extract, so nothing is claimed. It also has no energy inputs yet
(`energy-inputs.ts` returns null for it), so the page shows the model and
says nothing about energy.
