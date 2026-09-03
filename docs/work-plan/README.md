# GreenRetrofit Simulator — Tracked Work Plan

Master dashboard for the remediation plan produced by the full-codebase review of **2026-07-21**
(11 parallel review tracks; gates executed: `pnpm lint` 0 errors, **902/902 tests pass**, `pnpm build` green).
Every work item follows the project's AI development process — read **[AI_PROCESS.md](./AI_PROCESS.md)** before executing any item.

## The process (SW 공학 기반의 AI 에이전트 코딩)

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│  1. Upfront Requirements │   │  2. Spec-Driven Dev't    │   │  3. Constraint-Driven    │   │  4. Eval-Driven Dev't    │
│      Engineering (RE)    │──▶│          (SDD)           │──▶│        Dev't (CDD)       │──▶│          (EDD)           │
│                          │   │                          │   │                          │   │                          │
│ Business process +       │   │ Use Cases → BDD          │   │ BDD + Context → Tests    │   │ TDD + AFFs + Security +  │
│ semantic model →         │   │ Semantic model →         │   │   → TDD (red first)      │   │ Compliance + Honesty +   │
│ Use Cases                │   │ Knowledge base → Context │   │ Design rules + ADR →     │   │ Cost controls → CI/CD    │
│                          │   │                          │   │ Architecture Fitness Fn  │   │                          │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

| Stage | Artifact in this repo |
|---|---|
| 1. RE | [knowledge/domain-glossary.md](./knowledge/domain-glossary.md) (semantic model) · [knowledge/use-cases.md](./knowledge/use-cases.md) (UC-01…UC-10) |
| 2. SDD | Each `items/P*.md` — §2 Specification: context pack + BDD scenarios |
| 3. CDD | Each `items/P*.md` — §3 Constraints: may-touch / must-not / fitness functions · [adr/](./adr/README.md) |
| 4. EDD | Each `items/P*.md` — §4 Evaluation: TDD tests, gates, security & honesty checklist |

**Operating loop per item:** SELECT → CONTEXT → SPEC → TEST-RED → IMPLEMENT → EVALUATE → TRACK (gates G0–G5, exactly one `in-progress` item per AI session).
**Hand an item to an AI agent with:** `Execute work item P1-04 per docs/work-plan/AI_PROCESS.md`

## Status dashboard

Legend — status: ⬜ not-started · 🔵 in-progress · 🟣 in-review · ✅ done · ⛔ blocked

### P0 — Blockers (week 1)

| ID | Title | Area | Effort | UC | Status |
|---|---|---|---|---|---|
| [P0-01](./items/P0-01-secure-twin-data-routes.md) | Secure twin-data routes against path traversal and unauthenticated writes | api | M | UC-04, UC-05 | ✅ |
| [P0-02](./items/P0-02-wire-savings-into-report.md) | Wire scenario savings (NPV/IRR/payback) into report outputs | report | M | UC-06, UC-08 | ✅ |
| [P0-03](./items/P0-03-korean-pdf-font.md) | Register a CJK font so Korean PDF export stops rendering tofu | report | S | UC-08 | ✅ |
| [P0-04](./items/P0-04-polygon-floor-selection.md) | Fix floor selection on the polygon-footprint rendering path | viewer | S | UC-05 | ✅ |
| [P0-05](./items/P0-05-ci-pipeline.md) | Add GitHub Actions CI, coverage thresholds, and close the release-guard hole | infra | M | UC-01, 05–08 | ✅ |
| [P0-06](./items/P0-06-design-stage-energy-diagnostics.md) | Source-traceable design-stage energy diagnosis vertical slice | energy | XL | UC-12 | 🟣 |

### P1 — Correctness of the savings engine (month 1)

