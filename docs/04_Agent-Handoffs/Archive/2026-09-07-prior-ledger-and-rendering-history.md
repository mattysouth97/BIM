---
type: handoff
status: historical
archived: 2026-09-07
---

# Prior ledger and rendering handoff history

Archived from CURRENT.md after the professional mission update. Dates and next-action lists below are historical; consult CURRENT.md for active priorities.

## Recent Architectural Changes (2026-09-04 latest: directional setbacks)

- **P2-31 — a step goes on one face.** `makeLevel` used to shrink each plate
  about its centroid, splitting one real step across four faces. New
  `src/lib/cad-reconstruction/setback.ts`: `chooseSetbackFace` picks the face
  from 용도지역 + the slack the parcel actually shows; `insetEdgeToArea` takes
  the area off it (half-plane clip, bisected on offset — area is monotonic in
  the offset, so it converges and is deterministic).
- **The invariant that keeps this honest: the rule picks the FACE, 층별개요 picks
  the AMOUNT.** No figure from 건축법 시행령 제86조 is encoded anywhere — not
  1.5 m, not H/2. A rule that contributes no numbers cannot contribute a wrong
  one, and the amount stays sourced to the register.
- **New `/api/vworld/zoning`** reads `LT_C_UQ111.uname` (verified: returns
  "제3종일반주거지역", "일반상업지역" verbatim). `DAYLIGHT_SETBACK_DISTRICTS`
  lists 전용/일반주거지역 only — **준주거지역 is deliberately absent**, it reads
  like a 주거지역 and 제86조 does not list it. An absent district is *unknown*,
  never residential.
- **Degrade path, all tested:** 주거지역 + north slack → `daylight_setback`;
  parcel only → `lot_slack` (geometry, explicitly not a code rule); neither →
  `undetermined` + a stated assumption that per-orientation envelope is
  unreliable. A single-face step that would collapse the plate emits a
  `ConflictEntry` and falls back to concentric.
- **`EvidenceInput.parcel` (additive)** closes a real gap: the model could hold
  a building outline OR a parcel, never both, so the slack that decides the face
  was unreachable whenever a real outline existed. Used only for the setback —
  a parcel ring must never reach the footprint chain.
- **Known bug in `evidence.ts`, owned elsewhere, not fixed here:**
  `evidence.ts:383` builds `gisBox` from any GIS ring, missing the
  `!gisRingIsParcel` guard that line 382 applies to `gisArea`. A parcel's bbox
  becomes controls C5/C6 graded **B-OBSERVED**/`SRC-GIS-BLDG`, and
  `reconstruct.ts:265` then builds the footprint from them with the method
  string "사용자가 진술한 …" though no user stated anything. Reproduced: a 200 m²
  building on a 7,060 m² lot yields `footprint.areaSqm = 7060.4`, B-OBSERVED.
  The lot is reported as the building, graded as observed evidence.
- **VWorld carries no building height — P2-25's measured-height tier is void.**
  `LT_C_SPBD` returns exactly ten keys and `buld_hg` is not one of them:
  verified across 34 production buildings (`height: null` in every case;
  `groundFloors` real, 28/30) and four upstream bboxes in four cities. The
  documented chain `ledger heit → VWorld measured → era estimate` has **no
  supplier for the middle tier**; in practice it is `ledger heit → era
  estimate`. `parseBuildingAttributes` is correct — the field is absent, not
  mis-parsed. Six candidate layers were eliminated, which is a result about
  **those six**, not about the platform: do not assume a height layer exists.
  Genuinely unreachable code: `engine/steps/ingest.ts:17` can emit
  `source: "vworld-measured"` for a height that nothing can supply. **NOT
  unreachable, do not delete:** the `'measured'` heights grade in
  `input-provenance.ts:74` — `ledgerHeit > 0` reaches it constantly, and only
  the `measuredHeightM` disjunct is dead. No test caught any of this because
  every test on the path injects the height itself.
- **VWorld production was broken and is now fixed** (another session): the
  functions ran in `iad1` (Washington) and api.vworld.kr refuses that egress —
  `vercel.json` now pins `regions: ["icn1"]`. Verified `X-Vercel-Id`
  `icn1::iad1` → `icn1::icn1`, 502 → 200 with a real 34-point ring. Until that
  landed, every production user silently got the 건축면적-solved rectangle
  instead of the observed outline. It was NOT a geo-block or a bad key.

## Recent Architectural Changes (2026-09-04 later: per-storey envelope)

