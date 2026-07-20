# Use-Case Catalog — UC-01 … UC-10

> Stage-1 artifact of `docs/work-plan/AI_PROCESS.md`. Every work item references ≥1 UC id
> (rule R1.1). Domain terms used here are defined in `domain-glossary.md`.
> Notation: *primary modules* are entry points, not exhaustive touch lists — each item file
> carries its own May-touch/Must-not.

## UC-01 — Search building by address

- **Actor**: End user (building owner / retrofit planner)
- **Trigger**: User submits the address search form with a known lot address.
- **Main flow**:
  1. User selects/enters sido → sigungu → dong (법정동) and optional bun/ji; the form derives
     `sigunguCd` + `bjdongCd` from `src/data/region-codes.json` + `src/data/bjdong-codes.json`.
  2. App calls `/api/bldrgst/title` (and related endpoints) with the user's `x-api-key`.
  3. Upstream HUB API returns ledger rows; app renders the results table with pagination.
  4. If the optional use-type filter is set, rows are filtered **client-side** by
     `mainPurpsCd` (upstream ignores the param — `src/app/page.tsx:166-183`).
  5. User picks a row → navigates to the building detail view (UC-03).
  6. Empty upstream body (missing/invalid bjdongCd) renders an explicit "no results /
     check address" state — never a fabricated row (AFF-6).
- **Primary modules**: `src/components/search/address-search-form.tsx`,
  `src/components/search/search-results-table.tsx`, `src/components/search/search-pagination.tsx`,
  `src/app/page.tsx`, `src/app/api/bldrgst/title/route.ts`, `src/lib/api-proxy.ts`.

## UC-02 — Search by region cascade

- **Actor**: End user
- **Trigger**: User does not know the exact address; browses administrative regions instead.
- **Main flow**:
  1. User picks sido → sigungu → dong from cascading selects fed by
     `src/data/region-codes.json` / `src/data/bjdong-codes.json`.
  2. Selecting a dong is **mandatory** — bjdongCd is required by the upstream API
     (form validation at `src/components/search/region-search-form.tsx:180`).
  3. App queries `/api/bldrgst/title`, optionally in `batchMode` (comma-separated bjdongCd
     list, `src/app/api/bldrgst/title/route.ts:22-40`).
  4. Results render as in UC-01 steps 3–6; user proceeds to UC-03.
- **Primary modules**: `src/components/search/region-search-form.tsx`,
  `src/app/api/bldrgst/title/route.ts`, `src/data/region-codes.json`,
  `src/data/bjdong-codes.json`.

## UC-03 — View building ledger detail + data-quality tiers

- **Actor**: End user
- **Trigger**: User selects a building from search results (UC-01/UC-02).
- **Main flow**:
  1. App composes the building record from title/floors/recap endpoints
     (`/api/bldrgst/title|floors|recap|areas|jijugu|basis`).
  2. Data-quality scorer classifies each field available/missing using the zero-value
     convention (`platArea=0 / heit=0 / bcRat=0` ⇒ unavailable,
     `src/lib/data-quality/quality-scorer.ts:31-56`).
  3. Detail view renders the ledger fields; unavailable fields show the explicit `-` /
     unavailable state (AFF-6) — never a fabricated number.
  4. The composite record + quality tier feed the twin generation default (UC-05) and the
     fidelity badge (L1–L3).
- **Primary modules**: `src/app/building/[id]/page.tsx`,
  `src/hooks/use-composite-building.ts`, `src/lib/data-quality/quality-scorer.ts`,
  `src/lib/api-client.ts`, `src/app/api/bldrgst/*/route.ts`.

## UC-04 — Upload CAD footprint (DXF / DWG / PDF)

- **Actor**: End user
- **Trigger**: User wants higher-fidelity geometry than the ledger/procedural default.
- **Main flow**:
  1. User drops a file in the upload stage (50 MB cap, mirrored client/server —
     `src/app/api/cad/convert/route.ts:26`).
  2. DXF is parsed client-side (`dxf-parser`); DWG is header-validated client-side, then
     converted via WASM or the server round-trip (`src/lib/cad/dwg-parser.ts:120-153`);
     PDF is traced via the PDF tracer (`src/lib/cad/pdf-to-polygon.ts`).
  3. User picks the footprint layer/rings in the preview.
  4. The resulting polygon is stored as a `footprintPolygon` recipe override
     (`recipe-store.setOverride(pk, "footprintPolygon", rings)` — `src/lib/cad/README.md:5,23`).
  5. Workflow may advance to the twin stage only once a footprintPolygon exists
     (`src/store/__tests__/workflow-store.test.ts:57`).
