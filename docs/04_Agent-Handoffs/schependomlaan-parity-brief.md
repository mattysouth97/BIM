# Schependomlaan parity brief — same layers, same energy frame as the Clinic

Written 2026-09-04 21:58 by main-coordinator, on the user's instruction:
*"make sure that schependomlaan apt. page also includes the same layers,
energy, etc... as the dental clinic"* and *"delegate the work to other
sessions"*. Committed so it survives any session; a decision that lives only
in a context window is already lost.

The Clinic page (`/models/bs-medical-dental-clinic`) has three things the
apartment page (`/models/schependomlaan`) does not:

1. **Discipline layers** — toggleable GLBs beside the fabric.
2. **Envelope constructions with solved U-values** — the 외피 구성 section.
3. **The energy frame** — CAPEX→ROI rail, grade / kWh / CO₂ / W strip, ECO2
   export, and the 외피 열손실 · 방위별 창면적비 · 에너지 존 legend.

Three lanes, three sessions, one integrator. Rules first, then lanes.

## Rules that hold for every lane

- **Stated versus assumed is the product.** The manifest carries what the file
  states; every λ, U, ratio, schedule and climate is a named assumption with a
  reason. `AGENTS.md` "The label lies while the number is right" — nine
  instances today. Read it before writing a sentence next to a number.
- **Path-scoped commits, in one command.** `git add <paths> && git commit` —
  never across a message round-trip (three staged-file sweeps today). Never
  `git commit -a`.
- **Nothing under `public/` changes except by rebuild**, and every rebuild
  must leave the Clinic's GLBs byte-identical (`sha256sum` before/after).
  `--generated-at 2026-09-04T00:00:00.000Z` always.
- **Report the sha to main-coordinator; do not deploy.** One deploy at a
  time, from a clean detached worktree, and it is mine.
- **Each lane edits only its files.** Cross-lane needs go through me.
- Verification is `tsc`, `eslint`, the relevant `vitest` directories, and
  **looking at the page** — a test that a string appears is not a test that
  the string is true.

## What the file already gives us (from `public/reference-buildings/schependomlaan/`)

| fact | value | where |
|---|---|---|
| Floor area | 965.67 m² over 100 spaces, 4 storeys of 3.0 m (0 / 3 / 6 / 9) + `-1 fundering` datum + `04 dak` at 12 | `manifest.areas`, `manifest.storeys` |
| Exterior wall, inner leaf, net | 426.63 m² — N 148.90 · E 104.67 · S 74.12 · W 98.94 | `areas.exteriorWallByOrientationSqm`, `northAssumed: true` |
| Conditioned volume | gross 2,897.04 m³ · net 2,530.05 m³ | `areas.conditionedVolumeGrossM3 / roomVolumeNetM3` |
| Assemblies | 28 `IfcMaterialLayerSet`s, Dutch names, thicknesses stated | `manifest.assemblies` |
| Windows / doors | 77 / 20 (counts only — **no areas yet**) | bim-bf's 17:19 figures |
| Site | town **Nijmegen** stated; coordinate rejected (Amersfoort constant); true north not stated | `manifest.site` |
| Licence | CC BY 4.0, `attribution: null` (holder not established) — renders as a statement | `manifest.attribution` |
| Rooms | 100, Dutch names: WOONKAMER, SLAAPKAMER 1/2, KEUKEN, BADKAMER, TOILET, ENTREE, GANG, OVERLOOP, BERGING, KAST, MK, INSTAL. RUIMTE, ONBEN. RUIMTE | `spaces.json` |

**Not yet measured, and needed by the energy frame:** roof area
(horizontal-projected), ground-slab area and exposed perimeter, glazing
aperture (total and per orientation), exterior door aperture. The Clinic got
these from an ad-hoc pass and a doc; this time they go into the extractor,
generically, and the Clinic's committed figures are the regression test.

## Lane A — layers from the archive's subcontractor models · **bim-f0**

