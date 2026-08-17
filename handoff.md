# Handoff — Generative BIM Unification (2026-08-17, evening)

Session scope: orchestrated the schematic-driven pivot to its integrated state via
parallel agent fleets (Opus 5 / Sonnet 5 / Haiku 4.5). This file is the live
handoff for whoever continues; fold it into `docs/work-plan/handoffs/` and delete
it once its in-flight sections resolve.

## Product direction (user decisions, authoritative)

1. **The ledger (건축물대장 / data.go.kr) is no longer a data source.** Buildings
   enter ONLY via the generative engine: described prompt, drawn schematic, or
   imported DWG/DXF/SVG. The ledger-era *featureset* (workspace, layers, energy,
   reports, authoring) survives, repointed at generated designs.
2. **Energy is the point of the product.** Every design reports demand / EUI /
   grade / CO2 / retrofit economics from the real physics stack; modifications
   show their energy deltas.
3. **Workspace layer roster**: 외피 (envelope), 구조 (structure), 에너지존
   (energy zones), MEP/설비 — semantic lenses over engine data, never fabricated.
4. **Target product** (confirmed "go"): intent in → solved semantic BIM out →
   3D interior attached procedurally from the existing 102-family GLBs →
   four layers + 2D plan symbols → energy verdicts → hand-detailing with the
   family library → lock/regenerate. The human stays the architect.

## Committed & deployed state

Branch `merge/digital-twin-pivot`, all pushed to `origin`:

| Commit | Contents | Gate at commit time |
|---|---|---|
| `0e83856` | Schematic-driven engine: geom kernel, BlueprintSpec, polygon solver, blueprint compiler (+local grids), interpretBlueprint seam, schematic editor + plan overlay, `/api/generative/generate-from-blueprint`, acceptance tests (L/courtyard/rotated wings). Includes companion session's edit loop (patch/session/command-bar/panels). | 2,794 / 0 fail; tsc clean; build green |
| `306292e` | DWG/DXF import → auto-generated schematic (layer mapping, honest units, one-undo adoption). Fixed pre-existing LibreDWG tier DXF-text drop. | 2,940 / 0 fail |
| `d7a8502` | Energy bridge (seed-from-design, studio Energy tab, PK-by-generationId), plan-symbol node-graph library (102 families, `/dev/symbols`), SVG import entry, fidelity UI, handoff-1/2 integration (all 9 orphaned lanes verified KEEP; options-panel repaired with proven causation). | 3,418 / 0 fail; lint 0 err |

**Production**: deployed from `d7a8502` via `vercel --prod` (CLI authenticated as
`namseunghun97-8477`). Live at **https://bim-self.vercel.app** (project `bim`,
team `team_J4JFr5ovWikP4Ac1rNNjIb8V`). `/`, `/studio`, `/dev/symbols` verified 200.
Local: dev server :3000, production `next start` :3002.

## RESOLVED (2026-08-17 19:20) — everything below landed

All in-flight and queued items completed. `3868adc` (workspace unification:
GEN- routes + design-storage + 외피/구조/에너지존 overlays + hydrateFromSnapshot
+ generate-alternative seed + generative-first front door + interior builders)
and `d86a303` (interior mounted in both canvases, recipeOverride plumbing —
committed by the concurrent session after an in-flight merge, adversarial
verify PASS on the merged tree). Production redeployed from `3868adc`
(bim-self.vercel.app); redeploy from `d86a303` is the one remaining step if
not already done. New recorded gap: AuthoringFamilyLayer renders only in
authoring workMode (pre-existing), so hand-placed elements are invisible
outside it. The sections below are kept for archaeology only.

## ~~IN FLIGHT~~ (historical) — check before touching anything

### 1. Workspace-unification workflow `wf_35d46ec7-17e` (4 lanes + gate)

