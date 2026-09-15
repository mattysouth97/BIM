---
phase: 04-corpus-generation
plan: "01"
status: partial
requirements-completed: [SWEEP-02, SWEEP-03, SWEEP-04, SWEEP-05, SWEEP-07]
completed: 2026-09-15
---

# Phase4 — Bounded pilot corpus, measured limits

The normal production browser/proxy made three real first-page register requests,
25 rows each, at 11680/10300, 26110/10100 and 27110/10100. All returned HTTP200
from `icn1::icn1`, in 230, 147 and 98 ms respectively. The 75 observed source rows
are allowlisted snapshots outside git. No owner/contact/household/name/address
fields are cached or published by this lane.

## Measured field completeness

| Field | Present/valid | Fraction |
|---|---:|---:|
| Stable identifier | 75/75 | 100% |
| Five-digit use code | 75/75 | 100% |
| Region code | 75/75 | 100% |
| Positive footprint area | 72/75 | 96% |
| Positive floor area | 72/75 | 96% |
| Positive above-ground storeys | 74/75 | 98.67% |
| Positive stated height | 9/75 | 12% |
| Eight-digit approval date | 60/75 | 80% |

A missing height is not manufactured as a register measurement: the app's existing
named height assumption remains part of the generated model. Unsupported source
rows are exclusions rather than population-average substitutes.

## Quota boundary — SWEEP-01 remains partial

The official portal advertises development traffic 10,000. This pilot observed
three successful requests, no 429 and no quota-ceiling header. Actual daily quota
is **null/unmeasured**. A bounded success window does not establish a ceiling.
No saturation probe or national sweep ran. The first direct attempts using the
exported short environment value returned403; those are credential-transport
failures, not measurements of the deployed account's quota.

## Generator and artifact contract

- Reuses the app's ingestion, ledger model, canonical compiler/simulation and
  shared energy functions. Canonical primary mapping was corrected to the shared
  explicit fuel/PV route and tested with PV plus district cooling.
- Every record has schema/engine version, integrated source commit, pinned time,
  stable hashed identifier/permalink, source hash, licence decision, evidence tier,
  named assumptions and field-provenance statuses. Source facts are not attached
  to defaults. Unknown era remains unknown in filters.
- Pinned job metadata + append-once indexed outcomes + atomic checkpoint support
  restart without repeating already persisted outputs. Changed inputs are refused.
- Manifest generationStatus distinguishes partial jobs from complete snapshots.
  Coverage explicitly excludes other districts and all unlisted classes/eras.
- Assumption prevalence counts families by ID. When records have different exact
  bases, the aggregate says `Varies by record; see each record's named assumption.`
  Individual titles retain their precise per-record basis. A mixed25%/10% test
  verifies the aggregate cannot falsely describe all records with one ratio.

## Bounded generation and verification

The 75-row pilot produces 71 records: Seoul25, Busan24, Daegu22. Four exclusions
are logged: three missing footprint area and one missing floor area. There are
71 unique identifiers, 19 assumption families, seven observed use codes and six
era labels (including unknown). It is not representative of Korean stock.

A real job was stopped after five outputs and resumed through75, then rerun with
all outputs present. The complete rerun did not change record bytes. The first
artifact's misleading mixed-basis aggregate was caught in root review and withheld;
reviewed artifacts are regenerated under the integrated corrective commit before
Phase5 publication. Previous local artifacts are retained only as audit evidence.

- 186 focused corpus/canonical tests passed; subsequent core/PV-surplus review
  passed 602 tests. TypeScript and final scoped ESLint passed. Resume/idempotence, privacy allowlist, numeric-ID preservation,
  exclusion, primary mapping and mixed-basis aggregate cases are exercised.
- Full app verification and public permalinks are Phase5/root integration work.
- SWEEP-06's stable identifier is implemented; durable permalink resolution is
  not claimed until Phase5 publishes the reviewed snapshot.

External source evidence:
`C:/Users/남승헌/ProjectFiles/BIM-corpus-data/pilot-browser-2026-09-15/`.
No record or secret artifact is added to git. Publication review stays independent
of internal calculation consistency; no Korean-stock accuracy validation is claimed.

## Reviewed final artifact

Final release directory:
`C:/Users/남승헌/ProjectFiles/BIM-corpus-data/releases/0.1.0-pilot-reviewed/`.
The generator ran read-only from the integrated main checkout after strict source
comparison rejected the older worktree's missing publication-only modules.

- Source commit: `4e44b1b5a0dbb01d475a466a6e23dd3b5e03cdc4`.
- Pinned generation time: `2026-09-15T10:32:49.446Z`.
- Records NDJSON SHA256: `758525f91cced96a75ae2d92aeafa8b270a304bca3f8f7e57756949e2234a996`.
- Manifest SHA256: `2f889947239937e34071e79ce9fd516e22334d7db0cb94080974c4a68eba7cf7`.
- 71 records/unique IDs, four exclusions, 19 assumption families.
- Four mixed-basis families correctly use the neutral aggregate title:
  DHW71, default lighting-hours4, plug71, excluded-basement30.
- Every record points to the same integrated commit. The final job again resumed
  from five outputs to75. Phase5 received this directory for independent review;
  older local artifact directories remain withheld audit copies.