| ID | Title | Area | Effort | UC | Status |
|---|---|---|---|---|---|
| [P1-01](./items/P1-01-knapsack-mutual-exclusion-interaction.md) | Enforce mutually exclusive measures and damp interaction double-counting | retrofit | L | UC-06, UC-07 | ✅ |
| [P1-02](./items/P1-02-measure-lifetimes.md) | Add measure lifetimes, truncate cash flows, add generator-level tests | retrofit | M | UC-06, UC-07 | ✅ |
| [P1-03](./items/P1-03-fuel-aware-pricing.md) | Thread heating fuel type into envelope/HVAC generators; price district heating | retrofit | M | UC-06, UC-07 | ✅ |
| [P1-04](./items/P1-04-fix-system-ratios-use-codes.md) | Correct SYSTEM_RATIOS use-code keys against the real MOLIT 용도코드 table | energy | S | UC-03, UC-06 | ✅ |
| [P1-05](./items/P1-05-benchmark-units-grading-scale.md) | Fix benchmark unit mismatch and retire dual grading scales | energy | M | UC-03, UC-08 | ✅ |
| [P1-06](./items/P1-06-api-hardening-sweep.md) | API hardening sweep — traversal, error contracts, proxy factory, batch caps, zod | api | L | UC-01, 02, 04 | ✅ |
| [P1-07](./items/P1-07-a11y-chart-repair.md) | Accessibility and chart repair — Tab hijack, keyboard-inert rows, black bars | ux | M | UC-01, 03, 05, 06 | ✅ |
| [P1-08](./items/P1-08-state-consistency.md) | State consistency — one effective-recipe hook, guard-aware stepper, active building | state | L | UC-05, 06, 08 | ✅ |
| [P1-09](./items/P1-09-coverage-ratchet.md) | Ratchet src/lib coverage floors from measured 52/57 baseline to 70/70 | infra | S | UC-05, 06, 07 | ⬜ |

### P2 — Model completeness & product coherence (quarter)

