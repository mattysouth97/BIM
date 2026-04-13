# Plan: BIM Fidelity Strategy — Showcase Building Grade Agreement

- Source spec: `.omc/specs/deep-interview-bim-fidelity-strategy.md`
- Mode: ralplan consensus (SHORT, not deliberate)
- Scope: ONE showcase building, architecturally portfolio-ready
- Primary acceptance bar: predicted ECO2 grade == certified 에너지아이 grade (C1)
- **Version: v2 (Architect iteration 2 — minimum-change revisions applied)**

---

## 1. RALPLAN-DR Summary

### Principles (governing rules for every step)

1. **GX engineer rules win.** Every design choice is evaluated by whether it
   increases trust from a GX energy engineer comparing our predicted grade to
   the certified 에너지아이 grade. Demo polish, executive visuals, and
   external credibility do not tie-break anything.
2. **Extend, do not rebuild.** The procedural generator
   (`src/lib/procedural/*`), `korean-building-codes.ts`, VWorld footprint
   pipeline, `fidelity-assessor.ts`, and `eco2-export.ts` already exist and
   carry institutional knowledge. All new work is surgical additions or
   overrides on these; no parallel systems.
3. **One building, portfolio-safe.** Any per-building handcraft must live
   behind a named data seam keyed by PNU or buildingPk. If a step hardcodes
   "the showcase" anywhere in core pipeline code (not data), it is wrong.
4. **Public data is the spine.** PNU + address drives the default path.
   Enrichment (manual, CAD, IFC) is a layer, not a prerequisite. A failing
   public-data run is a valid output (C5 gap analysis), not a bug.
5. **Grade-truth beats kWh-truth.** We target the ECO2 grade bucket, not the
   measured kWh. Calibration-to-kWh, scenario deltas, and ranking-preservation
   are explicitly out. If a step starts chasing kWh it is out of scope.

### Decision Drivers (top 3 forces shaping the plan)

1. **Grade agreement is categorical and n=1.** C1 either passes or fails for
   one building. There is no partial credit, so the plan must expose *which*
   inputs flipped the bucket when it fails, and must make those inputs
   individually overridable without editing code.
2. **The showcase is not chosen yet (R1).** We cannot design envelope /
   HVAC / WWR defaults against specific building quirks today. The architecture
   has to absorb whatever certified 에너지아이 building is picked in Step 1
   without re-plumbing.
3. **Existing code already encodes most fidelity axes.** Geometric LOD lives
   in `procedural/*`, semantic fields in `korean-building-codes.ts` +
   `material-types.ts`, positional in VWorld + `proj4`, fidelity scoring in
   `src/lib/fidelity/*`. We are closing the **geometric-LOD gap** flagged in
   the spec ("existing fidelity levels track data breadth, not model detail")
   and the **HVAC string-mapping gap** at `eco2-export.ts:22`, not inventing a
   new fidelity framework.

### Viable Options for the Critical Architectural Choice

**Critical choice:** *How does per-showcase overrides/enrichment enter the
pipeline without hardcoding the showcase building into core code?*

#### Option A — Override file keyed by buildingId (default: PNU), layered on inferred materials

Introduce `src/data/building-calibrations/{buildingId}.json` (plus a loader
`src/lib/fidelity/building-calibration-loader.ts`). The calibration file
contains the partial `MaterialProperties` delta plus an optional
`certifiedGrade` field and per-override `rationale` metadata. A default
resolver sets `buildingId = pnu` today; the seam is opened so future
non-PNU sources (e.g. arbitrary operator-uploaded building) can key by the
same identifier without refactor. `material-inference.ts` merges the
calibration on top of era+code inference; when absent, behavior is identical
to today. A manifest lists all known buildingIds.

- Pros:
  - Zero hardcoding in core code — only data files keyed by buildingId.
  - Extends trivially to portfolio: adding building B = adding
    `{buildingIdB}.json`.
  - Clean provenance trail for C3 (fidelity manifest can stamp each field
    with `source: "calibration" | "inferred" | "vworld" | "ledger"`).
  - Existing `MaterialProperties` shape already accepts partial overrides via
    `material-store.ts` pattern — this is idiomatic.
  - **Folder name "building-calibrations" signals intent** (calibration data
    applied to public-data inference, not "showcase truth"); futureproof.
- Cons:
  - Still per-building handcraft; scale to 1k+ implies more calibrations. The
    spec accepts this for now but it defers a larger "data-sourcing pipeline"
    decision.
  - JSON is flat; complex per-floor or per-orientation overrides could become
    verbose. Mitigation: mirror the nested shape of `MaterialProperties`.

