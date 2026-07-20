# Domain Glossary — Semantic Model / Ontology

> Stage-1 artifact of `docs/work-plan/AI_PROCESS.md`. Canonical definitions of every domain
> term used in work items, BDD scenarios, and code. **Rule R1.2:** any new domain term
> introduced by a change is added here in the same PR.
> Conventions: Korean terms romanized in parentheses; `file:line` = evidence anchor.

## Building Ledger API (건축물대장 / data.go.kr HUB)

- **건축물대장 (building ledger)** — Korea's official building registry (표제부 title,
  층별 floors, recap, etc.). Queried through the 국토교통부 건축HUB API, proxied by
  `src/app/api/bldrgst/*/route.ts` (key via `x-api-key` header, `title/route.ts:16-19`).
- **bjdongCd** — 10-digit 법정동 (legal-dong) code. **REQUIRED by the upstream API**:
  omitting it returns an *empty body, not an error* — callers must treat empty as
  "missing/invalid bjdongCd", not as "no buildings". UI enforces selection
  (`src/components/search/region-search-form.tsx:180`). Validated as `^\d{10}$` in
  `src/app/api/v1/predictions/[bjdongCd]/route.ts:16`.
- **sigunguCd** — 5-digit 시군구 code; prefix of bjdongCd. Also keys the regional HDD/CDD
  climate lookup (`src/lib/energy/climate-data.ts:31,58`).
- **mainPurpsCd (용도코드)** — building use-type code. **The upstream filter parameter is
  IGNORED by the HUB API — filter client-side** (`src/app/page.tsx:166-183`). Code table:
  `src/data/use-type-codes.json` (full 5-digit codes; first two digits = category):
  `02` = 공동주택 (apartment/multi-family), `07` = 판매시설 (retail), `14` = 업무시설 (office).
- **Zero-value convention** — upstream numeric fields `platArea` (대지면적), `heit` (높이),
  `bcRat` (건폐율) equal to `0` mean **data unavailable**, not a real zero. Display `-`
  (AFF-6). Evidence: availability scored via `> 0` checks in
  `src/lib/data-quality/quality-scorer.ts:31-56`.

## Retrofit Program & Economics

- **그린리모델링 (GR, Green Remodeling)** — Korean government retrofit support program with
  two tracks (`src/lib/retrofit/cost-database.ts:57-95`,
  `src/components/twin/program-track-selector.tsx:23-28`):
  - **Public track (공공건축물)** — direct **CAPEX subsidy share**: 50% (Seoul + central
    government, `public-seoul-or-central`) or 70% (other municipalities, `public-local`).
  - **Private track (민간건축물)** — **interest-rate buy-down** over the loan term
    (`private-base` = 4.5pp, `private-tier2` = 4.0pp), NOT a CAPEX subsidy.
- **WACC buy-down** — the private-track interest support is modeled by blending the
  subsidized loan rate with the equity discount rate into an effective WACC
  (`src/lib/retrofit/economic-model.ts:70-77`).
- **DCF / NPV / IRR** — discounted cash flow with **end-of-period discounting** over a
  **20-year horizon** (Korean retrofit norm, `economic-model.ts:19-23`). NPV = discounted
  cumulative savings − effective CAPEX; IRR via bisection under monotonic-cash-flow
  assumption (`economic-model.ts:6-8`). Defaults: discount rate 5%, elec escalation 5%/yr,
  gas 3%/yr, DH 3%/yr.
- **Knapsack selection** — 0/1 knapsack `selectMeasuresForBudget`: pick the NPV-maximizing
  subset of measures within a budget (`economic-model.ts:344-356`). Inputs must already
  satisfy interaction/mutual-exclusion rules (AFF-5).
- **SMP/REC feed-in tariff** — solar revenue modeled as a single user-configurable
  `feedInTariffRate` (KRW/kWh) applied to a fixed feed-in ratio of generation
  (`src/lib/retrofit/solar-potential.ts:10,44,55`). SMP = system marginal price,
  REC = renewable energy certificate; the model collapses both into the one rate.

## Energy Model

- **ECO2** — German DIN V 18599 energy-certificate format; import/export interop for the
  energy model (`src/lib/energy/eco2-export.ts`, `src/lib/energy/eco2-import.ts`,
  API `src/app/api/v1/eco2-imports/route.ts`).
- **HDD / CDD** — heating / cooling degree days, **base 18 °C**, from a static regional
  table keyed by 2-digit sido prefix; optional sigunguCd lookup; observed weather can
  replace static values (`src/lib/energy/climate-data.ts:7,31,58-63`).
