# Phase 1: Honest Physics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 1-honest-physics
**Areas discussed:** Lighting energy source, Rest of the fuel split, PV generation input, Two-path convergence, Geo-location, Scope reach (resumed session)

**Session note:** areas 1–5 were discussed on 2026-09-15 and recorded in
`01-DISCUSS-CHECKPOINT.json`; the session ended before CONTEXT.md was written. A later
session on the same date resumed from that checkpoint, verified its claims against the
code, raised one further scope question, and wrote CONTEXT.md.

---

## Lighting energy source

| Option | Description | Selected |
|--------|-------------|----------|
| LPD × area × hours | Compute the lighting load from power density, area and operating hours | ✓ |
| Use-code ratio share | Keep a ratio, but index it by use code | |
| LPD primary, ratio fallback | LPD where known, ratio otherwise | |

**User's choice:** LPD × area × hours

| Option | Description | Selected |
|--------|-------------|----------|
| Use-indexed hours table | Replace the hard-coded 2,500 h/yr with a table keyed by use code | ✓ |
| Parse existing hour facts | Derive hours from the schedule facts already in the models | |
| One cited named constant | Keep a single constant, but cite and name it | |

**User's choice:** Use-indexed hours table
**Notes:** The resumed session found that `USE_CODE_OPERATING_HOURS` already exists in
`src/lib/energy/equipment-specs.ts` — so this is wiring an existing table, not authoring one.

| Option | Description | Selected |
|--------|-------------|----------|
| Primary intensity only | Lighting reaches primary energy | |
| Primary and site both | Lighting reaches both intensities | ✓ |
| Primary + separate total line | Primary moves, site reported separately | |

**User's choice:** Primary and site both

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with disclosure | An inferred LPD may move a grade if the inference is visible | ✓ |
| Only declared LPD | Only a user-declared LPD may move a grade | |
| Yes in app, no in datasets | Different rules for the app and published data | |

**User's choice:** Yes, with disclosure

---

## Rest of the fuel split

| Option | Description | Selected |
|--------|-------------|----------|
| Four named end uses | hvac, lighting, dhw, plug — each carrying provenance | ✓ |
| Lighting out, one residual | Pull lighting out, leave the rest as one residual | |
| Lighting + DHW modeled | Model two end uses, leave the rest | |

**User's choice:** Four named end uses, each carrying provenance

| Option | Description | Selected |
|--------|-------------|----------|
| Route by declared fuelType | Both legs route by declared fuel | ✓ |
| Heating by fuelType only | Only the heating leg routes by fuel | |
| Keep both as today | Heating→gas, cooling→electric stays fixed | |

**User's choice:** Route by declared fuelType (both legs)
**Notes:** districtHeating 0.728 / districtCooling 0.937 come alive as a consequence.

| Option | Description | Selected |
|--------|-------------|----------|
| Split routes named end uses | The function maps end uses to fuels and does no ratio arithmetic | ✓ |
| Ratios on HVAC-only subtotal | Keep ratios but apply them to a narrower base | |
| Branded total types | Use the type system to distinguish the totals | |

**User's choice:** `deliveredFromDemand` takes named end uses and only maps them to fuels; no ratio arithmetic survives inside
**Notes:** Stated as a structural guarantee, not a care-in-review guarantee.

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite in place, keep IDs | Same limitation IDs, corrected text | ✓ |
| Retire with supersededBy | New IDs, old ones marked superseded | |
| Delete once false | Remove the limitations entirely | |

**User's choice:** Rewrite in place, keep the IDs
**Notes:** Published records reference them via `limitationIds`.

---

## PV generation input

| Option | Description | Selected |
|--------|-------------|----------|
| Declared capacity, roof-sized | Split reads declared capacity; retrofit path writes measured kWp | ✓ |
| Measured layout first | The drawn module layout is the primary input | |
| Declared capacity only | Ignore measured geometry | |

**User's choice:** Declared capacity, roof-sized — split reads `materials.renewable.solarPV.capacity`; retrofit path writes measured `pvGeometricKWp` via `applyPhaseToMaterials`

| Option | Description | Selected |
|--------|-------------|----------|
| Extract the existing one | Lift `solar-potential.ts`'s formula into `src/lib/energy` | ✓ |
| Reuse in place | Import across the layer boundary | |
| Read declared tilt/orientation | A richer model using declared array geometry | |

**User's choice:** Claude's discretion — extract the existing formula (one validated arithmetic, fixes layering)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep cap, report surplus | Cap renewable at the electric leg, report the clipped kWh | ✓ |
| Keep cap silently | Cap and discard | |
| Allow net negative | Let generation exceed the leg | |

**User's choice:** Keep the `Math.min` cap, report the clipped kWh explicitly

| Option | Description | Selected |
|--------|-------------|----------|
| Zero stated as assumption | "no on-site generation assumed", named and visible | ✓ |
| Emit no renewable figure | Treat zero as an absence | |
| Zero is unremarkable | Show zero without comment | |

**User's choice:** Zero stated as a named, visible assumption

---

## Two-path convergence

| Option | Description | Selected |
|--------|-------------|----------|
| Shared generation core | Both paths become thin adapters over one pure core | ✓ |
| Diagnostics payload canonical | The diagnostics payload wins | |
| Two paths + contract test | Keep both implementations, test them against each other | |

**User's choice:** Shared pure generation core; `use-retrofit-scenario` and `retrofit-bridge` both become thin adapters

| Option | Description | Selected |
|--------|-------------|----------|
| Planes where measured, else named | Measured roof planes where they exist, a named assumption otherwise | ✓ |
| Only where planes exist | No PV figure without measured planes | |
| Ratio estimate is enough | A ratio estimate everywhere | |

