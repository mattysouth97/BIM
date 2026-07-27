# Simulation Accuracy Audit & Fix Wave — 2026-07-27

Three parallel formula-level audits (thermal physics, ratings/conversions,
retrofit economics) against reference methods (ISO 13789/13790 degree-day,
건축물 에너지효율등급 기준, DCF conventions). ~30 findings; the fixes below
were applied with tests re-pinned to hand-computed correct values.

## Critical fixes (results were >20% wrong)

| # | Was | Now |
|---|---|---|
| C1 | `HVAC_DEFAULTS` stores heating η as FRACTIONS (0.85) but `annual-demand` divided by 100 → silently clamped to 0.5 → heating consumption +70–76% for every inferred building | `normalizeEfficiency()`: ≤10 → fraction/COP as-is, >10 → percent/100; bounded [0.3, 6] (allows heat-pump COP) |
| C2 | No infiltration/ventilation heat loss at all (~30–50% of H missing; masked by C1 — error cancellation) | New "Ventilation" element: H_ve = 0.34·(ach50/20 + mech·(1−HRV))·V (ISO 13789); HRV credit capped 0.95 |
| R1 | UI graded SITE HVAC-only energy against residential PRIMARY bands for every building | Grade = `calculateEfficiencyRating` on whole-building PRIMARY energy (fuel-split legs, 주용도코드-based res/non-res table) |
| R2 | CO₂ applied grid factor 0.4594 to ALL fuels (gas heat overstated ×2.27) | Per-fuel factors: elec 0.4594, gas 0.202, oil 0.279, DH 0.13 t/MWh; heating rides its fuelType |

## Major fixes

- Cooling model had no solar aperture (0.6×conduction proxy → ~2% of HVAC, implausible): now conduction·CDD + A_win·SHGC·I_cool·0.7 (I_cool = 350 kWh/m²·season).
- Static CDD table was ~3× the base-24 values the live-weather path computes (cooling jumped when KMA data loaded): table rebuilt at base 24 (Seoul 600→220 etc.); HDD base aligned 18.3→18.0 both sides.
- Calibration compared HVAC-only prediction vs whole-building meter (systematic "under-prediction"): predicted stack now `calculateSystemBreakdown` whole-building total in panel/report/metrics-hook.
- `calibrationRatio` guarded the wrong operand (predicted=0 → Infinity); actual=0 now flags Infinity + "calibration unavailable" instead of "closely matches"; "uses X% less" now on the predicted base (could exceed 100%).
- Residential 에너지효율등급 bands 2–6 were non-res values (200/260/320/380/450 → 190/230/270/320/370); non-res grade 4 440→450.
- Renewables never offset primary energy (×0 factor): now net against the electric leg before the 2.75 conversion, capped at electric consumption.
- 주용도코드 mis-keys: system-breakdown ("02"=office→"14", "11"=res→"01"/"02", "13"=retail→"07"); equipment-specs office hours "12000"→"14000".
- Building-type detection inverted (residential density 0.04 < office 0.1, test was `>0.1`): now `<0.07`; benchmark input now primary energy (DB basis) and pre-1990 maps to nearest era (1990s), not 2020+.
- Ground floor: hardcoded ΔT 5 K → indoor−`foundation.groundTemperature`; annualized at its own constant ΔT over the heating season, no longer scaled by outdoor HDD.
- Thermal bridges: `walls[].thermalBridge` now applied as additive ΔU; buildings with `coolingEfficiency: 0` (no cooling) now report 0 cooling instead of COP-1 phantom load.
- Regional winter design temperatures added (Jeju −1.1 vs Seoul −11.3 — was Seoul everywhere).
- Weather processor: KMA sentinel days (−99 etc.) excluded from sums AND completeness; leap-year day count.
- Retrofit economics (see src/lib/retrofit changes): boiler savings formula D·(1/η_old−1/η_new) (was understating ×η_old); window savings priced/escalated as gas not electricity (was ×1.87 overstated) with gas CO₂ factor; interest-subsidy modeled as PV of interest saved on a 5-yr amortizing loan discounted at the base rate (was a permanent 20-yr WACC cut, +29% PV inflation); mutually-exclusive heating-plant measures (boiler vs heat pump) via knapsack exclusion groups; solar yield recalibrated 958→~1,175 kWh/kWp (tilt 1.15, PR 0.80); zero-saving payback ∞ not 0; ground-floor savings ×0.5 ground factor.

## Deliberately deferred (documented, not fixed)

- Internal-gain term in cooling (lighting/occupancy coupling) — screening model notes it.
- Heat-pump two-leg escalation (gas-minus-electric at different rates) — flagged in economic model docs.
- Weather-normalized calibration (HDD-ratio scaling of actual years).
- energy-grade.ts site-based legacy thresholds retained for the 3D heatmap color ramp only.

## Verification anchor (1000 m² 3-floor Seoul office, era 2010-2019)

Before: H=720 W/K (no vent), heating 93.3 kWh/m² (η clamped 0.5), cooling 1.9 kWh/m² — plausible total by error cancellation only.
After: H≈1,100–1,300 W/K (with vent), heating ≈ 95–110 kWh/m² (η 0.85 real), cooling ≈ 12–25 kWh/m² (solar aperture) — inside Korean office band with each term defensible.