- **Primary modules**: `src/components/upload/upload-stage.tsx`,
  `src/components/upload/footprint-preview.tsx`, `src/components/upload/layer-picker.tsx`,
  `src/components/upload/pdf-tracer.tsx`, `src/lib/cad/*`,
  `src/app/api/cad/convert/route.ts`, `src/store/recipe-store.ts`.

## UC-05 — Generate / inspect 3D twin (floor selection)

- **Actor**: End user
- **Trigger**: Building record loaded (UC-03) and/or footprint supplied (UC-04).
- **Main flow**:
  1. App builds a `BuildingRecipe` from composite geometry (`toRecipe`,
     `src/lib/building-geometry.ts:201`) and applies recipe overrides.
  2. The procedural generator + viewer render the twin; the fidelity badge shows the
     current tier L1–L3 (`src/lib/fidelity/fidelity-types.ts:7-11`).
  3. User orbits/zooms and clicks a floor or element; selection state records `floorNo`
     (`src/store/selection-store.ts:23-24`) and drives per-floor inspection panels.
  4. Twin data persisted per building in the `.twin-data/` JSON store
     (`src/app/api/twin-data/[buildingId]/route.ts:10`).
- **Primary modules**: `src/components/viewer/procedural-building-model.tsx`,
  `src/components/viewer/building-scene.tsx`, `src/components/viewer/floor-mesh.tsx`,
  `src/components/twin/fidelity-badge.tsx`, `src/lib/building-geometry.ts`,
  `src/lib/procedural/types.ts`, `src/store/selection-store.ts`,
  `src/app/api/twin-data/*`.

## UC-06 — Configure retrofit scenario within a budget (knapsack + GR track)

- **Actor**: End user
- **Trigger**: User opens the scenario rail on the twin stage and sets a CAPEX budget.
- **Main flow**:
  1. Candidate measures are generated from the building state: envelope (U-value targets),
     HVAC (incl. HRV), lighting, solar (`src/lib/retrofit/*-retrofits.ts`,
     `solar-potential.ts`).
  2. User sets the CAPEX budget (KRW) and picks a 그린리모델링 program track
     (`program-track-selector.tsx:23-28`): public = CAPEX subsidy share (50%/70%);
     private = interest-rate buy-down (4.5pp/4.0pp) modeled as a WACC blend
     (`economic-model.ts:70-77`).
  3. Measures are filtered through interaction/mutual-exclusion rules (AFF-5).
  4. `selectMeasuresForBudget` (0/1 knapsack, `economic-model.ts:356`) picks the
     NPV-maximizing subset within budget; all math stays in `src/lib/retrofit` (AFF-4).
  5. The manifest renders the selected set + effective CAPEX after subsidy.
- **Primary modules**: `src/store/scenario-store.ts`,
  `src/components/twin/capex-input.tsx`, `src/components/twin/program-track-selector.tsx`,
  `src/components/twin/retrofit-manifest.tsx`, `src/components/twin/scenario-rail.tsx`,
  `src/lib/retrofit/economic-model.ts`, `src/lib/retrofit/cost-database.ts`.

## UC-07 — View ROI readout (NPV / IRR / payback caliper)

- **Actor**: End user
- **Trigger**: A scenario selection exists (UC-06).
- **Main flow**:
  1. The economic model computes NPV, IRR (bisection), and discounted payback with
     end-of-period discounting over a 20-year horizon (`economic-model.ts:6-23`).
  2. The readout renders headline NPV, IRR band chip (A–D), and a year-by-year cumulative
     discounted-cash-flow caliper with the payback year pinned
     (`src/components/twin/roi-readout.tsx`).
  3. Loading/unavailable inputs render explicit states — never interpolated or invented
     figures (AFF-6).
- **Primary modules**: `src/components/twin/roi-readout.tsx`,
  `src/lib/retrofit/economic-model.ts`, `src/lib/retrofit/retrofit-report.ts`.

## UC-08 — Export savings report (PDF / CSV / JSON)