- **Delivered vs primary energy** — delivered = metered site energy; primary = source
  energy via MOTIE/KEMCO factors `PRIMARY_ENERGY_FACTORS` (`src/lib/energy/primary-energy.ts:5-8`):
  electricity **2.75**, gas **1.1**, district heating **0.728** (kWh primary per kWh
  delivered; renewable 0). Drives the official efficiency grade (`src/lib/energy/energy-grade.ts:7-8`).
- **U-value** — thermal transmittance W/m²K of an envelope element. Retrofit targets:
  `KOREAN_2020_TARGET_U_VALUES` (`src/lib/retrofit/envelope-retrofits.ts:8`).
- **ACH50** — airtightness: air changes per hour at 50 Pa pressure difference. Carried as
  `materials.envelope.airtightness.ach50` (`src/lib/energy/eco2-export.ts:100,231`).
- **HRV** — heat-recovery ventilation (열회수환기장치). Modeled as always-recommended
  measure: 75% heat-recovery efficiency ⇒ 15% ventilation heat-loss reduction
  (`src/lib/retrofit/hvac-retrofits.ts:93-111`).

## 3D Twin & Geometry

- **BuildingRecipe** — the declarative building description consumed by the procedural
  generator (`src/lib/procedural/types.ts`; converted from geometry by `toRecipe`,
  `src/lib/building-geometry.ts:201`).
- **Recipe overrides** — per-property user/CAD overrides applied on top of the recipe via
  `recipe-store.setOverride(pk, …)` (`src/lib/cad/README.md:5`).
- **footprintPolygon** — explicit ground-plan rings (`[number,number][][]`,
  `src/lib/building-geometry.ts:42`) supplied via CAD upload or override
  (`src/lib/cad/README.md:23`); required to advance past the upload stage
  (`src/store/__tests__/workflow-store.test.ts:57`).
- **twin-data** — filesystem JSON store at `<repo>/.twin-data/<buildingId>/<dataType>.json`
  (note the dot prefix), read/written by `src/app/api/twin-data/[buildingId]/route.ts:10`
  and `src/app/api/twin-data/upload/route.ts:10,53`.
- **Fidelity tiers L1–L3 (GeometricLOD)** — `src/lib/fidelity/fidelity-types.ts:7-11`:
  **L1** = era defaults only (no ledger data); **L2** = ledger-driven procedural output
  (heights, floor count, roof shape from 건축물대장); **L3** = per-orientation WWR +
  explicit footprintPolygon + per-floor heights from calibration overrides.
- **BuildingCalibration** — per-buildingId JSON record in `src/data/building-calibrations/`
  carrying `overrides: OverrideRationale[]` (field path, inferred value, override value,
  traceable source document) and a `geometricLOD` tier. Loaded by
  `loadCalibration(buildingId)` (`src/lib/fidelity/building-calibration-loader.ts`);
  unknown buildingId → `null` (never an error). Schema validated by
  `validateCalibrationEntry` — rejects empty or vague source strings ("backfit", "tuned").
- **InputProvenance** — per-input measurement flag for the fidelity badge
  (`src/components/twin/fidelity-badge.tsx`): each of `footprint`, `heights`, and `facade`
  is `"measured"` (comes from a real data source) or `"estimated"` (era-recipe default or
  zero-height unavailability). Displayed in the badge tooltip alongside the L1/L2/L3 tier.
- **slab overhang** — `BuildingRecipe.slab.overhang` (meters): the distance each floor slab
  extends beyond the facade plane. Zero means flush with the wall face. Non-zero values are
  applied by `generateSlabs` (`src/lib/procedural/structure-generator.ts`) by scaling the
  InstancedMesh width/depth by `footprint + 2 × overhang`.
- **estimated flag** — `FloorHeightResult.estimatedFlags[i]` (`src/lib/fidelity/
  building-calibration-loader.ts`): `true` when a floor's height is zero (AFF-6 unavailable
  data) or when a partial calibration exists but does not cover that floor. `false` when the
  height is a non-zero recipe default (best available) or a calibrated measurement.

## Governance

- **AFF (Architecture Fitness Function)** — a checkable architectural assertion; global
  list in `docs/work-plan/AI_PROCESS.md` §1 Stage 3.
- **ADR (Architecture Decision Record)** — required before breaking a Must-not constraint,
  changing a domain assumption (cost data sources, escalation rates…), or retiring a
  fitness function. See `docs/work-plan/adr/README.md`.
- **UC id** — use-case identifier `UC-01`…`UC-10` in
  `docs/work-plan/knowledge/use-cases.md`; every work item references ≥1 (rule R1.1).
