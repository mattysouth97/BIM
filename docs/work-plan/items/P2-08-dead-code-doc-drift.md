---
id: P2-08
title: Delete dead code, fix doc drift, remove stray artifacts
priority: P2
area: infra
status: done
owner: claude-opus-4-8-ultrawork
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-05]
---

# P2-08 — Delete dead code, fix doc drift, remove stray artifacts

## 1. Requirement (RE)
- **Problem** (all verified): legacy renderer files with zero importers — src/components/viewer/{building-model,slab-mesh,column-generator,roof-generator,floor-mesh,facade-generator,material-panel}.tsx + window-texture.ts (~1,000 LOC; grep shows the only non-test match is src/lib/procedural/facade-generator.ts, the LIVE procedural generator, and facade-generator.tsx ↔ window-texture.ts reference only each other). `SAOPostProcessing` is defined (src/components/viewer/building-scene.tsx:86) and never mounted — the live path is OutlinePass-based (:511 comment). Dead upload parsers src/lib/upload/energy-bill-parser.ts + floor-plan-metadata.ts (only their own tests consume them); src/lib/energy-api-client.ts imported nowhere. 48 @typescript-eslint/no-unused-vars warnings across 25+ files. CLAUDE.md drift: :15,41,64 document SAOPass as active (replaced by OutlinePass), :23 "7 draw calls total" though polygon towers emit ~36, "era-weathered textures" though textures apply only to the ground plane. Repo hygiene: 7 tracked root test-0*.png (~6.4 MB, Apr 11), stray empty dir literally named `C:UsersNamBIMsrclibportfolio__tests__`, docs/screenshots/ are pre-pivot (ifc-architecture-model.png etc.).
- **Impact**: misleading docs for every future agent; dead code compiled/linted forever; 6+ MB of binary junk in git history going forward.
- **Use case**: As a maintainer I want the repo to contain only live code and truthful docs so that agents and humans navigate it safely.

