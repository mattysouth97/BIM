---
type: handoff
status: implemented
last_verified: 2026-09-07
---

# Current Project State

Read this before starting work. It describes **verified reality**, not intentions.
Keep it short — move superseded detail to `Archive/` rather than letting this grow
into a log.

## Current Objective

Make the fixed four-step workflow — 건물 검색 → 도면 업로드 → 디지털 트윈 →
보고서 — carry the source-traceable energy engine end to end.

The workflow shape is **settled** (explicit product decision, 2026-08-27). Build
inside it; do not add a fifth step or a second front door.

User direction on 2026-09-07: improve 3D/model quality, grow the licensed model
collection, and develop reusable building-energy datasets with explicit source,
measurement/assumption and calculated-versus-metered distinctions. Commit, push
and deploy each major verified milestone. Current execution record:
`2026-09-07-product-datasets-and-viewer.md`.

Latest mission: make BIMFIT valuable to paying building professionals through
good judgment and evidence-based problem structure. Prioritize a defensible
retrofit decision, source-to-result traceability, consistent comparisons and
reviewable handover. [[Business and Service Model]] defines an assisted-service
and subscription proposal with explicit test prices; no paid service is launched.
[[Energy0 Simulation Engine Research]] audits the current screening engine and
proposes a validated detailed/hourly architecture; it is research, not implemented.

## Verified Working State

Local release validation on 2026-09-07:

- Unit: **5,492 passed**, 4 skipped (458 passed files, 1 skipped).
- Full Chromium: 160/161 passed. One existing diagnostic test captured the
  alternative placeholder before calculation finished; it now awaits the actual
  evaluated result, and all 10 diagnostic browser checks pass on rerun. Every
  source model, material, camera, dataset and proposed-work check passed.
  TalTech's MEP screenshot waits for mounted service geometry and was inspected;
  desktop/mobile proposed-work legend screenshots were also inspected.
- TypeScript: clean. ESLint src/e2e: 0 errors, 6 pre-existing warnings.
- KIT Office and demo expanded/collapsed canvas screenshots inspected; no page
  errors. Panel controls preserve state and do not overlap the rendering toolbar.
- Last production verification: `2816ab5` on 2026-09-07 01:52, full health SHA
  and region `icn1`; five live material-realism browser checks passed. The
  seven-model release described below is locally integrated, deployment pending.

## Current product

- Seven integrated source models: Clinic, Schependomlaan, Duplex, FZK Haus,
  KIT Office, Klassiqua Office 1970 and TalTech Mäemaja. KIT examples and the
  Klassiqua research archetype are synthetic models, not verified occupied sites.
  TalTech adds a licensed office/lab IFC with stated areas, thermal properties,
  equipment and existing PV; its separate meter archive is not ingested.
- Source architectural details add 4,040 elements across these seven models.
  The independent layer defaults on, preserves source placements, and supports
  retry without losing the base model. This is selected source detail, not a
  certified LOD claim. Clinic/Schependomlaan roof views were compared with the
  layer on/off; the PV placement remains aligned.
- Source-bound textures now show on the model by default. Surface selection
  opens the corresponding source assembly; loading/retry preserves the base.
  Samples illustrate the thickest stated layer, not a verified outer finish.
  Source thermal properties and generic assumptions remain distinct.
  Blender MCP lossless optimization reduces the original six material payloads
  by 54.1% and TalTech's by 51.3%, with exact decoded geometry, normals, indices
  and instances preserved. Source assignment basis remains part of the binding.
  Texture scale follows source units and instances; roughness and glass optics
  are illustrative. Single-material wood/metal panels remain opaque.
- MEP inventory is explicit for every model. Schependomlaan gains 73 source
  drainage/vent elements; zero typed MEP in FZK/KIT files does not mean those
  buildings have no services. Klassiqua also has no typed MEP in its source.
  TalTech adds 528 source MEP elements and 1,644 ports; ambiguous connection
  direction is disclosed and no flow animation is invented.
  Dataset schema 1.3 includes material bindings, explicit floor/facade scope and
  an optional hashed source-property archive (`source.statedPhysics`).
- JSON/CSV published-baseline datasets on the gallery and each model page.
  They carry licenses, source and payload hashes, units, inputs, assumptions,
  partial measurement scope, and calculated energy. Metered energy is absent.
