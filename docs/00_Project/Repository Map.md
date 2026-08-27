---
type: project
status: implemented
last_verified: 2026-08-27
---

# Repository Map

Where things live, who writes there, and whether an agent should change it freely.

## Top level

```text
src/          Application implementation
public/       Static assets — including 173 GLB models and PBR textures
e2e/          Playwright end-to-end specs
docs/         This knowledge vault (+ pinned historical plan folders)
scripts/      Development and maintenance automation
.github/      CI workflow
.planning/    Earlier codebase-notes system — superseded by this vault
ml/           Model/experiment material
```

## `src/`

| Path | Responsibility | Agent may modify freely? |
|---|---|---|
| `src/app/` | Next.js App Router routes and API route handlers | Yes, but read the Next.js docs in `node_modules/next/dist/docs/` first |
| `src/app/api/bldrgst/` | 건축물대장 proxy routes + shared-key resolution | **Careful** — `_factory.ts` holds key resolution and per-endpoint row caps |
| `src/app/api/vworld/`, `api/weather/`, `api/energy/` | GIS, weather, energy endpoints | Yes |
| `src/app/api/generative/` | Natural-language generation (needs `ANTHROPIC_API_KEY`) | Yes |
| `src/components/energy-diagnostics/` | Traceable diagnosis UI: workspace, scene, findings, refinement | Yes |
| `src/components/viewer/` | 3D scene, layers, config panel (step 3's typed inputs) | **Careful** — `building-scene.tsx` mounts every layer |
| `src/components/workspace/` | Workspace shell, the 4-step stepper, docks, report mounting | **Careful** — the stepper is the product's spine |
| `src/components/search/` | Register search forms, results table, pagination | Yes |
| `src/components/landing/` | The single landing page | Yes |
| `src/components/report/` | Report previews and export (step 4) | Yes |
| `src/components/generative/` | Prompt panel, schematic editor | Yes |
| `src/components/cad-viewer/` | In-browser DWG/DXF viewer and 2D drafting | Yes |
| `src/lib/energy/` | Physics core — heat loss, degree-day demand, grades, CO₂ | **Careful** — changes move every number |
| `src/lib/energy-diagnostics/` | Canonical model, ingestion, provenance, adapter, refinement | **Careful** — see below |
| `src/lib/ledger/` | Shared register helpers, explicit era classification | **Careful** — era drives every default |
| `src/lib/korean-building-codes.ts` | Era-indexed default tables | **Do not casually edit** — every assumption traces here |
| `src/lib/retrofit/` | Measures, cost database, DCF/NPV/IRR, knapsack | Yes, with tests |
| `src/lib/cad/` | DXF parse, DWG→DXF WASM, PDF trace, footprint conversion | Yes |
| `src/lib/generative/` | Blueprint → spec → polygon-BIM engine | Yes |
| `src/lib/procedural/` | Recipe-driven building geometry generators | Yes |
| `src/lib/workflow/` | The four-step stage machine, guards, lock reasons | **Careful** — the product shape is fixed |
| `src/store/` | Zustand stores; several persist to localStorage | **Careful** — persisted shape changes need migrations |
| `src/hooks/` | Data-fetching and view hooks | Yes |
| `src/data/` | 법정동 / region code tables | Reference data — rarely edited |

### The provenance-critical files

Three files carry the product's credibility. Read [[Product Intent]] before
touching them:

- `src/lib/energy-diagnostics/facts.ts` — `createEnergyFact` throws unless a fact
  cites sources, names an assumption, or is explicit user input.
- `src/lib/energy-diagnostics/validation.ts` — 35 error-severity checks that gate
  simulation.
- `src/lib/energy-diagnostics/ledger-baseline-model.ts` — the register → model
  builder, deliberately a *sibling* of `tier-one-model.ts` and never an extension
  of it.

## `public/`

```text
public/models/authoring/    102 GLB authoring families  (retained; layer flag-gated)
public/models/equipment/     58 GLB equipment models
public/bim-assets/           13 GLB assets
public/textures/              7 PBR texture sets (applied to the ground plane)
public/hdr/                  studio.hdr, used for reflections only
```

Binary assets. Referenced by path from the family catalog and material modules —
do not rename or relocate.

## `docs/`

This vault. Three folders inside it are **pinned** — referenced by name from
`CLAUDE.md` and from each other, so relocating them breaks the documented
process:

```text
docs/work-plan/     Tracked remediation plan (RE → SDD → CDD → EDD), items, ADRs, knowledge
docs/superpowers/   Historical plans, specs and research
docs/plans/         Historical implementation plans
```

Link to them. Do not move them. New vault material goes in the numbered folders.

## `e2e/`

Playwright specs, one per user-facing concern (first door, ledger baseline,
ledger refinement, energy diagnostics, building flow, plan view…), plus
`helpers/` and `fixtures/`. See [[Testing Strategy]].

## `.planning/`

An earlier codebase-notes system (`ARCHITECTURE`, `CONVENTIONS`, `STACK`,
`STRUCTURE`, `TESTING`, `INTEGRATIONS`, `CONCERNS`, `DEPLOY`). Superseded by this
vault but **not deleted** — some of it predates and explains decisions the vault
only summarises. Treat as historical; prefer the vault when they disagree.

## Generated / transient — never hand-edit, never commit

```text
.next/  .open-next/  coverage/  test-results/  playwright-report/
.playwright-mcp/  qa-evidence/  tsconfig.tsbuildinfo  node_modules/
```

`.vercelignore` excludes the QA artefacts from deployments — `qa-evidence/` alone
was 81 MB and made the CLI upload abort. See [[Deployment and Environment]].

## Root markdown

| File | Role |
|---|---|
| `AGENTS.md` | Agent operating instructions — read first |
| `CLAUDE.md` | Project instructions, architecture summary, API gotchas |
| `README.md` | Human-facing project readme |
| `handoff.md`, `model_refine_handoff.md`, `Project-CORE-Memory.md`, `QA-Checklist.md` | Historical session material — see `docs/99_Archive/` for classification |

## Related

[[Project Overview]] · [[System Architecture]] · [[Repository Conventions]]
