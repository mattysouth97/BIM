# ISO 13790 monthly kernel — brief for a fresh context

Written 2026-09-04 17:25 by bim-72, handing the kernel to a fresh session. Everything below
was verified against source today; file:line cites are on `feat/design-stage-energy-diagnostics`.

## The decision (user, 16:03, via main-coordinator)

> "We are going to use ECO2 engine as the main simulation engine for inferring the numbers
> for the building energy profile."

Resolved to: **implement ECO2's method in-app** — ISO 13790 / DIN V 18599 monthly
quasi-steady-state with Korean 별표 parameters. Two hard constraints came with it:

1. **Label:** output must read **"ECO2 방식 (자체 구현)"** and **never "ECO2 결과"**. An
   implementation of a method is not the certified tool's output. This is the
   stated-vs-assumed invariant applied to provenance of *method*.
2. **Scope:** `/diagnostics/*` and `/models/*` only. `/building/[id]`, retrofit and scenarios
   stay on the degree-day kernel. **No existing energy regression baseline may move** — if one
   does, that is a signal, not a cost. Do not touch `src/lib/energy/heat-loss.ts` or
   `annual-demand.ts`.

## What already exists (do not rebuild)

| Piece | Where | Note |
|---|---|---|
| Climate contract | `src/lib/energy-standards/monthly-climate.ts` | `MonthlyClimate`: 12 temps + 9 orientations × 12 irradiation, validated at construction; `monthlyClimateById` returns **null, never a neighbour**; `isComparableToEco2`; `climateProvenanceNoticeKo` |
| A real climate | `src/lib/energy-standards/climate-seoul-derived.ts` | `SEOUL_DERIVED` — PVGIS ERA5, `kind: "derived"`, **not** ECO2's own; ~1.3 K cold, Dec is an anomalous 2012, irradiation ~17 % high. All recorded in its provenance. Must be registered before use (`registerMonthlyClimate`) — registry ships empty on purpose |
| Ground coupling | `src/lib/energy-standards/ground-coupling.ts` | `slabOnGroundUValue` (ISO 13370). Use its U for the ground floor; **never** `calculateAssembly` for a slab (3.87 vs 0.24, 14× end-to-end). Its U pairs with **annual-mean** external temperature |
| Assemblies | `src/lib/energy-standards/assembly.ts` | `calculateAssembly` — note its Rsi/Rse are Korean 해설서 values (0.11/0.043 wall, 0.086/0.043 roof), not ISO 6946 Table 1. Disclosed, ~1 % |
| Materials | `src/lib/energy-standards/materials.ts` | 26 entries incl. the Clinic's; `air-iso-u25` (upward 0.16) vs `air-iso-h25` (horizontal 0.18) — direction matters |
| The Clinic's inputs | `src/lib/reference-buildings/bs-medical-dental-clinic-energy.ts` | `CLINIC_RECIPE`, `CLINIC_MATERIALS`, `CLINIC_MEASURED_ENVELOPE`, `CLINIC_ASSUMPTIONS` (17). Use `CLINIC_MEASURED_ENVELOPE` areas, not recipe-derived ones |
| Existing engine | `src/lib/energy/annual-demand.ts:2` | "degree-day method (screening-level, ISO 13790 flavor)" — **not** the monthly method. Sanity band only |

## What to build

`src/lib/energy-standards/monthly-balance.ts` + `__tests__/monthly-balance.test.ts`. Pure
functions. No React, no store, no engine wiring.

ISO 13790 §7 (monthly, quasi-steady-state), per month `m`:

```
H_tr  = Σ U_i · A_i                      (+ thermal bridges as an explicit term, may be 0 and SAID so)
H_ve  = ρ_a c_a · V̇                       (0.34 Wh/m³K × ACH_eff × V; ACH50/20 for infiltration)
Q_ht  = (H_tr + H_ve) · (θ_int − θ_e,m) · t_m           [transmission + ventilation loss]
Q_sol = Σ_orient  F_sh · g_gl · (1 − F_F) · A_w,orient · I_m,orient
Q_int = (q_occ + q_light + q_equip) · A_floor · t_m
Q_gn  = Q_int + Q_sol

γ_H   = Q_gn / Q_ht
a_H   = a_0 + τ / τ_0        (a_0 = 1.0, τ_0 = 15 h per ISO 13790 Table 12 for monthly)
τ     = C_m / (H_tr + H_ve) / 3600       [time constant, h]
η_H,gn = (1 − γ^a) / (1 − γ^(a+1))  for γ ≠ 1;  a/(a+1) for γ = 1
Q_H,nd = Q_ht − η_H,gn · Q_gn                          (clamp ≥ 0)

cooling mirror: γ_C = Q_gn / Q_ht ; η_C,ls = (1 − γ^−a) / (1 − γ^−(a+1)) ; Q_C,nd = Q_gn − η_C,ls · Q_ht
```