- The retrofit row selects physical work. Funding/support-program controls are
  removed across model, twin and diagnostics pages. Old saved program choices
  are ignored. Costs and NPV use the unsubsidized baseline.
- Budget is optional, session-only and per building. Chosen work belongs to the
  user; recommendation changes do not replace it.
- Top investment/work and bottom energy panels collapse independently while
  keeping their state mounted. Both reopen controls remain accessible.
- Published: four persistent information categories
  (Overview/Materials/Layers/Data), concise core copy, browser history and
  keyboard navigation, synchronized KO/EN, and a mobile split that keeps the
  model visible with initially collapsed energy rails. Thin-layer depth
  precision now follows the model bounds while orbiting/zooming; no source
  faces were removed. Seven model orbit/zoom browser checks passed. The proposed
  work legend starts compact and occupies the gap between the actual canvas
  panels; its proposed status and selected count remain visible.
- PV roof poses, drawn count, chips and economics share measured roof layout.
  Clinic 453/181.2 kWp, apartment 10/4.0, Duplex 14/5.6, FZK 44/17.6,
  Klassiqua 84/33.6; KIT 0 under the current module/setback rules. Downslope
  bearings now follow source normals and declared true north. Flat racks face
  true south; the yield estimate still does not resolve each slope's shading.
  TalTech retains 63.36 kWp of source-stated installed PV and permits 10 proposed
  modules / 4 kWp under the current rules. Its source latitude controls spacing;
  source array, chiller and parapet plan projections constrain new placement.
  New-work cost and area exclude existing arrays. The energy calculation still
  uses explicitly assumed Seoul comparison weather, not Tallinn weather.

Execution and release details: [[2026-09-07-product-datasets-and-viewer]].
Superseded snapshots: [[Archive/2026-09-07-before-dataset-and-canvas-release]].
Prior PV and selection methods remain documented in
`2026-09-06-pv-roof-placement-methodology.md` and
`2026-09-06-gallery-consistency-visuals-brief.md`.

## Open work and limits

- Material realism, professional mission and the research/business proposals
  are deployed and production-verified. TalTech and the compact proposed-work
  legend are integrated and locally verified; production deployment is pending.
- Existing/new PV accounting now preserves installed capacity and scopes costs
  to the addition; the separate report/grade heat-carrier mismatch remains open.
- TalTech's IFC4 port ownership and selected roof obstructions are source-bound.
  Full solar shading, unrecorded obstructions and structural feasibility remain
  unmeasured. Other reference models do not have TalTech's obstruction coverage;
  current placement may overstate feasible PV capacity.
- The apartment's aperture extraction is partial: 106.06m² selected glazing and
  81.03m² doors do not establish complete exterior coverage. Keep 115.5/40m²
  stand-ins and bias notices until host-wall/remaining-opening scope is resolved.
- HRV saving does not match the current engine's natural-ventilation path;
  LED/PV do not move the modeled kWh or grade. A sourced Nijmegen climate is open.
- `.planning/STATE.md` and `.claude/settings.local.json` are unowned changes
  excluded from this release. Always inspect current git status.

## Active Systems

- `/` is the model gallery; register lookup is `/diagnostics/new?method=ledger`
- Twin workspace `/building/[id]` — stepper, layers, CAPEX→ROI, report
- Traceable energy engine — reachable at `/diagnostics/new?method=ledger&building=…`
- Sample building `/building/demo` — offline fixture, needs no API key
- **Evidence-to-CAD reconstruction** — the 도면 업로드 step's prompt module turns
  the register + VWorld outline + era tables + a user sentence into a graded,
  source-traceable DXF for buildings that have no drawing. See
  [[Evidence-to-CAD Reconstruction]] and [[ADR-003 - Reconstruction Is Not Evidence]].
  The rule that must not be softened: a reconstruction is recorded as
  `reconstructedFootprint`, never `hasCadFootprint`, and it reaches the twin only
  by being re-read out of its own DXF through `parseDxfText`.

## Known Issues

1. **The twin's energy is not the traceable engine.** It uses the older
   `material-store` path, labelled `간이 모델` in the UI. The canonical engine
   lives on a second route. This is the top item.
