# Schematic-Driven Generative BIM — Session Handoff, 2026-08-17

Branch: `merge/digital-twin-pivot`. Consolidates the two root-level handoff
notes (`handoff-1.md`, `handoff-2.md`, both deleted after this fold) plus the
integration pass that closed the day. Three Claude sessions shared this
worktree concurrently; a fourth workflow died mid-run and left orphaned lanes,
triaged in §4.

Final gate for the whole wave (integration pass, 15:47–15:52):

| Gate | Result |
|---|---|
| `pnpm vitest run` | **3,418 passed / 0 failed / 4 skipped** (304 files) |
| `pnpm exec tsc --noEmit` | **exit 0** |
| `pnpm build` | **passes** (28 routes, incl. `/api/generative/interpret`) |
| `pnpm exec eslint src` | **0 errors, 0 warnings** |

---

## 1. What the wave delivered

### 1.1 Measured blueprint fidelity (spec §55)

`src/lib/generative/blueprint/metrics.ts` — `measureBlueprintFidelity(blueprint,
building)`, pure and deterministic. Per-dimension numbers with **no aggregate
score** (the spec forbids a fake single number):

- **boundary** — per shared level: `areaDeviationRatio`,
  `symmetricDifferenceRatio` (blueprint plate vs `GeneratedLevel.polygon`),
  plus mean/worst (`null` when nothing was comparable, never 0).
- **voids** — per void per floor: `retainedRatio = 1 − builtOver/voidArea`.
- **cores / anchors** — displacement in metres; anchors are a discriminated
  union on `measured`, so a kind with no comparable generated feature says so
  (`measured: false` + reason) instead of inventing a number.
- **zones** — `overlapRatio` with a per-floor breakdown; the zone→space join
  replays the compiler's own id derivation via `deriveZoneSpecId`.
- **topology** — each `DesignRelationship` classified satisfied / violated /
  not-measurable; ratio over measurable ones only. Measurable today:
  REQUIRES_ADJACENCY, ADJACENT_TO, PREFER_ADJACENCY, AVOID_ADJACENCY,
  REQUIRES_EXTERIOR, CONNECTED_TO, OPENS_TO.

`server/generate-from-blueprint.ts` returns `fidelity` in every successful
payload; the API route streams it verbatim.

**On screen** (Finish phase): `src/components/generative/schematic/fidelity-report.tsx`
renders those numbers and nothing else — no blended headline, `null` prints as
"not measurable" rather than 0.0%, and `NotMeasured` entries are shown *with*
their reasons, styled as information rather than failure. Colour bands are
declared in-file as a reading aid, never a verdict, with the raw percentage
always printed beside the colour. Store wiring in
`src/store/__tests__/blueprint-store-fidelity.test.ts`.

### 1.2 Shared compiler contracts

New exports in `blueprint/compile.ts` — keep these single-sourced; `metrics.ts`
replays them by import and silent drift breaks the zone join:

- `blueprintPlateFrame(blueprint)` — the ONE blueprint→engine transform (plates
  per level, voids subtracted, plus `shiftXMm/shiftZMm`). Do not re-derive the
  shift anywhere else.
- `blueprintLoopIndex`, `blueprintRegionToPolygonMm`.
- `deriveZoneSpecId(rawId, usedIds)` — the ONE zone→ProgramItem id rule.

### 1.3 SVG blueprint import (spec §33 input tier B)

`blueprint/from-svg.ts` — `fromSvgString`, `svgToSegments`, mirroring
`from-cad.ts` and feeding the shared `interpretSegmentsToBlueprint` core.
Hand-rolled dependency-free XML walker (deliberately **no DOMParser** — it
exists in happy-dom tests but not in the Node API-route runtime). Supports
line/polyline/polygon/rect, path `M/m L/l H/h V/v C/c Q/q A/a Z/z` (arcs via
real SVG 1.1 F.6 endpoint→centre math), implicit repetition, multi-subpath,
nested `<g>` transforms, `<text>/<tspan>` labels, `data-layer`-or-`id` layer
semantics inherited through groups. `viewBox` is the authoritative coordinate
frame; malformed input **throws** rather than silently mis-parsing.
Unsupported and documented as such: `S/s`/`T/t` shorthands,
`<use>/<defs>/<circle>/<ellipse>`, percentage/physical CSS units.

