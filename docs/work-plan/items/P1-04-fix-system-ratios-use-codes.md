---
id: P1-04
title: Correct SYSTEM_RATIOS use-code keys against the real MOLIT 용도코드 table
priority: P1
area: energy
status: done
owner: claude-fable-5-ultrawork
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-03, UC-06]
---

# P1-04 — Correct SYSTEM_RATIOS use-code keys against the real MOLIT 용도코드 table

## 1. Requirement (RE)

- **Problem**: The end-use split table keys the wrong MOLIT 주용도코드 prefixes, and the codebase contradicts itself. Verified in code:
  1. `SYSTEM_RATIOS` (`src/lib/energy/system-breakdown.ts:30-37`) maps `"02"` → office profile (hvac 0.55, comment 업무시설 at :34), `"11"` → residential 공동주택 (:35), `"13"` → retail 판매시설 (:36).
  2. But per the MOLIT 건축물대장 주용도코드 table (건축법 시행령 별표1): `02` = 공동주택 (multi-family residential), `07` = 판매시설 (retail), `11` = 노유자시설, `13` = 운동시설, `14` = 업무시설 (office). The SAME codebase says so: `USE_CODE_OPERATING_HOURS` labels `"02000"` as 공동주택 multi-family residential (`src/lib/energy/equipment-specs.ts:122`) and `"07000"` as 판매시설 retail (:126), and the DHW sizing logic treats prefixes `"01"`/`"02"` as residential (:310-311: `dhwFactor = 8 // residential` vs 5 commercial).
  3. The test suite CODIFIES the error: `system-breakdown.test.ts:216-226` asserts `mainPurpsCd "02000"` ⇒ office ratios with `hvac/total ≈ 0.55` (comment "Office: mainPurpsCd 02000" at :218), and :228-247 contrasts `"11000"` as residential against `"02000"` as office.
  4. Prefix lookup is `recipe.mainPurpsCd.slice(0, 2)` (system-breakdown.ts:99-100) with `DEFAULT_RATIOS` fallback (:41, :100), so every apartment building (`02xxx` — the dominant Korean residential stock) silently receives OFFICE end-use splits: HVAC overstated (0.55 vs 0.50), DHW understated (0.10 vs 0.25), lighting overstated (0.25 vs 0.07).
- **Spot-check corrections / additional findings**:
  - Brief cited the codifying test at :216-219 — the full test spans :216-226; companion test at :228-247 also needs rework (uses `"11000"` as residential).
  - ADDITIONAL defect found during spot-check: `equipment-specs.ts:129` maps `"12000"` → 업무시설 office (4380 h), but per MOLIT `12` = 수련시설 and `14` = 업무시설. The office operating-hours entry is keyed to the wrong code there too; include its correction in scope (behavioral note below).
