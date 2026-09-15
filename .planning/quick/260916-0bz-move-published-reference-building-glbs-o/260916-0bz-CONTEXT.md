# Quick Task 260916-0bz: Move published reference-building GLBs out of public/ into blob or CDN storage so model twelve does not hit a third Vercel ceiling - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning

<domain>
## Task Boundary

Move the 52 published reference-building `.glb` files (470 MB) out of
`public/reference-buildings/` into blob/CDN storage so adding model twelve
does not hit a third Vercel ceiling. Two ceilings already failed by actual
deployment, not prediction: serverless functions traced to 296.3 MB against
the 250 MB limit (cleared by `outputFileTracingExcludes`), then `pnpm run
build` OOM'd twice on the 4-core/8 GB builder (cleared by Enhanced Build
Machines, which is now load-bearing).

This task does **not** move textures, HDR, wasm, landing images, manifests,
datasets, flow graphs, SVG, licence files, or source IFCs.

</domain>

<decisions>
## Implementation Decisions

### What leaves the app bundle
- **GLBs only.** 52 files, 470.12 MB under `public/reference-buildings/`.
  Manifests, datasets, flow graphs, SVG, spaces/openings/roof-planes JSON and
  licence files stay in git.
- Textures, HDR and wasm (~62 MB elsewhere in `public/`) stay in the app
  bundle. They are a different consumer (atlas, ground, CAD convert) and a
  different failure mode.

### Claude's Discretion
- **Hosting:** Vercel Blob on the existing `bim` project
  (`matts-projects-d0677dc4` / https://bim-self.vercel.app). No blob client
  exists in the repo today. Same-account public blob URLs; do not introduce
  a second cloud (R2/S3) unless Blob cannot serve these sizes.
- **Public URL contract:** Keep `/reference-buildings/:id/:file.glb` so
  existing e2e (`e2e/model-anchors.spec.ts` hits `/reference-buildings/${id}/model.glb`),
  gallery pages, and bookmarks do not change. Rewrite or proxy to blob; do
  not bake absolute blob URLs into manifests as the only locator.
- **Git vs local/dev:** `git rm` the 52 GLBs from `public/` so the Vercel
  build checkout no longer contains 470 MB of meshes (the actual OOM cause).
  Add a local fetch/restore script so Playwright and `next dev` can put the
  files back on disk when needed. Do not git-filter history in this task
  (history size is a separate problem; build memory is this one).
- Manifest `file` fields stay relative (`model.glb`, `hvac.glb`, …).
- Enhanced Build Machines stays enabled until a clean 8 GB builder build is
  proven; this task's success criterion is that the 8 GB builder can build
  again, not that the paid setting is immediately turned off.
- Do not add a twelfth model in this task.

</decisions>

<specifics>
## Specific Ideas

- Measured 2026-09-16: `public/` 547.4 MB; `public/reference-buildings/`
  485.2 MB of which `.glb` 470.12 MB (52 files), `.json` 15.04 MB (75 files),
  `.svg` 0.08 MB (11 files).
- `next.config.ts` `outputFileTracingExcludes` already lists
  `public/reference-buildings/**/*.glb` (and JSON/SVG the user chose to leave
  in git). Keep that exclude; it is not a substitute for removing the files
  from the checkout.
- Production currently serves these as Vercel static files from `public/`
  (the comment in `next.config.ts` calling that "the CDN" is Vercel's static
  asset CDN, not a blob store). After the move, the same URL path must still
  200 for every published GLB, including Sixty5 `plumbing.glb` (69.7 MB).
- Layer GLBs are opt-in and lazily loaded; the URL contract must cover them
  too, not only `model.glb`.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/STATE.md` — v6.0 paused; this is the highest-value unblocked work
- `docs/04_Agent-Handoffs/CURRENT.md` — production verified at `0abbdaf`,
  eleven models, `public/` 549 MB, Enhanced Builds load-bearing
- `next.config.ts` — `outputFileTracingIncludes` / `Excludes` and the trap
  that an include only ADDS files
- `e2e/model-anchors.spec.ts` — asserts `GET /reference-buildings/${id}/model.glb`
- `scripts/build-reference-building.mjs` — writer of `model.glb` and layer GLBs
- AGENTS.md deploy section — clean detached worktree, `--scope matts-projects-d0677dc4`,
  functions pinned to `icn1`

</canonical_refs>
