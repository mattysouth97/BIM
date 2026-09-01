---
type: handoff
status: implemented
last_verified: 2026-08-27
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

## Verified Working State

Validated on 2026-08-31 (after the MEP graph-engine rework):

- Unit: **3994 passed**, 4 skipped, 364 files
- E2E: **35 passed** (Playwright, chromium)
- `tsc --noEmit`: clean; `eslint src`: 0 errors
- Production live at `https://bim-self.vercel.app`, verified against a real
  building (대청아파트306동, `11680-10300-0-0012-0000`)

## Active Systems

- Register lookup at `/` → routes picks to `/building/[id]`
- Twin workspace `/building/[id]` — stepper, layers, CAPEX→ROI, report
- Traceable energy engine — reachable at `/diagnostics/new?method=ledger&building=…`
- Sample building `/building/demo` — offline fixture, needs no API key

## Work in Progress

**The working tree is dirty and not all of it is mine.** A concurrent design pass
is restyling the landing and search surfaces toward the design-system tokens
(`border-border`, `bg-card`, `rounded-[8px]`, `shadow-xs`). Affected at time of
writing: `src/components/landing/{cad-sheet,resume-diagnostic}.tsx`,
`src/components/energy-diagnostics/ledger-lookup.tsx`,
`src/components/search/{address,region}-search-form.tsx`,
`src/components/layout/header.tsx`, `src/app/globals.css`, and
`e2e/first-door.spec.ts`.

Run `git status` before assuming anything about the tree, and do not revert those
files.

## Known Issues

1. **The twin's energy is not the traceable engine.** It uses the older
   `material-store` path, labelled `간이 모델` in the UI. The canonical engine
   lives on a second route. This is the top item.
2. **VWorld outlines are unusable as-is** — lon/lat degrees, not metres.
3. **Per-storey plans cannot move the number** until `envelopeQuantities` sums
   per storey instead of extruding one ring by total height.

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

## Recent Architectural Changes (2026-09-02: architectural renderer)

- **Real-time architectural renderer** layered on the existing R3F viewport
  (`src/lib/rendering/`). BIM mode keeps the historical CAD look; Realistic /
  Hyperreal resolve ledger structure/era/use into a PBR catalog, world-space
  triplanar shaders, Preetham sky + solar sun, GTAO/SMAA, and an interior
  occlusion volume. Engineering dimensions are unchanged.
- Viewport chrome: `data-testid="render-mode-overlay"` (mode, time, weather,
  quality, camera). Docs: `docs/rendering/`.
- Do not treat this as path tracing. The street close-up is the first view
  that stops reading as CAD; iso curtain-wall spandrels are still thin boxes.

## Recent Architectural Changes (2026-08-31 later: material-aware diagnostics)

- **New `src/lib/energy-standards/`** — verified 별표1 U-value ceilings
  (제2025-738호), ZEB 등급표 (제2024-893호), ISO-6946 assembly physics
  (U from layers, Rsi/Rse, target-U thickness solve), generic material
  library (`confidence:"generic"` hardwired). Every number cites
  `docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md` — update that ledger
  with any value change.
- Ledger baselines now carry **assumed layer stacks** whose ISO-6946 sum
  reproduces the era U exactly (insulation thickness solved; empty when
  unreachable). Runs now carry `result.primary` (1차에너지, factors
  embedded). `standards-assessment.ts` derives 계산 기준/별표1/ZEB-참고;
  `sensitivity.ts` does thickness sweeps + parameter ranking with one real
  engine run per point.
- Workspace: assembly editor (건물 모델), standards + sensitivity panels
  (결과). `runAssemblyScenario` in model-operations. New e2e
  `material-diagnostics.spec.ts` (38 e2e total).
- **Bug fixed:** the first autosave's URL rewrite dropped `building` from
  `?method=ledger…`, which server-redirects to `/` — the ledger diagnostic
  killed itself ~1.5 s after opening. `bindSavedProject` now preserves it.
- Findings bug fixed: dominant-envelope evidence now matches
  `envelope.construction.` (ledger) keys, not only tier-one `construction.`.
- Feature doc: [[Material-Aware Energy Diagnostics]].

## Recent Architectural Changes (2026-08-31: MEP graph engine)

- **The MEP layer is graph-driven.** `src/lib/mep/` plans a canonical,
  deterministic building-services network (plant → riser → main → branch →
  terminal; engineered catalog sizes; explicit fittings; elevation-band +
  channel coordination with a §28 self-repair pass; clash/gravity/connectivity
  validation and a plausibility score). Layer generators 3/4/5/6/13 and
  electrical-routing render FROM the model via `src/lib/layers/mep-render.ts`;
  their group names, userData tags and toggles are unchanged, so the viewer
  stack carried over (35/35 e2e green untouched).
- Engineering rules live in `src/lib/mep/rules.ts`, each citing
  `docs/05_Research/MEP Design Practice Research.md` (U/H/C/M classified).
- CAD-driven MEP: classified room polygons flow
  `classify-plan.roomPolygonsFromPlan → RecipeOverrides.cadRooms →
  MepZone(source:"cad-room")`.
- `/dev/mep` is the visual-QA harness (six QA buildings, provenance/clash
  color modes, graph overlay, live validator metrics).
- Regression thresholds (hard-clash ceilings, score floors) are in
  `src/lib/mep/__tests__/mep-engine.test.ts` — ratchet down only. Case E
  (pre-2000 central plant) keeps a documented residual; structure clashes are
  asserted zero everywhere.
- **설비 강조 (MEP x-ray)**: `layer-store.mepIsolation` (session-only) —
  toggle under 기계전기설비 in the scene layer list and layer panel; ghosts
  the massing via `ProceduralBuildingModel.mepIsolation` and clears
  interior + analysis overlays on entry. This is how the graph MEP is meant
  to be seen in the product.
- Feature doc: [[MEP Systems]].

## Earlier Architectural Changes

- Product reversed to **register-first**; the generative engine became refinement
  input and a secondary door.
- The two landing pages were collapsed into one; `/diagnostics/new` without a
  method redirects to `/`.
- Register picks now route to `/building/[id]`, which is what made the four-step
  workflow the actual product rather than an unreachable page.
- New: `ledger-source.ts`, `ledger-baseline-model.ts`, `ledger-climate.ts`,
  `refinement.ts`, `src/lib/ledger/floor-rows.ts`.

## Testing Status

Green. Run before claiming completion:

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
```

Bare `pnpm` fails on this machine and `pnpm exec` attempts to purge
`node_modules` — invoke binaries directly as above. See [[Build and Run]].

## Deployment Status

Deployed. `vercel --prod --yes`.

**Trap:** a deploy returns `BLOCKED` — not a build failure — when the HEAD commit
author email is not on the Vercel account. `git log -1 --format=%ae` must be
`namseunghun97@gmail.com`.

## Highest-Priority Next Actions

1. Integrate the canonical engine into step 3; mount refinement inputs in the twin.
2. Project VWorld outlines to metres.
3. Per-storey envelope quantities.

## Relevant Documents

[[Current State]] · [[Project Overview]] · [[System Architecture]] ·
[[Data Flow]] · [[Deployment and Environment]] · [[Testing Strategy]]

## Last Verified

2026-08-27 — against production and a full local test run.
