# Pitfalls Research

**Domain:** Adding a calibrated building-energy corpus (register sweep → generated baselines → calibration → versioned dataset releases + read-only API) to an existing single-building diagnosis app whose invariant is "every number cites a source or names a visible, reversible assumption."
**Researched:** 2026-09-15
**Confidence:** HIGH for statistics/publishing/rate-limit patterns (established literature and standards); HIGH for project-specific traps (drawn directly from AGENTS.md's documented incidents and current source); MEDIUM for the exact quota behavior of 건축HUB at sweep scale (unmeasured — this milestone's own open question).

## Critical Pitfalls

### Pitfall 1: A named assumption, scaled, becomes an unnamed population bias

**What goes wrong:**
On one building, "1985 아파트 → 별표1 era table U-value 1.2" is a visible, reversible, honest assumption — the user sees it, can override it, and the provenance says so. Run the same lookup over 100,000 register rows with the same era table and the same fallback rules, and the corpus inherits every one of that table's blind spots at once: buildings retrofitted since construction but not re-registered read at their original era's (worse) envelope; buildings whose 사용승인일 is blank fall to whatever `classifyEraExplicit`'s "unknown" branch does; mixed-use buildings get one `mainPurpsCd`-driven grade table applied to a structure that is actually two. None of this is wrong at the level of a single fact — every fact still cites the table it came from. It becomes wrong at the level of the *corpus statement*, where "our dataset says the Korean building stock averages X kWh/m²·yr" quietly encodes "assuming zero retrofit penetration, zero era misclassification, and zero within-building-type variance," none of which the dataset says.

**Why it happens:**
The per-fact traceability guarantee (`createEnergyFact`) is a row-level contract. Nothing in the pipeline currently asks "if I run this row-level function 100,000 times, what property of the *population* does it assert?" This is a scale problem, not a correctness problem, so it is invisible to every regression test written to check one building's arithmetic — the exact shape AGENTS.md already flags: label accuracy at one scale does not imply label accuracy at another.

**How to avoid:**
Treat corpus-level bias as its own artifact, generated from the same assumption ledger the per-building path already produces — do not hand-write it. Every batch run should tabulate, per assumption source (era table entry, use-code fallback, blank-date default), what fraction of the swept rows relied on it, and publish that distribution alongside the corpus (e.g., "38% of rows used the 1990–1999 era U-value because `classifyEraExplicit` could not read a date, not because the buildings are known to be of that era"). The published error/bias statement must be conditioned on assumption prevalence, not just on the anchor-set residual (see Pitfall 2) — a corpus that is 90% assumption-derived on U-value cannot inherit the confidence of a 7-building calibration on totally different inputs. Borrow TABULA/EPISCOPE's discipline here: that typology approach publishes, per archetype, the ratio of measured-to-calculated consumption as a stated calibration factor rather than presenting the archetype calculation as ground truth — the corpus needs the equivalent statement per era/use bucket, not one blended constant.

**Warning signs:**
- The dataset's methodology page states an overall mean or median with no distribution of which inputs were assumed vs. stated.
- Nobody can answer "what fraction of buildings in this release have a register-stated construction date?" without re-querying raw data.
- The corpus-level number moves noticeably when a single era-table entry is corrected (indicates concentration risk in one assumption, undisclosed).

**Phase to address:**
The "generate corpus baselines at scale" phase — the aggregation/bias-statement logic must be built alongside the generator, not bolted on after a sweep is already published. The sweep-feasibility research phase should scope what fields are actually populated at scale (this determines how bad the blank-date problem is before committing to volume).

---

### Pitfall 2: Calibrating against seven non-Korean, mostly synthetic, unmetered buildings and presenting it as an error band