#### Option B — Override via Zustand `material-store` runtime edits, persisted per PNU

Extend the existing runtime material-override store so edits are keyed by
PNU and persisted to localStorage / server blob. The showcase building is
just a "pre-seeded" set of edits.

- Pros:
  - Reuses existing `material-store.ts` and GX-facing UI for overrides.
  - GX engineer can tune in-app and see grade change interactively.
- Cons:
  - Overrides live in client state, not in the repo. Breaks reproducibility:
    two developers run the same PNU and get different ECO2 exports.
  - CI cannot pin a known-good baseline for C1 regression.
  - Portfolio path requires a sync mechanism (server storage) that is NOT
    in scope.

#### Option C — Hardcode showcase as a named recipe in `procedural/recipe.ts`

Add `getShowcaseRecipe()` branches that special-case the chosen building.

- Pros:
  - Fastest to implement.
- Cons:
  - **Violates Principles 2 and 3.** Directly hardcodes showcase into core
    pipeline code. Every additional building requires a code change. Fails
    C2 (extensibility smoke test) by construction.
  - *Invalidated — will not be pursued.*

**Selected: Option A** (file-based calibrations keyed by buildingId, default
resolver `buildingId = pnu`). Rationale: it is the only option that
satisfies C1 *and* C2 without introducing out-of-scope infrastructure
(server storage for B, code edits per building for C), and it gives the
Critic a reproducible artifact to verify. The `buildingId` indirection is
~5 lines of code today and opens a seam for future non-PNU sources.

---

## 2. Implementation Steps

Each step cites files and maps to acceptance criteria. Target is 6 steps.

### Step 1 — Select the showcase building and capture its ground truth (resolves R1)

Maps to: **C1, C5, R7, blocks all downstream steps.**

- GX team names **one** real building with a **publicly-certified 에너지아이
  grade** (required — without it C1 is not measurable per spec line 46). PNU
  and certificate PDF must be in hand.
- Create `.omc/research/showcase-building.md` recording: building name, PNU
  (19-digit), address, certified grade (A++ … E), certificate issue date,
  certificate source URL, sigunguCd/bjdongCd, and a one-line justification
  ("why this building").
- **Grade vocabulary (R7 closure):** record the certified grade in **two
  forms**: (a) the original Korean label as it appears on the certificate
  (e.g. "1등급"), and (b) its `EnergyGrade` enum value via
  `src/lib/energy/energy-grade.ts`. Both must be stored.
- Verify it resolves in existing pipelines: `/api/bldrgst/title`,
  `/api/bldrgst/floors`, `/api/bldrgst/basis`, `/api/vworld/footprint` each
  return non-empty payloads for the PNU. Capture raw responses to
  `.omc/research/showcase-raw/*.json` as a CI fixture.
- Acceptance:
  - A human-readable markdown file + raw JSON fixtures exist.
  - The certified grade is recorded as an `EnergyGrade` enum value **AND**
    its original Korean label.
  - A unit test asserts the two normalize to the same `EnergyGrade` bucket
    via `src/lib/energy/energy-grade.ts` (new
    `src/lib/energy/__tests__/energy-grade-normalization.test.ts` or
    extension of an existing test file).

**Blocks:** Steps 2, 3, 4, 5. **Does NOT block:** Step 6 (C6 regression scaffolding).

### Step 2 — Build the per-buildingId calibration + fidelity manifest seam (with GeometricLOD type)

Maps to: **C2, C3, C5.**

- New module: `src/lib/fidelity/building-calibration-loader.ts` exporting
  `loadCalibration(buildingId: string): CalibrationFile`, where
  `CalibrationFile = { certifiedGrade?: EnergyGrade, materialOverrides: Partial<MaterialProperties>, overrideRationales: Record<string, OverrideRationale> }`.
  Returns `{ materialOverrides: {}, overrideRationales: {} }` when no file
  exists — this is the "building B, no calibration" path that proves C2.
  Default resolver: `buildingId = pnu` (exposed as a pure helper
  `resolveBuildingId(input): string`, ~5 lines).
- New data dir: `src/data/building-calibrations/` (renamed from prior
  `showcase-overrides/` to signal intent — see Principles). One file per
  known buildingId. For the showcase only, prepopulate the file after
  Step 3 establishes which fields need pinning.