Ground floor: use the ISO 13370 U with **annual-mean** θ_e as its ΔT basis, not the month's
(ISO 13370 steady-state term). Say so in a comment; do not fold it into H_tr with the monthly
temperature.

Internal heat capacity `C_m`: ISO 13790 Table 12 class values (very light 80 000 … very heavy
370 000 J/m²K × A_floor). It is an **assumption** — expose it as an input with a named default,
never a hidden constant.

Return per month: Q_ht, Q_sol, Q_int, γ, η, Q_H,nd, Q_C,nd — and annual totals — **and the
climate's provenance notice**, so a caller cannot render the number without the sentence that
says what weather produced it.

## No silent defaults — the rule that governs every input

Twelve months × several terms is a lot of places for a plausible wrong number to hide.

- Missing climate → **throw**. Never Seoul, never a neighbour.
- Missing area / U / volume → **throw**, naming the field.
- `C_m` class, g-value, frame fraction, shading, ACH50, internal gains → accepted as inputs; each
  carries a default **only** if that default is returned in an `assumptions[]` list alongside the
  result. A default that is not listed is a defect.
- Result must carry `method: "ISO 13790 monthly (자체 구현)"` and the climate provenance notice.

## Traps verified today — the ones that will bite

- `collectEnergyFacts` (`energy-diagnostics/facts.ts:224`) **drops any property named `facts`**;
  a flat-only fact is deleted on the next `refreshModel`. Don't route through it.
- `resolveClimate` (`energy-diagnostics/adapter.ts:343`) gates on **four** facts, not five. Not
  your path, but don't reuse its shape.
- `ledger-baseline-model.ts:745` does **not** throw on a missing 단열재 layer — it silently
  returns an empty layer array. Worse than a throw. Don't copy the pattern.
- Tier-1 acceptance gate keys on the `tier1-office-screening-` MODEL_VERSION prefix. Use a
  distinct version string.
- **Never** map material names via `searchGenericMaterials` (substring only).
- WWR — **corrected 17:27, the first version of this line was wrong.** `heat-loss.ts` does `windows = gross × wwr; netWall = gross − windows`, so the ratio must be against GROSS wall: 2,454.52 m² (2,150.30 opaque + 267.16 glazing + 37.06 doors) × 0.10884 = 267.16. Feeding net wall as gross with 0.1242 gets the glazing right and silently un-prices 267 m² of real wall. **For the kernel: use 267.16 m² glazing directly; never derive it from wall × wwr.**
- PVGIS `MRcalc` silently ignores `aspect`/`azimuth`. Already worked around; noted so nobody
  re-fetches and trusts it.

## Verification the kernel must pass before it is called done

1. **Utilisation factor bounds:** η ∈ (0, 1]; γ → 0 ⇒ η → 1; γ → ∞ ⇒ η → 0. Test both limits.
2. **Continuity at γ = 1** (the a/(a+1) branch) — no visible step in a sweep.
3. **Monotonicity:** more insulation ⇒ lower Q_H,nd; more glazing on S ⇒ higher Q_sol.
4. **Energy conservation:** Σ_m Q_H,nd ≤ Σ_m Q_ht (gains can only reduce the need).
5. **Sanity band, not equality:** annual Q_H,nd on the Clinic should land within a factor of ~2
   of the degree-day kernel's heating figure. Wider than that is a defect in one of them — find
   out which; do not tune to match.
6. **Run the Clinic** through it with `SEOUL_DERIVED` and `CLINIC_MEASURED_ENVELOPE`. The
   result must carry the 17 named assumptions plus the kernel's own, and the provenance notice
   must say the weather is not ECO2's.
7. `tsc --noEmit` real exit 0, eslint real exit 0, vitest — **unpiped**. A check you piped is
   not a check (`tsc | tail` reports `tail`'s status).

## Not in scope

Wiring into `/models/*` cards (main-coordinator owns the route). Replacing the degree-day
baseline anywhere. Acquiring ECO2's real weather files (open question; the user has not decided).
A per-orientation glazing split for the Clinic (a separate verification, not yet landed).

## Coordination

Shared tree, one author email. Commit path-scoped (`git commit -- <paths>`), check
`git diff --cached --name-only` first, never bare. Claim in `SESSION-LOCKS.md` (tracked) — a
message to one session is not a claim to the fleet. `main-coordinator` (ref `2e51d5`) is the
Clinic session; message it, not the older name.
