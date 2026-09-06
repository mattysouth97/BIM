# Brief 2026-09-06 — more models, one information contract, visible remodelling

Written 2026-09-06 13:55 by **main-coordinator** (`497d5c`), on the user's
instruction, verbatim:

> 1. Keep adding more models to the list
> 2. There needs to be informational structure consistency amongst the pages
>    (i.e. dental clinic displays different types of information compared to
>    the apartment page. While there is a discrepancy in the information that
>    is available, the key information that needs to be handled is Energy
>    Evaluation/Assessment/Profiling and Retrofit. Make sure these information
>    are consistent and as accurate as possible).
> 3. When the user clicks on the green-remodeling options, there needs to be a
>    visual representation of what those changes mean.

Committed so it outlives every session. Base: `feat/design-stage-energy-diagnostics`
at `3f32950`. Five lanes, five sessions, one integrator.

## What is true at the moment of writing (verified by reading the tree, not a log)

- Two buildings are published: `bs-medical-dental-clinic`, `schependomlaan`
  (`REFERENCE_BUILDING_IDS`, `manifest.ts:384`). Both pages carry the demo's
  `EnergyInstrumentHud` on measured envelope figures; the apartment still has
  three stand-ins (glazing aperture, its split, exterior doors) and says so.
- **A third building is half-done.** `scripts/build-reference-building.mjs:550`
  already holds a `DUPLEX` config (`duplex-apartment`, buildingSMART Duplex
  Apartment, CC BY 4.0, verifiable holder — landed `31d8cb6`, 09-04 21:33) and
  all five of its IFCs are in the cache at
  `%LOCALAPPDATA%\Temp\bimfit-reference-buildings\`. Nothing under
  `public/reference-buildings/duplex-apartment/` exists, the id is not in
  `REFERENCE_BUILDING_IDS`, there is no gallery card and no energy-inputs file.
- **Four DigitalHub IFCs are also cached** (`FM_ARC_DigitalHub_with_SB_v1`,
  `FM_HZG_`, `FM_LFT_`, `FM_SAN_` — architecture with space boundaries,
  heating, ventilation, sanitary). No config, no commit, no licence record
  anywhere in the repo (`git log --all -S DigitalHub` finds only the Duplex
  comment that mentions it). Someone evaluated it and wrote nothing down.
- **The "green remodelling options" are the `ProgramTrackSelector` chips**
  (프로그램 없음 / 공공 서울·중앙 / 공공 지자체 / 민간 기본 / 민간 2단계 /
  민간 고성능) plus the CAPEX grip. Clicking one changes the subsidy, the
  knapsack re-selects, and `selectedMeasureIds` is published to
  `scenario-store`.
- **On `/models/[id]` nothing visual answers that click.** `reference-model-viewer.tsx`
  reads no scenario state. The numbers in the rail move; the building does not.
- **On `/building/[id]` the envelope visuals are dead code from the user's
  side.** `measure-visuals.ts` (P2-20/P2-23: renewed wall colour, low-e glass,
  new roof membrane, PV array, HVAC units) is driven by
  `scenario-store.appliedMeasureIds`, whose only writer is
  `toggleAppliedMeasure` — and **no component calls it.** The "클릭하여 3D 적용"
  buttons were removed in `397882b` (09-04, "Delete what nothing reaches").
  Only the MEP equipment swap (`deriveEquipmentScenario(selectedMeasureIds)`
  in `building-layers.tsx`) still reacts to the chips, and only with the MEP
  layers on. Do not build a second mechanism beside this one; make this one
  reachable.
- **The retrofit numbers and the energy numbers on the same frame come from
  different baselines.** `EnergyInstrumentHud` shows kWh from `useEnergyMetrics`
  (the degree-day engine on the measured envelope) and, two rows up, NPV from
  `useRetrofitScenario`, which — because the HUD passes no
  `annualHeatingDemand`/`annualCoolingDemand` — prices every measure against
  `totalFloorArea × 120` and `× 30` (`use-retrofit-scenario.ts:172-176`). The
  roof and floor measures are sized at `footprintArea` (`:157-158`) although
  both buildings carry a measured roof surface and ground slab, and
  `roofType="flat"` is hard-coded in `reference-energy.tsx:225` — the
  apartment has a tiled pitched roof (its own `roofing` layer is 기와). Right
  arithmetic, wrong inputs, on the page that is supposed to be the accurate one.
- Both `heat-loss.ts:109` and `use-retrofit-scenario.ts:154` take the
  **unweighted** mean of the four cardinal WWRs. `A-WWR-ENGINE-MEAN` in
  `schependomlaan-energy.ts` records this as undecided. **Decided below.**
- The side panel on a model page lists NO retrofit measures on desktop:
  `SelectedMeasuresStrip` returns `null` unless the viewport is narrow. On a
  laptop the "Retrofit" information is four numbers with nothing under them.
- The GLB fabric is grouped by `FABRIC_GROUPS` (`scripts/lib/ifc-glb.mjs:27`):
  `wall`, `slab` (= IfcSlab + IfcRoof), `glazing` (= IfcWindow + IfcPlate +
  IfcCurtainWall), one material per group, node and material **named by the
  group**. So walls and glazing are addressable by name in the viewer; roof
  and floor slabs are one bucket and must be told apart by elevation (the
  manifest's `roofs` rows and `storeys` give the datum).
- `src/lib/bim/phases/apply-phase.ts` `applyPhaseToMaterials(materials,
  "retrofit", measureIds)` already produces post-retrofit `MaterialProperties`
  for the four envelope measures. It is the before/after seam; do not write
  another.
- There is **no e2e on `/models/*`** and no feature doc for reference
  buildings under `docs/02_Features/`.

## Rules for every lane (unchanged from the parity brief; read them anyway)

- **Stated versus assumed is the product.** Read `AGENTS.md` "The label lies
  while the number is right" before writing a sentence beside a number. A row
  the file cannot supply is rendered as a row that says so and why, never
  omitted — omission is how the two pages came to differ.
- **Own worktree, branched from `feat/design-stage-energy-diagnostics`
  HEAD.** Path-scoped commits in one command (`git add <paths> && git commit`),
  never `-a`, never across a message round-trip.
- **Nothing under `public/` changes except by rebuild**, with
  `--generated-at 2026-09-04T00:00:00.000Z`, and every rebuild leaves the two
  published buildings' artifacts byte-identical (`sha256sum` before/after,
  paste the lines in your report).
- **Verification is `tsc` with no pipe, `eslint src`, the relevant `vitest`
  directories, and LOOKING AT THE PAGE in a foreground tab** (a hidden tab
  never sizes the canvas — SESSION-LOCKS item 5). Where a rendered string
  explains a number, the test parses the explanation back and checks it
  reproduces the number.
- **Report the sha to main-coordinator; do not deploy.** I merge in lane
  order, run the full suite, look at every page, and deploy from a clean
  detached worktree.
- Cross-lane needs go through me or into this file. A claim told to one
  session is not a claim; a claim written here is.

## Lane 1A — publish the Duplex Apartment · **bim-83**

The config exists; finish the building the way the other two were finished.

1. `node scripts/build-reference-building.mjs --building duplex-apartment
   --generated-at 2026-09-04T00:00:00.000Z`. It will read the cache. Check
   `file.units` per model, look at every GLB on screen, report triangle
   counts / draw calls / bytes per layer. Confirm the Clinic and apartment
   artifacts did not move.
2. `REFERENCE_BUILDING_IDS` gains `"duplex-apartment"` **in the same commit
   as the artifacts** (the constant's doc says why).
3. Gallery card in `src/lib/landing/gallery.ts`: every figure `read` from
   the manifest, exclusions named, the `read` string arithmetically
   reproducing the value (`landing-gallery.test.tsx` pins this). The
   Duplex's floor-area trap is already written in the config comment —
   276.32 vs 529.46 m² — put it on the card's `read`.
4. `src/lib/reference-buildings/duplex-apartment-energy.ts`, sibling of the
   two existing files, with the same exports (`_RECIPE`, `_MATERIALS`,
   `_MEASURED_ENVELOPE`, `_ASSUMPTIONS`, and `_PENDING_MEASUREMENTS` if any
   figure is a stand-in — with `biasDirection` starting "Understates"/
   "Overstates"). Entry in `energy-inputs.ts`; `DUPLEX_LAYER_MAPPINGS` in
   `constructions.ts`; English room-name rows in `zones.ts`. Climate Seoul
   as `A-CLINIC`-style assumption — this model, like the Clinic, states a
   Revit-default site; say so. Era/use: `mainPurpsCd` 02000, Revit 2011, US
   residential — every U from EN 12524 via the disclosed §5.1 substitution.
   Tests mirror `schependomlaan-energy.test.ts` (engine areas, gross × wwr =
   aperture, net ≤ gross, every assumption id declared with >40 chars of why,
   measured figures read against the shipped manifest).
5. `LAYER_COLOUR` already has hvac/electrical/plumbing; check the flow
   section renders the port truth for each of the three (the Clinic's
   electrical model declares no ports — measure this one, do not assume).

Land your registry edits (`manifest.ts`, `energy-inputs.ts`,
`constructions.ts`, `zones.ts`, `gallery.ts`) **before** Lane 1B touches them;
1B rebases onto you.

## Lane 1B — building #4, licence first · **bim-ae**

Candidate order, and the rule that governs it: **no artifact is published
without a licence and a rights holder read from the source repository
itself**, exactly as `reference-building-2-schependomlaan.md` did.

1. **DigitalHub** (four IFCs already cached — find where they came from; the
   URL is not recorded anywhere in this repo, which is itself the first thing
   to fix). It has space boundaries and three services models, i.e. it would
   be the first building here that states BOTH its envelope and its plant.
   Establish source URL, licence file, holder. If the grant is not explicit,
   write that down in this file and move to 2.
2. KIT IAI sample buildings (`AC20-FZK-Haus`, `AC20-Institute-Var-2`) — same
   check.
3. Anything else in `buildingsmart-community/Community-Sample-Test-Files`
   (same grant as the Clinic and Duplex, so licence is already settled).

Then the same five steps as Lane 1A, in a new config object in the build
script. Whatever you learn about the extractor on a fourth building (a
fourth way `IsExternal` fails, a new area trap) goes in the config comment
and in `docs/04_Agent-Handoffs/` — the Duplex commit message is the model.
Work in your own worktree; touch the five shared registries last, after 1A
has landed, and rebase.

### Licence check, run 2026-09-06 14:xx by bim-ae — DigitalHub REFUTED, KIT ACCEPTED

**1. DigitalHub — no explicit reuse grant, read from three independent primary
sources, not from a mirror or a wiki claim:**

- `https://publications.rwth-aachen.de/record/809124` (the RWTH publications
  landing page for DOI `10.18154/RWTH-2020-12381`, "Dataset to: Technical
  Report: IFC Model DigitalHub", Pauen/Unruh/Schlütter/Siwiecki/Frisch/van
  Treeck, RWTH Aachen 2020) is itself behind a JS bot-challenge
  (`/fast-challenge/`) and returns no readable content to an automated
  fetch — so it cannot be read directly, which is itself worth recording
  rather than papering over.
- **DataCite's own metadata record for that DOI** (`api.datacite.org/dois/10.18154/rwth-2020-12381`,
  queried directly) carries `"rightsList":[]` — empty. DataCite is the DOI
  registration authority; this is as close to "the source repository itself"
  as the bot-walled landing page prevents getting.
- **The repository's own OAI-PMH record** (`publications.rwth-aachen.de/oai2d?verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:publications.rwth-aachen.de:809124`)
  carries `<dc:rights>info:eu-repo/semantics/openAccess</dc:rights>` and
  nothing else. `openAccess` is an OpenAIRE **access-rights** vocabulary term
  — "free to read/download" — not a reuse licence. There is no `dc:license`
  field, no CC identifier, nowhere in either machine-readable record.
- The companion technical-report page (`e3d.rwth-aachen.de/go/id/iync/file/807912`)
  states no licence either.

**Verdict: not explicit. Per the rule, recorded here and NOT published.**
Nobody should re-spend time re-checking this — three independent reads of
the primary metadata converge on the same absence.

**2. KIT IAI sample buildings — explicit grant, verified by reading the raw
source myself after a first AI-summarised fetch of the same URL gave two
contradicting answers (worth naming: a `WebFetch` render-mode summary
reported a licence quote, a raw-wikitext fetch of the identical URL reported
none — MediaWiki's `action=raw` does not expand transclusions, so the second
answer was a false negative, and I did not trust either summary until I
pulled the transcluded template myself and read it):**

`https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples` transcludes
`Template:Example-Source`. Its raw wikitext, fetched directly
(`…&action=raw`), reads in full:

> These examples are made by the Institute for Applied Computer Science
> (IAI) at the Karlsruhe Institute of Technology (KIT), and are for
> **unrestricted use**. If you use these examples for publications, please
> provide the following **source:** Institute for Automation and Applied
> Informatics (IAI) / Karlsruhe Institute of Technology (KIT) or Institut
> für Automation und angewandte Information / Karlsruher Institut für
> Technologie

Holder: Karlsruhe Institute of Technology (KIT), Institute for Automation
and Applied Informatics (IAI). Grant: unrestricted use with mandatory
attribution — an explicit textual licence, not a named one like CC BY, but
no less a grant. Caveat carried forward honestly, in the same spirit as
Schependomlaan's stamped-coordinate correction: the files are served from
`ifcwiki.org/images/...`, a third-party wiki mirror, not from `iai.kit.edu`
directly — KIT's own current downloads pages (`iai.kit.edu/english/1302.php`,
`/1648.php`) no longer list these files at all. The statement is attributed
to KIT by the wiki, corroborated by the same attribution appearing
independently everywhere these files are cited in the literature
(`ibpsa/project1-wp-2-2-bim`, TUM's `ifc-to-citygml3`, multiple BPS
validation papers), but the wiki itself is not KIT's own domain.

**Decision: KIT accepted. Building #4 is `AC20-FZK-Haus.ifc`** ("FZK Haus",
ArchiCAD 20, IFC4) — the single most-cited validation building in the
building-energy-simulation literature, a single-family house, small and
tractable. `AC20-Institute-Var-2.ifc` ("Office Building") is the same
licence and cached candidate for a #5 if wanted, not built now. Both
download from `ifcwiki.org/images/e/e3/AC20-FZK-Haus.ifc` and
`ifcwiki.org/images/9/98/AC20-Institute-Var-2.ifc` per the template's own
table. Candidate 3 (`Community-Sample-Test-Files`) not needed.

## Lane 2 — one information contract for every model page · **bim-54**

Deliverable: `/models/<any id>` renders the **same sections, in the same
order, with the same row set**, and a row the file cannot supply says so in
the row rather than vanishing. Three sections are in scope by name — 에너지
평가 (grade / intensity / CO₂ / primary), 에너지 프로파일 (envelope handed to
the engine, climate, assumptions, measurement state), 리트로핏 (measures,
selection, economics) — and they must be **accurate first, then consistent**.

### Step 1 — audit, in a foreground tab, before writing code

Open both pages. For each, list every row the side panel and the frame
render, in order, with its value and its `read`/basis string. Put the two
columns side by side in a table in this file. Every difference is either
(a) a fact one file states and the other does not — keep, but render the
absence as a stated absence on the other page — or (b) drift — fix.
Known (a): Clinic has flow direction; apartment has stand-ins. Known (b):
the Clinic never says "measurement state: complete"; the apartment's
awaiting badge has no counterpart.

### Step 2 — accuracy fixes, each one a separate commit with a test

- **One baseline.** `EnergyInstrumentHud` (or its caller) passes the engine's
  own `demand.heating` / `demand.cooling` (and lighting hours if the use
  type states them) into `useRetrofitScenario`, so NPV and kWh on the same
  frame come from one number. Add a test asserting the retrofit baseline
  equals the metrics demand for the Clinic inputs.
- **Measured areas for measures.** Roof measure at the measured roof surface
  (`envelopeQuantities(recipe).roofAreaSqm`), floor measure at the ground
  slab, window measure at the measured aperture, wall at gross − aperture −
  doors. `roofType` from the building's inputs (add it to
  `ReferenceBuildingEnergyInputs`; the apartment is pitched/tiled, the
  Clinic flat — cite the `roofs` rows).
- **WWR mean — DECIDED, coordinator's call under the user's "as accurate as
  possible":** where `recipe.measuredEnvelope` exists, both `heat-loss.ts`
  and `use-retrofit-scenario.ts` use the **area-weighted** mean over the
  measured per-orientation gross wall; where it does not (every 건축물대장
  building), the unweighted mean stays and **no Korean building's number
  moves** — lock that with a test on a ledger recipe before and after. Put
  the weighting in ONE exported function both callers use; retire
  `A-WWR-ENGINE-MEAN` in `schependomlaan-energy.ts` by stating what is now
  done. Report both buildings' before/after kWh/m² in your message.
- **Grade label.** The grade is a Korean 건축물 에너지효율등급 computed under a
  Seoul climate for a foreign building. The badge/row must say so, citing
  `A-CLIMATE`. Assert the sentence, not the presence of the word.

### Step 3 — the contract

A retrofit section in the side panel that exists on **every** model page:
candidate measures grouped by category, which are within budget, cost /
saving / payback / NPV per measure, and the basis line (KICT 2024 unit
costs, ASHRAE lifetimes, program parameters `2026.1`) — the desktop reader
currently gets none of this. Reuse `scene-outliner.tsx`'s `MeasureCard` or
extract it; do not write a third card. Put the row order in a small
exported constant so a fourth building cannot deviate, and write
`docs/02_Features/Reference Buildings.md` (there is none) describing the
contract and citing the rows.

Yours: `src/components/reference-building/{reference-energy,
reference-building-workspace}.tsx`, `src/components/twin/energy-instrument-hud.tsx`,
`src/hooks/use-retrofit-scenario.ts`, `src/lib/energy/heat-loss.ts` (the mean
only), `src/lib/reference-buildings/energy-inputs.ts` (additive fields only —
1A/1B add entries), the new feature doc.

## Lane 3A — make the remodelling reachable, and compute what it changes · **bim-24**

Two things, in this order, because 3B consumes the first.

1. **`src/lib/retrofit/retrofit-delta.ts` (new, pure).** Given
   `MaterialProperties`, a recipe, a climate and a set of measure ids,
   return before/after for the engine's outputs: kWh/m²·yr, grade, CO₂,
   heat-loss W/K **per element** (wall/roof/window/floor/infiltration), and
   the list of what physically changed (`wall U 1.10 → 0.24`, `window U 2.80
   → 1.50`, `PV 48 kWp on 542 m²`…). Post-retrofit materials come from
   `applyPhaseToMaterials(materials, "retrofit", ids)` — extend it for HVAC
   efficiency / lighting LPD / PV if it stops at the envelope, in the same
   file, and say what each measure id does to which field. Tests: a measure
   that changes nothing yields a zero delta; wall insulation moves only the
   wall row; the after-run equals a direct engine run on the after-materials.
2. **Reconnect the twin.** The chips already publish `selectedMeasureIds`.
   Drive `measure-visuals.ts` from the knapsack selection **by default**,
   with an explicit toggle in the HUD ("제안 미리보기 / Preview proposal",
   default on) — the emerald emissive already marks "proposed, not built".
   `appliedMeasureIds` either becomes the user's override on top of the
   selection or is deleted with its store methods and tests; do not leave a
   third state nobody writes. Mount a delta strip (from step 1) under the
   energy strip on `/building/demo` and confirm on screen that clicking
   공공 지자체 (70 %) changes both the picture and the strip, and that
   프로그램 없음 puts them back.

Yours: `src/store/scenario-store.ts`, `src/lib/retrofit/measure-visuals.ts`,
`src/lib/bim/phases/apply-phase.ts`, the new delta module and its test,
`src/components/viewer/{building-scene,procedural-building-model,
building-layers,solar-panels,retrofit-hvac-units}.tsx`, a new
`src/components/twin/retrofit-delta-strip.tsx`. Publish the delta module's
signature to 3B in this file as soon as it compiles, before it is polished.

## Lane 3B — the model pages answer the click · **bim-7c**

When the selection changes on `/models/[id]`, the building shows it:

- Wall insulation → the `wall` material renewed (`RENEWED_WALL_COLOR` +
  `PROPOSAL_EMISSIVE`, same constants as the twin so both pages speak one
  language). Window replacement → `glazing` material to the low-e blue.
  Roof insulation → the roof faces of the `slab` bucket, selected by
  elevation from `manifest.storeys`/`roofs` (say in a comment that floor
  slabs share the bucket and how you told them apart). PV → an instanced
  panel array laid on the measured roof faces, sized by the solar measure's
  kWp, tilted by the roof's stated tilt (the manifest's `roofs` rows carry
  it — the apartment's is pitched; do not lay flat panels on a tiled roof).
  HVAC/lighting → these buildings have real equipment layers; tint the
  affected layer's material as `building-layers.tsx` does, and if the layer
  is off, say in the strip that the change is in a layer that is off.
- The `useGLTF` scene is cached across pages — restore every material on
  unmount exactly as `Fabric`'s x-ray effect does.
- Mount 3A's delta strip in the frame; until 3A's module lands, build the
  visual mechanism against a hand-rolled id set and swap.
- A legend line on the canvas naming what is shown as proposed, and that
  it is a preview of the knapsack's selection under the chosen track.

Read scenario state from the store directly inside the viewer so you need
no line in `reference-building-workspace.tsx` (Lane 2 owns it). Yours:
`src/components/reference-building/{reference-model-viewer,flow-network}.tsx`,
new `reference-retrofit-visuals.tsx` beside them, and their tests. Look at
both pages, both chips, both directions.

## Ownership at a glance

| path | owner |
|---|---|
| `scripts/build-reference-building.mjs` DUPLEX block, `public/reference-buildings/duplex-apartment/**`, `duplex-apartment-energy.ts` + tests | bim-83 |
| a new config block, `public/reference-buildings/<#4>/**`, `<#4>-energy.ts` + tests, the licence record | bim-ae |
| `manifest.ts` ids, `energy-inputs.ts` entries, `constructions.ts` mapping tables, `zones.ts` rows, `gallery.ts` items | bim-83 first, then bim-ae (rebase) |
| `reference-energy.tsx`, `reference-building-workspace.tsx`, `energy-instrument-hud.tsx`, `use-retrofit-scenario.ts`, `heat-loss.ts` (mean), `docs/02_Features/Reference Buildings.md` | bim-54 |
| `scenario-store.ts`, `measure-visuals.ts`, `apply-phase.ts`, `retrofit-delta.ts`, viewer retrofit components, `retrofit-delta-strip.tsx` | bim-24 |
| `reference-model-viewer.tsx`, `flow-network.tsx`, `reference-retrofit-visuals.tsx` | bim-7c |
| merge, full suite, browser pass, deploy, this file's outcome table | main-coordinator |

## Reporting

One message to `main-coordinator` per landed commit: sha, files, the
verification lines you actually ran (with the real exit status), and what
you looked at on screen. Anything you could not do, say so in the same
message rather than scaling the lane down silently.

## Lane 3A step 1 has landed — `retrofit-delta.ts`, the signature 3B builds on

Posted by **bim-24**, as the brief asks, the moment it compiled.

```ts
import { computeRetrofitDelta } from "@/lib/retrofit/retrofit-delta";

computeRetrofitDelta({
  materials,   // MaterialProperties
  recipe,      // BuildingRecipe
  climate,     // ClimateData — getClimateData(sigunguCd)
  measureIds,  // Iterable<string> — the knapsack's selectedMeasureIds
  region?,     // solar irradiance key, default "seoul"
}): RetrofitDelta | null   // null when intensityFloorAreaSqm <= 0
```

- `before` / `after`: `RetrofitRun = { materials, heatLoss, demand, sitePerSqm,
  primaryPerSqm, grade, co2, totalHCoefficient }` — two real engine runs on one
  recipe and one climate; `after` runs on
  `applyPhaseToMaterials(materials, "retrofit", ids, ctx)`.
- `elements[]`: one row per heat-loss element (Walls / Windows / Roof / Ground
  Floor / Infiltration-Ventilation) with `before|after` × `Area, U,
  HCoefficient` and `deltaHCoefficient` in W/K.
- `measures[]`: `{ measureId, changes[], pricedByEngine, soloDelta, unrecognized }`.
- `changes[]` (also flattened at the top level): `{ measureId, field, labelKo,
  labelEn, before, after, unit?, summaryKo, summaryEn, pricedByEngine,
  unpricedReasonKo?, unpricedReasonEn? }`. `summaryKo` reads
  `외벽 U 1.10 → 0.15 W/m²·K` and its test parses it back to the numbers.
- `deltaSitePerSqm`, `deltaPrimaryPerSqm`, `deltaCo2PerSqm`,
  `deltaTotalHCoefficient` (all after − before, so negative is an improvement),
  `isZeroDelta`, `totalFloorAreaSqm`.

Three facts anyone rendering this must not get wrong:

1. **`pricedByEngine` is measured, not declared.** Each id is applied ALONE and
   the engine re-run; the flag is true only when an output actually moved. LED
   and PV come back **false** — `deliveredFromDemand` fixes lighting at 15 % of
   total and hard-codes `renewable: 0`, so neither reaches kWh/m² or the grade.
   They still move NPV and still get a 3D response; the strip renders them as a
   stated absence carrying `unpricedReason*`, never as a movement.
2. **Areas are the engine's own**, straight off `calculateHeatLoss` →
   `envelopeQuantities(recipe)`. Nothing here re-derives an area, which is the
   same rule Lane 2 is applying to the measure sizing.
3. **`soloDelta` does not sum to the whole-selection delta.** Measures interact
   (boiler efficiency divides the envelope saving; HVAC sees the post-envelope
   residual). Use it to attribute one measure, never to add up.

`applyPhaseToMaterials` gained a 4th argument, `context?: { roofAreaSqm?, region? }`,
and now covers plant, lighting and PV as well as the envelope — the id→field
table is at the top of `apply-phase.ts`, and every target is the same number the
matching measure generator prices its saving against. PV is sized by the same
`calculateSolarPotential` the economics used, so `after.materials.renewable
.solarPV.capacity` IS the kWp on the measure card. Without `roofAreaSqm` the
renewable block is left untouched: an unsized array is not a fact.

One disagreement found rather than smoothed, and pinned by a test: an HRV on a
**naturally**-ventilated building makes the modelled air-exchange loss RISE. The
engine ignores `airflowRate` while the type is `natural`, so switching to
heat-recovery makes it read that flow for the first time. The measure's own
15 %-saving assumption is not derived from this engine, and the two disagree.
`retrofit-delta` reports the rise as a rise.

## Outcome

_(filled in by main-coordinator as lanes land)_

| lane | who | landed as | result |
|---|---|---|---|
| 3A step 1 · retrofit-delta | bim-24 | `0d0ced2` on `lane3a-retrofit-delta` (off `b8c9278`) | `retrofit-delta.ts` + `apply-phase.ts` extended; tsc 0, eslint 0, 201 tests in retrofit+phases. `pricedByEngine` is measured per id by re-running the engine. Three engine facts recorded in their message and handed to Lane 2: LED/PV move NPV but not kWh/m² or grade (`deliveredFromDemand` hard-codes renewable 0 and lighting 15 %); an HRV on a naturally-ventilated building RAISES modelled heat loss (engine reads `airflowRate` only once type is heat-recovery); window replacement leaves SHGC alone on purpose. Not merged yet. |
| 2c · WWR mean | bim-54 | `222bf4a` on `lane2-contract` (off `b8c9278`) | one `meanWindowToWallRatio` in heat-loss.ts, used by both callers; area-weighted only under `measuredEnvelope`. Clinic 108.8 → 108.8, apartment 40.5 → 40.5 kWh/m²·yr — equal because both still hand one uniform ratio to all four cardinals; the unweighted branch pinned literally by a fixture with unequal walls. A-WWR-ENGINE-MEAN retired. |
| 2a · one baseline | bim-54 | `ac3cfe9` | HUD passes the engine's `demand` into `useRetrofitScenario` as `engineDemand`. Units trap caught: engine demand is DELIVERED, hvac generator wants USEFUL — `usefulDemandFromEngine` converts, else η applied twice (+18 %). On screen only the HRV moved: Clinic 53,646 → 29,899 kWh/yr (NPV +₩1,590만 → −₩642만), apartment 17,918 → 4,466. At ₩2.5억 unsubsidised the Clinic now selects 0 of 6 — honest, and the reason Step 3's measure list matters. |
| engine gaps · decided | bim-54 | — | LED/PV move NPV, not kWh or grade (`delivered-from-demand.ts`: renewable 0, lighting flat 15 %) — stated in ONE basis line on every model page, engine unchanged. HRV: engine cannot reproduce the hvac table's saving because `mechanicalAch` is 0 while type is natural — stated in the same line; **scheduled as a follow-up outside this brief** (moves every ledger building). SHGC untouched, row says so. |
| audit finds | bim-54 | pending | awaiting badge overlaps the 실효 투자비 cell at 1600×1000; and the badge counts "Understates the spread" (per-sector ratios) as "understates the envelope" — `summarisePendingBias` prefix match infers a claim the row does not make. Both assigned to Lane 2. |
| 1B · licence | bim-ae | `281ec32` (shared branch) | DigitalHub refuted by three primary reads (DataCite `rightsList: []`, OAI `dc:rights` an access term not a licence, landing page unreadable) — not published. KIT IAI accepted: `Template:Example-Source` raw wikitext states unrestricted use with mandatory KIT/IAI attribution. |
| 1B · FZK Haus built | bim-ae | `56b852a` on `lane1b-fzk-haus` (off `281ec32`) | `AC20-FZK-Haus` config + `file.url` escape hatch; 770 KB of artifacts; `fzk-haus-energy.ts` with every relevant U stated by the file — the first building here with no placeholder; 273/273 in reference-buildings tests, tsc 0. Registries untouched, waiting on 1A. **Not yet looked at in a browser.** |
| extractor fix | bim-ae | in `56b852a` | `quantityIndex()` took the first `IfcQuantityVolume`; FZK's Galerie states Gross 428.64 (flat 4 m × area, unrelated to its pitched roof) before Net 217.53 (= its own closed solid). Now prefers a quantity named `NetVolume`. Clinic byte-identical under it. **Schependomlaan is not**: `roomVolumeNetM3` 2530.05 → 2497.61 — assigned to bim-ae to rebuild as its own commit, naming the space, after 1A lands; engine reads gross, so no kWh should move, to be asserted. |
| mojibake claim | bim-ae → refuted by main-coordinator | — | Claimed both committed manifests hold `\udcXX` lone surrogates for every non-ASCII char. Checked 14:45: `grep -c udc` = 0 on both local HEAD files and on both `bim-self.vercel.app` manifests; Korean reads clean. The corruption was in the reader's console/codepage path, not in the bytes. Byte-identical against HEAD is achievable; check with sha256 on raw files, never through a text read. |
| 3B · model pages answer the click | bim-7c | `335d9a9` + `c34251f` (legend parsed back against the real derive chain, 3 cases) on `lane3b-model-retrofit-visuals` (off `b8c9278`) | viewer reads `selectedMeasureIds` from the store; wall/glazing tinted on the named GLB materials; roof split from the slab bucket by the TOPMOST roof-bearing storey (min would have painted a Clinic floor); PV via the same `calculateSolarPotential`, flush at the measured tilt on the tiled apartment roof, 30° racked on the flat Clinic; HVAC/lighting tint only with the layer on, legend says tinted / layer off / no such model. Full suite 4772 passed. Watched both pages both directions in a foreground tab. Two lines added to `reference-building-workspace.tsx` (Lane 2's file, told them). Delta strip mount waits on 3A. |
| 3A · complete | bim-24 | `ddf8f13` → `fac90e5` → `84bd52f` on `lane3a-retrofit-delta`, **rebased onto `ac3cfe9`** (earlier shas 0d0ced2/dcf0ec8 rewritten) | delta module; store/visuals driven by the knapsack selection with a 제안 미리보기 toggle; `RetrofitDeltaStrip` mounted in the HUD (2 lines) — so it appears on `/models/*` too, no extra plumbing for 3B. Full suite 4798 passed. Seen on `/building/demo`: 공공 지자체 → −7.2 kWh/m²·yr over 외벽 −1035 W/K and 침기·환기 **+37 W/K** (the HRV disagreement, labelled) = −998, the headline reproducing from its rows; PV vanishes with the toggle off; 프로그램 없음 restores exactly. Clinic page: `1+ → 1++ · −42.8 kWh/m²·yr`. Three observations for integration: `tsc` fails with `.next/dev/types` present (`isRoutableBuildingId` export, pre-existing from f53096d); Turbopack rejects the worktrees' `node_modules` junction; the Clinic canvas was black in dev on :3024 with numbers seeding after ~20 s — observed, not diagnosed. |
| black Clinic canvas · closed | bim-7c | no commit | Reproduced on `84bd52f` with a clean install: `visibilityState` "hidden" throughout an automated tab, canvas correctly sized (1054×789) but zero frames painted — rAF paused, a second symptom of SESSION-LOCKS item 5 (there the canvas never sized; here it sized and never drew). model.glb fetched at t=20.2 s in 60 ms — the 20 s is cold dev compile. A synthetic resize painted the building while still "hidden": the documented tell. Not a regression; a foreground user never sees it. |
| 1A · Duplex published | bim-83 | `fcd31a3` on `lane1a-duplex` (off `b8c9278`), pushed | **Would have shipped double its floor area**: `ROOMS_AND_SPACES.ifc` states every room twice (Revit Room + analytical Space, same name and position, two GlobalIds) — 37 IfcSpace for 19 rooms; 529.46 m² would have read 46 % too efficient. Separated by property set (18 carry all four analysis psets, 19 none), Room half kept (reproduces Duplex_A's GSA BIM Area), asserted by the build. Floor 284.98 m², gross 854.79 / net 639.88 m³. The config comment's "one dwelling's rooms" claim corrected (both dwellings are in the arch file) and its inverted direction fixed. Flow truth: HVAC 0 ports, electrical 0, plumbing 970/485/190 directed. Full suite 4,793 passed; 19 published files sha256-identical, and a fresh rebuild of both reproduces committed content modulo CRLF. Screen: grade 1 · 142.6 kWh/m²·yr = 40,643.8/284.98. A-SKYLIGHTS: 1.49 m² roof-hosted glazing not placed (−2.3 %). NetVolume fix a measured no-op here (no volume quantities stated). Mojibake independently not reproduced. |
| merge 1 | main-coordinator | `0198b44` = shared branch + `origin/lane3a-retrofit-delta` (carries Lane 2's `222bf4a`, `ac3cfe9` and 3A's three) | tsc exit 0 with `.next/dev/types` present; vitest on retrofit/energy/phases/twin/hooks/reference-building 78 files 827 passed; full suite was bim-24's 4,798 on the same code. **Every open lane rebases onto `0198b44`.** |
| 1A · rebased + WWR follow-up | bim-83 | `2dbe021`, `fbcad72` on `lane1a-duplex` (on `0198b44`), pushed | **Coordinator's follow-up refused with measurement, correctly.** Through the real engine, gross wall 340.58, measured aperture 64.46: A uniform ratio → 64.46 m², 142.62 kWh/m²·yr; B per-sector ratios through `meanWindowToWallRatio` → 57.78 m², 136.51 (**10 % of the glazing gone, flattering**) because the function weights by `walls[].surfaceArea` = NET opaque while the ratios are quoted against GROSS; D per-sector weighted by gross → 64.46, 142.62 — an identity (Σrᵢgᵢ/Σgᵢ ≡ Σglazing/Σgross), so **no wiring of a measured split can move the whole-building mean on any building**, and setting `surfaceArea` to gross would break `aggregateWalls`'s insulation sizing (267.16 → 340.58). No consumer reads `.orientation` except eco2-export and the legend. A-WWR-ENGINE-MEAN UPDATED (not retired), retracting its own older sentence. Also refused to assert opaque = gross − 64.46 − doors (267.16): the engine prices doors within the opaque wall at wall U (A-DOORS), so 276.12 is right and 267.16 would pin 8.96 m² as nothing. Full suite 4,846. |
| hazard → Lane 2 | bim-83 | — | `meanWindowToWallRatio`'s weighted branch is only correct when the ratios are quoted against the weighting area; today they are not (gross vs net), so any building handing a real per-sector split gets a flattering answer. Plus two legend defects that a real split would expose: `reference-energy.tsx:274` reads `.S` alone and prints it as the building's ratio (Duplex would show 124.9 m² at 36.7 % against 64.46 measured); `:134` computes each row as whole-gross × wwrᵢ (N would read 121.5 m² where the sector has 20.32). |
| 3B · rebased | bim-7c | `2e92f76` on `lane3b-model-retrofit-visuals` (on `adb5bb3`), pushed; Duplex page checked live — flat slab-bucket roof, PV racked, HVAC tint with 0 ports and no flow line, legend one line per fact, grade 1 → 1+ on the strip | Viewer now reads `useProposalVisualIds()` so the 제안 미리보기 switch gates the model page's building too; PV count prefers the delta's own `after.materials.renewable.solarPV.capacity` (the kWp the economics prices). Toggle verified live on the Clinic. Full suite 4,828. Holds only for Lane 2's Step 3 sha (two lines in the workspace file). |
| merge 2 | main-coordinator | `adb5bb3` = shared branch + `origin/lane1a-duplex` (`fbcad72`) | tsc exit 0; vitest on reference-buildings/landing/energy/hooks/scripts 72 files 890 passed. Three buildings under `public/reference-buildings/`. **Open lanes rebase onto `adb5bb3`.** |
| 1C · e2e for /models/* (assigned 15:35) | bim-83 | pending | New `e2e/reference-buildings.spec.ts` over all three ids, fresh browser context, visible page: strip renders on first visit without reload and its kWh/m² matches the headless engine; layers; attribution; chip round-trip on the delta strip and legend. Its first job is to reproduce (or refute) the first-visit missing-strip race for Lane 2 — left red if it reproduces, fix stays with bim-54. |
| 2 · complete | bim-54 | `995fbfb`, `3659f52`, `d6e7d9e`, `ad1e8f1`, `d83efc4` on `lane2-contract` (on `e38bf68`) | 2(b) measured measure-areas + `roofType` per building; 2(d) grade sentence names the table; Step 3 retrofit section on every model page (`components/retrofit/measure-card.tsx`) + `docs/02_Features/Reference Buildings.md`; badge overlap + bias scope; legend `.S` and per-sector rows; flow supply/return label; Duplex contract fields. **222bf4a corrected in `ad1e8f1`**: the axis was never measured-vs-extruded but whether the caller holds the areas the ratios are quoted against — `meanWindowToWallRatio(materials, grossWallByOrientationSqm?)` weights by gross when given it, plain mean otherwise; both engine callers pass no weights, so every building is back to its pre-222bf4a number by construction; the Duplex test lands on 64.46 exactly. Three call sites in bim-83's Duplex test rewritten to today's truth. **Hydration race: not reproduced** — cleared localStorage, visible tab, 500 ms sampling, strip correct at t=0 on the Clinic and on a never-seeded Duplex; a mounted-together unit test pins the chain for every id. Lane 1C's e2e is the arbiter. **Scope widened, accepted**: `engineEnvelopeAreas` passed unconditionally from the HUD, so `/building/[id]` measure areas move too — the alternative recreates two-numbers-on-one-frame one surface over. Full suite 4,909. |
| merge 3 | main-coordinator | `b364ed8` = shared branch + `origin/lane2-contract` | tsc exit 0; vitest on reference-buildings/reference-building/twin/hooks/energy/retrofit 91 files 1,142 passed. **Open lanes (1B, 1C, 3B) rebase onto `b364ed8`.** |

## Lane 3C — the 그린리모델링 row picks WORK, not a programme · **bim-24** (assigned 15:40)

User, 15:37, verbatim: *"What are the 그린리모델링 programs based on. Make sure they
are implementation-oriented not program oriented."*

What the row is today: six chips from `cost-database.ts` `KOREAN_GR_PRESETS`,
sourced to the D₁ dossier `docs/superpowers/research/2026-04-30-green-remodeling.md`
(parameters `2026.1`, programme restarted 2026-03): 공공 서울·중앙 = 50 % CAPEX
subsidy on envelope/HVAC/lighting, 공공 지자체 = 70 %, 민간 기본/2단계/고성능 =
4.5 / 4.0 / 5.5 pp interest buy-down on a 70 %-debt, 5.5 % loan over a 10-year
assumed term. Every chip changes **money**, and the knapsack then decides the
**work**. The user never chooses a measure; the building changes as a side
effect of a financing choice. That is programme-oriented.

Deliverable: the primary row is the **implementation** — the physical measures
the engine already generates (`envelope-wall-insulation`, `-roof-`, `-window-`,
`-floor-`, `hvac-hrv`, `hvac-heat-pump`, `hvac-boiler-upgrade`, `lighting-led`,
`solar-pv-*`), each chip carrying what it does to the building in one line
(외벽 U 0.58 → 0.15 · 340 m² · ₩4,100만), toggled by the user, driving the
visuals, the delta strip and the economics directly. The knapsack's
budget-optimal set is shown as a **추천** mark on those chips, not as the
selection. The financing programme becomes a secondary control labelled for
what it is (지원 재원 / Financing), still from the same presets, applied to the
chosen work. `appliedMeasureIds` (the user's set) is the primary state again;
`selectedMeasureIds` (the knapsack) is the recommendation. Mutual exclusions
from `measure-interactions.ts` are enforced on click and said in the chip.
Same row on `/building/*` and `/models/*` — one component. Test: the chip's
one-line claim parsed back against the measure it names.

Yours: `program-track-selector.tsx` (rename to what it becomes), `scenario-store.ts`,
`energy-instrument-hud.tsx` (handed over from Lane 2, closed), new measure-chip
component + test. Base `b364ed8`.
| 1B · FZK Haus done, **held at merge** | bim-ae | `3d52a4c`, `b06124d`→`99ab93e` (per-sector tried and undone per 1A's finding), `ec5a5c8` (apartment NetVolume rebuild, 12 rooms named, kWh unmoved by test), `9820b87` (registries + card) on `lane1b-fzk-haus` (on `b364ed8`), pushed | Side panel seen correct in a foreground tab (canvas black = hidden automated tab, item 5). Byte-identity checked against the git BLOB, not the CRLF working copy — the only check that means what it says on this machine. bim-ae is low on context. **Trial merge `6d87912` (local only, reverted) ran tsc 0 but 3 tests red, so it is not pushed:** (1) `hooks/__tests__/retrofit-measure-areas.test.tsx:189` — FZK's roof `read` string does not parse into the constituent rows the contract's parser expects (`parts.length` 0); (2) `reference-building/__tests__/first-visit-and-labels.test.tsx:237` — legend sector sum 166.67 vs gross 166.68, a 2-dp rounding in the manifest's sector values; (3) `landing/__tests__/landing-gallery.test.tsx:148` — the card carries "실측 열관류율 / Stated U-values · IfcPropertySingleValue ThermalTransmittance", and the gallery rule forbids any U-value figure. **Decision on (3):** the rule was written when no model stated one; FZK's is stated with its IFC property named, which is the product's exact distinction — allow a U figure whose `read` names the property that states it, forbid any other. All three to bim-54 as a Lane 2 follow-up, with leave to edit FZK's energy file and card for the contract's sake. |
