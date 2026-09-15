---
type: adr
status: implemented
last_verified: 2026-09-15
---

# ADR-006 — Delivered energy is named end uses

## Status

Implemented for the user-authorized Honest Physics phase. Local calculation and published-evidence tests pass; deployment is recorded separately.

## Context

The prior grade split added flat shares of HVAC to electricity and gas and supplied no renewable generation. Lighting power density and installed PV capacity therefore could not affect the grade. A parallel whole-building site calculation made the displayed intensities difficult to reconcile.

## Decision

`buildEndUseLoads` constructs named HVAC, lighting, domestic hot water and plug loads with declared fuels. `deliveredFromDemand` routes these loads without adding a second share of total demand. Lighting is power density times conditioned area times annual operating hours divided by 1000. Domestic hot water and plug loads retain explicit ratio estimates.

PV generation uses declared capacity and regional assumed yield. Primary conversion caps its annual electricity offset at annual electric demand and reports clipped surplus. Gross whole-building site load remains before PV. Unknown capacity, partial capacity and unresolved location have distinct provenance states.

One resolved comparison region carries its climate basis. Historical city summer design temperatures and Seoul fallbacks remain distinguishable; seasonal solar scaling and indoor setpoints are assumptions.

## Consequences

All seven original model grades changed in the captured before/after run. Schema 2.0.0 and the public reference-building changelog expose this semantic change. The evidence test parses the changelog table and reproduces its after figures. Existing limitation identifiers remain stable while their explanations change.

This extends ADR-002's provenance principle with end-use assumption/refusal metadata; it does not make every legacy material parameter a canonical `EnergyFact`. It implements ADR-005's versioned, server-derived baseline export without duplicating computed datasets in git. Tests establish calculation consistency, not accuracy against Korean building stock or measured consumption.

## Alternatives

- An optional additive lighting field falling back to the old ratio: rejected because the old double-counting path would remain reachable.
- Subtract PV from gross load: rejected because load demand and purchased/net primary energy describe different quantities.
- Retire limitation identifiers: rejected because existing downloads cite those identifiers.

## Related

[[ADR-002 - Provenance as a Construction-Time Invariant]] · [[ADR-005 - Publish Reproducible Reference Energy Datasets]] · [[Twin Energy Model]] · [[Building Energy Datasets]]