2. ~~**VWorld outlines are unusable as-is**~~ — closed by P2-29. The
   reconstruction projects them into a site-centred TM frame and both the twin
   and the traceable engine now read that ring. What remains: the reconstruction
   uses a GIS ring **as-is**, never reconciled against the stated 건축면적 — the
   disagreement surfaces honestly as a `REVIEW` row in `buildAreaValidation`
   rather than being silently scaled away.
3. ~~**Per-storey plans cannot move the number**~~ — closed by P2-30, and the
   concentric-plate follow-up closed by P2-31. The ledger→geometry track
   (P2-29 → P2-30 → P2-31) is complete.

## Known Risks

- The 건축물대장 endpoints fail independently and intermittently. Any code that
  requires all four to succeed will discard buildings that were retrievable.
- The shared lookup key is rate-limited per IP (30/60s) and the limiter is
  in-memory per serverless instance — best-effort, not a hard cap.
- Several 3D subsystems are retained but flag-gated. Check reachability before
  reporting one as a feature.

## Important Constraints

- **Provenance is a construction-time invariant.** `createEnergyFact` throws
  unless a fact cites sources, names an assumption, or is explicit user input.
  Do not add a "convenience" helper that attaches register refs to a defaulted
  value — that is precisely how the guarantee dies.
- A **documented zero** in the register means *unavailable*. Emit no fact.
- **ACH50 ÷ 20** to reach a natural air-change rate. A 20× ventilation error
  still looks like an ordinary building.
- Use `classifyEraExplicit`, never `classifyEra`, on the traceable path.
- This Next.js version differs from training data — read
  `node_modules/next/dist/docs/` before writing Next-specific code.

## Do Not Modify Casually

| Path | Why |
|---|---|
| `src/lib/energy-diagnostics/facts.ts` | The provenance invariant lives here |
| `src/lib/energy-diagnostics/validation.ts` | 40 error-severity checks gate simulation |
| `src/lib/korean-building-codes.ts` | Era tables; every default traces here |
| `docs/work-plan/` | Referenced by name from `CLAUDE.md`; do not relocate |
| `src/app/api/bldrgst/_factory.ts` | Shared-key resolution and per-endpoint row caps |
| `public/models/` | 173 GLBs (102 authoring, 58 equipment, 13 bim-assets) |

## Carry-forward evidence risks

- The earlier parcel/bbox issue in `cad-reconstruction/evidence.ts` was
  documented but is not resolved by the model/material releases. Verify its
  runtime state before claiming reconstruction is complete.
- The sampled VWorld building layer supplied no measured-height field. Missing
  height must not be promoted to a measured value; preserve ledger/assumption
  distinctions. Detailed evidence is in the archive linked below.

## Highest-priority next actions

1. Reconcile the visible engine's carrier/end-use accounting and unite the
   traceable input path with the twin/report. Keep published baseline versions
   explicit when numerical results change.
2. Produce a reviewable envelope/HVAC screening decision package with sources,
   comparable alternatives and a verification plan. Validate it with a
   practitioner before claiming professional time savings.
3. Implement the staged simulation programme in the research document, beginning
   with a canonical thermal model and pinned detailed-engine experiment.
4. Expand model coverage against source quality, use type, climate and system
   diversity. Resolve uncertain input scope and seek permitted measured data;
   model count alone is not the objective.
5. Validate the proposed service and pricing through user-authorized paid pilots.
   No outreach, customer contracts or payment collection has been performed.

## Verification and deployment

Use direct binaries as required by AGENTS.md; do not use bare pnpm or pnpm exec.
Run checks appropriate to each change and inspect the displayed numerical claims.
Deploy only a clean detached worktree with the team scope; preserve `icn1`.

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test --workers=2
node node_modules/eslint/bin/eslint.js src e2e
vercel --cwd <clean-detached-worktree> --prod --yes --scope matts-projects-d0677dc4
```

The commit author must be `namseunghun97@gmail.com`. Verify the full deployed
SHA and region through `/api/health`, then run focused live browser checks.
`vercel --prod` uploads the working directory; a dirty main checkout is unsafe.

## Relevant documents

[[Business and Service Model]] · [[Energy0 Simulation Engine Research]] ·
[[Product Intent]] · [[System Architecture]] · [[Reference Buildings]] ·
[[Building Energy Datasets]] · [[2026-09-07-product-datasets-and-viewer]]

Historical ledger/rendering decisions and superseded task lists:
[[Archive/2026-09-07-prior-ledger-and-rendering-history]].