**Entry point** (Finish phase): `blueprint/import-svg-file.ts` reuses the DXF
path's own vocabulary (`CadLayerRole`, `CadLayerAssignments`,
`summariseLayerCounts`, `classifyImportFailure`, `CadImportReport`,
`interpretSegments`) so one dialog, one mapping table, one preview and one
adoption step serve both sources. Honest format differences are reported, not
hidden: SVG "layers" are `data-layer`/`id` inherited through `<g>`, unlayered
geometry is counted in `SvgReadFacts.unlayeredSegmentCount`, per-layer
`entityCount` is an EDGE count, and per-layer `textCount` is structurally
unavailable so the dialog prints "—" rather than a fake 0.

### 1.4 Engine fixes

- `blueprint/compile.ts` — **entrance anchors now drive
  `orientation.primaryEntranceFacade`** (was hardcoded `"south"`).
  Nearest-facade resolution against the largest plate's bbox using the
  compiler's own `shiftXMm/shiftZMm`; +Z = north per `generate/partitions.ts`;
  hard-hold anchor beats soft; no entrance anchor ⇒ `"south"` exactly as
  before. Extra entrance anchors surface as an `entrance-secondary` assumption
  rather than being dropped.
- `blueprint/validate-blueprint.ts` — local arc/bezier tessellation deleted;
  now calls `geom/curves` with the tolerance imported from `./compile`, so
  validator and compiler cannot disagree on curved-loop closure.
- `geom/polygon.ts` — `polygon-clipping` ESM interop fix. Its ESM build exports
  only a default object; named imports type-checked against a lying `.d.ts` but
  failed Turbopack static analysis and broke `next build`. **Never reintroduce
  named imports here.**
- `components/workspace/bim-properties-inspector.tsx` — removed a manual
  `useMemo` the React Compiler could not preserve.
- `bim/__tests__/authoring-asset-manifest.test.ts` — stale pin 46 → 102
  authoring families, plus a uniqueness assertion.

### 1.5 Security fix — infinite-loop DoS (HIGH)

The zone-id de-dup loop in both `compile.ts` and `metrics.ts` had a reachable
fixed point: three distinct, schema-valid zone ids sharing a 48-char prefix
hung `compileBlueprintToSpec` forever, pinning the event loop of
`POST /api/generative/generate-from-blueprint` on attacker-choosable JSON
(reproduced end-to-end by two independent verifiers). Fixed by the shared
`deriveZoneSpecId` with a per-retry attempt counter; the exact spinning trio is
pinned as a regression test in `blueprint-metrics.test.ts`.

Also fixed from the same adversarial review: SVG `Z`-then-draw corruption (a
draw command after closepath appended into the closed subpath; now conforms to
SVG 1.1 §8.3.3), 23 added SVG tests over previously untested risky paths, and
dropped-floor blindness in the U/H/T/trapezoid suites.

### 1.6 Acceptance coverage

`acceptance-required-shapes.test.ts` (40 tests) proves U, H, T, trapezoid,
podium+tower and stepped massing end-to-end (blueprint → compile → build → BIM
emit → validate). Plus `acceptance-podium-tower.test.ts` (7),
`blueprint-compile-curved.test.ts` (4, stadium boundary within 2% of true
area), `acceptance-multi-courtyard.test.ts` (6),
`coverage-vertical-and-voids.test.ts` (terrace roof, void-subset floors, ring
circulation). No `it.skip` placeholders were added anywhere.

---

## 2. Engine gaps register (measured, real, NOT fixed)