**User's choice:** `pv-layout` roof planes where measured, named ratio-estimate assumption otherwise

| Option | Description | Selected |
|--------|-------------|----------|
| Identical, test-enforced | Same IDs, kWh, grade delta and financials; build fails on divergence | ✓ |
| Identical core, inputs declared | Same core, differing inputs disclosed | |
| Same measures, money tolerance | Allow a financial tolerance band | |

**User's choice:** Identical measure ids, kWh, grade delta and financials; contract test fails the build on divergence

| Option | Description | Selected |
|--------|-------------|----------|
| Edits are a declared input | Price with unsaved edits, and say so | ✓ |
| Freeze before pricing | Require a save first | |
| Both live, both labelled | Show saved and unsaved side by side | |

**User's choice:** Edits are a declared input; the panel states N unsaved edits are included

---

## Geo-location

| Option | Description | Selected |
|--------|-------------|----------|
| 시도 code canonical | The numeric code wins, names derive from it | |
| Keep names via SIDO_TOKENS | The English names stay canonical | |
| ClimateRegion value object | One resolved object carries both plus the climate values | ✓ |

**User's choice:** Claude's discretion (user: "decide as energy expert") — a resolved `ClimateRegion` value object produced once from 시군구코드, carrying 시도 code, HDD/CDD, design temps and PSH together. `SIDO_TOKENS` English names become display labels only.

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse like ledger-climate | Emit no PV figure for an unresolvable region | ✓ |
| National mean, named | A named national-average PSH | |
| Seoul, named | Seoul's PSH, but disclosed | |

**User's choice:** Claude's discretion — refuse, emit no PV figure, matching `ledger-climate.ts`
**Notes:** A national mean would let the no-caller-passes-region bug hide behind a plausible number.

| Option | Description | Selected |
|--------|-------------|----------|
| Regionalize solar, leave setpoints | Weather fields regionalized, setpoints national | ✓ |
| Regionalize all four | Setpoints regionalized too | |
| Out of scope, name and defer | Name them as assumptions, defer the work | |

**User's choice:** Claude's discretion — regionalize `coolingSeasonSolar` and `summerDesignTemp`; keep `indoorTemp`/`indoorCoolTemp` national as named setpoint assumptions
**Notes:** Flagged at the time as a deliberate two-field reach past PHYS-01..05. Confirmed by the user in the resumed session — see Scope reach below.

| Option | Description | Selected |
|--------|-------------|----------|
| Once at payload boundary | Resolve once, pass the object inward | ✓ |
| Inside the shared core | The core resolves it | |
| At each call site | Each caller resolves independently | |

**User's choice:** Claude's discretion — once at the payload boundary; the shared core takes the resolved object, never a raw code. Also: name (do not silence) the existing `getClimateData` Seoul degree-day fallback.

---

## Scope reach (resumed session, 2026-09-15)

Raised because regionalizing `summerDesignTemp` and `coolingSeasonSolar` changes cooling
demand for every building, which moves the electric leg and therefore every grade —
including the seven published datasets.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both in Phase 1 | Regionalize both fields alongside the split fix, so PHYS-05 regenerates the datasets once | ✓ |
| Region wiring only, defer the two fields | Fix region resolution (required by PHYS-02 regardless), leave the two fields national | |
| Defer all geo work past the wiring minimum | Only what PHYS-02 strictly forces; defer climate regionalization to its own phase | |

**User's choice:** Keep both in Phase 1
**Notes:** Recorded as D-20. Setpoints stay national.

---

## Claude's Discretion

Delegated explicitly by the user ("decide as energy expert"), decided and recorded in
CONTEXT.md as D-10, D-17, D-18, D-19:

- The kWp→kWh model: extract the existing `solar-potential.ts` formula into `src/lib/energy`
- The canonical geo keyspace: a resolved `ClimateRegion` value object
- Unresolvable-region behaviour: refuse and emit no PV figure
- Where region resolution happens: once at the payload boundary

Still open to the planner: the extracted function's location and name; the internal shape of
`ClimateRegion`; how end-use provenance is represented on the split's input type; whether the
four end uses are a discriminated union or a record.

---

## Verification performed during the resumed session

Claims from the checkpoint were checked against the code rather than inherited:

- `getClimateData` regionalizes `hdd`/`cdd`/`winterDesignTemp` only — confirmed at `src/lib/energy/climate-data.ts:74-107`
- No `useRetrofitScenario` call site passes `region` — confirmed across all seven call sites
- `apply-phase.ts:207` independently hardcodes `context?.region ?? "seoul"` — confirmed
- `energy-instrument-hud.tsx:65` receives a 시도 prefix but never forwards it to the PV keyspace — confirmed

New finding folded into CONTEXT.md as D-21: because no caller passes a region today, the
refusal decision (D-18) cannot ship without the region wiring, or every building loses its
PV figure.

---

## Deferred Ideas

- Regionalizing `indoorTemp` and `indoorCoolTemp` — setpoints, not weather; a comfort-modelling decision
- The twin's energy path becoming the canonical traceable engine — remains open after this phase
- Deleting `capex-input.tsx` and `DEFAULT_CAPEX_BUDGET_KRW` — Phase 2 scope (PANEL-05)
- Calibration error bands (CAL-01..03) and peer-group benchmarking (BENCH-01..04) — next milestone

## Todos reviewed, not folded

- `2026-03-28-production-hardening-for-v2-0-release.md` — match score 0.2, unrelated
- `2026-03-28-rigorous-qa-testing-and-verification-for-bim-accuracy.md` — match score 0.2, unrelated
