---
type: feature
status: implemented
last_verified: 2026-08-31
---

# Material-Aware Energy Diagnostics (ECO2-native 재료 인지 진단)

## Purpose

Make the design-stage energy diagnostic read like the tool an ECO2/ECO2-OD
professional expects: assemblies are layered material stacks with real
thermal physics (λ, thickness, R, U), every result names the 기준/버전 it
was computed under, envelope U-values are checked against the 별표1 legal
ceilings, results climb the 소요량 → 1차에너지 hierarchy with a 참고용 ZEB
position, and material changes drive **actual engine re-runs** — never a
cosmetic control, never a fabricated number.

## What was added (2026-08-31)

### `src/lib/energy-standards/` — pure standards library
- `u-value-limits.ts` — the full 별표1 지역별 부위별 열관류율 table of
  국토교통부고시 제2025-738호 (verified from the official law.go.kr
  attachment), 시군구코드- and address-based 지역구분 resolution with an
  honest `regionBasis` confidence flag.
- `zeb.ts` — the 2025 ZEB 인증 등급표 (제2024-893호, verified from
  zeb.energy.or.kr): grade = better of 에너지자립률 vs residual 1차E.
- `assembly.ts` — ISO 6946 assembly physics: U = 1/(Rsi + Σd/λ + Rse),
  per-layer R shares, and `thicknessForTargetU` (the insulation thickness
  that meets a target U). Throws on non-physical input.
- `materials.ts` — generic Korean material library (단열재 등급 관행값,
  KS-typical structure/finish values). Every entry is hardwired
  `confidence: "generic"` — manufacturer performance is never invented.

Every number cites a row in [[ENERGY_STANDARD_TRACEABILITY]].

### Canonical engine extensions (`src/lib/energy-diagnostics/`)
- **Layer-populated ledger baselines** — `ledger-baseline-model.ts` builds
  each opaque construction's `layers` from the register's 구조코드
  (`STRUCTURE_TO_WALL_KEY`/`WALL_LAYERS`) with the insulation thickness
  **solved** so the ISO-6946 sum reproduces the era-table U exactly; when
  that is physically unreachable, no layers are emitted. All layer facts are
  assumptions under the era-envelope assumption id, with no source refs.
- **Primary energy** — `adapter.ts` `derivePrimaryEnergy` converts each
  run's delivered result to 1차에너지 with the published MOTIE/KEMCO factors
  (전력 2.75 · 가스 1.1 · 지역난방 0.728), embedding the factor set and an
  honesty note in `result.primary`.
- **`standards-assessment.ts`** — presentation-only derivation of the 계산
  기준 block (engine id/version, adapter version, input hash, standards
  list), per-construction 별표1 compliance checks, and the ZEB reference
  position (always 참고용; renewables assumed 0 and said so).
- **`sensitivity.ts`** — 재료 민감도: insulation-thickness sweep
  (100→250 mm) and a 10 %-improvement parameter ranking, every point one
  real engine run; deterministic; reports its own engine-run count.
- Fixed a real findings bug: `dominantEnvelopeFinding` matched only
  tier-one `construction.` fact keys, silently dropping ledger
  `envelope.construction.` facts from its evidence.

### Workspace UI (`src/components/energy-diagnostics/`)
- **`assembly-editor.tsx`** (건물 모델 stage) — layer table per opaque
  construction: thickness inputs, insulation swap from the generic library,
  live ISO-6946 U with Δ vs baseline and a 별표1 pass/fail chip, and
  [대안으로 평가] which runs `runAssemblyScenario` (delta-only scenario on
  that construction's U; baseline never mutated).
- **`standards-panel.tsx`** (결과 stage) — 기준 버전 list, result hierarchy
  ① 냉난방 소요 → ② 전체 소요량 → ③ 1차에너지, 별표1 compliance table with
  evidence-inspector links, ZEB reference row with disclaimer.
- **`sensitivity-panel.tsx`** (결과 stage) — runs the two sensitivity
  analyses on demand and renders bars + the diminishing-return point + the
  별표1-compliance thickness.
- `model-operations.ts` gained `runAssemblyScenario`; assembly scenarios are
  exempt from the improvement-draft staleness banner.

### Product bug fixed
`bindSavedProject` rewrote the URL to `?method=ledger&project=…` after the
first autosave, dropping `building` — and that URL server-redirects to `/`,
so **the ledger diagnostic navigated itself away ~1.5 s after opening**.
The rewrite now preserves the building id.

## Honesty boundaries (unchanged invariants, extended)

- The engine is still the annual degree-day screening kernel. No monthly
  method was added; the StandardsPanel and the adapter's approximation
  ledger both say so. 1차에너지 inherits the ratio-estimated
  lighting/DHW/plug split and carries that caveat in `primary.basis`.
- The ZEB row is a table position, never a certification claim.
- Layer stacks on ledger baselines are named assumptions (구조코드 + 연식),
  never register evidence.
- 시군구 exception lists of the 별표1 지역구분 are training-knowledge
  reconstructions; lookups through them report a lower-confidence basis.

## Relevant tests

- `src/lib/energy-standards/__tests__/` — 35 tests: 별표1 spot values, ZEB
  boundaries/monotonicity, ISO-6946 analytical + metamorphic.
- `src/lib/energy-diagnostics/__tests__/material-standards.test.ts` — layer↔U
  exact round-trip, primary-energy algebra, standards assessment, sweep
  determinism/monotonicity, ranking run-count.
- `e2e/material-diagnostics.spec.ts` — 3 specs: 기준 버전 + 별표1 verdicts,
  live layer edit → real-engine alternative with baseline byte-integrity,
  sensitivity from actual runs.
- Validation cases: `docs/05_Research/validation/reference-cases/README.md`.

## Related Systems

[[Design-Stage Energy Diagnostics]] · [[ENERGY_STANDARD_TRACEABILITY]] ·
[[Twin Energy Model]]