| ID | Title | Area | Effort | UC | Status |
|---|---|---|---|---|---|
| [P2-01](./items/P2-01-infiltration-ventilation-loss.md) | Add infiltration/ventilation heat loss to energy model | energy | M | UC-05, UC-06 | ✅ |
| [P2-02](./items/P2-02-per-fuel-co2.md) | Per-fuel CO2 factors and fuel-split demand result | energy | S | UC-07, UC-08 | ✅ |
| [P2-03](./items/P2-03-app-router-conventions.md) | Adopt App Router conventions (error/loading/not-found, metadata, fonts, link) | infra | M | UC-01, UC-03 | ✅ |
| [P2-14](./items/P2-14-building-metadata-font-trim.md) | generateMetadata on /building/[id] via server wrapper + font payload trim (P2-03 follow-up) | infra | S | UC-01, UC-03 | ✅ |
| [P2-04](./items/P2-04-readme-product-identity.md) | Rewrite README and retitle landing hero to the GreenRetrofit identity | docs | S | UC-01 | ✅ |
| [P2-05](./items/P2-05-ml-release-honesty.md) | Make the v0.1.0 ML release honest — build the pipeline or strip the metrics | ml | M | UC-10 | ✅ |
| [P2-06](./items/P2-06-i18n-consolidation.md) | Consolidate i18n onto a single t(ko,en) catalog honoring the language store | ux | L | UC-01, 05–08 | ✅ |
| [P2-15](./items/P2-15-i18n-numeric-idiom-and-remaining-isko.md) | i18n tail — localize Korean numeric idiom (억/만/년) + migrate remaining isKo sites (P2-06 follow-up) | ux | M | UC-01, 05–08 | ✅ |
| [P2-07](./items/P2-07-persistence-hardening.md) | Harden persisted stores — versioning, API-key policy, building-scoped annotations | state | M | UC-04, 05, 06 | ✅ |
| [P2-16](./items/P2-16-annotation-scope-and-stage-recovery.md) | Building-scope persisted annotations + workflow stage recovery after reload (P2-07 follow-up) | state | M | UC-04, UC-05 | ✅ |
| [P2-17](./items/P2-17-cad-optional-skip-upload.md) | Make CAD upload optional — explicit skip to the twin on the public-data footprint | ux | S | UC-01, 04, 05 | ✅ |
| [P2-18](./items/P2-18-remove-dead-editor-modes-distill-toolbar.md) | Remove vestigial editor modes (탐색/층·객체 편집) + distill toolbar/onboarding to real functions | ux | S | UC-01, 04, 05 | ✅ |
| [P2-19](./items/P2-19-equipment-object-story.md) | Object story — clicked equipment narrates identity → current operation → upgrade savings | ux | M | UC-04, 06–08 | ✅ |
| [P2-20](./items/P2-20-scenario-driven-visuals.md) | Scenario-driven visuals — clicking retrofit measures transforms the 3D model | ux | M | UC-04, 06–08 | ✅ |
| [P2-21](./items/P2-21-webgpu-renderer-option.md) | Opt-in WebGPU renderer backend (experimental) with WebGL fallback | viewer | S | UC-04, UC-05 | ✅ |
| [P2-22](./items/P2-22-structural-viz-benchmark-iso19650.md) | BIM-benchmarked structural visualization + ISO 19650-2-aligned provenance | viewer | M | UC-04, UC-05 | ✅ |
| [P2-23](./items/P2-23-webgpu-blackscreen-realistic-previews.md) | Fix WebGPU black screen + scenario clicks render the post-retrofit state | viewer | M | UC-04, 06–08 | ✅ |
| [P2-24](./items/P2-24-cad-first-standalone-workflow.md) | CAD-first standalone workflow — begin with a CAD file, no ledger dependency | ux | M | UC-04, 05, 06, 11 | 🟣 |
| [P2-25](./items/P2-25-vworld-building-layer-footprint.md) | VWorld building-layer footprint (LT_C_SPBD) — true outline + measured height fallback | geometry | M | UC-01, UC-05 | 🔎 |
| [P2-26](./items/P2-26-neighbor-context-massing.md) | Neighbor context massing — surrounding buildings as gray extrusions for solar/shading context | geometry | M | UC-05 | 🟣 |
| [P2-27](./items/P2-27-input-provenance-wiring.md) | Wire footprint/height provenance into the fidelity badge | viewer | S | UC-05 | 🟣 |
| [P2-28](./items/P2-28-campus-building-layer.md) | Campus mode building-layer upgrade — real outlines + measured heights for all campus buildings | geometry | M | UC-05, UC-09 | 🟣 |
| [P2-29](./items/P2-29-one-ledger-geometry-producer.md) | One ledger geometry producer — reconstruct() feeds the twin and the traceable engine | geometry | L | UC-03, 05, 12 | 🟣 |
| [P2-30](./items/P2-30-per-storey-envelope.md) | Per-storey envelope — the stack stops being one extruded prism | geometry | L | UC-05, UC-12 | 🟣 |
| [P2-31](./items/P2-31-directional-setbacks.md) | Directional setbacks — a step goes on one face, not concentrically | geometry | M | UC-05, UC-12 | ⬜ |
| [P2-08](./items/P2-08-dead-code-doc-drift.md) | Delete dead code, fix doc drift, remove stray artifacts | infra | M | UC-05 | ✅ |
| [P2-09](./items/P2-09-e2e-rewrite.md) | Rewrite e2e suite around the real user journey with mocked APIs | infra | M | UC-01, 03, 05, 08 | ✅ |
| [P2-10](./items/P2-10-financial-model-refinements.md) | Financial model refinements — loan-term buy-down, rate honesty, solar fixes, sourced costs | retrofit | L | UC-06, 07, 08 | ✅ |
| [P2-11](./items/P2-11-geometric-fidelity-data-correctness.md) | Geometric fidelity — data correctness fixes (parcels, curves, slabs, shadows, AA) | viewer | M | UC-04, UC-05 | ✅ |
| [P2-12](./items/P2-12-geometric-fidelity-dead-features.md) | Geometric fidelity — wire dead fidelity features (PBR, slab detail, calibration registry, honest badges) | viewer | L | UC-05 | ✅ |
| [P2-13](./items/P2-13-geometric-fidelity-ifc-path-validation.md) | Geometric fidelity — IFC high-accuracy path, unified slab pipeline, validation loop | viewer | L | UC-04, UC-05 | 🟣 |