The archive (`openBIMstandards/Archive-DataSetSchependomlaan`, `master`) has
no MEP model — measured: `HB_Nutsvoorzieningen.ifc` is 42
`IfcBuildingElementProxy` utility connections, no `IfcFlowSegment`, no ports.
But `Coordination model and subcontractors models/BIMsight Projectdata1/`
holds the real coordination set, and those are the layers:

| layer id | ko / en | files (top-level `BIMsight Projectdata1/`, not the `ProjectData/` duplicates) |
|---|---|---|
| `structure` | 구조 (철골) / Steel frame | `BERNTS-Staalconstructie.ifc` (3.9 MB) |
| `precast` | 프리캐스트 바닥·계단 / Precast floors & stairs | `GEELEN-Breedplaat V1/V2/V3.ifc`, `GEELEN-Dakvloer.ifc`, `WAARDO-Kanaalplaatvloer.ifc`, `MULTICOM-balkons/-banden/-trappen+bordessen.ifc` |
| `roofing` | 지붕 마감 (기와) / Roof tiling | `WILLEMSEN-Hoogbouw.ifc`, `WILLEMSEN-Hoogbouw dakpannen.ifc`, `WILLEMSEN-Laagbouw.ifc`, `WILLEMSEN-laagbouw dakpannen.ifc` |
| `railings` | 난간·발코니 / Railings & balconies | `BALKONHEKKEN 23-9-2015.IFC`, `FEK - *.IFC` (three files, the largest 12 MB) |
| `blockwork` | 내벽 블록 / Internal blockwork | `XELLA-*.ifc` (four storeys), `YTONG-Kavel 01..10.ifc`, `YTONG-Algemeen.ifc` |
| `utilities` | 설비 인입 / Utility connections | `HB_Nutsvoorzieningen.ifc` (34 MB, SketchUp, 42 proxies) |

Skip `JORDAHL-Gevelderagers` (façade anchors, invisible at building scale)
and `V_L_Constructief.ifc` (131 bytes — a pointer or empty). Say so in the
config comment.

What has to change:
- `scripts/build-reference-building.mjs` `SCHEPENDOMLAAN.files` gains one
  entry per file with a `role`, and `serviceLayers` gains one entry per
  layer id with the roles it draws from (a layer may span several files —
  check whether the loop at the service-layer pass handles one role per
  layer only, and extend it to a `roles: []` list if so).
- `scripts/lib/ifc-glb.mjs` `SERVICE_GROUPS` is MEP-typed
  (`IfcFlowSegment`, …). These models are `IfcBeam`, `IfcColumn`,
  `IfcMember`, `IfcPlate`, `IfcSlab`, `IfcStair`, `IfcRailing`,
  `IfcCovering`, `IfcWall`, `IfcBuildingElementProxy`. Add a per-layer
  `groups` override on the config (type list → group name → colour) rather
  than widening the MEP table; `collectServiceInstances` already takes
  `serviceGroups`. One colour per layer is fine; add the ids to
  `LAYER_COLOUR` in `reference-building-workspace.tsx`.
- Flow: these files declare no ports. The existing `flow.reason` path
  already renders "declares no distribution ports"; make sure it does for
  each of these rather than an empty animation.
- Units: check each file's `IfcUnitAssignment` (the reader records it as
  `file.units`); the architectural file is MILLIMETRE. A SketchUp export
  may differ. Any GLB that lands 1000× off will be obvious on screen —
  look.
- Fetch through `fetchSource` with SHA-256 recorded like every other file.
  Raw URLs work for this repo (no LFS: the 34 MB file came down raw).
- Rebuild Schependomlaan only. Report per-layer triangle counts, draw
  calls and bytes; keep the total of new GLBs under ~40 MB or say why not.

## Lane B — measure what the energy frame needs · **bim-bf**

Generic extractor passes, verified against the Clinic's committed figures
before they are trusted on the apartment:

1. **Roof area, horizontal-projected**: Σ over the top faces of `IfcRoof`,
   `IfcSlab` with `PredefinedType ROOF`, and `IfcCovering ROOFING` of
   (triangle area × |n_y|). Clinic regression: EPDM 2,286.93 + standing
   seam 382.28 (projected) = 2,669.21 within 1 %. Emit
   `areas.roofProjectedSqm` plus the per-element rows in a `roofs` array
   (name, element type, projected m², tilt) — the Clinic's two roof
   types must remain distinguishable.
2. **Ground slab area and exposed perimeter**: the lowest storey's
   `IfcSlab`s (bottom face area, projected) and the perimeter of their
   union outline. Clinic regression: 2,621.08 m² (excluding the 167.32 m²
   of exterior paving — a `Floor:150mm Exterior Slab on Grade` you must
   exclude by IsExternal or by name, and say which) and 217.01 m.
3. **Glazing and exterior doors**: aperture per `IfcWindow` / `IfcDoor`
   from `OverallWidth × OverallHeight`, attributed to a host wall through
   `IfcRelFillsElement → IfcOpeningElement → IfcRelVoidsElement → wall`,
   kept only when the host is in the exterior-wall set (the same set
   `netFaceAreasByElement` uses), and binned by that wall's orientation
   from `orientWalls`. Curtain walls: the plates' area by the same
   outward-face rule. Clinic regression: aperture 267.16 m² (windows +
   storefronts, 58 + 15 elements) ± 1 %, doors 37.06 m². Emit
   `areas.glazingApertureSqm`, `areas.glazingByOrientationSqm`,
   `areas.exteriorDoorSqm`, and per-opening rows in `openings.json`.
   **This closes the Clinic's open item too** — the four WWR rows on its
   legend are currently one assumed ratio under a measured wall split.
4. Manifest type (`src/lib/reference-buildings/manifest.ts`) gains the new
   optional fields; `clinic-glazing-and-usage-sources.md` gets a line
   saying the doc's figures are now reproduced by the extractor.

Rebuild both buildings; Clinic GLBs byte-identical; report the apartment's
numbers to main-coordinator AND to bim-72.

## Lane C — the apartment's energy inputs · **bim-72**

`src/lib/reference-buildings/schependomlaan-energy.ts`, the sibling of
`bs-medical-dental-clinic-energy.ts`, exporting `SCHEPENDOMLAAN_RECIPE`,
`SCHEPENDOMLAAN_MATERIALS`, `SCHEPENDOMLAAN_MEASURED_ENVELOPE`,
`SCHEPENDOMLAAN_ASSUMPTIONS`; plus the entry in `energy-inputs.ts`, a
`SCHEPENDOMLAAN_LAYER_MAPPINGS` table in `constructions.ts` (make the
solver pick its table by `manifest.id`), and the Dutch rows in the
`zones.ts` keyword table (WOONKAMER/SLAAPKAMER → 거실·침실, KEUKEN,
BADKAMER/TOILET → 위생, ENTREE/GANG/OVERLOOP → 동선, BERGING/KAST →
수납, MK/INSTAL. RUIMTE → 설비, ONBEN. RUIMTE → unnamed, say so).

Decisions already taken, do not re-open:
- **Climate: Seoul, as assumption `A-CLIMATE`**, same as the Clinic. The
  town Nijmegen IS stated and the assumption must say so and say that the
  engine's regional table is Korean-only — a sourced Nijmegen HDD/CDD
  entry (KNMI) is a follow-up, not this lane.
- **WWR against GROSS wall** (opaque + glazing + doors), derived from the
  measured numbers, never typed. Until Lane B lands, carry the aperture as
  a named placeholder assumption and switch to the measured figure when it
  arrives — the file must say which state it is in.
- **Volume: gross 2,897.04** (`conditionedVolumeGrossM3`), net recorded.
- `mainPurpsCd` 02000 (공동주택), era 2010-2019 (built 2015–16), `strctCd`
  for masonry/precast — say what the era does and does not decide.
