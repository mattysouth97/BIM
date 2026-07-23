---
id: P2-24
title: CAD-first standalone workflow — begin with a CAD file, no building-ledger dependency
priority: P2
area: ux
status: in-review
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-04, UC-05, UC-06, UC-11]
---

# P2-24 — CAD-first standalone workflow

Today the workflow is strictly ledger-first: search (건물 검색) → upload →
twin → report, and every store (`active-building-store`, `recipe-store`,
`workflow-store.cadSkipped`, scenario state) is keyed by the ledger's
`mgmBldrgstPk`. A user who has a CAD drawing but no ledger building —
design-phase work, unregistered buildings, quick massing studies — cannot
enter at all. This item adds a second entry mode: begin with a CAD file,
enter three minimal parameters, and reach the twin + report with no ledger
call ever fired.

Design decisions (approved 2026-07-23 brainstorm):
- **Fully standalone** — no ledger link step; manual parameters fill the gaps.
- **Home page dual entry** — a "CAD로 시작" card beside the existing search.
- **Minimal inputs + era defaults** — floors, approximate completion year,
  region (시군구, for climate); everything else defaults from the era-based
  recipe and stays editable in the twin stage.
- **Architecture: synthetic PK** — `cad-<uuid>` flows through the existing
  `/building/[id]` workspace; mode is *derived from the PK prefix* so
  identity and mode cannot drift apart.

## 1. Requirement (RE)
- A user with only a CAD file (DXF/DWG/PDF) must be able to go from the home
  page to a rendered twin and a retrofit report without any building-ledger
  lookup, entering at most: floor count, approximate completion year, region.
- The existing ledger-first flow must be byte-for-byte unaffected (mode
  defaults to `ledger`; all current guards/stages unchanged in that mode).
- New use case **UC-11 — Start from CAD file (standalone twin)** is added to
  `docs/work-plan/knowledge/use-cases.md` in the same PR (R1.2).

## 2. Specification (SDD)

Spec bullets:
- Home page (`src/app/page.tsx`) gains a "CAD로 시작 / Start from CAD" card.
  Clicking generates `cad-<uuid>`, sets it as the active building, and
  navigates to `/building/cad-<uuid>`.
- `workflow-store` gains `mode: 'ledger' | 'cad-first'`, derived from the
  active PK prefix (`cad-`). Stage list per mode:
  - `ledger` (unchanged): search → upload → twin → report
  - `cad-first`: upload → **params (정보 입력)** → twin → report
