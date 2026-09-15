# Roadmap: BIMFIT — Korean Building Energy Repository

## Milestones

- 🚧 **v6.0 Building Energy Repository** — Phases 1-5 (in progress)
- ✅ **v5.0 Energy Systems Observability & Control** — Phases 22-28 (shipped 2026-04-12)
- ✅ **v4.0 GIS-Composite Realistic Drafts** — Phases 19-21 (shipped 2026-04-12)
- ✅ **v3.0 UX Workflow Overhaul** — Phases 14-18 (shipped 2026-03-31)
- ✅ **v2.0 Advanced BIM Authoring** — Phases 10-13 (shipped 2026-03-28)
- ✅ **v1.0 Procedural BIM Viewer** — Phases 1-9 (shipped 2026-03-26)

**Superseded plans (2026-09-15):** The prior "v6.0 Audit Deliverables" (undo/redo, element IDs,
annotations, auto-views, schedules, PDF sheets, phases 29-34) and "v7.0 Prediction" (portfolio
forecasting via trained model and Parquet releases, phases 35-40) both stalled in April 2026 and
are superseded. Their dataset-release idea is absorbed into this milestone's Publishing phase;
their ML/BIM-authoring approaches are not. Records archived under
`milestones/v6.0-audit-superseded-ROADMAP.md`, `milestones/v6.0-audit-superseded-REQUIREMENTS.md`
and `milestones/v6.0-audit-superseded-phases/` — not deleted.

**Phase numbering reset:** This milestone reclaims the v6.0 number and restarts phase numbering
at 1 (a deliberate product decision, not a numbering bug — see PROJECT.md Key Decisions). Phases
1-5 below belong to v6.0 Building Energy Repository and are unrelated to the legacy phases 1-28
from the shipped v1.0-v5.0 milestones archived further down this file.

## v6.0 Building Energy Repository (Phases 1-5)

**Milestone Goal:** Turn BIMFIT from a single-building diagnosis tool into a building energy
repository — a calibrated corpus of Korean building baselines is the product, the measured
reference models are its calibration anchors, and the retrofit panel reports honest energy,
carbon and corpus position instead of proxy-priced return. Peer-group benchmarking and
calibration error bands are next-milestone scope (see REQUIREMENTS.md "Next Milestone") because
both have hard upstream dependencies this milestone creates rather than satisfies.

- [ ] **Phase 1: Honest Physics** - Fix the delivered-energy split so lighting and PV measures move the modeled grade, not only cash flow; converge the two economics paths; regenerate the seven published datasets
- [ ] **Phase 2: Retrofit Panel** - Replace the return-focused panel with energy, carbon and verification guidance, priced only off real modeled savings
- [ ] **Phase 3: Model Anchors** - Collapse the two hand-synced model registries into one and grow the anchor set with Korean, typology-gap and further-licensed buildings
- [ ] **Phase 4: Corpus Generation** - Measure register-sweep feasibility with a real pilot, then generate corpus baselines at scale with per-record provenance built in from the start
- [ ] **Phase 5: Publishing** - Publish versioned corpus releases with bulk export, a read-only filterable API and a data dictionary, gated by a licence and privacy review

## Phase Details

### Phase 1: Honest Physics
**Goal**: Every measure that changes lighting or renewable generation moves the building's modeled energy intensity and efficiency grade, not only its cash flow — and the same building returns the same retrofit result no matter which page computed it
**Depends on**: Nothing (first phase)
**Requirements**: PHYS-01, PHYS-02, PHYS-03, PHYS-04, PHYS-05
**Success Criteria** (what must be TRUE):
  1. Applying an LED/lighting retrofit changes the building's modeled energy intensity and efficiency grade, not only its cash flow
  2. Applying a photovoltaic system changes primary energy and efficiency grade, not only its cash flow
  3. When lighting power density or PV capacity is unknown, the resulting figure displays as a named, visible assumption, never a silent default
  4. The same building priced from the twin and from the diagnostics page returns identical retrofit results
  5. All seven published reference-building datasets are regenerated under the corrected physics, with a raised schema version and a changelog entry recording the change
**Plans**: 5 plans