- **Impact**: Every apartment building queried through `calculateSystemBreakdown` (consumed by `src/hooks/use-energy-breakdown.ts` and `src/lib/report/report-engine.ts`) gets office-style end-use attribution — DHW share understated ~2.5×, lighting overstated ~3.5× — corrupting the per-system panels, per-floor heatmap intensities derived from `total`, and any report that attributes savings potential by system. Genuinely office buildings (`14xxx`) and retail (`07xxx`) fall through to the generic `DEFAULT_RATIOS`, losing their specific profiles.
- **Use case**: As a user viewing an apartment building's energy breakdown, I want the end-use split to follow the residential profile for 공동주택 codes, so that the HVAC/lighting/DHW attribution matches the building's actual use type.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/lib/energy/system-breakdown.ts:21-41` — `SYSTEM_RATIOS` + `DEFAULT_RATIOS`; :89-135 for how ratios are consumed (HVAC anchored to degree-day engine; other systems scaled so `total = hvac / ratios.hvac`, :102-110).
  2. `src/lib/energy/equipment-specs.ts:115-134` — `USE_CODE_OPERATING_HOURS` (the module's own use-code labels); :307-313 DHW residential heuristic.
  3. `src/lib/energy/__tests__/system-breakdown.test.ts` — full file; `makeRecipe(floors, mainPurpsCd)` helper; the three ratio tests at :216-247 plus the DEFAULT fallback test at :249+.
  4. Consumers (read-only, to gauge blast radius): `src/hooks/use-energy-breakdown.ts`, `src/lib/report/report-engine.ts`.
- **Design (decided)**:
  1. Re-key `SYSTEM_RATIOS` WITHOUT changing the ratio values themselves (values are CONTEXT.md D6-sourced per-use profiles; only the code↔use binding is wrong):
     - `"01"` → residential profile (0.50/0.07/0.25/0.18) — 단독주택; aligns with the DHW heuristic at equipment-specs.ts:310-311 which already treats `01` as residential.
     - `"02"` → residential profile — 공동주택 (replaces the office binding).
     - `"07"` → retail profile (0.45/0.40/0.03/0.12) — 판매시설.
     - `"14"` → office profile (0.55/0.25/0.10/0.10) — 업무시설.
     - REMOVE `"11"` and `"13"` keys — 노유자시설/운동시설 have no researched profiles; they fall back to `DEFAULT_RATIOS`. Comment this explicitly: fallback is honest, a wrong binding is not.
     - Update each row's comment to carry the MOLIT label (e.g. `// 공동주택 multi-family residential (MOLIT 02)`).
  2. Fix `equipment-specs.ts:129`: change the office operating-hours key `"12000"` → `"14000"` (comment stays 업무시설/office 4380 h). Behavioral note: `12xxx` 수련시설 buildings now fall back to the 2500 h default at :133 — acceptable and correct-by-ignorance; record it in the commit/PR description.
  3. Export for testability: export `SYSTEM_RATIOS` from system-breakdown.ts (or a `getSystemRatios(prefix)` accessor) and `USE_CODE_OPERATING_HOURS` from equipment-specs.ts so the consistency test can iterate them. Additive exports only — no signature changes.
  4. Do NOT change `DEFAULT_RATIOS`, the HVAC anchoring (D2 contract, :102-105), or per-floor distribution (D3, :112-120).
- **BDD scenarios**:
  1. *Apartment gets residential split* — Given `mainPurpsCd "02000"`, When `calculateSystemBreakdown` runs, Then `hvac/total ≈ 0.50` and `dhw/total ≈ 0.25` (residential profile), NOT 0.55/0.10.
  2. *Office gets office split* — Given `mainPurpsCd "14000"`, Then `hvac/total ≈ 0.55`; given `"07000"` (retail), Then `lighting/total ≈ 0.40`.
  3. *De-researched codes fall back* — Given `"11000"` or `"13000"`, Then the split equals `DEFAULT_RATIOS` proportions (hvac 0.42 etc.) and the breakdown remains valid/positive.
  4. *Cross-module consistency* — For every 2-char prefix present in BOTH `SYSTEM_RATIOS` and (via 5-digit codes) `USE_CODE_OPERATING_HOURS`, the MOLIT use category asserted by a canonical table in the test file agrees with both modules' rows; specifically `"01"/"02"` ⇒ residential, `"07"` ⇒ retail, `"14"` ⇒ office.
  5. *DHW heuristic alignment* — equipment-specs DHW residential prefixes (`01`,`02` at :310-311) are exactly the prefixes whose SYSTEM_RATIOS row is the residential profile (asserted programmatically via exported tables).

## 3. Constraints (CDD)

- **Design constraints**:
  - Ratio VALUES are frozen (CONTEXT.md D6/D7 provenance) — this item fixes KEY bindings only. If the implementer believes a value is also wrong, that is a separate research item; do not change values here.
  - Canonical MOLIT mapping for the consistency test lives IN the test file as a literal table with a comment citing 건축법 시행령 별표1 / 건축물대장 주용도코드 — do not create a third production-side copy of the table (two modules + test oracle is already the consistency triangle; a third production table would just be another thing to drift).
  - Additive exports only; no changes to `calculateSystemBreakdown`'s signature or the `SystemBreakdown` interface.
  - No `'use client'` additions in `src/lib/**`.
