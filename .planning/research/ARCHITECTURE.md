# Architecture Research — Building Energy Repository (v6.0)

**Domain:** Adding a corpus/repository face to an existing single-building BIM/energy diagnosis app
**Researched:** 2026-09-15
**Confidence:** HIGH — every claim below is grounded in a read file:line; the only MEDIUM-confidence area is corpus storage at real scale (Q5), because nothing at that scale exists in the codebase yet to measure against.

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│  INTERACTIVE APP (existing, untouched)                                    │
│  /diagnostics/new?method=ledger → register search (client)                │
│  /building/[id]  → twin: material-store + scenario-store → engine         │
│  /models/[id]    → reference model: energy-inputs.ts (static, per-id)     │
├───────────────────────────────────────────────────────────────────────────┤
│  SHARED PHYSICS CORE (pure, no React, no fs) — already the seam           │
│  src/lib/energy/*  (heat-loss, annual-demand, delivered-from-demand,      │
│    primary-energy, system-breakdown, co2-emissions)                      │
│  src/lib/energy-standards/*, src/lib/korean-building-codes.ts            │
│  src/lib/energy-diagnostics/ledger-baseline-model.ts (register → model)  │
│  src/lib/retrofit/* (measure generators, economic-model, retrofit-delta) │
├───────────────────────────────────────────────────────────────────────────┤
│  NEW: BATCH CORPUS GENERATION (headless, Node, server-only)               │
│  scripts/generate-corpus-release.mjs  (driver: pages 법정동, calls route) │
│  src/app/api/corpus/generate/route.ts (NEW — one register→row unit)      │
│    reuses: api-proxy.ts, ledger-source.ts, ingestion.ts,                 │
│            buildLedgerBaselineModel, energy-dataset.ts shape             │
├───────────────────────────────────────────────────────────────────────────┤
│  NEW: RELEASE STORAGE (extend an existing, currently-orphaned pattern)   │
│  src/lib/portfolio/release-store.ts → StaticFileReleaseStore              │
│  public/releases/<version>/{manifest.json, rows shards, calibration}     │
│  (built for the superseded v7.0 Prediction plan; PROJECT.md absorbs its  │
│   "dataset-release idea" into v6.0 — reuse, do not re-invent)            │
├───────────────────────────────────────────────────────────────────────────┤
│  SERVING                                                                   │
│  src/app/api/reference-buildings/{datasets,[id]/dataset}/route.ts (exists)│
│  NEW: src/app/api/corpus/{releases,[version],[version]/buildings}/*      │
│  NEW: /corpus browsable page — server-paginated, never ships whole table │
├───────────────────────────────────────────────────────────────────────────┤
│  BENCHMARKING (NEW, shared)                                               │
│  src/lib/benchmarks/peer-groups.ts + percentiles.ts — pure, consumed by  │
│  both /corpus and /models/[id] / /building/[id]                          │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `src/lib/energy-diagnostics/ledger-baseline-model.ts` | 건축물대장 → versioned `CanonicalEnergyModel`, pure, fact-traced | Existing — reuse as-is |
| `src/app/api/bldrgst/*` + `_factory.ts` | Server-side data.go.kr proxy, per-endpoint caps, shared-key resolution | Existing — reuse for corpus fetch |
| `src/app/api/corpus/generate/route.ts` | One register row → one dataset row, server-side, Node runtime | **NEW** |
| `scripts/generate-corpus-release.mjs` | Drives the sweep: pages 법정동/시군구, calls the route, shards output, writes manifest | **NEW**, mirrors `scripts/build-reference-building.mjs` |
| `src/lib/portfolio/release-store.ts` (`StaticFileReleaseStore`) | Reads immutable release artifacts from `public/releases/<version>/` | Existing (built for superseded v7.0) — **extend/rename for corpus rows** |
| `src/lib/reference-buildings/energy-dataset.ts` | Shape of one building's published energy dataset (schema 1.3.0) | Existing — corpus row schema should be a superset/sibling, not a fork |
| `src/lib/energy/delivered-from-demand.ts` | Fuel split feeding grade + primary energy | Existing — **fix in place, additive params** |
| `src/lib/retrofit/lighting-retrofits.ts`, `solar-potential.ts` | Already compute REAL lighting kWh (LPD × area × hours) and REAL PV kWh (geometric kWp × irradiance) | Existing — **reuse the numbers these already produce, do not re-derive** |
| `src/lib/retrofit/retrofit-delta.ts` | Twin's before/after engine re-run, consumes `deliveredFromDemand` | Existing — **must keep working after Q2 fix** |
| `src/lib/energy-diagnostics/retrofit-bridge.ts` | Diagnostics' economics, reads `CompiledDegreeDayInput.payload`, a *second* derivation of the same measures | Existing — **this is the second economics path (Q3)** |
| `src/lib/reference-buildings/manifest.ts` (`REFERENCE_BUILDING_IDS`) | Registry #1 of published models | Existing — **collapse into gallery (Q4)** |
| `src/lib/landing/gallery.ts` (`GALLERY_ITEMS`) | Registry #2, hand-typed figures | Existing — **generate from manifest (Q4)** |
| `src/lib/benchmarks/peer-groups.ts`, `percentiles.ts` | Peer-group definition + percentile math | **NEW**, shared by corpus page and single-building page |

## Q1 — Where corpus generation lives, and the interactive/batch boundary

### The boundary already exists; it just isn't crossed by anything headless yet

`buildLedgerBaselineModel` (`src/lib/energy-diagnostics/ledger-baseline-model.ts:244`) is already a pure function: it takes a `LedgerBaselineInput` (an `ingestion: DrawingSetIngestionResult`, a `title`, optional `floors`, a `locale`, and an optional `now: IsoDateTime`) and returns a `LedgerBaselineOutcome`. It imports nothing from React, nothing from Zustand, nothing from the DOM — only `@/lib/korean-building-codes`, `@/lib/energy-standards/assembly`, `@/lib/ledger/floor-rows`, and sibling `energy-diagnostics/*` modules (all pure). Its only current caller is `src/components/energy-diagnostics/ledger-baseline-loader.tsx` (a React component, confirmed by grep — the other five hits are tests), which fetches register data client-side, builds a `DrawingSourceInput` via `src/lib/energy-diagnostics/ledger-source.ts:1-50` (also pure — no `fs`, no `fetch`; it takes already-fetched register fields as plain arguments), runs it through `ingestDrawingSet`, and calls the model builder.

So the "clean boundary between the interactive app and a batch job" is not something to build from scratch — it is to **stop entering this pipeline only from a browser component** and add a second, server-side entry point that supplies the same three things (register title/floor rows, a `DrawingSourceInput`, a fixed `now`) without React.

**Recommended shape (new):**

- `src/app/api/corpus/generate/route.ts` (Node runtime, `export const runtime = "nodejs"`, pinned to `icn1` like every other route touching data.go.kr/VWorld — see `AGENTS.md` "Functions are pinned to Seoul"). One request = one register lookup (by `sigunguCd`/`bjdongCd`/`platGbCd`/`bun`/`ji`, the same shape `bldrgstParamsSchema` already validates at `src/app/api/bldrgst/_factory.ts:36-45`) → fetch the four register endpoints server-side via `fetchFromDataGoKr` (`src/lib/api-proxy.ts`, already used by `_factory.ts:108`) → build the `DrawingSourceInput`/`ingestDrawingSet`/`buildLedgerBaselineModel` chain exactly as `ledger-baseline-loader.tsx` does, but in a route handler → shape the result through `buildReferenceEnergyDataset`-equivalent logic (Q5) → return one corpus row (JSON) or a `insufficient_ledger` reason.
- This keeps `buildLedgerBaselineModel` itself completely untouched and reused verbatim from both the interactive loader and the batch route — the "same physics" requirement is satisfied by construction, not by convention.
- `scripts/generate-corpus-release.mjs` (new, plain `.mjs`, matching the existing `scripts/build-reference-building.mjs:1-70` style) is the **driver**, not the physics: it pages through region codes (`/api/bldrgst/jijugu`, which already reports `totalCount` via `extractTotalCount`, `src/lib/api-proxy.ts:243-248`), calls the new route once per building or per small batch, and writes the accumulated rows to a release directory (Q5).

**Why not run TypeScript directly in a `.mjs` script?** Checked: there is no `tsx`/`ts-node` devDependency in `package.json`, and no existing script imports from `src/lib` via the `@/` path alias — every `scripts/*.mjs` is plain JS with its own `scripts/lib/*.mjs` helpers (confirmed by directory listing and grep). Building the batch job as a Next.js route handler avoids introducing a new script-execution toolchain: the route runs inside the already-compiled, already-tested TypeScript build, and the driver script only speaks HTTP (same pattern the app already uses for the register proxy itself). Adding `tsx` as a dev dependency to let scripts import `src/lib` directly is a viable alternative but is new tooling with its own path-alias/tsconfig wiring; the route-handler approach costs nothing new.

### Version-stamping for reproducibility

The pieces already exist and only need to be **assembled and pinned**, not invented:

- `LEDGER_BASELINE_MODEL_VERSION = "ledger-baseline-v1"` (`ledger-baseline-model.ts:77`) and `CANONICAL_ENERGY_MODEL_VERSION` (imported from `./types`) are already carried on every `CanonicalEnergyModel.modelVersion`/`schemaVersion`.
- `ENERGY_DATASET_SCHEMA_VERSION = "1.3.0"` (`src/lib/reference-buildings/energy-dataset.ts:14`) is the existing per-building dataset schema version; a corpus row should carry a sibling `CORPUS_ROW_SCHEMA_VERSION`, not silently reuse this one (a corpus row's shape will diverge from a hand-curated reference building's — see Q5).
- `energy-dataset-server.ts:46-47` already resolves `process.env.DEPLOY_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null` into `integrity.codeRevision`, exactly the git-SHA pin `AGENTS.md`'s deploy section requires for verification (`git log -1 --format=%ae`, `DEPLOY_COMMIT_SHA` in the deploy runbook).
- `buildLedgerBaselineModel`'s only non-deterministic input is `now` (`input.now ?? new Date().toISOString()`, line 248) — a batch run **must** pass a single pinned `now` for the whole release (the same principle `build-reference-building.mjs:14-16` already states in its own header comment: "`--generated-at` is required rather than defaulted to a clock... building them twice from the same inputs must produce identical bytes").

**Recommendation:** a corpus release's reproducibility fingerprint is the triple `{ gitSha (codeRevision), LEDGER_BASELINE_MODEL_VERSION, generatedAt (pinned) }`, stamped once in the release manifest (`ReleaseManifest`, `src/lib/portfolio/types.ts:44-67` — already has `modelVersion`, `featureSchemaVersion`, `lineage: Record<string,string>` fields fit for this) and echoed on every row. Regenerating from the same register snapshot at the same git SHA with the same pinned `now` reproduces byte-identical rows; a diff in any of the three explains any diff in output.

## Q2 — Fixing `delivered-from-demand.ts` without breaking the world

### What is there today, and why it is a single point of dishonesty

`deliveredFromDemand` (`src/lib/energy/delivered-from-demand.ts:24-32`) is:

```ts
export function deliveredFromDemand(demand: DemandLike): DeliveredEnergy {
  return {
    electric: demand.coolingDemand + demand.totalDemand * 0.15,
    gas: demand.heatingDemand + demand.totalDemand * 0.1,
    districtHeating: 0,
    districtCooling: 0,
    renewable: 0,
  };
}
```

It is consumed by two call sites in the physics core (`src/hooks/use-energy-metrics.ts:104`, `src/lib/retrofit/retrofit-delta.ts:278`) plus the reference-building dataset builder (`src/lib/reference-buildings/energy-dataset.ts:89`) — i.e., every grade the app shows (twin, retrofit delta, reference model, corpus-to-be) funnels through this one function.

**The good news, found while reading rather than assumed:** the two real terms this fix needs — lighting energy and PV generation — are **already computed correctly elsewhere in the codebase**, just not plumbed into this function:

- Lighting: `src/lib/retrofit/lighting-retrofits.ts:23-34` computes a real saving as `((currentLPD - targetLPD) * floorArea * annualOperatingHours) / 1000` (kWh/yr), and `src/hooks/use-retrofit-scenario.ts:431-432` independently computes the **baseline** the same way: `(materials.lighting.lightingPowerDensity * totalFloorArea * annualOperatingHours) / 1000`. `materials.lighting.lightingPowerDensity` (`src/lib/material-types.ts:111`) is already a first-class engine input, already populated from era tables (`LIGHTING_DEFAULTS[mainPurpsCd].lpd`, `src/lib/korean-building-codes.ts:174`) for every ledger-derived building (`ledger-baseline-model.ts:1146-1150`) and every reference building's own `-energy.ts` file (e.g. `bs-medical-dental-clinic-energy.ts:405`, `taltech-maemaja-energy.ts:92`).
- PV generation: `src/lib/retrofit/solar-potential.ts:90-91` computes `annualGenerationKWh = systemSizeKWp * peakSunHours * 365 * TILT_FACTOR * PERFORMANCE_RATIO`, sized from the **measured roof-plane** `geometricKWp` when available (`solar-potential.ts:61-85`, the same PV layout `pv-layout.ts` and `twin-roof-planes.ts` already draw on the model). `calculatePrimaryEnergy` (`src/lib/energy/primary-energy.ts:48-104`) **already accepts and correctly nets a `renewable` term** against the electric leg with its own capped substitution logic (lines 62-77) — this half of the fix requires no new primary-energy math at all, only a non-zero value reaching it.

`retrofit-delta.ts` already documents exactly this gap in its own header (lines 22-27) and in `UNPRICED_REASONS` (lines 218-232): an LED or PV measure is real, priced in NPV, and explicitly marked `pricedByEngine: false` with a reason string that names `delivered-from-demand.ts` by filename. This means the fix's "do not break the world" constraint is partly self-solving: once `deliveredFromDemand` reads lighting/renewable, the corresponding entries in `UNPRICED_REASONS` become dead code (their guard conditions — `runsAgree` on isolated re-runs — will simply stop matching, since a solo LED/PV run will now move `primaryPerSqm`). That is a **behavior change in test expectations**, not a design problem: tests asserting "LED/PV is `pricedByEngine: false`" must flip to asserting it is `true`, and that is precisely what "make lighting, photovoltaic... measures move the modeled energy and the grade" (PROJECT.md Active requirements) means.

### The safe shape of the change

**Signature: additive, not replacing.** Change `DemandLike` to accept two new optional fields rather than changing `deliveredFromDemand`'s existing two required ones:

```ts
export interface DemandLike {
  heatingDemand: number;
  coolingDemand: number;
  totalDemand: number;
  /** kWh/yr, from lightingPowerDensityWPerSqm × floorArea × operatingHours / 1000. Undefined = unknown. */
  lightingDemandKwh?: number;
  /** kWh/yr, from measured/geometric PV generation. Undefined = none/unknown. */
  renewableGenerationKwh?: number;
}
```

`electric = coolingDemand + (lightingDemandKwh ?? totalDemand * 0.15)` and `renewable: renewableGenerationKwh ?? 0` preserve the exact current output for every call site that does not pass the new fields — this is what keeps the ~380 retrofit-economics tests across 29 files (per `PROJECT.md` "Constraints") from breaking on day one. The DHW share (`totalDemand * 0.10` on gas) is unrelated to this milestone's stated targets (lighting, PV) and should be left alone in this pass — touching it multiplies the blast radius for no requirement in scope.

**What becomes an explicit input, and what happens when it is unknown (the stated-versus-assumed invariant):**

- `lightingDemandKwh` must be computed by the **caller**, not inferred inside `deliveredFromDemand` — the function has no access to `annualOperatingHours` today and should not gain one implicitly. Each of the three call sites (`use-energy-metrics.ts`, `retrofit-delta.ts`, `energy-dataset.ts`) already has `materials.lighting.lightingPowerDensity` and `envelopeQuantities(recipe).intensityFloorAreaSqm` in scope; `annualOperatingHours` is the one genuinely new named assumption to introduce (currently hard-coded per call site as `DEFAULT_LIGHTING_HOURS_PER_YEAR = 2_500` in `retrofit-bridge.ts:40`, and as a hook parameter default in `use-retrofit-scenario.ts`). This assumption must be surfaced the same way `LEDGER_USAGE_ASSUMPTION_ID` already surfaces occupancy/setpoint defaults (`ledger-baseline-model.ts:1128-1187`) — a named, visible, reversible assumption, never a bare constant multiplied in silently. Where `lightingPowerDensityWPerSqm` itself is a `status: "defaulted"` fact (the normal ledger-baseline case, `assumptionFact` at line 1146), the resulting lighting kWh is itself an assumption-derived value and must say so wherever it is displayed — it is not suddenly "measured" because it now moves the grade.
- `renewableGenerationKwh` must default to `0`, not to an estimate, when no PV is modeled — this is not a case of "unknown," it is the honest majority case (`materials.renewable.solarPV.installed === false` for most buildings). `0` is correct here in the same sense a documented zero from the register is correct elsewhere: it is a stated absence, not a placeholder. Where PV *is* modeled but sized by the crude area/utilisation ratio rather than a measured roof plane (`solar-potential.ts:61-68`'s own comment on why "a count wins"), the resulting generation figure inherits that provenance and the UI showing it must carry the same "not geometrically measured" caveat the roof-planes work already established for reference buildings.
- Do **not** add a convenience default that fabricates `lightingDemandKwh` from a ratio when `lightingPowerDensityWPerSqm` is missing — if a caller has no LPD fact at all (should not happen post-ledger-baseline, since `LIGHTING_DEFAULTS.default` always resolves, `korean-building-codes.ts:174` with a `.default` fallback pattern matching `WINDOW_RATIOS[era].default` at `ledger-baseline-model.ts:671`), the function should fall back to the existing `totalDemand * 0.15` ratio and the caller must record that it did — mirroring the discriminated `SystemRatioProvenance` pattern already built for exactly this purpose in `system-breakdown.ts:73-104` (`{ source: "use_code" }` vs `{ source: "generic_default"; assumption: string }`). Reuse that provenance type rather than inventing a second one; `deliveredFromDemand`'s return should probably grow a sibling `DeliveredEnergyProvenance` alongside `DeliveredEnergy` for exactly this reason.

**Test blast radius, concretely:** `src/lib/energy/__tests__/delivered-from-demand.test.ts` and `src/lib/retrofit/__tests__/retrofit-delta.test.ts` (which already has a case at line 274 asserting on the `lighting.lightingPowerDensity` field name) are the two files that will need direct edits. Every other test in the ~380/29 that merely exercises retrofit economics through `runEnergyEngine`/`computeRetrofitDelta` without asserting on `pricedByEngine` for lighting/PV specifically should be unaffected by the additive signature, because omitting the new optional fields reproduces today's numbers exactly. Grep for `pricedByEngine: false` and `UNPRICED_REASONS` assertions before merging — those are the ones that must flip, not silently start failing.

## Q3 — Reconciling the two economics input paths

**The two paths, read side by side:**

1. **Twin path** (`src/hooks/use-retrofit-scenario.ts` → `src/lib/retrofit/retrofit-delta.ts:269-294`, `runEnergyEngine`): reads live `MaterialProperties` from `material-store` and a `BuildingRecipe`/climate from `scenario-store`'s `ScenarioBuildingInputs` (`src/store/scenario-store.ts:21-33`), then derives wall U, WWR, roof/ground U by calling `calculateHeatLoss`/`calculateAnnualDemand` directly on those live materials via `envelopeQuantities(recipe)`.
2. **Diagnostics path** (`src/lib/energy-diagnostics/retrofit-bridge.ts:62-212`, `analyzeRetrofitEconomics`): reads a **frozen** `CompiledDegreeDayInput.payload` off a `DegreeDaySimulationRun` (`baselineRun.engineInput as CompiledDegreeDayInput`, line 69) — the exact materials/recipe/climate/mapping snapshot from a succeeded canonical-model run — and independently re-derives its own `wallU`/`avgWwr` (lines 79-91) before calling the *same* low-level generators (`generateEnvelopeRetrofits`, `generateHvacRetrofits`, `generateLightingRetrofits`).

Both paths terminate in the same generator functions (`src/lib/retrofit/{envelope,hvac,lighting}-retrofits.ts`, `computeFinancials`/`economic-model.ts`) — the divergence is entirely in **how each path arrives at the numbers it hands those generators**, not in the generators or the DCF math. Concretely: path 1 computes `wallU` as a straight arithmetic mean over `materials.envelope.walls` (`retrofit-delta.ts:258-262`, `meanWallU`); path 2 computes it as an area-weighted mean over the same array shape (`retrofit-bridge.ts:83-89`). Same input type, two different formulas, so the same building's wall U — and therefore its envelope-retrofit economics — can print two different numbers depending which page is open. Similarly, path 1's `computeRetrofitDelta` gets its before/after by literally re-running `calculateHeatLoss`/`calculateAnnualDemand` twice on the engine's `applyPhaseToMaterials` output (a measured delta); path 2 never re-runs the degree-day engine per measure at all — it hands the generator functions summary numbers and lets their own closed-form formulas produce the saving (`retrofit-bridge.ts`'s own `notes` array says so explicitly, lines 194-197: "절감량은... 도일 근사식으로 계산한 스크리닝 추정치이며, 진단 엔진을 조치별로 재실행한 값이 아닙니다").

**Recommendation — converge on the twin's method, not a third one.** `computeRetrofitDelta`/`runEnergyEngine` (`retrofit-delta.ts`) is the more rigorous of the two: it measures each solo delta by actually re-running the engine (`runsAgree`, line 297), which is exactly the "measured, not declared" standard `retrofit-delta.ts`'s own header enforces (points 1-2 of its file comment, lines 12-27). The fix is to make `analyzeRetrofitEconomics` build a `MaterialProperties`/`BuildingRecipe` pair from `CompiledDegreeDayInput.payload` (it already has `materials`/`recipe`/`climate` in hand, line 70) and call `computeRetrofitDelta({ materials, recipe, climate, measureIds, region, pvGeometricKWp })` instead of hand-rolling its own wall-U/WWR/residual-heat arithmetic. This:

- Deletes the second `wallU`/`avgWwr` formula (`retrofit-bridge.ts:79-91`) entirely rather than reconciling it with the twin's — one fewer place to keep in sync.
- Gets the diagnostics path the same `pricedByEngine`/`unpricedReasonKo` honesty `retrofit-delta.ts` already provides, which `retrofit-bridge.ts` currently has no equivalent for (it just emits whatever the generator computes, with no check that the degree-day engine can actually see that field).
- Is the natural point to also route the corpus generator (Q1) through: a corpus row's own retrofit/benchmark figures (if included) should call `computeRetrofitDelta` too, so there is exactly **one** economics computation path in the codebase after this change, not three.

This is real, scoped work (not a one-line change) because `retrofit-bridge.ts` currently derives `residualUsefulHeat` from `baselineRun.engineOutput.annualDemand.heatingDemand * heatingEfficiency` (line 116-118) to convert site energy back to useful heat — a conversion `retrofit-delta.ts`'s `computeRetrofitDelta` does not need, since it re-runs the full engine rather than post-hoc adjusting a demand figure. Reconciling the two is properly scoped as its own phase, sequenced after the Q2 fix (so the engine both paths call already produces honest lighting/PV numbers) and before or alongside Q6 (benchmarks need one economics source too, if benchmark percentiles ever include cost/NPV fields).

## Q4 — Collapsing the two model registries

**Registry #1**, `REFERENCE_BUILDING_IDS` (`src/lib/reference-buildings/manifest.ts:544-552`): the array of ids with a committed `public/reference-buildings/<id>/manifest.json`. `loadReferenceBuildingManifest` (lines 577-602) reads that file server-side. This is already the generated, machine-produced source of truth for one building's geometry counts/areas — produced by `scripts/build-reference-building.mjs`.

**Registry #2**, `GALLERY_ITEMS` (`src/lib/landing/gallery.ts:602`): seven hand-written `GalleryItem` object literals (`CLINIC` at line 119, `SCHEPENDOMLAAN` at 222, `DUPLEX` at 332, `FZK_HAUS` at 444, `KIT_OFFICE` at 522, `KLASSIQUA_OFFICE_1970` at 551, `TALTECH` at 577). Every `figures[]` entry's `value` (e.g. `"4,314.2 m²"`, `"259"`, `"58"`) is a **literal string**, typed by hand from a one-time read of the manifest/IFC. The file's own header comment (lines 43-49) already names this exact debt: *"These figures are still literals... A literal cannot notice that the extraction moved under it... Every numeric field here should be read from the manifest, keeping only the editorial ones by hand."* Only `landing-gallery.test.tsx` (lines 36-46) cross-checks the Clinic's figures against fixed strings — it pins the literal, it does not read the manifest, so it cannot catch drift between `gallery.ts` and `manifest.json` (only drift between `gallery.ts` and itself). PROJECT.md's own Context section confirms: *"only the clinic card is cross-checked against its generated manifest"* — and even that is an overstatement per the actual test file read: it checks against another literal in the test, not the manifest JSON.

**What must stay hand-typed vs. what must be generated:** `GalleryItem` mixes two different kinds of field —
- **Editorial** (`koTitle`, `enTitle`, `koUse`, `enUse`, `status`, the long doc-comment provenance notes) — these require human judgment about how to describe a building and cannot be generated.
- **Extracted** (`figures[].value`, `datums[].{elevationM,rooms,roomAreaSqm}`, `counts`, `modelFile`, `ifcSchema`, `licence`, `attribution`) — these already live in `ReferenceBuildingManifest` (`manifest.ts:71-389`: `counts`, `areas`, `storeys`, `licence`, `attribution`, `sourceFiles`) and must be **read**, not retyped.

**Recommended collapse:** make `REFERENCE_BUILDING_IDS` (manifest.ts) the single registry. `GalleryItem` becomes a thin editorial overlay keyed by id — `{ id, koTitle, enTitle, koUse, enUse, status }` plus nothing else — and a new pure function (e.g. `src/lib/landing/gallery-from-manifest.ts`) builds the rest of a `GalleryItem` (`datums`, `figures`, `licence`, `attribution`, `modelFile`, etc.) directly from `ReferenceBuildingManifest.{storeys, areas, counts, licence, attribution, sourceFiles}` at request/render time, the same way `buildReferenceEnergyDataset` (`energy-dataset.ts:160`) already turns a manifest into the per-building dataset. Because `loadReferenceBuildingManifest` is `async` (reads `node:fs/promises`, lines 577-602), and `GALLERY_ITEMS` is currently a synchronous, statically-imported array consumed by a **server component** landing page (`landing-page.tsx`, confirmed by the test rendering `<LandingPage />` without `await`) — the collapse requires either (a) making the landing page `async` and building `GALLERY_ITEMS` server-side per request (cheap: seven small JSON reads, same cost `loadReferenceEnergyCatalogue` already pays per `/api/reference-buildings/datasets` request), or (b) a build-time step that regenerates a `gallery.generated.ts` from the manifests (closer to today's shape, but reintroduces a can-drift artifact, just a generated one instead of hand-typed one — prefer (a) unless the landing page's `force-dynamic`/caching story rules it out).

**Test consequence:** the fifteen files that loop `REFERENCE_BUILDING_IDS` today as de facto contract tests (`grade-basis.test.ts`, `energy-dataset.test.ts`, `roof-planes.test.ts`, etc. — listed by the grep above) already treat this array as canonical; making the gallery derive from it strictly increases their coverage (a manifest change now also changes the visible gallery card, and a test asserting gallery figures would catch it) rather than requiring them to change.

## Q5 — Corpus storage and serving

**There is no database in this project.** `package.json` has no `pg`/`prisma`/`drizzle`/`@supabase`/`sqlite`/`@vercel/blob`/`mongodb` dependency (checked directly). Every persistence pattern in the app today is either browser-side (Zustand `persist`, IndexedDB via `idb-keyval`) or **committed static files under `public/`, read server-side with `node:fs`** — `loadReferenceBuildingManifest` (`manifest.ts:577-602`), `loadReferenceEnergyDataset`/`loadReferenceEnergyCatalogue` (`energy-dataset-server.ts:19-68`), and — most relevantly — `StaticFileReleaseStore` (`src/lib/portfolio/release-store.ts:73-166`), which reads `public/releases/<version>/{manifest.json, predictions.json|.jsonl, calibration.json}` and a top-level `public/releases/manifest.json` pointer (`{ latest, history }`, `LatestReleasePointer`, `portfolio/types.ts:70`).

**This `ReleaseStore` was built for the now-superseded v7.0 Prediction plan, and PROJECT.md explicitly says its "dataset-release idea is absorbed into this milestone."** It is not dead code to route around — it is the one piece of infrastructure in the repo already shaped for "versioned dataset releases with a stated error band and a read-only API" (PROJECT.md's Active requirement, verbatim). `/releases` (`src/app/releases/page.tsx:1-60`) is a working, if currently pointing-at-nothing, explorer built on exactly this store, marked `dynamic = "force-dynamic"` so a newly published release appears without a rebuild (line 16).

**Recommendation:** repoint/extend this store rather than building a parallel one.

- Rename the concept from "prediction release" to "corpus release" (or generalize `ReleaseStore` to carry either), and change the row type from `PredictionRow` to a new `CorpusRow` (superset: `buildingPk`, `bjdongCd`, `mainPurpsCd`, era, floor area, EUI, grade, assumption ids, `modelVersion` — see Q1's reproducibility triple).
- **Storage layout for "large table without shipping it all to the browser":** the current `getPredictions` implementation (`release-store.ts:107-165`) reads one whole `predictions.json`/`.jsonl` file into Node memory and filters in-process — acceptable for the seven-reference-building scale and for a corpus in the low thousands, but it does not shard, so a nationwide sweep (tens of thousands of buildings) would force one huge JSON into every serverless invocation's memory just to answer one query. Shard by the register's own natural partition — **시군구코드** (5-digit prefix of `bjdongCd`, the same key `/api/bldrgst/jijugu` already pages by) — into `public/releases/<version>/rows/<sigunguCd>.jsonl`, plus a small `public/releases/<version>/index.json` carrying per-shard row counts and the aggregate stats needed for Q6's peer groups (n, mean, percentile breakpoints) precomputed at release-build time. A query for one 시군구 or one building reads one shard; a query across regions reads the small index plus only the shards it needs.
- `predictions.parquet` is already documented as "canonical... but download-only — not parsed in the Next.js runtime" (`release-store.ts:122-123`) — carry the same convention for the corpus: ship a single Parquet (or CSV) file per release for analysts to download wholesale (mirrors the existing `/api/reference-buildings/datasets?format=csv` pattern, `datasets/route.ts:11-16`), and keep the JSONL shards as the only thing the app itself reads.
- **API:** `src/app/api/corpus/releases/route.ts` (list/latest, thin wrapper on `listReleases`/`getManifest`), `src/app/api/corpus/[version]/buildings/route.ts` (paginated, filtered by 시군구/mainPurpsCd/era — server-side `Array.slice` over one shard, never the whole corpus), `src/app/api/corpus/[version]/buildings/[buildingPk]/route.ts` (single row, mirrors `[id]/dataset/route.ts`). All Node runtime, `icn1`-pinned only if they ever re-touch data.go.kr/VWorld directly (they should not — they read committed release artifacts, same as `/api/reference-buildings/*` today, which carries no region pin because it never calls an external Korean API at request time).
- **The browsable corpus page** (`/corpus`, new) is a server component that requests one page of the index/shard via the API above with `searchParams`-driven filters and pagination (region, use type, era, grade), never importing the row array directly into a client bundle — same principle `/releases/page.tsx` already follows by being a server component with no client directive (line 7's own comment: "SERVER COMPONENT ONLY... enforced by the CI guard in `scripts/ci-check-plan.mjs`").

## Q6 — Benchmark computation

Nothing today computes peer-group percentiles anywhere in the codebase (confirmed: no existing `peer-group`/`percentile`/`benchmark` module surfaced across the files read for this research). Two consumers will need the same answer to "how does this building compare to others like it": the corpus page (rank a building against the whole shard-appropriate peer set) and a single building's page (`/models/[id]` or `/building/[id]`, showing "this building's EUI is at the Nth percentile of similar buildings"). Both need to agree on **what "similar" means** and **the same percentile arithmetic**, or the two pages will show different rankings for the same building — the exact repeated failure this codebase's history (two model registries, two economics paths) keeps producing when the same computation is allowed to live in two places.

**Recommendation:** a new pure module, `src/lib/benchmarks/peer-groups.ts` + `src/lib/benchmarks/percentiles.ts`, alongside `src/lib/energy/` and `src/lib/reference-buildings/` (not inside either — it is consumed by corpus rows, reference buildings, *and* live twin/diagnostics buildings alike, so it must not depend on any of their specific types beyond a minimal shared shape like `{ mainPurpsCd, era, primaryEnergyPerArea, climateRegion }`).

- **Peer-group definition** should reuse the classification vocabulary the app already has rather than inventing a new one: `ledgerUseCategory`/`classifyEraExplicit` (`src/lib/ledger/floor-rows.ts`, already imported by `ledger-baseline-model.ts:41-45`) for use-type and era buckets, and the climate region key `resolveLedgerWeatherSource` already resolves (`src/lib/energy-diagnostics/ledger-climate.ts`, imported at `ledger-baseline-model.ts:52`). A peer group is therefore `{ useCategory, era, weatherRegion }` — the same three axes every ledger-baseline building already carries as named facts, so no building's peer-group membership needs a new, separately-maintained classification.
- **Percentile calculation** is generic array statistics (given the release-time precomputation recommended in Q5, this can be as simple as a sorted-array nearest-rank or linear-interpolation percentile function) and belongs in `percentiles.ts` with zero building-domain knowledge, so it is trivially unit-testable in isolation.
- **Where it runs:** peer-group aggregate stats (n, percentile breakpoints per group) are computed **once per release**, at corpus-generation time (Q1/Q5), and stored in the release's `index.json` — not recomputed per page view. A single building's page (corpus row, reference building, or live diagnostics/twin building) then calls a small `rankWithinPeerGroup(building, precomputedBreakpoints)` function from the same module to say "you are at percentile X" without re-scanning the whole corpus. This is the same pattern `system-breakdown.ts` already uses for provenance (compute once, carry a small typed result) rather than the "loop everything client-side" pattern the two-registries and two-economics-paths mistakes both grew out of.
- **Honesty requirement carried over from the stated-versus-assumed invariant:** a percentile computed against a peer group of `n < ~10` (a rare use-type/era/region combination) is statistically close to meaningless and must say so — carry `peerGroupSize` alongside every percentile figure and render a named caveat below a threshold, the same way `gradeTableIsFromOccupancy` (`delivered-from-demand.ts:91-93`) already forces the UI to disclose when a classification fell back to a weaker signal.

## Q7 — Suggested build order

Dependencies are stated inline; phases in the same tier can run in parallel if separate agents/sessions own them (per `docs/04_Agent-Handoffs/CURRENT.md`'s multi-session-tree caution, use path-scoped commits).

1. **Fix `delivered-from-demand.ts` (Q2).** No dependency on anything else in this list; every other honest energy number in this milestone (corpus rows, benchmarks, the retrofit panel) is decoration until this lands, per PROJECT.md's own Key Decision ("Fix delivered-from-demand.ts before anything downstream"). Touches `delivered-from-demand.ts`, its two direct call sites, `energy-dataset.ts`, and the two test files named in Q2.
2. **Reconcile the two economics paths (Q3).** Depends on (1) being done first, so the single converged path already produces honest lighting/PV numbers rather than converging onto the old dishonest ones. Touches `retrofit-bridge.ts` primarily.
3. **Collapse the two model registries (Q4).** Independent of (1)/(2) — can run in parallel with them. Touches `gallery.ts`, adds `gallery-from-manifest.ts`, and the landing page's sync/async boundary.
4. **Register-sweep feasibility research (already an Active requirement, not architecture work) → corpus generation route + driver script (Q1).** The route can be built and tested against a handful of buildings without waiting on sweep-quota research to conclude, but a full-scale run should not be attempted before that research answers the quota question (PROJECT.md's own ordering: "Register sweep feasibility is researched before any phase commits to scale"). Depends on (1) for the numbers it will publish to be honest, but not on (2)/(3).
5. **Corpus storage/serving (Q5).** Depends on (4) existing (something must produce rows to store), and should reuse/extend `release-store.ts` rather than fork it — sequence this as soon as (4) produces its first real batch, so the storage shape is validated against real row volume rather than designed on paper.
6. **Benchmark computation (Q6).** Depends on (5) (needs a corpus release to compute peer groups from) and benefits from (1) (percentile figures are only as honest as the EUI figures behind them). This is naturally the last tier: it is a read-time convenience over data the earlier phases produce, and building it before there is a real corpus to benchmark against would mean testing it only on the seven reference buildings — too small a peer group to validate percentile math meaningfully.

```
(1) delivered-from-demand fix
   │
   ├──► (2) reconcile economics paths
   │
   └──► (4) corpus generation route/script ──► (5) corpus storage/serving ──► (6) benchmarks
(3) collapse registries  [independent, parallel to all of the above]
```

## Anti-Patterns to avoid in this integration

### Anti-Pattern: a third economics/energy computation path

**What people do:** when the corpus generator needs "the retrofit-adjusted numbers for this building," write a third, corpus-specific derivation because the two existing ones (twin, diagnostics) are each awkward to import into a headless batch context.
**Why it's wrong:** this repository already has two disagreeing economics paths (Q3) as a direct consequence of exactly this instinct happening once. A third would make it three.
**Do this instead:** finish the Q3 convergence first, then have the corpus generator call the single converged `computeRetrofitDelta`, the same pure function the twin already calls.

### Anti-Pattern: a corpus row that "fills in" an unmeasured input with a plausible number

**What people do:** when a register sweep produces a building with a genuinely unresolvable field (era unknown, no floor count, climate unresolvable — `LedgerInsufficientReason`, `ledger-baseline-model.ts:101-108`), silently substitute a population-average value so the row is "complete" for the corpus table.
**Why it's wrong:** this is the exact convenience-default trap `AGENTS.md` names as the way the provenance guarantee dies, at corpus scale instead of single-building scale. `buildLedgerBaselineModel` already refuses to do this — it returns `insufficient_ledger` with a typed reason instead (lines 223-228 and every early return in the builder).
**Do this instead:** a corpus release must be able to state its own coverage honestly — "N buildings swept, M produced a baseline, K excluded for reason X" — the same way `ReleaseManifest.coverage` (`portfolio/types.ts:52-58`) already has a `buildingCount` field ready to carry this. An excluded building is a row in an exclusions log, not a row with invented values.

## Sources

- `src/lib/energy-diagnostics/ledger-baseline-model.ts` (read in full)
- `src/lib/energy/delivered-from-demand.ts`, `primary-energy.ts`, `system-breakdown.ts` (read in full)
- `src/lib/retrofit/retrofit-delta.ts` (read in full), `lighting-retrofits.ts` (partial), `solar-potential.ts` (partial)
- `src/lib/energy-diagnostics/retrofit-bridge.ts` (read in full)
- `src/lib/reference-buildings/manifest.ts`, `energy-dataset.ts`, `energy-dataset-server.ts`, `energy-inputs.ts` (partial) (read in full/partial)
- `src/lib/landing/gallery.ts` (read in full)
- `src/lib/portfolio/release-store.ts`, `types.ts` (partial), `src/app/releases/page.tsx` (partial)
- `src/app/api/bldrgst/_factory.ts`, `jijugu/route.ts`, `src/lib/api-proxy.ts` (partial)
- `src/app/api/reference-buildings/datasets/route.ts`, `[id]/dataset/route.ts`
- `src/hooks/use-energy-metrics.ts`, `use-retrofit-scenario.ts` (partial)
- `src/store/scenario-store.ts` (partial)
- `.planning/PROJECT.md`, `CLAUDE.md`, `AGENTS.md`, `docs/04_Agent-Handoffs/CURRENT.md` (required reading)
- `package.json` (checked for DB/tsx dependencies — none found), directory listings of `scripts/`, `src/lib/reference-buildings/`, `src/app/api/`

---
*Architecture research for: Building Energy Repository integration (v6.0)*
*Researched: 2026-09-15*
