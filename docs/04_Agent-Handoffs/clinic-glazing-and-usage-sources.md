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

## Why there is no apartment model or card yet

Three deliberate locks, all verified in production at `4a97e28`: no artifacts
under `public/reference-buildings/schependomlaan/` (the build has **not been
executed** — `schep-wt` holds only the Clinic's), the card in
`HELD_GALLERY_ITEMS`, and the id absent from `REFERENCE_BUILDING_IDS`. All
three follow the user's own ruling *build now, decide publishing later* on
the licence-authority question (CC BY 4.0 granted by a student committer;
ROOT bv named as author; README says "scientific and academic purposes"; the
DOI resolves to a private OSF node). Flipping them is one config change plus
running the build; the residual risk is the grantor's authority.