- **May touch**: `src/lib/energy/system-breakdown.ts`, `src/lib/energy/equipment-specs.ts` (the `"12000"`→`"14000"` key fix + export), `src/lib/energy/__tests__/system-breakdown.test.ts`, optionally a new `src/lib/energy/__tests__/use-code-consistency.test.ts`.
- **Must not**: do not change any ratio number, `DEFAULT_RATIOS`, HDD/CDD logic, `calculateAnnualDemand`/`calculateHeatLoss`, consumers (`use-energy-breakdown.ts`, `report-engine.ts`, UI), or snapshot files unrelated to these tests; do not touch retrofit modules (P1-01/02/03 scope).
- **Fitness functions**:
  - `SYSTEM_RATIOS` contains exactly keys `{"01","02","07","14"}`; each row still sums to 1.0 (existing invariant — keep/assert).
  - For every key k in `SYSTEM_RATIOS`: k matches the MOLIT use label in the row comment (grep-able, but enforced by the consistency test).
  - `hvac/total` for `"02000"` ∈ [0.49, 0.51]; for `"14000"` ∈ [0.54, 0.56] (test-level).
  - No remaining reference in `src/` treats `"02"` as office or `"11"`/`"13"` as residential/retail (grep `"11"|"13"` within system-breakdown.ts returns only comments explaining removal).
- **Security / honesty checklist**:
  - The MOLIT table cited in test comments is the real one (건축법 시행령 별표1); do not invent codes — if a code's category is uncertain, leave it to `DEFAULT_RATIOS` and say so in a comment.
  - Removing the `"11"`/`"13"` bindings is a deliberate honesty move (no researched profile ⇒ generic fallback); the removal MUST be commented, not silent.
  - Note in the PR/commit that `12xxx` buildings move from 4380 h (mislabeled office) to the 2500 h default — a behavior change for a currently-mislabeled code, not a regression.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - REWRITE `system-breakdown.test.ts:216-226` → `"02000"` selects residential ratios (`hvac/total ≈ 0.50`, `dhw/total ≈ 0.25`).
  - REWRITE `:228-247` → contrast `"14000"` (office, 0.55) vs `"02000"` (residential, 0.50); keep the DHW-dominance assertion direction (residential DHW > office DHW still holds: 0.25 vs 0.10).
  - KEEP `:249+` DEFAULT fallback test; ADD fallback cases for `"11000"`/`"13000"`.
  - NEW `use-code-consistency.test.ts`: scenarios 4–5 — iterate exported `SYSTEM_RATIOS` × `USE_CODE_OPERATING_HOURS` against a canonical MOLIT prefix table `{ "01": "residential", "02": "residential", "07": "retail", "14": "office", ... }`; assert equipment-specs office hours now live under `"14000"` and no module binds `"12"` to office.
- **Gates**: `pnpm test -- src/lib/energy` green; full `pnpm test` green; `pnpm lint` clean; `pnpm build` green.
- **Acceptance criteria**:
  - [x] `SYSTEM_RATIOS` re-keyed to `01/02/07/14` with MOLIT labels in comments; `"11"`/`"13"` removed with explanatory comment.
  - [x] `equipment-specs.ts` office operating-hours key corrected to `"14000"`.
  - [x] Both modules export their tables (or accessors) for tests.
  - [x] Codifying tests rewritten; new cross-module consistency test asserts agreement on every shared prefix incl. the DHW heuristic alignment.
  - [x] All gates green; consumers untouched and unaffected in shape (only split values change).
- **Done when**: `mainPurpsCd "02000"` yields the residential end-use split, office/retail profiles bind to `14`/`07`, and a single consistency test fails the build if the two modules ever disagree on a use-code prefix again.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- Re-keyed exactly as designed: `01`/`02` → residential profile, `07` → retail, `14` →
  office; `11`/`13` removed with an explanatory honesty comment; ratio values untouched.
  Office operating hours moved `"12000"` → `"14000"` (12xxx 수련시설 now falls back to the
  2500 h default — behavior change for a previously-mislabeled code, noted in commit).
- Both tables exported (additive); new `use-code-consistency.test.ts` (5 assertions) is the
  cross-module oracle incl. the DHW heuristic alignment; codifying tests rewritten (red-first:
  9 failures pre-fix).
- Gates: targeted `vitest run system-breakdown use-code-consistency equipment` 41/41 ·
  `pnpm test` green (exit 0) · `pnpm lint` 0 errors · `pnpm build` green.