## Sequencing constraints

- **P0-01 before P1-06** — both touch API routes; land the twin-data security fix first.
- **P1-01 → P1-02 → P1-03** — all touch `src/lib/retrofit/` generators and `economic-model.ts`; land sequentially in this order (one session each).
- **P1-08 before P1-05** — both edit `src/hooks/use-energy-metrics.ts`; P1-08 consolidates the hook first. Inside P1-08, follow its internal order (c) → (a) → (d) → (b).
- **P1-04 before P2-01 / P2-02** — energy-engine corrections land before model extensions build on them.
- **P0-02 before P2-10** — the report wiring establishes the data path that P2-10's rate-honesty fixes then refine.
- **P0-05 early** — once CI lands, every later item is gate-enforced automatically (EDD stage becomes self-policing).
- **P2-11 after P1-06** — both touch `src/app/api/vworld/footprint/route.ts`; the error-contract work lands first.
- **P2-12 before P2-08** — P2-12 wires previously dead texture/detail code that P2-08 would otherwise delete.
- **P2-13 after P0-04 (done) and P2-09** — it builds on the floor-selection fallback and the e2e harness.
- **P2-29 → P2-30 → P2-31** — the ledger-geometry track, strictly in order. P2-29 makes per-level plates reach the twin at all; P2-30 prices them; P2-31 decides where the step goes. Running them out of order produces geometry nothing downstream can see.
- **P2-29 after P2-27** — both write `twin-provenance-store`; the fidelity badge wiring lands before an automatic reconstruction starts setting `reconstructedFootprint` on every building.
- **P2-08 last** — dead-code deletion is safest after the items that might touch those files have landed.

## Changelog