- **New types module: `src/lib/fidelity/fidelity-types.ts`** (declared here
  in Step 2, consumed by Step 4). This module exports TWO distinct types:
  - `FidelityLevel` — existing data-source-breadth classification (L1/L2/L3
    based on what `fidelity-assessor.ts` currently scores).
  - `GeometricLOD` — **new, distinct** type for model detail:
    - `L1` = era defaults only (no ledger data applied)
    - `L2` = ledger-driven (current procedural output: heights, floor count,
      roof shape from 건축물대장)
    - `L3` = per-orientation WWR + explicit footprint polygon + per-floor
      heights pulled from calibration overrides
  - The two types are **independent**; a building can be `FidelityLevel.L3`
    (rich data) but `GeometricLOD.L2` (no geometric refinement applied yet),
    and vice versa. The manifest carries both.
  - Also declare `OverrideRationale` here (consumed by Step 5):
    ```ts
    interface OverrideRationale {
      field: string;                // dotted path, e.g. "walls.uValue"
      inferredValue: unknown;       // what era+code inference produced
      overrideValue: unknown;       // what the calibration sets
      source: string;               // "건축물대장:frstRegstrGbCd", "permit-drawing-A3", "operator-self-report", "manufacturer-spec-sheet", …
      hypothesisForInference: string; // narrative: "if we could infer from X, we wouldn't need this override"
    }
    ```
- New module: `src/lib/fidelity/fidelity-manifest.ts` exporting
  `buildFidelityManifest(recipe, materials, sources)` producing the structure
  required by C3: `{ fidelityLevel: FidelityLevel, geometricLOD: GeometricLOD, semanticFields: Array<{ name, value, source, confidence }>, positionalAccuracy, gapAnalysis }`.
  Each field stamped with `source: "calibration" | "inferred" | "ledger" | "vworld" | "default"`.
- Wire manifest into an existing UI surface. Prefer extending
  `src/lib/fidelity/fidelity-assessor.ts` so the existing data-breadth
  assessment and the new geometric-LOD + per-field-provenance assessment
  compose; do **not** duplicate `FidelityReport`.
- Acceptance:
  - Unit test loads the showcase buildingId, gets calibration material
    deltas and rationales; loads a second made-up buildingId, gets empty
    calibration.
  - Manifest serializes to valid JSON with all C3 fields populated,
    including both `fidelityLevel` and `geometricLOD` independently.
  - `GeometricLOD` type is exported from `fidelity-types.ts` and imported
    (not redefined) by Step 4's recipe changes.

**Depends on:** Step 1. **Parallelizable with:** Step 3 (seam shape can be
designed from `MaterialProperties` type alone).

### Step 3 — Close the HVAC string-mapping gap and ECO2 input completeness (C4, R3)

Maps to: **C4.**

- Resolve the TODO at `src/lib/energy/eco2-export.ts:22`. Concretely:
  - Enumerate the exact HVAC `systemType`, `fuelType`, `coolingSystemType`,
    `dhwSystemType` string values that `materials.hvac.*` can emit today
    (grep `material-inference.ts`, `korean-building-codes.ts`,
    `equipment-specs.ts`).
  - Produce a lookup table `src/lib/energy/eco2-hvac-codes.ts` mapping each
    to the ECO2/KS F 1900 string the GX auditor validates against. Unknown
    values map to `"UNKNOWN"` and produce a warning in the manifest, not a
    silent pass.