Plans:
- [ ] 01-01-PLAN.md — Tracer: named end-use fuel split and a real lighting load reach both the grade intensity and the on-screen site intensity
- [ ] 01-02-PLAN.md — One resolved ClimateRegion wired to all nine consumers; regionalized cooling fields; an unresolvable region refuses
- [ ] 01-03-PLAN.md — Photovoltaic generation reaches primary energy and the grade; clipped surplus reported; a zero capacity stated as an assumption
- [ ] 01-04-PLAN.md — Twin and diagnostics converge on one shared retrofit core, enforced by a build-failing parity contract test
- [ ] 01-05-PLAN.md — Schema version raised, limitation statements rewritten in place, changelog and seven-building before-and-after evidence

### Phase 2: Retrofit Panel
**Goal**: The retrofit panel reports honest energy, carbon and verification guidance for the work the user selected, priced only off savings the engine actually produced
**Depends on**: Phase 1 (needs honest physics and converged economics before the panel can honestly report them)
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05
**Success Criteria** (what must be TRUE):
  1. User sees the energy intensity and carbon outcome, before and after, for the retrofit work they selected
  2. User sees which inputs behind that outcome are measured versus assumed, with guidance on what to verify before committing capital
  3. Every currency figure shown traces to a modeled saving the engine actually produced
  4. The panel has a defined, visible slot reserved for corpus position, ready to receive next milestone's benchmarking feature without a redesign
  5. The unreachable budget slider component and the unused default-budget constant no longer exist in the codebase
**Plans**: TBD
**UI hint**: yes

### Phase 3: Model Anchors
**Goal**: The reference-model roster has one source of truth that every consumer reads, and it has grown to include Korean, typology-gap and further-licensed buildings — with an honest statement wherever no measured-consumption anchor exists
**Depends on**: Nothing (independent of Phases 1-2; parallel-eligible with the physics/panel/corpus track)
**Requirements**: ANCH-01, ANCH-02, ANCH-03, ANCH-04, ANCH-05, ANCH-06, ANCH-07
**Success Criteria** (what must be TRUE):
  1. Every gallery card figure is derived from that building's generated manifest; none is a hand-typed literal
  2. A contract test checks every gallery card against its manifest, not only the clinic
  3. At least one Korean building, one typology-gap building and one further licensed-source building are registered as reference models at the same evidence standard as the existing seven
  4. A recorded finding states whether Korean metered-energy sources will license data for calibration, and on what terms
  5. Wherever a measured-consumption anchor would otherwise be implied, the product instead states explicitly that none exists
**Plans**: TBD
**UI hint**: yes

### Phase 4: Corpus Generation
**Goal**: Corpus baselines are generated at scale by a resumable batch job that reuses the app's own physics chain, with quota and field-completeness established by a real pilot before full-scale generation runs, and every record carrying its own provenance, licence and evidence tier from the moment it is created
**Depends on**: Phase 1 (the physics fix must land first — the already-published datasets encode the old flaw, and a corpus generated before the fix would need regenerating)
**Requirements**: SWEEP-01, SWEEP-02, SWEEP-03, SWEEP-04, SWEEP-05, SWEEP-06, SWEEP-07
**Success Criteria** (what must be TRUE):
  1. A recorded measurement states the register's actual request quota and field-completeness rate, taken from a real bounded pilot sweep
  2. Corpus baselines are generated by a resumable batch job that reuses the same energy chain the interactive app uses, with no second implementation — and full-scale generation does not start until the pilot's findings are in (a route/generator skeleton may be built and tested on a handful of buildings beforehand)
  3. Every corpus record carries its engine version, schema version, source commit, pinned generation time, provenance and evidence tier, assembled during generation rather than added afterward
  4. A register row that cannot support a baseline is recorded as a logged exclusion with a reason, never filled with a population average, and each release carries a table of how prevalent each named assumption is across its records
  5. Every corpus record has a stable identifier and a permalink that returns that record later
**Plans**: TBD

### Phase 5: Publishing
**Goal**: The corpus is published as versioned, dated releases with a bulk export, a read-only filterable API and a public data dictionary, stating what it covers and what it does not — gated by a licence and privacy review before anything ships
**Depends on**: Phase 4 (needs real corpus records to publish, store and version)
**Requirements**: PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-07, PUB-08, PUB-09
**Success Criteria** (what must be TRUE):
  1. Every release states which building classes, eras and regions it covers and which it does not
  2. User can download the whole corpus in one export, and can search and filter it by use type, era and region
  3. A read-only API returns corpus records with filtering and pagination, documented by a public data dictionary covering every field and its unit
  4. Releases are dated, versioned snapshots with a changelog stating what changed since the prior release, and corpus artifacts are stored outside the git repository
  5. Before first publish, a recorded decision states the licence for register-derived records separately from the curated models' licences, and any statement about the pipeline's internal consistency stays textually separate from any statement about accuracy against the Korean building stock