| Date | Item | Change | Agent/session |
|---|---|---|---|
| 2026-09-04 | P2-30 | Per-storey envelope. `FloorSpec.plate` threaded through slabs (bucketed by distinct plate, not per storey), facade faces, column grid and parapet; `envelopeQuantities` now sums Σ perimeterᵢ×hᵢ and counts setback terraces as roof; the traceable engine walls each storey on its own plate and emits one roof surface per terrace. `applyLevelPlates` is the shared adapter. Absent plate = building footprint, so a prism is byte-identical. 4174 unit (from 4149), tsc clean, 0 lint errors | claude-opus-5-session |
| 2026-09-04 | P2-31 | Spec corrected: VWorld `LT_C_UQ111` **does** return 용도지역 in `uname` (verified against the live API). The item had assumed it was unavailable, so 일조권 사선제한 could only be a recognised pattern; it can now be applied as a sourced rule, with 상업지역 ruling it out explicitly | claude-opus-5-session |
| 2026-09-04 | P2-29 | Implemented. New `src/lib/cad-reconstruction/ledger-bridge.ts` (`evidenceFromLedger` → `reconstructModel` → `twinGeometryFromModel` / `ledgerRingFromModel` / `provenancePatchForModel`) and `useLedgerReconstruction`. `building-scene.tsx` renders the model's projected ring instead of the GIS bbox; `use-ledger-record.ts` feeds the same ring to the traceable engine through a new `reconstructed` `LedgerFootprint` kind whose `observed` flag alone decides traced-vs-inferred authority. 4149 unit (from 4118), tsc clean, 0 lint errors, e2e 41/2 vs a 39/4 baseline | claude-opus-5-session |
| 2026-09-04 | P2-29, P2-30, P2-31 | Added the ledger-geometry track. Audit found **three** independent 건축물대장→shape derivations (`building-geometry.ts` bbox/1.5:1 rect, `ledger-baseline-model.ts:1233` 1.5:1 rect, `cad-reconstruction/reconstruct.ts` per-level plates) of which only the third reads 층별개요 — and its levels are discarded at `upload-stage.tsx:427`, leaving the twin a single extruded prism. Items collapse to one producer, sum the envelope per storey, and direct the setback. Spec only; no code changed | claude-opus-5-session |
| 2026-08-24 | P0-06 | Source-traceable canonical drawing-set diagnosis shipped for review: visible Tier-1 assumption acceptance, deterministic simulation, evidence/3D/result round trips, alternatives, and all-or-nothing persistence; 3,839 Vitest passed (4 skipped), 28 Playwright passed (1 skipped), build and CI checks green | codex-gpt5 |
| 2026-07-21 | all | Work plan created from 11-track code review (23 items; process + knowledge base seeded) | orchestrator swarm |
| 2026-07-21 | P0-01 | Twin-data routes hardened: slug+containment validation, timing-safe POST auth (fail-closed), 64 KB cap, no path leak, honest lastUpdated | claude-fable-5-ultrawork |
| 2026-07-21 | P0-04 | Polygon-path floor clicks now select via userData.floorNo fallback (resolvePickedFloor helper + getFloorByFloorNo); manual viewer smoke still pending | claude-fable-5-ultrawork |
| 2026-07-21 | P0-03 | NotoSansKR (subset OTF, OFL) registered for PDF export; all 7 Helvetica refs replaced; toast.error on PDF failure; embedding proven by PDF-bytes test | claude-fable-5-ultrawork |
| 2026-07-21 | P0-02 | Scenario financials wired into preview/PDF/CSV/JSON via scenario-summary.ts; null (never 0) paybacks; honest fidelity 1/2/3 derivation | claude-fable-5-ultrawork |
| 2026-07-21 | P0-05 | GitHub Actions CI (lint/test:coverage/build/ci:check); src/lib floors at measured 52/57 baseline (P1-09 ratchet filed); guard (c) now catches untracked release files | claude-fable-5-ultrawork |
| 2026-07-21 | P1-04 | SYSTEM_RATIOS re-keyed to MOLIT truth (01/02 residential, 07 retail, 14 office; 11/13 → honest fallback); office hours 12000→14000; cross-module consistency oracle test | claude-fable-5-ultrawork |
| 2026-07-21 | P1-08 | useEffectiveRecipe replaces SIX hand-copied merges (polygon overrides now reach all consumers); active-building store + sigunguCd parity; guard-aware stepper with lock reasons | claude-fable-5-ultrawork |
| 2026-07-21 | P1-05 | Benchmark + grade now computed in PRIMARY energy via official MOTIE/KEMCO tables (one path); legacy scale demoted to heatmap color ramp; certification input unit fixed | claude-fable-5-ultrawork |
| 2026-07-21 | P1-01 | Heating-plant conflict groups enforced via exact DP branching; portfolio savings damped (sequential residual in hook, documented pairwise fallback in report); GR fraction clamped | claude-fable-5-ultrawork |
| 2026-07-21 | P1-02 | Measure lifetimes (ASHRAE-anchored) truncate cash flows past useful life; 3 new generator test suites pin every savings formula + branch boundary | claude-fable-5-ultrawork |
| 2026-07-21 | P1-03 | Heating fuel (resolveHeatingFuel) threaded into envelope/HVAC generators — district-heat priced at 90 KRW/kWh + 0.32 tCO2/MWh; heat-pump suppressed on electric heat; legacy gas default preserved | claude-fable-5-ultrawork |
| 2026-07-23 | P2-28 | Campus building-layer upgrade: bboxMode+layer=building queries LT_C_SPBD (size=30, per-item height/groundFloors); hook parallel-fetches parcel+building, prefers largest-area building per PNU with parcel fallback; measuredHeightM carried on CampusBuilding and passed to generateBuildingGeometry | claude-fable-5-session |
| 2026-07-23 | P2-26 | Neighbor context massing: contextMode on /api/vworld/footprint returns up to 30 LT_C_SPBD neighbor buildings; client pure module (resolveNeighborHeight, toLocalNeighbors with ray-cast subject exclusion); ContextMassing R3F component mounts in single-building path | claude-fable-5-session |
| 2026-07-21 | P1-06 | API hardening: filename allowlist + execFile timeout (cad), 400/502/503 contract + truncated flag (vworld), createDataGoKrProxy factory (5 routes → 4 lines), batch cap 10 + Promise.all + failedCodes (title), tab/doc fix (consumption), zod validation | claude-opus-4-8-ultrawork |
| 2026-07-21 | P1-07 | a11y + chart repair: Tab un-hijacked (→backquote), keyboard-operable result rows, viewport-clamped floating panel, var(--chart-N) bars, sr-only upload input, clamped CAPEX input, anchored Moon icon | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-01 | Infiltration/ventilation heat-loss term (0.34·ACH·V·ΔT; ach50/20 leakage + mechanical airflow; HRV cuts mechanical share); heating demand now airtightness/HRV-sensitive | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-02 | Per-fuel CO2 (shared CO2_FACTORS in energy/co2-factors.ts; gas heating at 0.2018 not grid 0.4594); AnnualDemand fuel split; renewable now offsets primary energy at 2.75 | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-03 | App Router conventions: error/loading/not-found/global-error boundaries; parseBuildingId + notFound() on bad ids; /releases force-dynamic; logo next/link. generateMetadata+font trim → P2-14 | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-04 | README rewritten to GreenRetrofit identity (value prop, features, data.go.kr API-key setup, stack); hero + root metadata retitled to the savings story; no fabricated metrics | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-05 | ML release made honest (Option B): stripped unverifiable v0.1.0 metrics (MAPE/R²/holdout), relabeled schema-only; /releases guards metrics; skipped corpus test → real smoke test | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-06 | i18n consolidated onto useT()/catalog: all 6 twin panels + stepper + export-dropdown + html lang switch KO/EN via one code path. Numeric idiom (억/만/년) + remaining isKo → P2-15 | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-07 | version+migrate (versionedMigrate) on all 6 persisted stores (no more silent corruption across deploys); API-key localStorage policy documented in dialog. Annotation-scope + stage-recovery → P2-16 | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-09 | e2e rewritten around real journey: deleted `</div>` tautology + plan-view always-true else + false beforeEach comment; network-mocked ledger fixture (dummy key seeded, no real credential) renders a SPECIFIC field; hero/banner/404-boundary content assertions; plan-view WebGL toggle explicit test.skip w/ reason; mutation-verified mock is load-bearing (5 passed/1 skipped, 1117 vitest, build green) | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-10 | Financial model corrected: loan-term-scoped buy-down (per-year discount schedule; ref private-base NPV 153.1M→135.1M, −11.8%); UI shows 유효할인율 (WACC) not 5% equity; general escalationComponents split solar (flat feed-in + 0.5%/yr degradation) & heat-pump (gas-saved vs elec-spent); unified 140 KRW/kWh; sourced/assumption-tagged HVAC+lighting+solar costs; PROGRAM_PARAMETERS version + ₩200B loan-cap flag. 9 new tests, 1126 total, build green | claude-opus-4-8-ultrawork |
| 2026-07-21 | P2-11, P2-12, P2-13 | Added geometric-fidelity track (data correctness / dead-feature wiring / IFC path + validation loop) from rendering-accuracy review; dashboard, sequencing, and execution prompts updated | orchestrator |
| 2026-07-21 | P2-13 | IFC session singleton (getSharedIfcApi/disposeIfcSession); accuracy-path routing ifcResult+resolveAccuracyPath (measured>exact>converted>traced); polygon slabs unified into ONE InstancedMesh (floor selection preserved via instanceToFloor); ledger-fact validation (±15% threshold, zero-skip, magnitude-stating warnings). 1200 tests, build green | claude-fable-5 |
| 2026-07-21 | P2-08 | Dead code + doc drift purged: 23 tracked files deleted (legacy viewer renderer cluster, dead upload parsers/api-client, 11 stale PNGs ~6.4MB); unmounted SAOPostProcessing removed; noUnusedLocals/Parameters ON with repo-wide clean tsc (all no-unused-vars gone; 9 react-hooks warnings remain, out of scope); CLAUDE.md claims corrected (OutlinePass, qualified draw calls, ground-plane-only textures); stray dir removed. 1114 tests, build green | ultrawork |
| 2026-07-21 | P2-11 | 5 geometric fidelity fixes: VWorld MultiPolygon picks largest-area parcel + parcelCount metadata; DXF bulge arc tessellation (16 chords, area within 2%) + CIRCLE entity support + NaN vertex filter closed; IFC BASESLAB classified as floor not roof (first IFC unit tests); shadow frustum derived from siteLayout.extents (no hardcoded ±60); EffectComposer MSAA target (samples=4) restores AA. 1131 tests, build green | claude-fable-5 |
| 2026-07-21 | P2-12 | Wire dead fidelity features: shared-texture mutation fixed (clone+dispose in useMemo); slab overhang extends W/D by 2×overhang, ground-floor slabs use instanceColor per groundFloor material; 5 seed calibration JSON entries (validateCalibrationEntry, schema-validated); applyCalibrationFloorHeights overrides FloorSpec heights + recalculates y positions + estimated flags (zero or partial-calibration gap); FidelityBadge gains InputProvenance prop showing per-input measured/estimated in tooltip; ADR-0001 filed for factoryZones deferral (zero new draw calls constraint). 1156 tests, build green | claude-fable-5 |
| 2026-07-21 | P2-14 | generateMetadata on /building/[id] via thin server wrapper (buildingMetadataTitle, pure fn unit-tested); client workspace byte-mechanically moved to building-workspace.tsx; Fraunces+JetBrains_Mono trimmed from root layout → route-scoped to building/[id]/layout.tsx; 5 new tests, 1205 total, lint 0 errors, build green (route: ƒ Dynamic) | claude-fable-5 |
| 2026-07-21 | P2-15 | i18n tail done: lang-aware twin-formatters.ts (formatKrw/formatYears — ko byte-identical, en ₩250M/3.0 yr) + all remaining isKo ternaries (~230 sites, 36 components incl. upload stage, config-tabs, energy panels) migrated to useT()/pick(); grep isKo → 0 (one comment). 1226 tests, lint 0 errors, build green | claude-fable-5 |
| 2026-07-21 | P2-16 | Annotations building-scoped (ScopedAnnotation stamped with active buildingPk, annotationsForBuilding selector, store v2 migrator stamps legacy null) + WorkflowStageRecovery in Providers retreats persisted twin/report stage to first guard-failing stage on reload (reuses getBlockingStage). 16 new tests, 1242 total, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-17 | CAD upload now optional: upload guard passes on explicit cadSkipped; transient per-building skipCad map in workflow store (not persisted — reload still retreats via P2-16 recovery); "Continue without CAD" button + caveat on upload stage; stepper/recovery guard ctx carry the active building's skip. Twin renders public-data footprint (no override written, honest badges intact). 11 new tests, 1253 total, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-18 | Dead editor-mode system removed (mode-indicator, editor-mode-store, use-editor-keybinds — currentMode was write-only since the pivot); toolbar distilled (identity-first strip, duplicate Reset View dropped, dead GLOBAL_ITEMS/PROP_ACTION_ITEMS data deleted); onboarding tour rewritten from stale 5-stage/catalog copy to the real 4-stage pipeline. 1249 tests, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-19 | Equipment object story: new pure equipment-story.ts (component prefix → measure category, fuel-priced current cost) + equipment-info-panel restructured to 3 acts (identity / current operation incl. annual ₩ / upgrade measures with 절감·회수·NPV from the shared useRetrofitScenario engine — numbers identical to scenario rail). EQ-02 추정 discipline extended to savings. 9 new tests, 1258 total, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-20 | Scenario clicks now remodel the twin: appliedMeasureIds in scenario-store (cleared on building switch), pure measure-visuals.ts mapping, clone-and-restore tints (glass/walls/roof/slabs via userData.type + group names; sub-mep-hvac/lighting recolor), new SolarPanels InstancedMesh PV array, manifest rows clickable (aria-pressed, emerald applied state). 7 new tests, 1265 total, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-21 | Opt-in WebGPU backend: persisted rendererBackend in app-store, R3F v9 async gl factory (dynamic import of three/webgpu, code-split), Canvas keyed remount, 4096 shadow maps under WebGPU, OutlinePass WebGL-only (documented trade-off), toolbar Sparkles toggle with support detection. 1265 tests, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-22 | BIM benchmark (Revit/Navisworks/Tekla/Solibri/xeokit → knowledge doc): orphaned KBC 2016 StructuralAnalysisLayer finally mounted under structure toggle (StructuralTooltip group now exists); IFC 4 classification lib (IfcSlab/Column/Wall/CurtainWall/Member + LoadBearing) in floor overlay; structural isolation view (LoadBearing solid, rest ghosted, 구조 보기 toggle); ISO 19650-2-ALIGNED container chips (ledger A / CAD S2 / estimated S0) in summary card. 12 new tests, 1277 total, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-25 | VWorld footprint now prefers the BUILDING outline (GIS건물통합정보 LT_C_SPBD; largest-area per PNU / nearest-centroid per point) over the cadastral parcel — parcel is the named fallback, response carries `source` + measured `attributes` (buld_hg/gro_flo_co/und_flo_co, null-never-fabricated); height chain ledger heit → VWorld measured → era estimate in building-geometry (opts.measuredHeightM), wired through building-scene/hooks; campus bbox mode untouched. 12 new tests, 1343 total, lint 0 errors; build gate red from concurrent P2-24 tree (0 tsc errors in P2-25 files) — re-run after P2-24 | claude-fable-5 |
| 2026-07-23 | P2-23 | WebGPU black wall fixed (PMREMGenerator is WebGL-only → direct equirect env map under WebGPU; raw ShaderMaterial meshes hidden — node renderer can't convert them). Scenario previews now render the post-retrofit state: fresh wall/roof finishes, LIT LED fixtures, physical rooftop heat-pump units (retrofit-hvac-units.tsx), proposal-emissive accent on solar/renewed surfaces. 1277 tests, lint 0 errors, build green | claude-fable-5 |
| 2026-07-23 | P2-27 | InputProvenance wired: pure deriveInputProvenance (footprint/heights/facade) in src/lib/fidelity/input-provenance.ts; threaded through LedgerWorkspace→WorkspaceShell→PropertiesPanel→FidelityBadge+FidelityDetailPanel (calibrationApplied via sync loadCalibration, no new fetch); 16 new tests, 1387 total, lint 0 errors, build green | claude-fable-5-session |
| 2026-07-23 | P2-24 | CAD-first standalone workflow shipped: 홈 "CAD 도면으로 시작" card mints a `cad-<uuid>` draft; mode derives from the PK prefix; cad-first stage order 업로드 → 정보 입력 → 트윈 → 보고서 (CAD mandatory, no skip); ParamsStage (floors/year/시군구) + transient cad-draft-store; cadDraftTitle synthesizes an honest minimal title (derived areas, explicit `-` elsewhere) through the existing geometry pipeline; zero ledger/HUB/VWorld calls for drafts; UC-11 added. 1343 tests, lint 0 errors, build + ci:check green | claude-fable-5 |
