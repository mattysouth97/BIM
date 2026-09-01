---
type: research
status: reference
created: 2026-08-31
tags: [energy, validation, eco2]
---

# Validation Reference Cases

What the diagnostic engine's numbers have actually been checked against, and
— just as important — what they have **not**. Companion to
[[ENERGY_STANDARD_TRACEABILITY]].

## The honest headline

**No result in this product reproduces an official ECO2 output, and none is
presented as one.** ECO2's internal coefficients (66-station monthly weather
dataset, part-load curves, distribution-loss models, 보정계수) are not
published, and we hold no licensed ECO2 result files for these buildings to
compare against. Every screen therefore labels results 설계 검토용 참고 계산
and names its own engine (`bimfit-degree-day@existing-2026.08`) and standard
versions. If a licensed ECO2 run of one of these cases is ever obtained, add
it here as Case E with the side-by-side numbers and the discrepancy left
visible — do not tune the engine to match it silently.

## Case A — Analytical verification box

**Claim tested:** the physics kernel computes exactly what its equations say.

- Assembly R/U: `src/lib/energy-standards/__tests__/assembly.test.ts` checks
  a single-layer wall against the hand value R = 0.11 + 0.043 + 0.1/0.04 =
  2.653 m²K/W (U = 0.37693) to 6 decimal places, and a 4-layer RC wall
  against the full Σd/λ sum to 9 decimals.
- Ventilation heat loss: `src/lib/energy/__tests__/heat-loss.test.ts`
  derives 0.34 × (ACH50/20) × V × ΔT by hand and asserts the engine matches;
  every element satisfies heatLoss = h × ΔT.
- Primary energy: `material-standards.test.ts` reconstructs the 1차에너지
  total from the per-fuel delivered legs and the published factors
  (2.75/1.1/0.728) and asserts equality.

**Verdict:** exact. These are identities, not calibrations.

## Case B/C — Korean performance tiers (office and residential)

**Claim tested:** whole-building results land in the bands published for
Korean building stock of each era.

`src/lib/energy/__tests__/bim-accuracy.test.ts` runs three full buildings
through the real kernel:

| Tier | Envelope | Accepted band |
|---|---|---|
| Passive-house grade | U 0.15/0.10/0.12, window 0.8 | demand < 60 kWh/m²·yr, grade 1+++/1++ |
| 2000s code minimum | U 0.47/0.29/0.35, window 2.1 | 90–200 kWh/m²·yr |
| 1970s uninsulated | U 2.0/1.5/1.2, window 5.8 | > 300 kWh/m²·yr |

**Verdict:** band-level plausibility only. These bands come from published
benchmark ranges, not from ECO2 runs of these exact geometries.

## Case D — Material comparison (metamorphic)

**Claim tested:** material physics moves results in the direction and
proportion physics demands, with no fabricated numbers in between.

`src/lib/energy-diagnostics/__tests__/material-standards.test.ts`:

- The ledger baseline's assumed layer stack reproduces its stated era-table
  U by the ISO-6946 sum **exactly** (round-trip to 6 decimals); when no
  physical insulation thickness can reach the era U, the model emits **no**
  layers rather than an inconsistent stack.
- Thickness sweep 100→250 mm (every point a real engine run): U strictly
  decreases, annual energy monotonically non-increasing, marginal saving per
  mm strictly diminishing, byte-identical on repetition.
- Parameter ranking: one real engine run per parameter, ranked by achieved
  saving; run count is asserted (no interpolated entries).

**Verdict:** the 활성 변수 guarantee — a material change reaches the engine
and the engine's answer is what is displayed.

## Live product check (2026-08-31)

Performed against the running app (`/diagnostics/new?method=ledger&building=demo`):
insulation swapped EPS→페놀폼 and thickened 48.8→150 mm in the assembly
editor → computed U 0.580→0.127 (matches hand calculation), 별표1 chip
초과→충족, [대안으로 평가] ran the real engine (−5.5 %, −149,000 kWh/yr),
the baseline stayed byte-identical (2,696,085.5 kWh/yr) before and after,
and a full page reload restored the same baseline.

## What remains unvalidated

- Absolute accuracy against measured consumption (the product deliberately
  separates asset-style evaluation from operational data).
- Any ECO2/ECO2-OD official output (see headline).
- Monthly distribution — the engine is annual degree-day; monthly output is
  refused, never fabricated (`unsupported_output` approximation record).
- The 시군구 exception lists for the 별표1 지역구분 footnote are
  training-knowledge reconstructions; a lookup through them reports a
  lower-confidence `regionBasis`.
