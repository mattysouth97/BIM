# Feature Research

**Domain:** Building energy repository / building-stock corpus (new capability layer on an existing single-building energy diagnosis tool, BIMFIT)
**Researched:** 2026-09-15
**Confidence:** HIGH for prior-art mechanics and published methodology (primary sources: DOE, NREL/OEDI, EIA, ASHRAE, EU Commission, episcope.eu, data.go.kr); MEDIUM for Korean-specific gap analysis (public-data-portal listings read directly, no internal access to 그린투게더/한국에너지공단 raw microdata); LOW only where explicitly marked.

## Prior Art — What Each System Actually Offers

| System | Unit of record | Data origin | Modeled or metered | Uncertainty expression |
|---|---|---|---|---|
| **DOE Building Performance Database (BPD)** — [energy.gov](https://www.energy.gov/cmei/buildings/building-performance-database-bpd), [OpenEI submission](https://data.openei.org/submissions/145) | One building record (anonymized) | Voluntary/convenience pool: local benchmarking-mandate filings, utility Green Button exports, CBECS/RECS as two of many contributing sources, owner-submitted data | **Metered** (whole-building billing/meter data) + self-reported physical characteristics | None stated at the record level; the population itself is **not** statistically representative — it is a volunteered, mandate-driven sample skewed toward buildings that already benchmark (often already efficient or compliance-obligated) |
| **ASHRAE Building EQ (bEQ)** — [ashrae.org/technical-resources/building-eq](https://www.ashrae.org/technical-resources/building-eq) | One building, issued as a **label**, not a searchable corpus | Two independent evaluations per building: "In Operation" from actual utility billing + a Level 1 energy audit; "As Designed" from an asset simulation | **Both**, kept deliberately separate — an operational (metered) rating and an asset (simulated) rating are never merged into one number | No statistical error band; the two labels are the disclosure mechanism — a building's real bill and its designed potential are shown side by side rather than reconciled into one figure |
| **EU Building Stock Observatory (BSO)** — [building-stock-observatory.energy.ec.europa.eu](https://building-stock-observatory.energy.ec.europa.eu/database/), [EC news](https://energy.ec.europa.eu/news/eu-building-stock-observatory-monitoring-energy-performance-buildings-across-europe-2023-08-31_en) | **National/EU aggregate indicator** (stock count, m², renovation rate, EPC counts) — never an individual building | Eurostat, national statistics offices, the Hotmaps project | Aggregated **secondary statistics**, not a building-level model or meter at all | Not quantified per figure; credibility rests on citing the contributing national source per indicator, not on a stated confidence interval |
| **TABULA / EPISCOPE** — [episcope.eu/building-typology](https://episcope.eu/building-typology/), [TABULA calculation method PDF](https://episcope.eu/fileadmin/tabula/public/docs/report/TABULA_CommonCalculationMethod.pdf) | One **archetype** per (country × building-type × age-class) cell of a national "building type matrix" — a representative example, not a real surveyed building | Expert-compiled national typologies built from real building samples + EN 13790 seasonal-method calculation | **Modeled**, but explicitly and visibly **calibrated**: a country-specific empirical "adaptation factor" scales the raw calculation to the typical level of *measured* consumption, and the WebTool lets a user toggle between raw calculated and calibrated views | The gap between calculation and metered reality is not hidden — it is named as a factor and shown as a switch, the strongest "modeled-vs-real, and here's the seam" precedent found |
| **ResStock / ComStock (NREL)** — [nrel.gov/research/software/comstock](https://www.nrel.gov/research/software/comstock), [ResStock 2024.2 docs](https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2024/resstock_tmy3_release_2/resstock_documentation_2024_release_2.pdf) | One **synthetic dwelling/building EnergyPlus model** per sampled unit — 350,000+ homes for ResStock, a comparable national commercial set for ComStock | Probabilistic sampling across 100+ characteristic distributions built from many admin/survey/utility sources, then simulated | **Modeled at scale**, but validated against real meters from **30+ utility data-sharing partners** over three years, plus submetering | An explicit, stated aggregate error band: "the vast majority of simulations, aggregated to varying degrees, estimate electricity use to within ±20% of RECS reported consumption" — a named, published number, not a vague disclaimer |
| **EnergyPlus / DOE Commercial Reference & 90.1 Prototype Buildings** — [OpenEI wiki](https://openei.org/wiki/Commercial_Reference_Buildings), [NREL PNNL report](https://docs.nrel.gov/docs/fy11osti/46861.pdf) | One canonical **prototype** per (16 building types × 16–17 climate locations × code vintage) — thousands of IDF/OSM files total | Built by PNNL for ASHRAE 90.1 code development, not sampled from the real stock | **Purely modeled**, deterministic — these are reference points for code-writing and compliance baselines, never claimed as a population sample | None — by design these are single archetypes, not a distribution, so no uncertainty is stated or implied |
| **CBECS / RECS (EIA)** — [eia.gov/consumption/commercial](https://www.eia.gov/consumption/commercial/), [RSE methodology](https://www.eia.gov/consumption/commercial/data/what-is-an-rse.php) | One real, statistically sampled building/household (CBECS: 6,720 buildings) | A designed national probability sample, re-run roughly every 4 years, later merged with billing data | **Metered** billing + surveyed physical/operational characteristics | The most rigorous precedent found: **Relative Standard Error (RSE)** per estimate, computed from replicate weights, converted to a 95% CI (`RSE/100 × estimate × 1.96`), and a **hard suppression rule** — a table cell is withheld if RSE > 50% or fewer than 20 buildings respond |
| **한국에너지공단 건축물 에너지효율등급 (BEE certification) dataset** — [data.go.kr listing](https://www.data.go.kr/data/15100521/openapi.do) | One certified building (grade 1+++ to 7) | Submitted **as-designed asset simulation** at certification time (ECO2-class tooling), not billing | **Modeled** (asset rating), not metered | Not stated; coverage is self-selected toward buildings legally obligated to certify (new/large/public), an undisclosed bias by omission |
| **국가 건물에너지 통합관리시스템 / 그린투게더 (Green Together, MOLIT)** — [greentogether.go.kr](https://www.greentogether.go.kr/), [건축HUB 건물에너지정보 서비스](https://www.data.go.kr/data/15135963/openapi.do) | Building/parcel-month electricity + gas usage, aggregated by 법정동/parcel | Actual utility billing (한전/도시가스) collected under the 녹색건축물 조성 지원법 | **Metered**, genuinely — the strongest "real consumption" source found for Korea | No stated error band because it is a raw aggregate, not a sample; but single-family homes and multifamily buildings under 200 units are **excluded from disclosure since 2020**, a real, undisclosed-on-the-chart coverage gap |
| **한국에너지공단 건물에너지진단정보DB** — [data.go.kr fileData listing](https://www.data.go.kr/data/15105239/fileData.do) | One on-site-audited building | Mixed: billing history + physical survey at audit time | Mixed (metered history + modeled improvement scenarios) | Published as aggregated project statistics, not open per-building microdata — no bulk download of the underlying records found |

**The gap this milestone can fill in Korea specifically:** nothing found above combines (a) a bulk-downloadable, per-record, licensed, versioned dataset, (b) a public API, (c) a named modeled/metered distinction per record, and (d) a stated calibration error band against real measured anchors. Green Together has real meters but no per-building bulk API or permalink. The KEA BEE dataset has per-building granularity but is asset-only with no calibration statement. TABULA-style calibration exists only for a handful of EU countries, and only for residential archetypes. BIMFIT's register-generated corpus, anchored by its seven (growing) measured/well-documented reference models, sits in a position none of the Korean prior art occupies today.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes / Dependency |
|---|---|---|---|
| Search and filter across the corpus (use type, era/vintage, region/climate, floor-area band, structure type) | Every prior-art tool above lets a user narrow before they read (TABULA's type×age matrix, CBECS's variable filters, BPD's search UI) | MEDIUM | Depends on the existing catalogue endpoint (`/api/reference-buildings`) and `classifyEraExplicit`; needs to generalize from 7 hand-curated records to a swept corpus of unknown size |
| Stable per-record identifier + permalink | DOE BPD, CBECS microdata, and ResStock/ComStock all key every record so it can be cited and re-fetched later; a corpus that can't be pointed at isn't citable | LOW–MEDIUM | The 건축물대장 PK (`mgmBldrgstPk`) is already the id used by the ledger path; needs a uniqueness/collision check at sweep scale, not new plumbing |
| Provenance and licence per record | Every credible source above states where a number came from; BPD is criticized precisely where this is weakest (anonymized, sourced from "various" without per-record traceability) | LOW–MEDIUM | Directly extends the existing per-building dataset schema (1.3.0: licences, hashes, sources) from 7 hand-built records to register-swept ones — the assumption ledger already produces this per-fact, it needs to roll up per-record |
| Units and schema documentation (data dictionary) | ResStock/ComStock ship a `data_dictionary.tsv` and `enumeration_dictionary.tsv` with every release; without this, a bulk file is unusable outside the app | LOW | Schema 1.3.0 partially documents this already; needs a public-facing page, not new data work |
| Bulk download | CBECS microdata, ResStock/ComStock parquet/csv dumps, and BPD's bulk exports are all expected by any building professional or researcher | MEDIUM | Today the app serves one file per building; corpus scale needs a single dump (or paginated export) covering however many records the register sweep produces |
| Read-only API | BPD ships an API (v2.1), Green Together exposes Swagger-documented OpenAPI, data.go.kr is API-first by convention in Korea | MEDIUM–HIGH | `/api/reference-buildings/[id]` exists for single records; corpus scale needs list/filter/pagination/rate-limiting, which does not exist yet |
| Changelog / release versioning | ResStock names every release (`resstock_amy2018_release_1`) with a dated README; CBECS is versioned by survey year; a corpus without a stated vintage cannot be trusted for a decision made today | LOW–MEDIUM | Dataset schema is already version-stamped (1.3.0); this is a release-level (corpus-snapshot) changelog on top of that, not a new versioning scheme |
| Statement of coverage and known bias | EVERY credible source above states, explicitly, what it does not cover (CBECS's suppression rule, BPD's admitted volunteer-sample skew, Green Together's <200-unit exclusion) | MEDIUM | This is a direct extension of the project's own stated invariant ("no meter series is ingested; every published figure is modeled, and the dataset says so") from one building to a population statement |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes / Dependency |
|---|---|---|---|
| Percentile-within-peer-group position for a building | This is the single most-requested benchmarking feature (ENERGY STAR's 1–100 score is the industry reference point); nothing in the Korean prior art offers it against a per-building, cited, modeled corpus | HIGH | Depends on the Active roadmap item "generate corpus baselines at scale," on the existing degree-day/climate adapter (`ledger-climate.ts`) for weather normalization, and on floor-area normalization the diagnostics engine already does |
| Transparent, adjustable peer-group definition (use type × era × climate region × size class) | TABULA's building-type matrix is the credible precedent; ENERGY STAR's peer group is opaque (a regression, not a named matrix) — a named matrix is more defensible for a Korean professional audience used to era-indexed code tables already | MEDIUM | Reuses `classifyEraExplicit` and `ledger-climate.ts` region mapping directly; no new classification scheme needed, just exposure of the existing one as a filter axis |
| Calibration display against measured anchors, with a stated error band per peer group | This is the feature none of the Korean sources offer and only ResStock/ComStock (±20% vs RECS) and TABULA (named adaptation factor) offer well among the international sources | HIGH | Directly the mechanism named in PROJECT.md: "the measured models are the only way to state how wrong they are." Requires the Active item of growing the anchor set to include buildings with **measured consumption**, not just measured envelopes |
| Confidence tiering by anchor proximity (peer groups near a measured anchor get a tighter stated band; groups with none get an explicit "no calibration anchor" flag rather than a false tight number) | No prior-art system found does this at the *peer-group* level — CBECS suppresses by sample size, TABULA calibrates per country not per matrix cell, ResStock states one national aggregate band. A per-cell honesty flag is a genuine differentiator consistent with the project's assumption-ledger philosophy | HIGH | Depends on both the peer-group feature above and the growing anchor set; this is the most novel and highest-complexity item in this list |
| Modeled/metered/assumption tri-state badge per record and per figure, at population scale (not just per building) | The project already enforces this per-fact via `createEnergyFact`; no prior-art corpus reviewed exposes this distinction at the *record* level in a search/browse UI — BPD blurs it (labeled "measured" while including volunteered/mandate data of uneven quality), CBECS doesn't need to (it's uniformly metered) | MEDIUM | Extends the existing assumption-ledger UI pattern (already built for single-building diagnosis) to the corpus catalogue and API response shape |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic (evidenced) | Alternative |
|---|---|---|---|
| Branding the corpus output as "measured" or population-representative | Sounds more credible/marketable than "modeled" | DOE BPD does exactly this ("largest publicly-available source of measured energy performance data") while its own documentation admits the underlying pool is a volunteered, mandate-driven convenience sample, not a designed sample like CBECS — the label overclaims what the population supports. This is the precise trap PROJECT.md already forbids ("no meter series is ingested... the dataset says so") | Label every corpus record and every aggregate figure with its actual evidence tier (register-stated fact / era-table assumption / calibrated-against-anchor estimate), never a bare "measured" |
| A single clean benchmark score (one number, 1–100) as the headline UI | ENERGY STAR's score is the most recognized pattern in the industry and stakeholders will ask for "our own ENERGY STAR score" | The EnergyStar++ academic critique found the underlying weighted linear regression cannot capture the real nonlinear relationship between energy use and building attributes, and that CBECS strata behind the score are sometimes thin (6,720 buildings split across many use-type/climate cells) — the single number hides both a model-form error and a sample-size problem | Show a range/band alongside any single position (as CBECS shows RSE-derived confidence intervals, not bare point estimates), and suppress or flag any peer-group cell below a stated minimum sample count, mirroring CBECS's "withhold if RSE > 50% or n < 20" rule |
| Publishing only national/aggregate roll-up KPIs (a dashboard of totals, not per-building records) | Aggregates are simpler to build, easier to present as a policy dashboard, and avoid record-level provenance work | The EU Building Stock Observatory does exactly this and, as a direct consequence, cannot place a single building against anything, and cannot reveal *which* buildings within a country typology are driving a national number — it hides intra-country bias by construction | Keep the per-record dataset (already the schema-1.3.0 pattern) as the primary artifact; aggregate views are a read *of* that corpus, never a replacement for it |
| Collapsing an asset (as-designed/simulated) rating and an operational (metered) rating into one merged "performance" figure | Simplifies the UI, avoids explaining two numbers | ASHRAE deliberately keeps Building EQ's "As Designed" and "In Operation" labels **separate** for this reason — merging a simulated potential with an actual bill produces a number that answers neither question honestly. In this project's terms: a register-baseline (assumption-tier) figure and a diagnosed/refined-twin (evidence-tier) figure for the same building must never silently merge into one reported value | Always surface which evidence tier produced a figure (this is already the assumption-ledger's job for a single building); a corpus-scale UI must carry that same tag through search results and API responses, not just the detail page |
| Treating a fixed set of reference/prototype archetypes as if they represent the current stock indefinitely | Reference buildings are cheap to keep using once built, and "the archetype" is a comfortable mental model to reuse | DOE's 90.1 prototype buildings are pinned to a code vintage by design and go stale as the real stock and code both move on — they are useful as compliance baselines, never as a claim about today's population. A corpus without a visible generation date invites exactly that misuse | Every release must carry the changelog/version item above; a corpus snapshot's generation date is not decoration, it's the fact that keeps a stale archetype from being mistaken for a current stock estimate |
| Silently excluding a building class/era/region from the sweep without saying so on the coverage page | Easiest path — quietly narrow scope during implementation rather than stating a limit | Green Together's undisclosed exclusion of small residential buildings from disclosure, and KEA's certification dataset's undisclosed skew toward buildings legally obligated to certify, both let a reader assume broader coverage than exists. The failure is not narrow coverage — CBECS is narrow too — it's narrow coverage **without a stated boundary** | Publish an explicit coverage statement (what building classes/eras/regions are and are not in the current sweep) as a required field of every corpus release, following CBECS's example of publishing its sampling frame alongside the data |

## Feature Dependencies

```
Register sweep feasibility research (Active, already planned)
    └──requires──> Corpus generation at scale (Active)
                       └──requires──> Stable per-record identifier + permalink [table stakes]
                       └──requires──> Provenance/licence per record [table stakes]
                       └──enables───> Bulk download [table stakes]
                       └──enables───> Read-only API [table stakes]

Growing the anchor set with measured-consumption buildings (Active)
    └──requires──> Corpus generation at scale
    └──enables───> Calibration display + error band [differentiator]
                       └──enables───> Confidence tiering by anchor proximity [differentiator]

Peer-group percentile position [differentiator]
    └──requires──> Corpus generation at scale
    └──requires──> Existing climate/degree-day adapter (ledger-climate.ts)
    └──requires──> Existing floor-area normalization (diagnostics engine)
    └──requires──> Transparent peer-group definition [differentiator]

Modeled/metered/assumption badge at record scale [differentiator]
    └──requires──> Existing assumption-ledger pattern (createEnergyFact, single-building UI)
    └──enhances──> Search and filter [table stakes] (badge becomes a filterable/visible facet)

Statement of coverage and known bias [table stakes]
    └──conflicts──> Silent scope-narrowing anti-feature (must replace it, not coexist with it)

Single merged score anti-feature
    └──conflicts──> Modeled/metered/assumption badge (a single blended number destroys the tier distinction the badge exists to preserve)
```

### Dependency Notes

- **Peer-group percentile requires corpus generation at scale:** there is no population to rank a building against until the register-sweep feasibility work (already an Active PROJECT.md item) produces enough records per peer-group cell; this is a hard phase-ordering constraint, not a preference.
- **Calibration display requires the anchor set to include measured-consumption buildings, not just measured-envelope buildings:** the current seven reference models have measured envelopes and material bindings, but PROJECT.md's own Active list separately calls for anchors "with measured consumption" — that is the specific input the calibration feature needs and does not yet have.
- **Bulk download and the API both depend on the same per-record schema work:** building the corpus's stable identifier and provenance fields once, then exposing it through both a bulk export and a paginated API, is cheaper than treating them as separate efforts.
- **The badge feature enhances search/filter rather than requiring new infrastructure:** the assumption ledger already exists for one building; the work is exposing its existing evidence-tier classification as a corpus-wide facet, not inventing a new one.
- **Two anti-features are direct conflicts, not just cautions:** a single merged score and a silently-narrowed coverage statement are both structurally incompatible with the project's existing traceability guarantee (`createEnergyFact`) — they cannot be added later as an "also"; choosing them replaces the guarantee rather than sitting beside it.

## MVP Definition

### Launch With (v1)

Minimum viable product for the repository face — validates that a corpus, not just a single building, can carry the same guarantee.

- [ ] Stable per-record identifier + permalink for every swept building — without this nothing else in the repository is citable
- [ ] Provenance/licence/evidence-tier fields per corpus record, generated by rolling up the existing assumption ledger — this is the guarantee that makes the corpus worth publishing at all
- [ ] Explicit coverage statement (which classes/eras/regions the current sweep covers and does not) — table stakes and the direct fix for the anti-feature pattern seen in Green Together and the KEA BEE dataset
- [ ] A single bulk export (JSON/CSV) of whatever scale the register sweep produces at launch
- [ ] Basic catalogue search/filter by use type, era, region — reuses the existing catalogue endpoint pattern

### Add After Validation (v1.x)

Add once the sweep has produced enough records per cell to make ranking meaningful.

- [ ] Read-only, paginated, filterable API (trigger: bulk export alone proves insufficient once external consumers ask for programmatic access)
- [ ] Changelog / dated release snapshots (trigger: the corpus is regenerated a second time and a consumer needs to know what changed)
- [ ] Peer-group percentile position on a building's report page (trigger: at least one peer-group cell per major use-type/era/region combination has enough records to state a position without a suppression flag)

### Future Consideration (v2+)

Defer until the anchor set and corpus scale both support them.

- [ ] Calibration display with a stated error band per peer group (defer until the anchor set includes measured-consumption buildings, not only measured-envelope ones)
- [ ] Confidence tiering by anchor proximity (defer until calibration display exists — tiering is a refinement of it, not a separate feature)
- [ ] Parquet/bulk-format-at-scale export (defer until record count makes CSV/JSON genuinely unwieldy, following ResStock/ComStock's own move to parquet only once file sizes demanded it)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Stable per-record identifier + permalink | HIGH | LOW | P1 |
| Provenance/licence/evidence-tier per record | HIGH | MEDIUM | P1 |
| Coverage and known-bias statement | HIGH | MEDIUM | P1 |
| Bulk download | MEDIUM | MEDIUM | P1 |
| Catalogue search/filter | MEDIUM | MEDIUM | P1 |
| Read-only paginated API | HIGH | MEDIUM–HIGH | P2 |
| Changelog / release versioning | MEDIUM | LOW–MEDIUM | P2 |
| Peer-group percentile position | HIGH | HIGH | P2 |
| Modeled/metered/assumption badge at corpus scale | HIGH | MEDIUM | P2 |
| Calibration display with stated error band | HIGH | HIGH | P3 |
| Confidence tiering by anchor proximity | MEDIUM | HIGH | P3 |
| Parquet/bulk-at-scale export | LOW (until scale demands it) | MEDIUM | P3 |

**Priority key:**
- P1: Must have for the repository to be taken seriously at all
- P2: Should have, once corpus scale and API demand justify it
- P3: Differentiating but dependent on the anchor set growing beyond today's seven reference models

## Competitor Feature Analysis

| Feature | DOE BPD | ResStock/ComStock | TABULA/EPISCOPE | CBECS/RECS | BIMFIT's Planned Approach |
|---|---|---|---|---|---|
| Per-record identifier/permalink | Yes, anonymized | Yes, per synthetic unit | No (archetype, not individual) | Yes, via microdata case ID | Yes — 건축물대장 PK, already the ledger's id |
| Modeled vs. metered stated per record | Blurred (branded "measured" over a mixed pool) | Modeled, explicitly validated against meters | Modeled, with a named calibration factor | Metered, uniformly | Explicit tri-state badge per record (table stakes above) |
| Stated error band | None | ±20% vs RECS, published | Country-level adaptation factor | RSE + 95% CI + suppression rule | Peer-group-level band, tiered by anchor proximity (v2+) |
| Bulk download / API | Both | Both (parquet/csv + OEDI) | WebTool export only | Microdata + methodology docs | Bulk export at launch, API at v1.x |
| Coverage statement | Implicit bias, not clearly disclosed | Explicit validation partners named | Country-by-country, explicit | Explicit sampling frame + suppression | Explicit coverage page, required at launch |
| Peer-group benchmarking | No | No (it's a generator, not a benchmarking UI) | No (per-archetype only) | Feeds ENERGY STAR's regression, not itself a peer-group tool | Percentile-within-peer-group, transparent matrix definition |

## Sources

- [DOE Building Performance Database overview](https://www.energy.gov/cmei/buildings/building-performance-database-bpd)
- [BPD on OpenEI/OEDI](https://data.openei.org/submissions/145)
- [Building Performance Database, Wikipedia](https://en.wikipedia.org/wiki/Building_Performance_Database)
- [ASHRAE Building EQ program page](https://www.ashrae.org/technical-resources/building-eq)
- [ASHRAE Building EQ Reference Manual](https://www.ashrae.org/file%20library/communities/committees/standing%20committees/building%20energy%20quotient%20committee/buildingeq_referencemanual_10-15-2020.pdf)
- [EU Building Stock Observatory database](https://building-stock-observatory.energy.ec.europa.eu/database/)
- [EU BSO monitoring announcement, European Commission](https://energy.ec.europa.eu/news/eu-building-stock-observatory-monitoring-energy-performance-buildings-across-europe-2023-08-31_en)
- [TABULA/EPISCOPE Building Typology](https://episcope.eu/building-typology/)
- [TABULA WebTool](https://episcope.eu/building-typology/tabula-webtool/)
- [TABULA Common Calculation Method PDF](https://episcope.eu/fileadmin/tabula/public/docs/report/TABULA_CommonCalculationMethod.pdf)
- [ComStock overview, NREL](https://www.nrel.gov/research/software/comstock)
- [ResStock 2024 Release 2 technical documentation](https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2024/resstock_tmy3_release_2/resstock_documentation_2024_release_2.pdf)
- [ResStock 2025 Release 1 README](https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/resstock_amy2018_release_1/README_resstock_20251.pdf)
- [ResStock GitHub](https://github.com/NREL/resstock)
- [ComStock GitHub](https://github.com/NREL/ComStock)
- [OpenEI Commercial Reference Buildings wiki](https://openei.org/wiki/Commercial_Reference_Buildings)
- [DOE/PNNL U.S. Commercial Reference Buildings report](https://docs.nrel.gov/docs/fy11osti/46861.pdf)
- [EIA CBECS overview](https://www.eia.gov/consumption/commercial/)
- [EIA "What is an RSE"](https://www.eia.gov/consumption/commercial/data/what-is-an-rse.php)
- [ENERGY STAR: How the 1–100 score is calculated](https://www.energystar.gov/buildings/benchmark/understand-metrics/how-score-calculated)
- [ENERGY STAR Score technical reference PDF](https://portfoliomanager.energystar.gov/pdf/reference/ENERGY%20STAR%20Score.pdf)
- [EnergyStar++ critique, arXiv](https://arxiv.org/pdf/1910.14563)
- [한국에너지공단_건축물 에너지 효율등급 정보, 공공데이터포털](https://www.data.go.kr/data/15100521/openapi.do)
- [한국에너지공단_건물에너지진단정보DB구축 사업 통계, 공공데이터포털](https://www.data.go.kr/data/15105239/fileData.do)
- [국토교통부_건축HUB_건물에너지정보 서비스, 공공데이터포털](https://www.data.go.kr/data/15135963/openapi.do)
- [녹색건축포털 그린투게더](https://www.greentogether.go.kr/)
- [False precision, Wikipedia (concept reference)](https://en.wikipedia.org/wiki/False_precision)
- [FAIR Guiding Principles, Scientific Data (Nature)](https://www.nature.com/articles/sdata201618)
- `.planning/PROJECT.md` (BIMFIT v6.0 milestone context, existing feature inventory and constraints)

---
*Feature research for: Korean building energy repository / building-stock corpus capability*
*Researched: 2026-09-15*