**What goes wrong:**
The existing anchor set (FZK-Haus, KIT office, Klassiqua office, Schependomlaan, TalTech Maemaja, plus a duplex apartment and a clinic) is European/synthetic BIM-research test buildings, none Korean, none with a metered consumption series — PROJECT.md is explicit that "no meter series is ingested; every published energy figure is modeled." Deriving a Korean-stock error band ("±X%") from seven non-Korean, non-metered reference points is a category error twice over: (a) climate, code era and construction assemblies differ systematically from Korean stock, so any residual measured there says nothing about bias in Korea; (b) with no meter series, the "anchor" comparison is model-vs-model (BIMFIT's baseline vs. the reference model's own as-designed energy claim), not model-vs-reality, so it validates internal consistency of the pipeline, not real-world accuracy. Seven data points is also far below what any calibration standard treats as sufficient for a population-level error statistic — ASHRAE Guideline 14's own sampling-uncertainty annex exists precisely because small samples inflate the reported uncertainty of a savings/error estimate, and 14's calibration thresholds (NMBE ≤5%, CV(RMSE) ≤15% monthly) are defined per-building against measured utility data, not as a recipe for extrapolating a stock-wide band from a handful of unmetered surrogates.

**Why it happens:**
The anchor set was built for a different purpose (demonstrating source-rich material bindings for the reference-model gallery) and is now being asked to carry a second job (calibration) it wasn't sized or sourced for. It is tempting to publish *some* number because "calibrated" is the milestone's stated goal, and a number always looks more credible than an admission that none is supportable yet.

**How to avoid:**
Separate two claims that are currently at risk of being fused: (1) "the pipeline reproduces the reference models' own design-stage energy figures within Y%" — a legitimate, honestly-scoped claim about internal consistency, verifiable today; (2) "the corpus's error band against real Korean building performance is ±X%" — not supportable from this anchor set, full stop. Publish (1) labeled as exactly that (model-to-model agreement on non-Korean, unmetered test buildings), and do not let it drift into being read as (2). Where a corpus-wide accuracy claim is required, the honest artifact is a stated gap: "no calibration against measured Korean consumption exists; the anchor set validates pipeline consistency only." If/when Korean metered buildings are added (an Active roadmap item — "buildings with measured consumption"), gate any *population* error-band claim on reaching a sample large enough that Guideline 14's Annex B sampling-uncertainty correction doesn't dominate the reported number, and even then scope the band to the strata the anchors actually cover (do not extrapolate an office-building band to apartments).

**Warning signs:**
- A dataset release or UI surface uses the word "accuracy" or "error band" attached to a number without stating N, climate provenance, or whether it's metered or modeled reference.
- The same seven-model N is used to justify confidence across multiple building typologies the anchors don't include.
- Marketing language ("calibrated corpus") outruns what the methodology section can actually support.

**Phase to address:**
The "calibrate corpus baselines against measured anchors" phase must produce the methodology text *as its own deliverable*, reviewed against exactly this distinction, before any error figure ships in the dataset or the API. The "grow the anchor set" phase (Korean, metered, typology-gap buildings) is the prerequisite that actually unblocks claim (2); sequence calibration language changes to land only after that phase, not before.

---

### Pitfall 3: Survivorship and coverage bias baked into the register itself

**What goes wrong:**
건축물대장 coverage is not a random sample of the Korean building stock. It systematically under-represents: unregistered/informal structures (무허가 건축물), very old buildings predating digitization whose register rows are thin or blank, buildings mid-demolition or mid-permit-amendment with inconsistent state, and (per AGENTS.md) any building where one of the four register endpoints failed for that call — which "fail independently and intermittently" and must never all be required, meaning a swept corpus will contain rows built from partial endpoint success next to rows built from full success, with no visible marker distinguishing the two once they're both in a "published" dataset. On top of that, the project already knows a documented zero (`platArea=0`, `heit=0`) means *unavailable, not zero* — but that convention is enforced by the existing single-building code path (`ledger-baseline-model.ts` treats it as "emit no fact"). A sweep-and-aggregate pipeline is new code, at a different call frequency, under different pressure to "fill in" a summary statistic, and is exactly where a shortcut reintroduces the old bug in a new location — e.g., a corpus-summary aggregator that averages `platArea` across a `WHERE platArea IS NOT NULL` filter is safe, but one that averages across all rows after a naive `|| 0` coercion silently drags every mean toward zero.