- **TWO required validations (Architect ITERATE):**
  - **(a) GX-auditor sign-off.** Add a line in
    `.omc/research/showcase-building.md`: "HVAC mapping table reviewed by
    {name} on {date}." This closes R3 for the auditor-trust dimension.
  - **(b) Round-trip schema validation test.** Required in addition to (a):
    - Search the repo for an ECO2 sample/schema (`src/lib/energy/__tests__/**`
      fixtures, `src/lib/energy/eco2-import.ts` inverse path, any
      `.omc/research/eco2-*.json`).
    - **If a sample exists:** export ECO2 JSON for the showcase with the new
      HVAC mapping; run it through the actual ECO2 input parser (or schema
      validator against the known sample); assert values are accepted as
      valid KS F 1900 codes.
    - **If no sample exists:** the minimum acceptable posture is —
      (i) explicitly flag in `.omc/research/showcase-building.md` that HVAC
      mapping is validated against a single source (the auditor), AND
      (ii) add a C1-regression test: `eco2-hvac-codes.test.ts` that
      snapshots the mapping table and fails CI if the table changes without
      a corresponding calibration-file update in
      `src/data/building-calibrations/` (prevents silent regression between
      mapping-table edits and the showcase's pinned grade).
- Extend `buildSubSystems()` in `eco2-export.ts` to read from the new
  mapping, and add a `completenessCheck()` helper that returns the list of
  required ECO2 fields that are missing or `"UNKNOWN"`.
- Acceptance: `pnpm test` passes a new `eco2-export.test.ts` case asserting
  zero missing fields for the showcase building; JSON exported from the
  showcase passes (a) schema check if sample exists, or (b) the mapping
  snapshot + calibration consistency test if not.

**Depends on:** Step 1 (need showcase to exercise real values).
**Parallelizable with:** Step 2.

### Step 4 — Geometric LOD escalation path for the showcase (closes the "Level-2→Level-3 geometric refinement" gap)

Maps to: **C1, C3.**

- The spec's **critical gap** (line 109) is that no geometric-LOD refinement
  exists. The plan's minimum viable close:
  - Add a `geometricRefinement` field to `BuildingRecipe`
    (`src/lib/procedural/types.ts`) carrying: `wwrOverridesByOrientation?`,
    `floorHeightOverridesByFloor?`, `footprintPolygon?` (already supported
    via VWorld, make it explicit in the manifest), `roofShapeOverride?`.
  - `recipe.ts` honors `geometricRefinement` after era+use defaults are
    applied, so the calibration layer (Step 2) can push refined values in.
  - Consume the `GeometricLOD` type **declared in Step 2's
    `fidelity-types.ts`** (no redefinition here). The three L1/L2/L3
    semantics are already fixed in Step 2.
- Do **not** add balconies, interior geometry, window subdivisions, or MEP
  detail (explicit non-goals, spec lines 52, 82).
- Acceptance: rendering the showcase with no calibration still uses today's
  L2 output; rendering with calibration produces different WWR visible in a
  scene-tree snapshot test, and the manifest's `geometricLOD` field flips
  from L2 → L3.

**Depends on:** Step 2 (needs both the calibration seam AND the
`GeometricLOD` type declaration).

### Step 5 — End-to-end grade agreement run + calibration iteration loop (C1, C5)

Maps to: **C1, C5.**

- Add a CLI-or-test harness `src/lib/energy/__tests__/showcase-grade-agreement.test.ts`:
  1. Load showcase buildingId public data from Step 1 fixtures (no live API).
  2. Run `material-inference` + calibration-loader + `recipe` +
     `energy-metrics` + `eco2-export`.
  3. Assert `metrics.grade === calibration.certifiedGrade` (both normalized
     through `EnergyGrade` per Step 1).
  4. On mismatch, emit a structured **gap report** (which field, current
     value, source, candidate enrichment) — this is the C5 "valid output,
     not a failure" artifact.
- Expose the same run behind a `/api/fidelity/showcase-report` route or a
  page surface that renders the manifest from Step 2. Choose whichever is
  lighter weight given current `workspace-shell.tsx` wiring.

#### Calibration iteration loop (Architect ITERATE — tightened)

When the harness reports a grade mismatch, populate
`src/data/building-calibrations/{buildingId}.json` using the following
rules. These rules are binding: the harness fails CI if calibration entries
violate them.

- **(a) Sensitivity ordering.** Attempt overrides in this order, adding at
  most one category per iteration:
  1. **Envelope U-values** (walls, roof, floor, windows) — largest grade
     lever per spec's ~25 fields.
  2. **HVAC efficiency** (system COP/efficiency, DHW efficiency).
  3. **WWR** (window-to-wall ratio overrides by orientation).
  4. **Occupancy** (density, schedule if supported).
  5. **Lighting power density** (LPD).
  Rationale: this ordering reflects which fields dominate ECO2's grade
  calculation for Korean office/residential typologies. Cite the spec's
  ~25 semantic fields list.
- **(b) Stopping rule.** If 5 individually-cited overrides do not flip the
  predicted grade to the certified bucket, declare the run a **C5 gap
  output** and stop. Do not continue adding overrides. The iteration
  terminates with C1 marked **UNREACHED** and C5 as the deliverable.
- **(c) Source-of-truth rule.** Each override's `overrideValue` must come
  from a specific source document: 건축물대장 field, permit drawing,
  operator self-report, manufacturer spec sheet, or a cited GX-engineer
  knowledge claim. **Back-calculation from the target grade is forbidden
  — overrides chosen to make C1 pass by fitting the number are tautological
  and invalid.** The harness inspects each override's `source` field and
  fails CI if `source` is empty, `"backfit"`, `"tuned"`, or similar.
- **(d) Rationale schema on every override.** Every override in
  `{buildingId}.json` must include an `OverrideRationale` entry (schema
  declared in Step 2):
  ```json
  {
    "field": "walls.uValue",
    "inferredValue": 0.47,
    "overrideValue": 0.28,
    "source": "permit-drawing-A3 sheet 4 insulation schedule",
    "hypothesisForInference": "if material-inference.ts could read insulation-thickness from permit OCR, it would produce ~0.28 for this era+structure"
  }
  ```
  The loader validates schema presence; the harness fails CI on any
  missing or malformed entry.

#### Step 5.5 — Inference gap digest (handoff, not execution)

- After C1 passes **or** the stopping rule in (b) triggers, emit
  `.omc/research/showcase-inference-gaps.md` listing every override's
  `hypothesisForInference` verbatim, grouped by category (envelope / HVAC /
  WWR / occupancy / lighting).
- This file is the **handoff artifact** for a future iteration that updates
  `src/lib/data-enrichment/material-inference.ts` to close these inference
  gaps structurally.
- **Scope guard:** do NOT execute `material-inference.ts` changes in this
  iteration. Emitting the digest is the only Step 5.5 deliverable.

#### R5 Gate (explicit decision rule, not narrative)

- After the stopping rule in (b) triggers, the iteration terminates with
  C5 gap output as the deliverable and C1 marked **UNREACHED**.
- The plan does **NOT** expand scope to CAD/IFC within this iteration.
  A follow-up spec is required before any CAD/IFC enrichment work begins.
- This is a declarative rule: the PR description must state either "C1
  PASSED with N overrides" or "C1 UNREACHED — stopping rule triggered at
  5 overrides, C5 digest emitted, follow-up spec required."

- Acceptance: test passes for the showcase (C1) **or** the gap report +
  `showcase-inference-gaps.md` digest are produced and enumerate the
  exact fields that need enrichment (C5 partial pass + clear next action).
  Both outcomes are acceptable for this iteration; the spec explicitly
  names C5 gap output as valid (line 63).

**Depends on:** Steps 2, 3, 4.

### Step 6 — Extensibility smoke test + no-regression gate (C2, C6)

Maps to: **C2, C6.**

- **Extensibility (strengthened per Architect ITERATE).** Add a second test
  case in the same harness that runs the full pipeline for a *different*
  buildingId that has no calibration file. Assert:
  - Pipeline runs to completion, produces an ECO2 export JSON, produces a
    fidelity manifest.
  - No code changes allowed to pass this test beyond adding the buildingId
    constant.
  - **NEW:** The run for building B must emit a **non-empty
    `gapAnalysis`** field in the manifest listing fields that inference
    could not determine with high confidence. A completed-but-empty
    `gapAnalysis` fails the test. This proves the architecture is honest
    about what it doesn't know — the portfolio-readiness signal.
- Regression: run `pnpm build` + `pnpm lint` + targeted smoke of the four
  routes named in C6 (`/api/bldrgst/*`, `/api/vworld/footprint`, procedural
  building render via existing snapshot test, 3D viewer load via existing
  test). Gate merge on these. Explicitly **skip** `/api/energy/consumption`
  per spec line 64 and flag in the risk log (R2).
- Acceptance: CI green on both new tests and existing suite; PR description
  lists grade-agreement outcome (C1 PASSED / UNREACHED per R5 gate) and any
  fields in the gap report / `gapAnalysis`.

**Depends on:** Step 5 (test harness exists).

---

## 3. Test Plan (per-criterion verification)

| Criterion | Verification | File/Location |
|-----------|-------------|---------------|
| **C1 — Grade agreement** | `showcase-grade-agreement.test.ts` asserts `metrics.grade === certifiedGrade` (both normalized via `EnergyGrade`) for the showcase buildingId. Failure produces a gap report + `showcase-inference-gaps.md` digest, not a silent pass. R5 gate terminates with C5 deliverable if stopping rule triggers. | `src/lib/energy/__tests__/showcase-grade-agreement.test.ts` |
| **C2 — Extensibility smoke** | Same harness runs a second buildingId with no calibration file, asserts pipeline completes end-to-end **AND emits non-empty `gapAnalysis`**. No code change between runs (git diff of `src/**/*.ts` shows only data additions). | Same file, second `describe` block |
| **C3 — Fidelity inventory** | Unit test on `buildFidelityManifest()` asserts output contains both `fidelityLevel` and `geometricLOD` (independent), per-field `source`, `positionalAccuracy`, and non-empty `gapAnalysis` when inference confidence is low. Visual check: the manifest is rendered somewhere in the app (fidelity tab or report stage). | `src/lib/fidelity/__tests__/fidelity-manifest.test.ts` |
| **C4 — ECO2 input completeness** | `eco2-export.test.ts` asserts `completenessCheck(exportJson)` returns empty array for the showcase. HVAC mapping closed via **TWO validations**: (a) GX-auditor sign-off in showcase research doc, (b) round-trip schema test OR mapping-table snapshot + calibration-consistency test if no ECO2 sample exists. | `src/lib/energy/__tests__/eco2-export.test.ts`, `src/lib/energy/__tests__/eco2-hvac-codes.test.ts` |
| **C5 — Public-data baseline** | Harness is runnable with zero calibration file; produces either a grade match or a structured gap report + `showcase-inference-gaps.md` with at least one actionable enrichment item per override. | Same harness, third case: "public-data-only path" |
| **C6 — No-regression** | `pnpm build && pnpm lint` green. Existing tests under `src/lib/procedural/__tests__/*` and `src/lib/energy/__tests__/*` green. Four named routes return non-5xx on dev server. `/api/energy/consumption` excluded. | CI pipeline + manual smoke checklist in PR |
| **R7 — Grade vocabulary** | Unit test asserts Korean label (e.g. "1등급") and `EnergyGrade` enum value normalize to the same bucket via `src/lib/energy/energy-grade.ts`. | `src/lib/energy/__tests__/energy-grade-normalization.test.ts` |

**Evidence requirement:** every acceptance check produces an artifact
(JSON, test log, or screenshot) attached to the PR — the Critic will look
for concrete verification, not narrative "it works."

---

## 4. Risks & Mitigations

Inherited from spec:

- **R1 — Showcase unnamed.** Step 1 resolves explicitly. If GX team cannot
  name a building with a certified grade within this iteration, the spec's
  primary bar (C1) is not evaluable and the iteration should stop at Step 3
  (HVAC + manifest infrastructure) with a clear note.
- **R2 — `/api/energy/consumption` returns 502.** Out of scope per spec
  line 64. Not fixed here. Step 6 explicitly excludes it from the
  no-regression gate. Separate issue/ticket recommended.
- **R3 — `eco2-export.ts:22` HVAC mapping unverified against KS F 1900.**
  Standard is paywalled. Step 3 closes this by requiring **both** a
  GX-auditor sign-off recorded in `showcase-building.md` **and** a
  round-trip schema validation test (or a mapping-snapshot +
  calibration-consistency test if no ECO2 sample exists).
- **R4 — Portfolio scope creep.** Option A (file calibrations) was chosen
  specifically because it defers portfolio data-sourcing without blocking
  it. Every step has a "for the showcase" boundary; Step 6 tests extension
  *only* via the "run another buildingId end-to-end" bar, not via portfolio
  UI or ranking.
- **R5 — Public-data baseline may fail C1, forcing CAD/IFC into scope.**
  Step 5 handles this with an explicit **R5 Gate** (declarative rule):
  stopping rule at 5 overrides → C1 marked UNREACHED, C5 digest emitted,
  iteration terminates, CAD/IFC work deferred to a follow-up spec. This
  closes the ambiguity flagged by the Architect.

New risks surfaced during planning:

- **R6 — `MaterialProperties` override merge semantics.** Partial deep
  merge of nested material blocks is easy to get subtly wrong (e.g.,
  overriding `hvac.heating` without clobbering `hvac.cooling`). Mitigation:
  `building-calibration-loader.ts` uses explicit deep-merge with unit tests
  for each nested block. (Evidence: `src/lib/energy/eco2-export.ts:222-250`
  reads six nested `materials.hvac.*` paths — any shallow-merge bug is
  silently catastrophic for C1.)
- **R7 — `EnergyGrade` bucket semantics coupling.** C1 compares strings;
  if the codebase supports both "1등급" and "A++" labels (see
  `src/lib/energy/eco2-import.ts` — parses `energyGrade` / `grade` /
  `result.grade`), the calibration file and the certified grade must be in
  the same vocabulary. Mitigation: Step 1 records the certified grade in
  **both** Korean label and `EnergyGrade` enum, and a unit test asserts
  they normalize to the same bucket via `src/lib/energy/energy-grade.ts`.
- **R8 — Reproducibility of VWorld footprint fetches in CI.** VWorld is a
  network call. Step 1 captures raw JSON to `.omc/research/showcase-raw/`
  so the harness runs offline; Step 6's smoke does not require VWorld to
  be live.

---

## 5. Dependencies & Ordering

```
Step 1 (pick showcase + grade normalize)  ── blocks ──►  Steps 2, 3, 4, 5
                                                              │
Step 2 (calibration seam + GeometricLOD)  ── blocks ──►  Step 4 ── blocks ──► Step 5
Step 3 (HVAC mapping + 2 validations)     ── blocks ──►  Step 5
                                                              │
Step 5 (grade run + iteration + gate)     ── blocks ──►  Step 6
   └── Step 5.5 (inference-gap digest, runs after C1/stop-rule)
```

Parallelization:
- **Steps 2 and 3 can run in parallel** after Step 1 (different files,
  independent surfaces: calibration-loader / fidelity-manifest /
  fidelity-types vs. eco2-hvac-codes / eco2-export).
- **Step 4 can start design work in parallel with Step 2** but MUST
  consume Step 2's `GeometricLOD` type (declared in
  `fidelity-types.ts`) rather than redefining it. Serialize at
  integration.
