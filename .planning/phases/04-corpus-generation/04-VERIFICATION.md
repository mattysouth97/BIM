---
phase: 04-corpus-generation
status: partial
verified: 2026-09-15
---

# Verification

| Requirement | Evidence | Status |
|---|---|---|
| SWEEP-01 | Three real HTTP200 queries, 75 rows, per-field completeness and latency recorded. Actual daily ceiling null; advertised10,000 not relabeled measured. | Partial |
| SWEEP-02 | Shared ingestion/model/compiler/engine route; resumable indexed outcomes, actual5→75 run. National sweep not claimed. | Bounded implementation verified |
| SWEEP-03 | All71 records pin integrated source4e44b1b5a0dbb01d475a466a6e23dd3b5e03cdc4, schema/engine version and common timestamp. | Verified |
| SWEEP-04 | Four real exclusions (3footprint,1floor-area); no fabricated replacement. | Verified |
| SWEEP-05 |19 assumption families; mixed-basis titles neutral; per-record basis retained. Mixed25%/10% test catches false family labels. | Verified |
| SWEEP-06 |71 unique stable IDs/permalinks generated. All71 resolve on the live published release with matching ids, zero HTTP errors (production,2026-09-15). | Verified |
| SWEEP-07 | Licence decision, source endpoint/hash, evidence tier, fact statuses and assumptions assembled per record. | Verified |

602 focused retrofit/canonical/corpus/hook tests and TypeScript passed after the
final physics review; scoped ESLint passed. Source-derived numerical consistency
is not a validation against metered energy or the Korean building stock.

No upstream quota saturation test, full-scale sweep, or publication performed by
this lane. The reviewed external snapshot and hashes are in04-01-SUMMARY.md.

## Production follow-up (2026-09-15)

SWEEP-06 was closed against the live release at bim-self.vercel.app: every one
of the71 record permalinks returned200 with a matching id. SWEEP-01 is
unchanged and still open — the account's actual daily quota is unmeasured, and
a bounded pilot's success does not establish that ceiling.