- The exterior wall is a **cavity wall whose leaves are separate IfcWall
  instances** (bim-bf, 17:19): inner leaf `IFC_kalkzandsteen_100/120mm`,
  cavity `IFC_isolatie_110mm_glaswol`, outer leaf
  `IFC_baksteen_*_100mm`. The composite U is an inference the file does
  not state as one assembly — build it as `A-CAVITY-WALL` with the three
  stacks cited, expected U ≈ 0.28–0.33 W/m²K (Rc ≈ 3.0–3.5, the Dutch
  2012 Bouwbesluit minimum was Rc 3.5 for walls). Roof:
  `IFC_dakplaat_geisoleerd_Rc=4,00` — the name states Rc 4.00; solve it
  from the layers AND record the stated Rc, and if they disagree by more
  than 10 % say which is used and why. Ground:
  `IFC_vloer_geisoleerde_kanaalplaat_Rc=3,00` through ISO 13370
  (`ground-coupling.ts`), same as the Clinic.
- Glazing U: Dutch 2015 HR++ double glazing ≈ 1.1–1.2 W/m²K, frame
  `IFC_kozijn_90x114` hardwood — assumption `A-GLAZING`, cite the
  Bouwbesluit 2012 window limit of 1.65 (2015 revision) as the ceiling.
- Airtightness: qv;10 ≈ 0.6 dm³/s·m² is the NTA 8800 default for new
  build; convert to ACH50 and state the conversion. Occupancy: residential
  profile; LPD residential. HVAC: none stated in the file — placeholder,
  labelled as the Clinic's A-HVAC is.

Tests mirror `bs-medical-dental-clinic-energy.test.ts`: engine element
areas, gross × wwr = aperture, net ≤ gross, every assumption id declared
and >40 characters of why.

## Integration · **main-coordinator**

Order: Lane C can start now on the manifest's figures; Lane B's numbers
replace its placeholders; Lane A is independent. I merge, run the full
suite, look at both pages in a browser (focus the tab first — an unfocused
tab freezes the animated numbers at ~4 %), and deploy. Report shas to me as
they land; I will not pull work out of your worktrees.

## Outcome — 23:10, production `7b9e0f8`

| lane | who | landed as | result |
|---|---|---|---|
| A layers | bim-f0 → fresh agent | `143b93e`, `ed51554`, `4105108` | six layers, 29.3 MiB, utilities as labelled boxes; Clinic byte-identical |
| B1 glazing | bim-bf → fresh agent | `2e1c6b6`, `31fffc4` (merged `85863f0`) | Clinic 262.73 m² by per-element outline reproducing route A; doors 36.08; apartment 106.06 / 81.03, 16 of 20 doors confirmed against an exterior wall, 4 `merk F-R` named |
| B2 roof/ground | fresh agent | `9412833`, `46837ce` (merged `b74ce3b`) | Clinic ground 2,577.42 (43.66 m² pad excluded), seam surface 455.00; apartment roof 542.96 derived, ground 345.81 / 90.08 |
| C energy inputs | bim-72 → fresh agent | `9fd77dd`, `9a93a84` (merged `c9749e0`), constants `7b9e0f8` | recipe, materials, 28-assembly mappings, Dutch zone rows; three stand-ins remain, badge predicts the grade falls |

Two things settled on the way: **IsExternal has never meant envelope** on
any building here (both cavity leaves, party and foundation walls, atrium
screens — it means "not an interior partition"); and P2-35, the blank
viewport on cold load, was a hidden-tab artefact (rAF paused, so the
canvas never measured) — recorded in SESSION-LOCKS with the visibilityState
evidence. Open: A-WALL-SET-SCOPE (in measurement), the unweighted WWR mean
in `heat-loss.ts`, a sourced Nijmegen climate, dormer/knee-wall glazing.