- **Step 6 regression scaffolding** (CI list of routes, test file
  stubs) can start at Step 1 and complete at Step 5.

Critical path: Step 1 → Step 2 → Step 4 → Step 5 → Step 5.5 → Step 6.

---

## 6. Open Questions (surface to Architect/Critic, do not silently decide)

1. **Where does the fidelity manifest render?** Options: (a) extend the
   existing fidelity tab in `fidelity-assessor.ts`-backed UI, (b) new
   `/api/fidelity/showcase-report` route, (c) new panel in workspace-shell
   report stage. Spec says "visible in the app" (C3) but not where. Pick
   the lightest.
2. **Calibration file on-disk vs. database.** Option A uses `src/data/`
   shipped in the repo. At 10–100 buildings this is fine; at 1k+ it wants
   a database. Is shipping in-repo acceptable for this iteration, and at
   what buildingId count do we revisit? Not a blocker now; flag for the
   portfolio iteration.
3. **Does Step 4 need a scene-tree snapshot test?** The procedural
   generator currently has limited snapshot coverage. If adding one is
   too heavy, a bounding-box + draw-call assertion on the
   `ProceduralBuilding` output may suffice for the acceptance of Step 4.
4. **Scope of HVAC mapping table.** Do we enumerate all current enum
   values (~10–15) or only the ones the showcase actually uses? Former
   is more portfolio-ready; latter is faster. Critic preference requested.