1. **Zone geometry is positionally lossy — the biggest fidelity gap.**
   Compilation keeps a zone's area/type/levels but discards its drawn REGION,
   so the space solver packs program anywhere; an in-plate `zone-meeting`
   measured `overlapRatio 0`. True schematic fidelity needs a region-aware
   space solver. The metric makes this visible per zone per floor.
2. **No exterior doors exist** (`generate/openings.ts` FOLLOW-UP comment) —
   entrance anchors are permanently `measured: false`.
3. **Only `blueprint.cores[0]` compiles** — `BuildingSpec` carries one core;
   `CoreFidelity.compiled` flags the dropped ones.
4. **Zones beyond 56 are dropped** (`zoneFacts.slice(0, 56)`) — replicated
   exactly in the metric so the 57th zone reports as not-measured.
5. **One global core rect serves every level**, sited on the primary plate; an
   off-centre tower over a podium strands it (`CORE_OUTSIDE_PLATE`).
6. **Same program lands in different bands on different levels**, so a stacked
   zone reads like its best level; the per-floor `floors[]` breakdown exposes it.
7. **Not-measurable relationship kinds** (FACES, ALIGNED_WITH, CENTERED_ON,
   STACKED_WITH, CONTAINS, INSIDE): the generated model carries no per-space
   orientation/stacking identity to test against.
8. **Corridor reachability on CONCAVE plates is still broken.** Lane O3 (§4)
   repaired plates cut by voids; an L-plate at 5 storeys / 6,000 m² still
   yields 12 × `SPACE_NOT_ACCESSIBLE` at every seed tried. Measured during the
   integration pass, and now deliberately used as the critical-bearing fixture
   in `options-panel.test.tsx` — closing this gap will fail that test loudly,
   which is the intended signal to pick a new fixture.
9. `spec.core.offsetXMm/ZMm` absolute-vs-relative mismatch — **fixed** by lane
   O2; listed here only so the trap is not re-introduced.

---

## 3. Deliberately deferred (not forgotten)

- **Renderer per-level plates** — `BuildingRecipe` carries one
  `footprintPolygon`, so podium-tower/stepped render as a single extrusion. The
  BIM graph stays authoritative and `approximations` notes fire. Fix requires
  `src/lib/procedural/**`, which belongs to the renderer session — see
  `model_refine_handoff.md` at the repo root (**kept, not folded**: it is that
  session's own zone marker and carries live operational notes on the
  `DATA_GO_KR_API_KEY` env var, the proxy `Accept` header and the deployment
  target).
- **Two cores** — `compile.ts` consumes `cores[0]` only; the `"dual"` strategy
  is deliberately central. Needs a `building-spec.ts` schema ripple.
- **Sentinel test** `acceptance-locks-and-stability.test.ts:354` pins that
  partial regeneration is NOT room-level. It is designed to fail the day
  same-floor wing-level regen lands. O1's floor-level work did not flip it
  (file untouched, verified in the integration pass).

---

## 4. Orphaned-lane verdicts (workflow `wf_30ed4cea-6fa`)

That workflow launched 9 agents in 7 lanes with exclusive file ownership, then
died. Lanes O1, O2, S1, S2, S3 reported success; O3, O4, O5 never reported.
Triage during the integration pass:

| Lane | Task | Verdict |
|---|---|---|
| O1 | Floor-scoped partial regeneration | **KEEP.** `build.ts`, `server/edit.ts`, `partial-regen-floors.test.ts` all green; sentinel test untouched. |
| O2 | Core-offset semantics | **KEEP.** `generate/core.ts`, `generate/pipeline.ts`, `core-offset-frame.test.ts` green. |
| O3 | Corridor reachability on multi-void plates | **KEEP — landed complete despite never reporting.** See below. |
| O4 | `double-height` rule consumption | **KEEP — landed complete despite never reporting.** 26 double-height references in `blueprint/compile.ts`; `blueprint-double-height.test.ts` green. |
| O5 | Rotated-wing local-frame room solving | **NEVER STARTED — nothing to revert.** `generate/types.ts` and `generate/partitions.ts` are unmodified in `git status`, and the `space-plan.ts` diff contains only O3's block plus its call-site swap. No half-done remnants. |
| S1 | `/api/generative/interpret` route + server module | **KEEP.** Route present in the production build; `interpret-route.test.ts` + `interpret-server.test.ts` green. |
| S2 | Extract `blueprint/segment-curves.ts` | **KEEP.** File present, compile/validate both consume it. |
| S3 | `resolveReasoningProvider` tests | **KEEP.** `provider-resolution.test.ts` green. |
| S4 | Terrace roof / void-subset / ring circulation | **KEEP.** `coverage-vertical-and-voids.test.ts` green, lints clean. |

All six named lane test files: **56/56 passing**. Full generative suite: 865
passing / 4 skipped across 57 files.

### 4.1 O3 in detail — and the options-panel metric drift

O3 replaced the `keptCorridors` filter in `generate/space-plan.ts` with
`retainedCirculation(...)`. The old rule dropped any corridor whose own room
strip took no rooms. On a plate cut by voids, a band decomposes into
independent solid cells; the cell adjoining the core is often thin, loses the
greedy area/aspect competition in `chooseStrip`, takes no rooms, and was
dropped — severing the only door-graph path from the lift lobby to whole wings.
`retainedCirculation` runs a Dijkstra walk from the core where a route's cost
is the number of dropped cells it must reinstate, and reinstates them at FULL
cell size (the strips they would have served are empty, so that floor is a
walk-through, not rooms). Connectivity mirrors `generate/openings.ts` exactly:
a door exists between a room and circulation, never between two circulation
spaces. Deterministic — every tie resolves to the lower index.

**Two `options-panel.test.tsx` failures were caused by this, and they are a
genuine engine repair, not a regression.** Verified by temporarily restoring
the pre-O3 filter and re-measuring the fixtures:

| Courtyard fixture (seed 22) | pre-O3 | post-O3 |
|---|---|---|
| critical violations | **12 × SPACE_NOT_ACCESSIBLE** | **0** |
| circulation ratio | 0.1163 | 0.3589 (advisory `CIRCULATION_OVER_BUDGET`) |
| net area | 2797.07 | 3855.47 |

The same before/after sweep confirmed O3 changed **nothing** on the L-shape,
atrium-library and warehouse prompts (byte-identical counts and metrics), so it
introduced no regressions.

The test's premise — "the courtyard scheme has more critical issues than the
research scheme" — was resting on that bug. Resolution: the three geometry rows
still use the same two real generations and still disagree in the documented
directions; the critical row moved to its own pair (research vs. a real
L-plate generation that still severs, gap #8 above). No expected number was
blindly bumped, and no fixture was fabricated — every fixture is still a real
offline-provider generation run through the real deterministic build.

---

## 5. Repo hygiene done in the integration pass

- Deleted: `handoff-1.md`, `handoff-2.md` (folded into this file).
- Verified already-absent: `aa-tmp-reach-probe.test.ts`, `zz-probe-*.ts`,
  `zzz-*` — no scratch/probe files remain under `src/`.
- `coverage-vertical-and-voids.test.ts` unused import and the
  `schematic-canvas.tsx` `react-hooks/set-state-in-effect` error that handoff-2
  left for the schematic session: both already resolved; `eslint src` is clean
  at error *and* warning level.
- Still untracked and NOT part of this wave — decide before committing:
  `grok-mcp-test.png`, `playwright-report/`, `qa-evidence/`, `test-results/`,
  `.playwright-mcp/*`, `scripts/blender/__pycache__/`,
  `scripts/blender/_probe_blender.py` (a probe belonging to the Blender/renderer
  session — left in place rather than deleted across an ownership boundary).

Nothing is committed. The tree is coherent and fully green, ready for one
integrated commit.