| Lane | Model | Task | Owns (writes) |
|---|---|---|---|
| A citizenship | Opus | `GEN-` route branch, `GeneratedWorkspace`, **`src/lib/generative/design-storage.ts`** (pinned contract below), studio "Open in workspace" | `app/building/**`, `building-workspace.tsx`, `generated-workspace.tsx`, `design-storage.ts`, studio header row |
| B layers | Opus | 외피/구조/에너지존 layers + panel toggles | `building-scene.tsx`, new viewer layer files, `src/lib/layers/` additions |
| C authoring+seed | Opus | `bim-model-store.hydrateFromSnapshot` (generated snapshots feed authoring), `blueprint/from-footprint.ts`, "Generate alternative" toolbar action | `bim-model-store.ts`, hydrate wiring, `building-toolbar.tsx` |
| D front door | Sonnet | Generative-first landing + header; ledger entry-point removal + deletion inventory (links only, no file deletes) | landing, header |
| Gate | Opus | Seam checks (incl. wiring lane C's studio-side seed pickup if stashed), node e2e (save→reload byte-identical), full gate | fixes anywhere in wave files |

Monitor: `/workflows` or journal at
`~/.claude/projects/c--Users-----ProjectFiles-BIM/4e56a469-8afc-4a8a-9c0f-cd3ebb2ebec4/subagents/workflows/wf_35d46ec7-17e/journal.jsonl`.
Resume after interrupt: `Workflow({scriptPath: ".../workflows/scripts/bim-workspace-unification-wf_35d46ec7-17e.js", resumeFromRunId: "wf_35d46ec7-17e"})`.

### 2. Interior-builders agent (single Opus, pure half of the 3D interior layer)

Territory: **only** new `src/lib/interior/` + its tests. Builds: wall
oriented-box instances from snapshot endpoints with three-box opening splits
(no CSG), generated-element → family-GLB pose mapping (doors/windows scaled to
real mm + sill math, stairs spanning storeys), authored-element dedupe, honest
`skipped` ledger. Output vocabulary designed for `InstancedMesh.setMatrixAt` +
the existing `FamilyInstance` pattern.

### Pinned contract (lane A creates, lane C + interior mounting consume)

```ts
// src/lib/generative/design-storage.ts
interface StoredDesignRecord { generationId; spec; seed; revision; savedAtIso; name? }
saveDesign(record): Promise<void>                    // idb-keyval 'gen-design:'+id
loadDesignRecord(id): Promise<StoredDesignRecord|null>
getOrBuildDesign(id): Promise<(DesignPayload & {generationId; seed; revision})|null>  // buildDesign is pure — spec regenerates snapshot deterministically
listDesigns(): Promise<{generationId; name?; savedAtIso}[]>
isGeneratedPk(id): boolean                            // /^GEN-\d{4}(\.\d+)?$/
```

## QUEUED (in order, after both in-flight items land)

1. **Interior mounting wave**: mount `src/lib/interior/` builders as a toggleable
   "내부 요소 (Interior)" layer in BOTH canvases (studio viewport +
   `BuildingScene`), floor filtering per existing conventions, instancing +
   disposal discipline; Sonnet adversarial verify (poses on host walls, no
   double-render vs authoring layer, perf sanity).
2. **Final gate**: full `vitest run` / `tsc --noEmit` / `next build` / lint.
3. **One integrated commit** (union of both waves), push.
4. **Production redeploy**: `npx vercel --prod --yes` (CLI is authenticated).

## Key architecture facts for whoever continues

- Everything downstream keys on `buildingPk` into `material-store` /
  `recipe-store` / `active-building-store`; provenance is never inspected. The
  energy bridge (`publishDesignEnergy` in `generative-session-store.ts`) is the
  reference for seeding; `seedBuildingFromGeneratedDesign` +
  `syntheticTitleForGeneratedDesign` live in `src/lib/generative/energy/seed-from-design.ts`.
- MEP layer kit is 100% `BuildingRecipe`-driven (`LayerGenerator.generate(recipe,
  density)`); `/dev/assets` proves it with a hand-built recipe.
- The generative snapshot (from `buildDesign`) is RICHER than the ledger-era
  `hydrateBimModel` derivation (real columns/stairs/cores, provenance, locks) —
  lane C's `hydrateFromSnapshot` makes authoring use it.
- 2D plan symbols: `src/lib/plan-symbols/` node-graph engine; explicit graphs for
  all 102 families; renderer in `schematic/plan-symbols-layer.tsx`; host-wall
  rotation is authoritative for hosted openings (their own rotationY is always 0
  from emit — same rule applies to the 3D interior layer).
- Blueprint chain: `blueprint/` (schema, validate, compile, metrics/fidelity,
  from-cad / from-svg / from-segments / from-footprint(lane C)), all mm;
  `blueprintPlateFrame` and `deriveZoneSpecId` are single-sourced contracts —
  never re-derive the plate shift or zone-id rule elsewhere.

## Engine-gap register (docs/work-plan/handoffs/2026-08-17-schematic-pivot.md holds the full list)

Highest-value open gaps: concave-plate circulation severing (L-plates still
strand rooms; a loud-by-design fixture in `options-panel.test.tsx` flips when
fixed) · rotated local grids publish no `BimGrid` lines · void edges unwalled ·
door swing arcs need an "operable envelope" depth distinct from GLB bounds ·
no poché fill concept in plan symbols · rooms stay world-axis rects inside
rotated wings · renderer carries one `footprintPolygon` (podium/tower render as
one extrusion; see `model_refine_handoff.md`, deliberately left at root).

## Coordination rules

- While the two in-flight items run, their ownership columns above are no-go
  zones. `src/lib/interior/` belongs to the interior agent alone.
- Never `git commit` from an agent; the orchestrator commits after gates.
- Scratch artifacts stay untracked (`playwright-report/`, `qa-evidence/`,
  `test-results/`, `grok-mcp-test.png`, blender probe scripts).
- `ANTHROPIC_API_KEY` lives in `.env.local` (gitignored) and Vercel project env.
  The key pasted in chat earlier today should be treated as compromised —
  rotate at console.anthropic.com if not already done.