5. **Gap report format.** Human-readable markdown vs. structured JSON
   vs. both. Step 5 assumes structured JSON consumed by a rendered
   markdown view; confirm with GX engineer before implementation.
6. **ECO2 sample presence.** Step 3's validation branch depends on
   whether an ECO2 sample/schema exists in the repo. A grep pass in
   execution phase will resolve; if absent, the fallback path (mapping
   snapshot + calibration-consistency test) applies. Flagged for Critic.

---

## ADR (Architecture Decision Record)

- **Decision.** Implement per-showcase data enrichment through file-based
  calibrations keyed by `buildingId` (Option A, with default resolver
  `buildingId = pnu`), layered on the existing era+codes+VWorld pipeline,
  with a new fidelity manifest carrying independent `FidelityLevel` (data
  breadth) and `GeometricLOD` (model detail) axes, per-field provenance,
  and positional accuracy.
- **Drivers.** (1) C1 is n=1 categorical and needs a reproducible
  artifact; (2) C2 requires zero code change for a second building; (3)
  existing code encodes most axes already — new structure should be
  additive only.
- **Alternatives considered.** Option B (runtime Zustand store overrides
  persisted per PNU) rejected because overrides live outside the repo,
  breaking reproducibility and CI pinning of the C1 baseline. Option C
  (hardcode showcase in `recipe.ts`) invalidated because it directly
  violates Principles 2 and 3 and fails C2 by construction.
