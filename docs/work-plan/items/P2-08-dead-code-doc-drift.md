---
id: P2-08
title: Delete dead code, fix doc drift, remove stray artifacts
priority: P2
area: infra
status: not-started
owner: unassigned
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
  - [ ] All listed dead files + orphan tests deleted
  - [ ] SAOPostProcessing removed from building-scene.tsx
  - [ ] noUnusedLocals/noUnusedParameters enabled, 48 warnings resolved
  - [ ] CLAUDE.md corrected; stray dir + test-0*.png + stale screenshots removed
- **Done when**: the repo compiles with strict unused checks and every CLAUDE.md claim traces to live code.