- **Actor**: End user
- **Trigger**: User chooses an export format from the export dropdown on a finished scenario.
- **Main flow**:
  1. User selects PDF, CSV, or JSON in the export dropdown.
  2. PDF is composed by the report engine/renderer; CSV/JSON serialize the recipe, demand,
     and economic results (`src/lib/export/csv-export.ts`, `src/lib/export/json-export.ts`).
  3. Exported numbers are identical to the on-screen pure-function outputs (AFF-4/AFF-6 —
     no re-computation with different assumptions inside exporters).
  4. File downloads via the browser; no server persistence.
- **Primary modules**: `src/components/export/export-dropdown.tsx`,
  `src/lib/report/report-engine.ts`, `src/lib/report/pdf-renderer.tsx`,
  `src/lib/export/csv-export.ts`, `src/lib/export/json-export.ts`,
  `src/lib/retrofit/retrofit-report.ts`.

## UC-09 — Campus multi-building comparison

- **Actor**: End user (campus / portfolio manager)
- **Trigger**: User adds ≥2 buildings to the campus comparison view.
- **Main flow**:
  1. User assembles a campus set from previously analyzed buildings.
  2. The comparison engine normalizes per-building metrics (incl. ACH50-sensitive demand)
     and aggregates portfolio-level savings (`src/lib/campus/comparison-engine.ts`,
     `portfolio-aggregator.ts`).
  3. The view renders side-by-side metrics, load diversity, and shared-renewables potential.
  4. Any building with unavailable data contributes an explicit gap marker, not an
     interpolated value (AFF-6).
- **Primary modules**: `src/components/campus/comparison-view.tsx`,
  `src/components/campus/portfolio-dashboard.tsx`, `src/lib/campus/comparison-engine.ts`,
  `src/lib/campus/portfolio-aggregator.ts`, `src/lib/campus/load-diversity.ts`,
  `src/lib/campus/shared-renewables.ts`.

## UC-10 — Consume portfolio predictions via `/api/v1/predictions/{bjdongCd}`

> Correction vs. the original brief: the route is the **dynamic** endpoint
> `GET /api/v1/predictions/{bjdongCd}` (`src/app/api/v1/predictions/[bjdongCd]/route.ts`),
> not a bare `/api/v1/predictions` collection.

- **Actor**: External API consumer (third-party client, machine-to-machine)
- **Trigger**: Consumer issues `GET /api/v1/predictions/{bjdongCd}`.
- **Main flow**:
  1. Route validates the path param against `^\d{10}$` → `400` on malformed input
     (`route.ts:11,16`).
  2. Per-IP token-bucket rate limit (60 req/min) → `429` when exceeded (`route.ts:18-45`).
  3. Latest release is loaded via `StaticFileReleaseStore`; predictions for the bjdongCd
     are returned.
  4. Status contract: `200` rows found · `404` bjdongCd not in latest release ·
     `503` no published/readable release (`route.ts:4-11`).
  5. Errors never leak filesystem paths or internals (AFF-2).
- **Primary modules**: `src/app/api/v1/predictions/[bjdongCd]/route.ts`,
  `src/lib/portfolio/release-store.ts`, `src/lib/portfolio/feature-extractor.ts`,
  `src/app/api/v1/predictions/[bjdongCd]/__tests__/route.test.ts`.

---

## Traceability matrix

| UC | Stage-2 spec anchor (typical item area) | Key invariant |
|----|------------------------------------------|---------------|
| UC-01 | api, ux | client-side mainPurpsCd filter; empty ≠ error |
| UC-02 | api, ux | bjdongCd required; batchMode contract |
| UC-03 | api, ux | zero-value convention; explicit unavailable state |
| UC-04 | viewer, state | footprintPolygon override; upload gate before twin |
| UC-05 | viewer, state | fidelity tier honesty; floor selection |
| UC-06 | retrofit, state | knapsack in `src/lib/retrofit`; GR track semantics; AFF-5 |
| UC-07 | retrofit, ux | end-of-period DCF, 20-yr horizon; no fabricated figures |
| UC-08 | report | exporters reuse pure-function outputs |
| UC-09 | campus, ux | normalized metrics; explicit gaps |
| UC-10 | api, ml | 400/404/429/503 contract; rate limit; no secret/path leakage |
