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
- **CAD-first draft (`cad-` PK)** — P2-24: a standalone building with no
  건축물대장 entry, identified by a synthetic `cad-<uuid>` PK
  (`src/lib/workflow/cad-draft.ts`). The workflow **mode** (`ledger` |
  `cad-first`) is derived from this prefix, never stored; cad-first swaps the
  stage order to upload → 정보 입력(params) → twin → report, makes the CAD
  footprint mandatory (no P2-17 skip), and synthesizes a minimal title from
  three manual params (floors, year, sigunguCd) + CAD-derived areas — all
  other ledger fields stay explicit unavailable markers (AFF-6). Drafts are
  session-transient (`src/store/cad-draft-store.ts`).
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
- **accuracy-path routing** — explicit precedence ordering for footprint geometry sources:
  IFC (measured BIM) > DXF (exact CAD) > DWG (converted CAD) > PDF (traced) > procedural
  rectangle (era guess). Implemented in `resolveAccuracyPath()`
  (`src/lib/cad/ingest-result.ts`). The winning source is recorded in the ingest result's
  `source` + `confidence` fields so the fidelity badge can display the correct provenance.
- **IFC ingest source** — `IngestSource = "ifc"` in `src/lib/cad/ingest-result.ts`:
  the BIM-sourced footprint path. Paired with `IngestConfidence = "measured"` (highest
  accuracy tier). Produced by `ifcResult()` and selected first by `resolveAccuracyPath()`.
- **IfcSession** — singleton `{ api, closeModel }` returned by `getSharedIfcApi()`
  (`src/lib/ifc/ifc-session.ts`). One `IfcAPI` + `Init` call per browser session; concurrent
  callers share the same promise. `disposeIfcSession()` resets the singleton (used in tests
  and on unmount to release the WASM heap).
- **LedgerValidationResult** — output of `validateAgainstLedger()` (`src/lib/validation/
  ledger-validator.ts`): `{ valid: boolean, warnings: LedgerWarning[] }`. Each `LedgerWarning`
  carries `field`, `divergencePct`, and a `message` stating the exact magnitude.
  Checks: gross area (`totArea`), above-ground floors (`grndFlrCnt`), below-ground floors
  (`ugrndFlrCnt`). Zero ledger fields are skipped (AFF-6 zero = unavailable). Threshold ±15%.

- **PNU (필지고유번호)** — 19-digit parcel key: 시군구코드(5) + 법정동코드(5) +
  대지구분(1) + 본번(4) + 부번(4). The join key across Korean national spatial databases;
  constructed from ledger fields (`sigunguCd`/`bjdongCd`/`platGbCd`/`bun`/`ji`) in
  `src/app/api/vworld/footprint/route.ts` and `use-campus-buildings.ts`.
- **GIS건물통합정보 (`LT_C_SPBD`)** — VWorld dataset fusing 연속지적도 geometry with
  건축물대장 attributes per building: actual building outline polygon + measured
  `buld_hg` (height, m), `gro_flo_co` (ground floors), `und_flo_co` (underground floors).
  P2-25: preferred footprint source for the single-building twin; multiple buildings can
  share one PNU, so selection is largest-area (PNU mode) or nearest-centroid (point mode).
- **연속지적도 필지 (`LP_PA_CBND_BUBUN`)** — VWorld cadastral parcel (lot boundary, NOT
  the building outline). The named fallback when `LT_C_SPBD` has no usable feature; the
  footprint route reports which layer won via its `source` field (`"building" | "parcel"`).
- **context massing (컨텍스트 매싱)** — P2-26: surrounding neighbor building volumes rendered
  as gray extrusions (`color: '#cfcfcf'`) in the single-building twin for solar/shading context.
  Fetched via `GET /api/vworld/footprint?contextMode=true&lat=…&lng=…` (radius 50–500m, default
  150m, size=30). Height chain: measured `buld_hg` → `gro_flo_co × 3.3m` → 6m default
  (`ESTIMATED_FLOOR_HEIGHT_M`, `DEFAULT_NEIGHBOR_HEIGHT_M` in `src/lib/context-massing.ts`).
  The subject building itself is excluded from neighbors via ray-cast point-in-polygon
  (`toLocalNeighbors`). `truncated=true` when ≥30 neighbors returned (more may exist).

## Governance

- **AFF (Architecture Fitness Function)** — a checkable architectural assertion; global
  list in `docs/work-plan/AI_PROCESS.md` §1 Stage 3.
- **ADR (Architecture Decision Record)** — required before breaking a Must-not constraint,
  changing a domain assumption (cost data sources, escalation rates…), or retiring a
  fitness function. See `docs/work-plan/adr/README.md`.
- **UC id** — use-case identifier `UC-01`…`UC-10` in
  `docs/work-plan/knowledge/use-cases.md`; every work item references ≥1 (rule R1.1).