- **Why chosen.** Option A is the minimum-surface-area addition that
  satisfies C1, C2, C3, C5 without new infrastructure. It piggybacks on
  the `MaterialProperties` override pattern already in use
  (`material-store.ts`). The `buildingId` indirection (vs. PNU directly)
  adds one seam for future non-PNU sources at ~5 lines of cost today.
- **Consequences.** (+) Clean data seam for portfolio extension; zero
  hardcoding; CI-pinnable baseline; `GeometricLOD` decoupled from
  `FidelityLevel` so a building can score high on one axis and low on the
  other without corrupting either signal. (−) Calibrations at scale become
  a data curation problem the next iteration must solve; partial deep-merge
  semantics require unit tests (R6). **Per-building overrides are
  scaffolding for inference improvement, not persistent data** — every
  override carries a `hypothesisForInference` that feeds back into
  `material-inference.ts` in a follow-up iteration. Calibrations should
  shrink over time as inference improves, not accumulate.
- **Follow-ups.** Portfolio data-sourcing iteration (not scoped here);
  `/api/energy/consumption` 502 fix (R2); CAD/IFC enrichment path if C5
  gap report shows public data is insufficient (R5, gated behind a
  follow-up spec); **promote `hypothesisForInference` digests from
  `.omc/research/showcase-inference-gaps.md` into structural improvements
  in `src/lib/data-enrichment/material-inference.ts` in a follow-up
  iteration** (the handoff path from Step 5.5).

---

## v1 → v2 Changelog (Architect iteration 2)

Summary of Architect-driven minimum changes. Principles and Decision
Drivers unchanged (Architect did not request revision).