**Plans**: TBD
**UI hint**: yes

## Phases

<details>
<summary>✅ v5.0 Energy Systems Observability & Control (Phases 22-28) — SHIPPED 2026-04-12</summary>

- [x] Phase 22: MEP Sub-Layer Foundation (3/3 plans) — completed 2026-04-12
- [x] Phase 23: Per-Floor Energy Model (2/2 plans) — completed 2026-04-12
- [x] Phase 24: Energy Breakdown Dashboard (2/2 plans) — completed 2026-04-12
- [x] Phase 25: Energy Consumption Heatmap (1/1 plan) — completed 2026-04-12
- [x] Phase 26: Equipment Info Panel (2/2 plans) — completed 2026-04-12
- [x] Phase 27: ECO2 Sub-System Export (1/1 plan) — completed 2026-04-12
- [x] Phase 28: Procedural MEP Equipment Models (5/5 plans + gap-wiring) — completed 2026-04-12

</details>

<details>
<summary>✅ v4.0 GIS-Composite Realistic Drafts (Phases 19-21) — SHIPPED 2026-04-12</summary>

- [x] Phase 19: Coordinate System Foundation (2/2 plans) — completed 2026-04-11
- [x] Phase 20: Footprint Extrusion (3/3 plans) — completed 2026-04-11
- [x] Phase 21: Composite Pipeline (2/2 plans) — completed 2026-04-12

</details>

<details>
<summary>✅ v3.0 UX Workflow Overhaul (Phases 14-18) — SHIPPED 2026-03-31</summary>

- [x] Phase 14: Workflow State Foundation (3/3 plans) — completed 2026-03-29
- [x] Phase 15: Workspace Shell Layout (2/2 plans) — completed 2026-03-30
- [x] Phase 16: Contextual Toolbar Migration (3/3 plans) — completed 2026-03-30
- [x] Phase 17: Panel Content + Workflow Stepper (5/5 plans) — completed 2026-03-30
- [x] Phase 18: Guidance + Energy Feedback (3/3 plans) — completed 2026-03-31

</details>

<details>
<summary>✅ v2.0 Advanced BIM Authoring (Phases 10-13) — SHIPPED 2026-03-28</summary>

- [x] Phase 10: 2D Plan View Engine (1/1 plans) — completed 2026-03-28
- [x] Phase 10.1: QA Testing & BIM Accuracy (3/3 plans) — completed 2026-03-28
- [x] Phase 11: Room Boundaries + 3D Extrusion (3/3 plans) — completed 2026-03-28
- [x] Phase 12: Snap & Alignment System (2/2 plans) — completed 2026-03-28
- [x] Phase 13: Structural Analysis Visualization (2/2 plans) — completed 2026-03-28

</details>

<details>
<summary>✅ v1.0 Procedural BIM Viewer (Phases 1-9) — SHIPPED 2026-03-26</summary>

- [x] Phase 1: Dashboard Layout Redesign
- [x] Phase 2: Structural 3D Components
- [x] Phase 3: Better Textures & Materials
- [x] Phase 4: Procedural Generation Engine
- [x] Phase 5: 10-Layer Building Systems Visualization
- [x] Phase 6: Interactive Configuration Panel
- [x] Phase 7: Energy Calculation & ECO2 Export
- [x] Phase 8: BIM Authoring Tools
- [x] Phase 9: Energy Data Integration

</details>

## Progress

**Execution order (v6.0):** Phase 1 → Phase 2; Phase 3 runs independently in parallel; Phase 1 → Phase 4 → Phase 5.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Honest Physics | 0/5 | Planned | - |
| 2. Retrofit Panel | 0/TBD | Not started | - |
| 3. Model Anchors | 0/TBD | Not started | - |
| 4. Corpus Generation | 0/TBD | Not started | - |
| 5. Publishing | 0/TBD | Not started | - |