## 2. Specification (SDD)
- **Context pack**: grep results above (re-verify each file's importer count before deleting: `grep -rln "<basename>" src e2e`); CLAUDE.md full; src/components/viewer/building-scene.tsx:80-130,505-515; tsconfig.json.
- **BDD scenarios**:
  1. Given the dead-file list, When deleted along with their orphan tests, Then `pnpm build` + `pnpm test` stay green.
  2. Given cleanup done, When tsconfig `noUnusedLocals`/`noUnusedParameters` are enabled, Then the build passes (fix remaining unused vars first — the 48 warnings).
  3. Given CLAUDE.md, When updated, Then post-processing = OutlinePass, draw-call claims are qualified per geometry path, texture claims match ground-plane-only reality.
  4. Given root + docs, When cleaned, Then test-0*.png, the stray dir, and pre-pivot screenshots are gone (or screenshots regenerated per P2-04 if still wanted).
- **Order**: fix unused vars → delete dead files → enable tsconfig flags → update CLAUDE.md → remove artifacts. Small commits per step for bisectability.

## 3. Constraints (CDD)
- **Design constraints**: verify zero importers immediately before each deletion (imports may have changed since review); keep src/lib/procedural/facade-generator.ts (live); if a dead parser has plausible near-term use, move decision to PR description — default is delete (git history preserves it).
- **May touch**: the listed dead files + their tests, building-scene.tsx (remove SAOPostProcessing block), tsconfig.json, eslint config (if needed to promote warnings), CLAUDE.md, root test-0*.png, the stray directory, docs/screenshots/.
- **Must not**: touch live viewer components (procedural-building-model.tsx, outline-post-processing.tsx, building-layers.tsx…), energy/retrofit logic, or public/releases/**; do not git-rm anything with a live importer.
- **Fitness functions**: zero no-unused-vars warnings; tsconfig flags on and green; `grep -rln` finds no references to deleted modules; CLAUDE.md statements verifiable against code.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: none new — this is deletion; existing suite is the gate. Delete the orphan tests of deleted modules in the same commit.
- **Gates**: `pnpm build`; `pnpm test`; `pnpm lint` (zero warnings after); repo size check (`git count-objects -vH` before/after optional).
- **Security / honesty checklist**: CLAUDE.md contains no aspirational/false architecture claims; no deleted file was load-bearing (all gates green after each commit).
- **Acceptance criteria**:
  - [x] All listed dead files + orphan tests deleted
  - [x] SAOPostProcessing removed from building-scene.tsx
  - [x] noUnusedLocals/noUnusedParameters enabled, all no-unused-vars warnings resolved
  - [x] CLAUDE.md corrected; stray dir + test-0*.png + stale screenshots removed
- **Done when**: the repo compiles with strict unused checks and every CLAUDE.md claim traces to live code.

### Evaluation notes (2026-07-21, ultrawork)

- **Dead files deleted (23 tracked paths)** — importer counts re-verified immediately before
  each deletion, per §3: viewer legacy renderer cluster `building-model.tsx` (+ its private
  imports `slab-mesh`, `column-generator`, `roof-generator`), isolated pair
  `facade-generator.tsx` ↔ `window-texture.ts`, standalone `floor-mesh.tsx`,
  `material-panel.tsx`; lib modules `energy-bill-parser.ts` (+ its orphan test, −12 tests),
  `floor-plan-metadata.ts`, `energy-api-client.ts`. The earlier grep hits on "building-model"
  were substring false-positives on the LIVE `procedural-building-model.tsx`; `GroundPlane`
  (imported by the dead file) is live and untouched.
- **SAOPostProcessing removed** from building-scene.tsx with its SAOPass/EffectComposer/
  RenderPass/OutputPass/useFrame imports — it was defined but never mounted; the live pipeline
  is `<ScenePostProcessing />` (OutlinePass). A pointer comment marks the removal.
- **Unused-symbol sweep**: all `@typescript-eslint/no-unused-vars` warnings resolved (45 at
  start of the item, plus cascades). eslint rule configured with `^_` ignore patterns
  (args/vars/caught/destructured) so required-position params use the explicit `_` convention.
  `noUnusedLocals` + `noUnusedParameters` enabled in tsconfig; tsc surfaced 9 additional
  unused symbols (6 legacy `import React`, 3 unused params) — fixed. Full `tsc --noEmit` also
  surfaced 4 PRE-EXISTING test-fixture type drifts (P2-02 `district_kwh`/CO2Result split,
  P1-05 `primaryEnergyPerArea`, P2-05 optional `metrics`) invisible to vitest/next-build —
  fixture fields added, now repo-wide clean.
- **CLAUDE.md corrected**: post-processing = OutlinePass (not SAOPass); draw-call claim
  qualified (7 on the rectangular InstancedMesh path; polygon towers emit more via per-face
  Groups); PBR texture claim scoped to the ground plane (building materials are recipe-driven,
  not image maps); era boundary claim reworded to match.
- **Artifacts**: 7 root `test-0*.png` (~6.4 MB) and 4 pre-pivot `docs/screenshots/` PNGs
  git-rm'd; stray empty `C:UsersNamBIMsrclibportfolio__tests__` dir removed (untracked).
- **Honest scope note**: 9 lint warnings remain, ALL from other rules
  (5 `react-hooks/exhaustive-deps`, 4 `react-hooks/incompatible-library`) — pre-existing,
  outside this item's no-unused-vars fitness function, and not behavior-safe to auto-fix
  (adding effect deps changes re-run semantics). Zero `no-unused-vars` remain.
- Gates: `tsc --noEmit` clean with strict unused flags · `pnpm lint` 0 errors /
  0 no-unused-vars · `pnpm test` **1114 passed** (1126 − 12 deleted orphan tests) ·
  `pnpm build` green.