- **P2-30 — the stack is no longer one extruded prism.** `FloorSpec.plate`
  (optional, `[outer, ...holes]` in the twin's local metre frame) threads
  through slabs, facade faces, the column grid and the parapet;
  `applyLevelPlates` is the shared adapter from `TwinLevel[]` onto floor
  geometry. **Absent plate = building footprint**, so every pre-P2-30 building
  is byte-identical — that equality is locked by a test, not a convention.
- `envelopeQuantities` now returns `grossWallAreaSqm = Σ perimeterᵢ × heightᵢ`,
  `roofAreaSqm = top plate + Σ max(0, areaᵢ − areaᵢ₊₁)`, `volumeM³` summed per
  storey, and `planAreaSqm` = the lowest **above-grade** plate. Basements stay
  recorded, not extruded.
- The traceable engine walls each storey on its own plate and emits one roof
  surface per terrace. Plates ride the ingestion boundary channel tagged
  `LEVEL_PLATE_ENTITY_PREFIX`, carrying the **same grade** as the outline they
  were scaled from.
- **Traps:** slabs bucket by *distinct plate*, not per storey, so the draw-call
  budget holds — and because a pick's `instanceId` is scoped to the batch it
  hit, `resolvePickedFloor` reads the hit mesh's own `instanceToFloor` before
  the building-wide lookup. A terrace surface carries the plate it sits on as
  geometry while its **area** is the exposed difference; the canonical model has
  no polygon-difference type, and the physics reads the area.
- **VWorld finding (verified against the live API, 2026-09-04):**
  - `LT_C_UQ111` returns 용도지역 verbatim in `uname` ("제3종일반주거지역",
    "일반상업지역"). P2-31 was specced assuming this was unavailable; it is not,
    so 일조권 사선제한 can be applied as a *sourced* rule. Item corrected.
  - `LT_C_SPBD` returned **only** `gro_flo_co` among the P2-25 attributes — no
    `buld_hg`, no `und_flo_co` — on the sample queried. If that holds generally,
    the VWorld measured-height fallback never fires and `heit=0` falls straight
    through to the era estimate. Worth confirming before relying on it.
  - There is **no** open 3D-building endpoint: `req/3ddata` 404s and no
    `LT_C_SPBD_3D`-style layer resolves. VWorld's 3D map is not an API here.

## Recent Architectural Changes (2026-09-04: one ledger geometry producer)

- **P2-29 — `reconstruct()` is now the single producer of ledger geometry.**
  Before this the app derived a building shape three times and they disagreed:
  `building-geometry.ts` from a GIS **bbox** or a 1.5:1 rectangle,
  `ledger-baseline-model.ts:1233` from its own 1.5:1 rectangle, and
  `cad-reconstruction/reconstruct.ts` from the register's per-floor areas —
  only the third reading 층별개요, and its levels discarded at
  `upload-stage.tsx:427`.
- New `src/lib/cad-reconstruction/ledger-bridge.ts` — `evidenceFromLedger`
  (claims-free evidence), `reconstructModel` (model only, no DXF or documents),
  `twinGeometryFromModel` (mm → local metres, bbox-centred, per-level plates),
  `ledgerRingFromModel`, `provenancePatchForModel`. Pure; no store imports.
- `useLedgerReconstruction` memoises it on content, not identity, and runs on
  data the page already fetched — no extra register call.
- **New `LedgerFootprint` kind `reconstructed`.** Its `observed` flag alone
  decides authority: `repeated_graphical_evidence` for a trace,
  `deterministic_rule_inference` + `LEDGER_FOOTPRINT_ASSUMPTION_ID` for a ring
  solved from 건축면적. Neither is ever `dimensioned_vector_geometry` (ADR-003).
- **Traps to keep:** `provenancePatchForModel` never returns
  `hasCadFootprint`, and returns `null` outright when an uploaded CAD outline is
  already recorded — the automatic path runs every render, the upload once.
  A GIS trace is **not** flagged `reconstructedFootprint`; only a solved ring is.
- Learned while building it: the model is more resilient than the item assumed —
  C2 falls back 연면적 ÷ 지상층수 (`evidence.ts:410`), so blocking needs every
  dimensional route closed, not just `archArea=0`.
- `/building/demo` carries a canned `recipeOverride` and deliberately bypasses
  this path; only a real ledger id exercises the twin side.
- Next: **P2-30** (per-storey envelope — the stack is still one extruded prism),
  then **P2-31** (directional setbacks). Strictly in that order.

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

1. **P2-31 — directional setbacks.** `makeLevel` still shrinks each plate about
   its centroid, so a step's area is right and its face is not. Now unblocked
   further than specced: `LT_C_UQ111` supplies 용도지역, so 일조권 사선제한 is a
   sourced rule rather than a recognised pattern.
2. Confirm whether `LT_C_SPBD` carries `buld_hg` at all (see above); if not,
   P2-25's measured-height tier is dead code.
3. Integrate the canonical engine into step 3; mount refinement inputs in the twin.
4. Fix the two E2E defects above (canvas sizing, cross-test state leak).

## Relevant Documents

[[Current State]] · [[Project Overview]] · [[System Architecture]] ·
[[Data Flow]] · [[Deployment and Environment]] · [[Testing Strategy]]

## Last Verified

2026-08-27 — against production and a full local test run.
