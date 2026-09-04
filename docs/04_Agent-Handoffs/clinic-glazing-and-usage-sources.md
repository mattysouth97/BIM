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

## 267.16 replaced by 262.73 — reproduced by the extractor (2026-09-05)

The table above is superseded. `scripts/lib/ifc-openings.mjs` now measures
every opening from the file and the manifest carries the result
(`areas.glazingApertureSqm`, `glazingByOrientationSqm`, `exteriorDoorSqm`,
`openingsNote`; one row per element in `openings.json`). The Clinic's
constants in `bs-medical-dental-clinic-energy.ts` moved to the reproducible
figures, and the reason is recorded in A-WWR-LOW / A-DOORS.

| quantity | was | now | why |
|---|---|---|---|
| Glazing aperture | 267.16 (route A, re-derived 266.78) | **262.73** | 58 IfcWindow at OverallWidth × OverallHeight (100.63) + 15 exterior IfcCurtainWall at the projected outline of plates and mullions (162.10). Route A's method was recovered from its transcript afterwards: the same 73 elements, reproduced here to 0.01 m² per storefront, with one difference — the 4.19 m² "Dbl Glass" entrance leaf in storefront #742 was inside its union there and is an IfcDoor here. 262.73 + 4.19 = 266.92 vs 266.78. |
| Exterior doors | 37.06 | **36.08** | 12 hosted leaves 31.89 (OverallWidth × OverallHeight = their cut openings to the millimetre) + the Dbl Glass leaf 4.19. 37.06 is not reproduced by any route tried — not leaf, not opening, not IsExternal. |
| WWR against gross | 10.9 % | **10.7 %** | 262.73 / (2,150.30 + 262.73 + 36.08 = 2,449.11). |
| Per sector | one assumed ratio | N 54.79 · E 95.11 · S 49.58 · W 63.24 | each window by its host wall's sector, each storefront by its outward face. |

The three definitions the storefronts admit, for the record: per-plate glass
sum 143.38 (bim-bf's 238.00 less the interior screens and the fence), the
adopted projected outline 162.10, bounding rectangles 187.49 (the gable in
#549 alone is 20.11 as a rectangle, 12.55 as an outline). The outline is
adopted because it is the analogue of a window's frame opening — what the
wall plane gives up to the glazing system, mullions included, voids
excluded — and it is what route A had measured.

What removed the other 16 of the 31 curtain walls, by geometry rather than by
list: a probe on each side of every curtain wall against the 262 conditioned
IfcSpace solids found a room on **both** sides of 13 — the five second-floor
atrium screens (#455, #745, #752, #753, #873; 91.24 m² of outline, 83.63 of
plate — the "81.00" above) and the eight "Storefront - Interior" walls — every
one of them `IsExternal = TRUE`; the two chain-link fences are excluded by
name in the building config with the reason stated; #881 is coincident with
#879 to the centimetre and is counted once. Route A's 15 and this set are the
same 15 elements.

The apartment (Schependomlaan) runs through the same code with a different
result, stated in its own `openingsNote`: ArchiCAD's fills chain never reaches
the inner leaf (it carries zero IfcOpeningElements; each frame is its own
`kozijn` element in the wall line), so attribution is by an exterior wall
adjacent in the opening's plane. 51 of 77 real windows resolve (106.06 m²);
16 of the 20 IsExternal doors confirm (81.03 m²), the four `merk F-R` do not
because the only inner wall beside them is `opgaand werk`, which the wall
config excludes; 12 windows sit in `knieschot` / `zijwang dakk` walls the
exterior set does not carry, 4 `merk N` have a 0.65 × 0.61 m plan footprint
(a corner or splay, not a flat opening), and 10 rooflights state no size.
Only 6 of its 100 spaces have solids, so the both-sides probe is reported
inconclusive there, not as "exterior".

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
  prices `gross − windows` as wall, so gross = 2,150.30 opaque + 262.73
  glazing + 36.08 doors = 2,449.11 and wwr = 0.1073 (the 10.7 % in the
  2026-09-05 section; it was 267.16 / 37.06 / 2,454.52 / 0.1088 before the
  extractor reproduced the openings). The net-wall ratio 0.1222 that was
  first proposed would have landed the windows on 262.73 while unpricing
  263 m² of wall. Doors end up at wall U (A-DOORS). Tests assert the
  engine's element areas against the file's constants: Windows 262.73,
  Walls 2,186.38, Roof 2,667.38, Ground 2,577.42, Ventilation 20,701.55.
  (Roof and ground re-measured 2026-09-04: the roof is the outer SURFACE —
  EPDM 2,286.93 less 74.55 under the standing-seam barrel, plus the barrels'
  one-sheet 455.00, where the earlier 382.28 was 764.56 ÷ 2 of near-horizontal
  faces over both sheets, not a projection; the ground drops the 43.66 m²
  outdoor equipment pad "Floor:150mm Slab on Grade:221475" that no space
  stands on.)
- **Volume measured, not bracketed.** `scripts/lib/ifc-space-volume.mjs`
  takes the signed volume of every IfcSpace solid; `spaces.json` now ships
  beside the manifest with one row per space (area, storey, net and gross
  volume with basis, plan extent). Gross conditioned volume **20,701.55 m³**
  = floor area × storey floor-to-floor per room + the three OPEN TO BELOW
  voids as their own solids + the 9.25 m lift shaft as its own solid; the room solids themselves sum to
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