- cad-first guards: `upload` requires a committed footprint (the "CAD 없이
  계속" skip button from P2-17 is **not rendered** in this mode); `params`
  requires floors ≥ 1, a completion year, and a selected 시군구.
- New `src/components/params/params-stage.tsx`: minimal form (floors, year,
  region cascade reusing `region-codes.json`). On submit: store the params in
  the transient `cad-draft-store`, store `sigunguCd` in
  `active-building-store` for climate lookups.
  *(Spec refinement at CONTEXT: "floors as a recipe override" was wrong-shaped
  — `BuildingRecipe.floors` is a `FloorSpec[]`, not a count. The count flows
  as `grndFlrCnt` through a synthetic minimal title (`cadDraftTitle`) into the
  existing `generateBuildingGeometry` → `toRecipe` → `setBaseRecipe` pipeline,
  which calls the era-based `getRecipe()` internally. Observable behavior —
  era defaults + N floors — is exactly as specified.)*
- `building-workspace.tsx` detects the `cad-` prefix → skips
  `useCompositeBuilding` and `useBuildingFootprint` entirely (zero API
  calls). Ledger-derived display fields fall back: floor area = CAD footprint
  polygon area × floors; era = entered year; all other ledger-only fields
  render `-` (AFF-6).
- Drafts are session-transient (matching `active-building-store`): a hard
  refresh on `/building/cad-<uuid>` with empty stores recovers to the upload
  stage of that draft via the existing `WorkflowStageRecovery` (P2-16)
  guard-retreat, never crashes. Documented v1 limitation.

BDD scenarios:

1. **CAD entry from home** — Given the home page, When the user clicks
   "CAD로 시작", Then the app navigates to `/building/cad-<uuid>`, the
   workspace opens in `cad-first` mode at the upload stage, and no
   `bldrgst`/VWorld request is issued.
2. **Mode-specific stages and guards** — Given a `cad-first` workspace at the
   upload stage, Then the stepper shows 도면 업로드 → 정보 입력 → 디지털 트윈
   → 보고서 and no "CAD 없이 계속" button exists; When a footprint is
   committed, Then the workflow advances to 정보 입력, and 디지털 트윈 stays
   locked until floors ≥ 1, year, and region are provided.
3. **Params produce a twin** — Given a committed CAD footprint and submitted
   params (floors=6, year=1995, region selected), Then the recipe resolves to
   the 1995-era defaults with a floors=6 override, `sigunguCd` is set, and
   the twin stage extrudes the CAD polygon.
4. **Report without ledger** — Given a cad-first building at the report
   stage, Then gross floor area derives from polygon area × floors, climate
   data resolves from the selected region, and every ledger-only field
   renders `-` — never a fabricated value (AFF-6).
5. **No regression + recovery** — Given a ledger-mode building, Then stage
   list, guards, and skip behavior are unchanged (existing tests green);
   Given a hard refresh on `/building/cad-<uuid>` with empty stores, Then the
   workspace recovers to the upload stage without a crash or ledger fetch.

Context pack (read in order):
1. `src/lib/workflow/stages.ts` — stage ids, guards, `StageGuardContext`
2. `src/store/workflow-store.ts` — stage state, `cadSkipped` precedent (P2-17)
3. `src/app/building/[id]/building-workspace.tsx` — fetch orchestration
4. `src/components/upload/upload-stage.tsx` — commit/skip flows
5. `src/store/recipe-store.ts` — `setOverride`, `getEffectiveRecipe`
6. `src/store/active-building-store.ts` — pk + sigunguCd
7. `src/lib/procedural/recipe.ts` — `getRecipe(year)` era factory
8. `src/app/page.tsx` — home entry composition
9. `src/lib/cad/README.md`, `docs/work-plan/items/P2-17-cad-optional-skip-upload.md`

## 3. Constraints (CDD)
- **May touch**: `src/app/page.tsx`, `src/lib/workflow/stages.ts`,
  `src/store/workflow-store.ts`, `src/store/active-building-store.ts`,
  `src/components/workspace/*` (stepper, shell, recovery, status bar
  fallbacks), `src/components/upload/upload-stage.tsx` (skip-button gating
  only), new `src/components/params/**`, report data-sourcing selectors,
  `docs/work-plan/knowledge/use-cases.md`, `domain-glossary.md`.
- **Must not**: alter ledger-mode stage list, guards, or skip behavior;
  persist synthetic drafts or the mode (derive, don't store, the mode);
  fabricate ledger values in the report (AFF-6); fire any
  `bldrgst`/VWorld request for a `cad-` PK; put `'use client'` in
  `src/lib/**` (AFF-1); change existing store action signatures.
- **Fitness**: a `cad-` PK produces zero network calls to ledger/VWorld
  endpoints; mode derivation is a pure function of the PK string,
  unit-testable without React.

## 4. Evaluation (EDD)
- **Tests to write first** (TDD red):
  - stage-list + guard unit tests for `cad-first` mode (upload requires
    footprint, no skip; params guard validates floors/year/region)
  - mode-derivation pure function (`cad-` prefix → `cad-first`, else `ledger`)
  - params submit → recipe override + `sigunguCd` assertions
  - report area fallback: polygon area × floors; ledger-only fields `-`
  - regression: ledger-mode stage list/guards unchanged
- **Gates**: targeted vitest for touched modules; `pnpm test` (baseline 1277);
  `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [x] Home page shows the CAD entry card; click lands in a `cad-first`
        workspace with zero ledger/VWorld requests (CadWorkspace never mounts
        the fetch hooks; useActualEnergy disabled for `cad-` PKs)
  - [x] cad-first stepper: upload → 정보 입력 → twin → report; no skip button;
        params guard enforces floors/year/region
  - [x] Params submit yields an era-correct recipe + floor count +
        `sigunguCd`; twin extrudes the CAD footprint (via cadDraftTitle →
        existing geometry pipeline)
  - [x] Report renders area from polygon × floors, climate from region,
        `-` for ledger-only fields (AFF-6 honesty checklist)
  - [x] UC-11 added to use-cases.md (+ glossary entry); ledger flow fully
        regression-green (1343/1343 tests)

- **Evaluation notes (G4, 2026-07-23)**:
  - Gates: `pnpm vitest run` 1343/1343 (baseline 1277 + 66 new) ·
    `pnpm lint` 0 errors (11 pre-existing warnings) · `pnpm build` green
    (typecheck exposed and fixed two exhaustive `Record<WorkflowStage,…>`
    tables: STAGE_HINTS, TOOLBAR_CONFIGS) · `pnpm ci:check` all guards passed.
  - Security checklist: params form validates via `isCadDraftParamsValid`
    before any store write; no new routes; no secrets/env in errors; no
    filesystem access. ✔
  - Honesty checklist: cadDraftTitle emits only user facts, CAD-derived
    areas, or explicit `0`/`""` unavailable markers (unit-tested);
    cad-first upload lock reason drops the nonexistent skip option;
    useActualEnergy no longer issues HUB requests for synthetic PKs. ✔

- **Production smoke test (2026-07-23, bim-self.vercel.app)**:
  - Caught + fixed live: the P2-14 server wrapper 404'd `cad-` routes
    (`parseBuildingId`-only validation) — `isRoutableBuildingId` fix shipped
    as a TDD'd hotfix; drafts now get a "CAD 트윈 드래프트" metadata title.
  - Verified end-to-end: home card → DXF upload (sample-footprint.dxf, 239.4 m²)
    → 정보 입력 (6F / 1995 / 서울 강남구) → twin renders 6-story procedural
    building → report shows GFA 1,436.4 m² (= 239.4 × 6), era 1995, empty
    address/use, full NPV/IRR portfolio. Network log: zero bldrgst/VWorld/HUB
    requests for the draft session.
  - **Follow-up (minor, AFF-6 wording)**: the report's "Twin Fidelity
    Summary" hardcodes Level-1 provenance as "Korean Building Ledger
    (건축물대장)" — for cad drafts the true source is CAD + manual params.
    Template lives in the report engine; fix in a small follow-up item.
  - Pre-existing, unrelated: `/api/weather` (KMA ASOS) returns 502 without an
    upstream key — static HDD/CDD fallback applies (affects ledger mode too).
- **Done when**: a user starting from only a CAD file reaches an honest twin
  + report through upload → 정보 입력, while the ledger-first flow is
  provably untouched.