- **Step 1 (select showcase) — ADDED:**
  - Grade recorded in **two vocabularies** (Korean label + `EnergyGrade`
    enum). R7 closure at the point it can silently fail.
  - New unit test asserts both normalize to the same bucket via
    `src/lib/energy/energy-grade.ts`.
  - Acceptance criteria expanded to require the two-vocabulary artifact.

- **Step 2 (override seam + manifest) — RESHAPED:**
  - Created new module `src/lib/fidelity/fidelity-types.ts`.
  - Declared **`GeometricLOD` type here** (pulled UP from Step 4) so the
    manifest shape settles before Step 4 consumes it.
  - Declared `GeometricLOD` as **distinct from `FidelityLevel`**; the
    manifest now carries both independently.
  - Declared `OverrideRationale` schema here (consumed by Step 5).
  - Folder renamed `src/data/showcase-overrides/` → `src/data/building-calibrations/`
    (Architect: "signals intent — calibration data, not showcase truth").
  - Loader renamed `showcase-override-loader.ts` → `building-calibration-loader.ts`
    with `loadCalibration(buildingId)` signature.
  - Keyed by `buildingId: string` with default resolver `buildingId = pnu`
    (Architect optional, accepted as ~5 lines).

- **Step 3 (HVAC mapping) — STRENGTHENED:**
  - Closure now requires **TWO validations**, not one:
    - (a) GX-auditor sign-off (previously planned).
    - (b) **NEW:** round-trip schema validation test against actual ECO2
      input parser / schema if sample exists, OR mapping-snapshot +
      calibration-consistency test if no sample exists.
  - Acceptance criteria expanded; Test Plan table updated with both tests.

- **Step 4 (geometric LOD) — REFACTORED:**
  - `GeometricLOD` type declaration **moved up to Step 2**.
  - Step 4 now **consumes** (does not redefine) the type.
  - Acceptance added: manifest `geometricLOD` flips L2 → L3 when
    calibration applies geometric refinements.

- **Step 5 (grade-agreement loop) — HEAVILY TIGHTENED:**
  - **NEW (a) Sensitivity ordering**: envelope U → HVAC efficiency → WWR
    → occupancy → LPD. Bounded and cited.
  - **NEW (b) Stopping rule**: 5 overrides max, then C5 gap output + stop.
  - **NEW (c) Source-of-truth rule**: each `overrideValue` must cite a
    specific source document; back-calculation from target grade
    explicitly forbidden; harness fails CI on `source: "backfit"`/`"tuned"`/empty.
  - **NEW (d) `rationale` schema** on every override file
    (`OverrideRationale`: field, inferredValue, overrideValue, source,
    hypothesisForInference). Makes overrides machine-readable signals.
  - **NEW Step 5.5 — Inference gap digest**: emit
    `.omc/research/showcase-inference-gaps.md` after C1/stop-rule.
    Explicit scope guard: do NOT execute `material-inference.ts` updates
    this iteration.
  - **NEW R5 Gate** (declarative rule): stopping rule trigger ⇒ C1
    UNREACHED, C5 deliverable, no scope expansion to CAD/IFC this
    iteration, follow-up spec required. Closes Architect's R5 rejection.

- **Step 6 (extensibility + no-regression) — STRENGTHENED:**
  - C2 test now additionally requires **non-empty `gapAnalysis`** in the
    manifest for building B. Architecture must be honest about what it
    doesn't know.

- **ADR — UPDATED:**
  - Decision now references `buildingId` keying with PNU default resolver.
  - Consequences include independent `GeometricLOD`/`FidelityLevel` axes
    and the **new** statement: "per-building overrides are scaffolding for
    inference improvement, not persistent data."
  - Follow-ups include the **new** entry: "promote `hypothesisForInference`
    digests into `material-inference.ts` in a follow-up iteration."

- **Test Plan table — UPDATED:**
  - New R7 row for grade-vocabulary normalization test.
  - C4 row expanded to list both validations and both test files.
  - C2 row expanded to assert non-empty `gapAnalysis`.
  - Renamed "PNU" → "buildingId" where appropriate (semantics unchanged
    since `buildingId = pnu` by default).

- **Risks — UPDATED:**
  - R3 now references the two-validation closure.
  - R5 now references the R5 Gate declarative rule.
  - R7 closure mechanism updated (two-vocabulary + normalization test).

- **Open Questions — UPDATED:**
  - Question 6 rewritten to flag the ECO2-sample-presence branch in
    Step 3's validation path.
  - "PNU" replaced with "buildingId" where it refers to the keying
    identifier (not where it refers to the spec field).