**Why it happens:**
The zero/blank distinction is currently guaranteed by one code path (`createEnergyFact`'s throw). A sweep introduces new aggregation code — summary stats, coverage percentages, per-법정동 counts — that sits *outside* that construction-time guard because it operates on raw register rows or on already-materialized `CanonicalEnergyModel` objects, not on the fact-construction call site itself. Coverage bias (which buildings are missing) is a different failure mode again: it's not about a wrong value in a present row, it's about which rows are silently absent, and nothing currently measures "expected vs. actual row count per 법정동" to surface that gap.

**How to avoid:**
1. Any new aggregation/summary code must consume already-validated `CanonicalEnergyModel`/fact objects (which already enforce zero-vs-blank correctly) rather than re-reading raw register JSON and re-implementing the zero check.
2. Publish a coverage statement per geographic/typology stratum: expected building count (from the register's own reported total-per-법정동, which the proxy already surfaces) vs. successfully-modeled count, with a documented reason distribution for the gap (endpoint failure, unresolvable era, unmapped use code, all-fields-blank).
3. Treat "endpoint N of 4 succeeded" as a per-row provenance field carried into the published dataset — a corpus row built from 2-of-4 endpoints is not the same evidentiary strength as one built from 4-of-4, and collapsing that distinction in the public schema is the sweep-scale version of "the label lies while the number is right."

**Warning signs:**
- A corpus release states total building count with no comparison to the register's own reported total for that scope.
- No field in the published schema distinguishes "all four register endpoints succeeded" from "partial."
- A sudden request to "just default the missing area to the neighborhood average so the row isn't empty" — this is the convenience-helper trap AGENTS.md names directly ("do not add a convenience helper that attaches register references to a defaulted value"), reappearing as a batch-job feature request.

**Phase to address:**
The sweep-feasibility research phase should measure actual blank/zero/endpoint-failure rates at real scale (this is currently unknown — PROJECT.md flags quota as the known unknown, but field-completeness at scale is an equally real unknown that research should capture in the same pass). The corpus-generation phase must carry per-row provenance (endpoint count, assumption count) all the way to the published schema, not just to internal logs.

---

### Pitfall 4: Benchmark comparisons that aren't like-for-like

**What goes wrong:**
Once a corpus exists, the natural next feature is "how does this building compare to its peers" — and every dimension of that comparison can silently misalign: (a) peer groups drawn from a thin corpus slice (e.g., 12 pre-1990 교육연구시설 in one 시군구) report a percentile off a sample too small to mean anything, without saying so; (b) climate is not normalized — a Seoul building and a Busan building compared on raw kWh/m²·yr conflate climate severity with building performance, when the app already has degree-day climate data (`src/lib/energy-diagnostics/ledger-climate.ts`, `src/lib/energy/`) that could normalize it and might simply not be wired into the comparison; (c) floor-area definitions differ between records — register `platArea`/floor rows are not guaranteed to use the same conditioned-vs-gross convention as a drawing-derived or CAD-reconstructed model, and AGENTS.md's own worked example (the Clinic's floor area correction, 6,935.8 → 4,314.2 m², "every intensity had read 37% too good") is exactly this failure inside a single building — a peer comparison multiplies that risk across every pair being compared; (d) modeled records get compared against metered ones once any metered anchor exists, silently treating a simulation output and a utility bill as the same kind of number.

**How to avoid:**
- State peer-group N on every comparison surface, and set a minimum-N floor below which the app shows "insufficient peers" rather than a percentile.
- Normalize by heating/cooling degree-days before any cross-region comparison, using the climate adapter that already exists — do not introduce a second, ad hoc normalization.
- Carry a floor-area *definition* tag (conditioned vs. gross, register-stated vs. drawing-measured vs. reconstructed) as a first-class field, and either refuse to compare across mismatched definitions or state the mismatch inline.
- Tag every record's energy figure as `modeled` vs. `metered` (the schema already needs this per Pitfall 2) and never blend the two into one benchmark distribution without a visible split.

**Warning signs:**
- A percentile or "better/worse than average" claim renders with no visible N.
- Two buildings from different climate zones are ranked on raw intensity.
- A comparison silently mixes register-only baselines with drawing-refined digital twins as if they were the same evidentiary tier.

**Phase to address:**
This is a "corpus position" feature explicitly named in PROJECT.md's target features ("corpus position and evidence" replacing the return-focused retrofit panel) — build the minimum-N, climate-normalization and floor-area-definition guards into that same phase, not as a later patch, since the feature's entire credibility rests on them.

---

### Pitfall 5: Publishing traps — immutability, schema drift, licence contamination, and personal data reachable from a register record

**What goes wrong:**
Four distinct failure modes bundle under "publish a versioned dataset":

1. **Immutable releases that need correction.** Once a release is versioned and cited externally (a URL, a hash, a schema version like the existing 1.3.0), "fixing" it by silently overwriting the same version number breaks every consumer's assumption that a version is stable, while *never* correcting a known-wrong figure (e.g., a discovered era-table bug) leaves bad data live indefinitely. Both extremes are wrong.
2. **Schema evolution breaking downstream consumers.** The per-building dataset already has fields (units, inputs, assumptions, licences, hashes per PROJECT.md); adding corpus-level fields (coverage stats, calibration bands, provenance tiers from Pitfall 3) risks either bolting them on incompatibly or requiring every field to be optional forever, which erodes the schema's own guarantees.
3. **Licence contamination.** PROJECT.md's constraint is explicit — "no reference-building artifact ships without an established licence and rights holder." A corpus generated *from* register data is a different licence regime than a corpus that also incorporates or was validated against the seven reference-model artifacts (some of which are academic/research-licensed BIM test files, e.g., Schependomlaan, TalTech Maemaja). If a calibration factor derived from a restrictively-licensed reference model gets baked into every corpus row's number (not just cited as methodology), the corpus itself may inherit a licence obligation it wasn't built to carry.
4. **Personal or commercially sensitive information reachable from a register-derived record.** 건축물대장 rows can carry owner name, address-level precision sufficient to identify a specific residence, and (for smaller buildings) effectively single-occupant identification. A per-building energy dataset published at scale — unlike a single building the user explicitly searched for — turns "look up my own building" into "enumerate everyone's building," which is a materially different privacy posture even if no field is individually new.

**How to avoid:**
1. Use immutable, append-only versioning (the schema already has a version field — extend the pattern to full-release snapshots) with an explicit errata/deprecation mechanism: a corrected release gets a new version, the old one is marked superseded (not deleted, not silently mutated), and the API's default "latest" pointer moves forward while pinned consumers keep the old version resolvable.
2. Version the schema independently of the release cadence, require additive-only changes within a major schema version (new optional fields, never repurposed or removed ones) exactly as the existing 1.3.0 numbering implies, and write a migration/compat note per schema bump.
3. Track licence provenance per *derived* value, not just per artifact — if a calibration constant traces back to a restrictively-licensed reference model, that lineage must be visible on the corpus methodology page, and legal/licence review should happen before the calibration phase ships numbers, not after.
4. Before any bulk publish, define and apply a redaction/aggregation policy for register fields with identifying potential (owner name if present, exact address vs. 법정동-level generalization for small/residential buildings) — treat this as a go/no-go gate on the "publish corpus" phase, not a cleanup pass afterward, because a public read-only API cannot be un-published once scraped.

**Warning signs:**
- A "fix" to a published dataset changes numbers under the same version string.
- A new corpus-level field appears with no schema version bump.
- Nobody can name which reference model's licence terms cover a specific calibration constant.
- The dataset or API returns register rows for buildings the requesting user never searched for, at address-level granularity.

**Phase to address:**
The "publish versioned corpus releases and a read-only API" phase must include a privacy/redaction gate and a licence-lineage audit as explicit exit criteria, not implicit assumptions — and the release-versioning mechanism should be designed before the first corpus batch is generated, since retrofitting immutability onto an already-published ad hoc release is much harder than building it in from release #1.

---

### Pitfall 6: Rate limits and quota exhaustion during a register sweep, and what a partial sweep does to a coverage claim

**What goes wrong:**
The existing single-building path already works around real API fragility — a shared demo key "rate-limited per IP," four endpoints that "fail independently and intermittently." A sweep multiplies call volume by orders of magnitude (per-법정동 paging × per-building detail calls × potentially per-floor calls), turning an occasional intermittent failure into a near-certain partial-completion event at scale. The failure that actually damages the product is not the sweep stopping — it's the sweep stopping *silently mid-region* and the corpus being described as "nationwide coverage" or "region X: N buildings" when N is actually "however many completed before the quota reset," with no visible marker of where the sweep truncated. A retry loop that doesn't respect the per-IP rate limit can also get the shared key throttled or blacklisted, taking down the *single-building* diagnosis flow (which depends on the same key) as collateral damage from a batch job — that's a regression in the app's core, existing feature caused by the new one.

**How to avoid:**
- Treat quota discovery as its own research deliverable before any generation phase commits to a target scale (PROJECT.md already names this: "establish whether the register can be swept at scale, and on what quota" as a standalone Active item, and correctly sequences it before "generate corpus baselines at scale").
- Design the sweep as resumable and rate-aware from day one: persist a per-법정동, per-endpoint completion checkpoint; back off on 429/timeout rather than retry-hammering; and never share the sweep job's request budget with the interactive single-building lookup's key/quota — if a separate key isn't available, the sweep must yield to interactive traffic, not compete with it.
- Every published coverage number must be paired with completion status: "swept 187 of 250 시군구; remaining incomplete due to quota" is honest; "corpus covers Korea" when 63 districts never ran is the Pitfall-3 problem again, now caused by infrastructure rather than register content.
- Make partial-sweep state visible in the corpus metadata itself (last-swept timestamp per region), not just in an internal job log, so a stale or truncated region is detectable by a consumer, not just by whoever ran the job.

**Warning signs:**
- A sweep job has no persisted checkpoint and restarts from zero on any failure.
- The single-building lookup flow starts failing or slowing during/after a sweep run (shared-key contention).
- A coverage claim in the UI or dataset has no accompanying "as of" timestamp or region-completion list.

**Phase to address:**
The "register sweep feasibility" research phase is the correct and already-planned home for quota discovery. The subsequent "generate corpus baselines at scale" phase must build the resumable/rate-aware sweep architecture as a first-class design constraint (not an afterthought), and its own completion criteria should require a coverage-with-caveats reporting mechanism before it's considered done.

---

### Pitfall 7: Replacing a hard-coded physics ratio with a real term breaks quietly under ~380 dependent tests

**What goes wrong:**
`deliveredFromDemand` currently hard-codes `electric = cooling + 0.15 × total` and `gas = heating + 0.10 × total`, with `renewable = 0` always — PROJECT.md names this "the single gate on honest retrofit physics" and the exact target of this milestone's physics work. Around 380 tests across 29 files exercise retrofit economics built on this function's output, and roughly 15 files loop the reference-building registry as de facto contract tests. Replacing the flat 0.15/0.10 ratios with a real lighting/DHW/renewable term changes the *shape* of every downstream number, not just its magnitude: grades computed against fixed kWh/m²·yr thresholds can flip bands for buildings that were sitting near a boundary purely because the fallback ratio happened to land them on one side; NPV/IRR/payback figures for lighting and PV retrofits, which the constraint list says currently *cannot move the headline number at all* ("no lighting or photovoltaic measure can move the headline intensity or the grade, however real its own savings formula is"), will suddenly move it — meaning any test that encoded "PV retrofit changes cost but not energy" as an implicit expectation will now be *correctly* failing, but that failure looks identical to a regression unless every failing test is individually checked against which behavior is the fix versus which is real breakage. The corpus-generation work sits directly downstream: every baseline generated before this fix is fuel-split on the old flat ratio, so a corpus batch run before vs. after this change is not a like-for-like re-run — it's two different physics models, and mixing their outputs in one published release silently reintroduces Pitfall 1's population-bias problem at the level of "half the corpus used ratio A, half used ratio B."

**Why it happens:**
A single shared function with many silent consumers (retrofit economics, the efficiency grade, the primary-energy conversion, and now the corpus generator) means one change ripples through every consumer's fixed expectations at once, and the volume of tests (380) makes "did I break something" indistinguishable from "did I fix something that was compensating for the bug" without reading each failure's intent, not just its assertion.

**How to avoid:**
- Before changing the function, snapshot its current output distribution across the reference-model set and a corpus sample, so "how much did the physics change move things" is a measured, reportable delta rather than an assumption.
- Land the physics fix as an isolated phase (already sequenced first in PROJECT.md's Key Decisions: "Fix `delivered-from-demand.ts` before anything downstream") and re-run the full 380-test suite reading each failure's *assertion intent*, not just its pass/fail — a test asserting "PV never changes intensity" should be rewritten to assert the new, correct behavior, not patched to keep passing the old one.
- Version-stamp any corpus batch with the `deliveredFromDemand`/grade-logic version it was generated under (the pipeline already version-stamps `buildLedgerBaselineModel` output per PROJECT.md — extend that same discipline to this function), and refuse to publish a single release that mixes batches generated under different physics versions without labeling the split.
- Re-run this specifically against the near-grade-boundary buildings in the existing reference set and any early corpus sample, since boundary-flip cases are exactly where a silent regression is highest-consequence (a building's published efficiency grade changing between releases needs its own visible changelog entry, not a diff buried in a version bump).

**Warning signs:**
- Test failures after the change are triaged in bulk ("re-run and see what's still red") rather than individually read for intent.
- A corpus release mixes buildings generated before and after the physics change with no version marker distinguishing them.
- A reference building's published grade changes between two dataset releases with no changelog entry explaining why.

**Phase to address:**
The physics-fix phase itself (already first in sequence per PROJECT.md), with its exit criteria explicitly including: full suite re-triaged by intent (not bulk-patched), a measured before/after delta on the reference set, and a version marker introduced before any corpus generation phase consumes the new function.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Deriving corpus-level averages directly from raw register JSON instead of through the existing `CanonicalEnergyModel`/fact path | Faster to write a summary script | Reintroduces the zero-vs-blank bug in a new code path; breaks the single-guarantee architecture | Never — always aggregate post-validation objects |
| Publishing a single blended "error band" figure instead of per-stratum bands | One number is easier to headline | Misleads on strata the anchor set never covered (Pitfall 2/4) | Only as an explicitly-labeled "overall, low-confidence" figure alongside the honest per-stratum breakdown, never alone |
| Treating corpus generation as a one-off batch script outside the versioned pipeline | Ships the first release faster | No resumability, no checkpoint, no reproducibility when the physics function changes (Pitfall 7) | Only for an internal dry-run explicitly marked non-publishable |
| Sharing the interactive lookup's data.go.kr key/quota with the sweep job | No new credential to provision | Sweep starves or gets the interactive flow throttled (Pitfall 6) | Never for a production sweep; acceptable only for a tiny (<50 building) manual test explicitly run off-peak |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| data.go.kr 건축HUB at sweep volume | Assuming per-call behavior observed at single-building scale (intermittent per-endpoint failure, per-IP throttling) generalizes linearly to batch volume | Run a scoped, checkpointed pilot sweep first and measure actual quota/backoff behavior before committing to a target scale — this is explicitly the sweep-feasibility phase's job |
| VWorld GIS outline lookups at scale (used by the cad-reconstruction path) | Assuming the icn1-region pin only matters for interactive requests | The same egress restriction applies to any batch job calling VWorld; a sweep running outside icn1 silently degrades to the 건축면적-solved rectangle for every row, not just some |
| Reference-building manifests as calibration inputs | Treating `public/reference-buildings/<id>/manifest.json` figures as ground truth because they're "measured envelopes" | They are measured *geometry/material* inputs to a model, not metered *energy consumption* — do not let "measured" in one dimension imply "measured" in the other when writing calibration language |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Synchronous, unpaginated sweep loop over all 법정동 in one process | Job runtime scales linearly with no checkpoint; any single failure loses all prior progress | Per-region checkpointing, resumable job state, parallelism bounded by observed quota | First real quota limit or transient outage during a full sweep |
| Recomputing corpus-wide aggregate stats (coverage %, bias distribution) on every API read | API latency grows with corpus size; read path competes with the sweep job for the same data store | Precompute and version-stamp aggregate stats at publish time, serve them as static release artifacts | Once the corpus exceeds a few thousand rows, or once the read API has real external traffic |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Publishing register-derived owner name or exact address at scale via the read-only API | Enables enumeration of individually-identifiable residential energy/ownership data, a materially different exposure than one user looking up their own building | Redact/generalize identifying fields before any bulk publish; gate the publish phase on an explicit privacy review (Pitfall 5) |
| Reusing the shared demo data.go.kr key for an unauthenticated public sweep-trigger endpoint | Exposes the shared key to quota exhaustion or abuse by any caller of a public corpus-refresh trigger | Keep sweep execution server-side/operator-triggered only; never expose a public endpoint that fans out to data.go.kr on demand |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Showing a corpus percentile/benchmark with no visible N or climate normalization | User draws a false confidence conclusion about their building's relative performance | Always render N and normalization basis inline with any comparison figure (Pitfall 4) |
| Labeling a modeled anchor comparison as "calibration accuracy" in user-facing copy | User believes the corpus is validated against real Korean consumption data when it is not | Use precise language distinguishing "pipeline consistency check" from "measured accuracy" everywhere the number surfaces, not just in a methodology footnote |
| Presenting a partially-swept region's corpus entry identically to a fully-swept one | User assumes uniform coverage/confidence across the map | Visually and textually distinguish completion/confidence tier per region in any coverage UI |

## "Looks Done But Isn't" Checklist

- [ ] **Corpus generated at scale:** Often missing a persisted per-row assumption/provenance trail — verify a random sample of published rows can each be traced back to which register fields were stated vs. assumed, the same way a single building's diagnosis already can.
- [ ] **Calibration against anchors:** Often missing a stated scope (which typologies, which climate zones the seven anchors actually cover) — verify the published error band names its coverage limits, not just a number.
- [ ] **Corpus dataset release:** Often missing a coverage/completion statement — verify the release states swept-vs-expected counts per region, not just a total.
- [ ] **Read-only API:** Often missing rate limiting and a privacy/redaction pass on its own surface — verify no endpoint returns identifying register fields at bulk scale.
- [ ] **Physics fix (`delivered-from-demand.ts`):** Often "done" once tests are green again — verify each previously-passing test's *new* assertion matches intended behavior, not merely that the suite is green (bulk re-passing tests can hide a compensating second bug).
- [ ] **Registry collapse (two hand-synced model registries → one):** Often verified only against the buildings already in both registries — verify a *new* corpus-sourced building added to the single source of truth actually reaches every consumer (gallery, `/api/reference-buildings`, contract tests) without a manual sync step.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Population bias discovered after a corpus release shipped | MEDIUM | Publish a superseding version with the bias statement added/corrected; mark the prior version deprecated-not-deleted (Pitfall 5); do not silently edit the live release |
| Over-claimed calibration error band already published | MEDIUM–HIGH (reputational) | Issue a corrected methodology note in a new schema/release version, narrow the claim to what the anchor set supports, and explicitly log the correction in the dataset changelog |
| Sweep quota exhausted mid-run, partial corpus already in use | LOW | Mark affected regions as partial in metadata immediately; resume from checkpoint once quota resets; do not backfill silently without a version bump |
| Physics change regression discovered post-corpus-generation | HIGH | Re-generate affected corpus batches under the corrected function, version-stamp them distinctly from pre-fix batches, and never merge the two into one unlabeled release |
| Identifying register data found already exposed via the public API | HIGH (privacy incident) | Pull the affected release/endpoint immediately, redact at source, republish under a new version, and treat as a privacy incident requiring root-cause review of the redaction gate that should have caught it |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|---------------|
| 1. Scaled assumption → population bias | Generate corpus baselines at scale | Published release includes an assumption-prevalence table per era/use bucket; spot-check that a bucket-level bias statement changes the headline number's confidence, not just its footnote |
| 2. Calibrating against a tiny, non-Korean, unmetered anchor set | Calibrate corpus baselines against measured anchors | Methodology text names N, coverage, and modeled-vs-metered status for every error figure; no figure ships without this |
| 3. Survivorship/coverage bias in register data | Register sweep feasibility research; corpus generation | Field-completeness and endpoint-success rates measured and published per stratum; zero-vs-blank handling verified to flow through aggregation, not just single-building construction |
| 4. Non-like-for-like benchmark comparisons | Corpus-position/retrofit-panel replacement phase | Every comparison surface shows N, climate normalization basis, and floor-area definition; minimum-N floor enforced in code, not just convention |
| 5. Publishing traps (immutability, schema drift, licence, PII) | Publish versioned corpus releases + read-only API | Release versioning is append-only with a deprecation path tested end-to-end; licence lineage documented per derived calibration value; privacy redaction gate passed before first public release |
| 6. Rate limits / partial sweep | Register sweep feasibility research; corpus generation | A real, checkpointed pilot sweep's quota behavior is measured and documented before scale is committed to; every coverage claim carries a completion/timestamp field |
| 7. Physics-ratio replacement breaking downstream tests | `delivered-from-demand.ts` fix (sequenced first) | Full 380-test suite re-triaged by assertion intent; before/after delta measured on the reference set; corpus batches version-stamped by physics-function version before any generation phase runs |

## Sources

- `docs/00_Project/` / `.planning/PROJECT.md` — project-specific constraints, active roadmap items, current known unknowns (HIGH confidence — primary source)
- `AGENTS.md` — "stated versus assumed" and "the label lies while the number is right," ten worked incidents used directly as the pattern basis for Pitfalls 1, 3, 4, 7 (HIGH confidence — primary source, verified incidents)
- `src/lib/energy/delivered-from-demand.ts` and its test count — read directly for Pitfall 7 (HIGH confidence — runtime evidence)
- `src/lib/reference-buildings/manifest.ts` and the reference-building file list — read directly for Pitfall 2's anchor-set composition (HIGH confidence — runtime evidence)
- [ASHRAE Guideline 14-2002/2014 Measurement of Energy and Demand Savings](https://www.eeperformance.org/uploads/8/6/5/0/8650231/ashrae_guideline_14-2002_measurement_of_energy_and_demand_saving.pdf) — NMBE/CV(RMSE) calibration thresholds and sampling-uncertainty annex (MEDIUM-HIGH confidence — established industry standard, general web result not a primary document read)
- [TABULA Building Typologies in 20 European countries — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0378778816305837) and [TABULA/EPISCOPE scientific report](https://www.episcope.eu/downloads/public/docs/scientific/DE_TABULA_ScientificReport_IWU.pdf) — archetype/typology calibration-factor discipline used as the model for Pitfall 1's recommendation (MEDIUM-HIGH confidence — peer-reviewed/EU-project literature, general web result)

---
*Pitfalls research for: Korean building-energy repository (corpus generation, calibration, dataset publishing) added to an existing single-building diagnosis app*
*Researched: 2026-09-15*
