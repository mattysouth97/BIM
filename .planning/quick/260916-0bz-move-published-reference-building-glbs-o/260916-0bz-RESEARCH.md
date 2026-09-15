# Quick Task 260916-0bz: Move published reference-building GLBs to Vercel Blob - Research

**Researched:** 2026-09-16
**Domain:** Vercel Blob public object storage + Next.js external rewrites
**Confidence:** HIGH (in-repo + official Vercel/Next docs). Store hostname is unknown until a store is created.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
None stated in CONTEXT.md. History `git filter-repo` / BFG is explicitly out of this task.
</user_constraints>

## Project Constraints (from CLAUDE.md / AGENTS.md)

- Product shape is fixed; this task only moves bytes, it does not add a front door or a twelfth model.
- Functions stay pinned to Seoul: `vercel.json` is `"regions": ["icn1"]` only. Do not remove it — VWorld refuses non-`icn1` egress. [VERIFIED: vercel.json:1-4]
- Deploy from a **clean detached worktree**. `vercel --prod` uploads the **working tree, not HEAD**. Untracked files that live code references work locally and 404 after a clean deploy; the inverse (gitignored-but-present binaries) is this task's OOM trap.
- Scope flag is load-bearing: `vercel --prod --yes --scope matts-projects-d0677dc4`.
- HEAD author email must be `namseunghun97@gmail.com` or the deploy is `BLOCKED` (not a build failure).
- Bare `pnpm` fails on this machine. Invoke binaries directly:
  `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run`, `node node_modules/@playwright/test/cli.js test`.
- `.env*` is gitignored. Never commit `BLOB_READ_WRITE_TOKEN`. [VERIFIED: .gitignore:35-36]
- `.vercelignore` is load-bearing (QA trees abort the CLI upload). Add the GLB glob there in the same change. [VERIFIED: .vercelignore:13-15]
- `outputFileTracingExcludes` already lists `public/reference-buildings/**/*.glb`. Keep it. An include only ADDS files. [VERIFIED: next.config.ts:52-64]

## Summary

The 8 GB builder OOM is caused by **470.12 MB of committed GLBs in the checkout**, not by function tracing (already excluded). Blob can hold these sizes: max file 5 TB, CDN cache up to 512 MB per blob. Largest file is Sixty5 `plumbing.glb` at **69,730,700 bytes** (`byteLength: 69730700` in the published manifest) — under both limits. [VERIFIED: public/reference-buildings/sixty5/manifest.json:1236-1240] [CITED: vercel.com/docs/vercel-blob/usage-and-pricing]

**Primary recommendation:** Create a **new public** Blob store on project `bim` in **`icn1`**. Upload the 52 files with pathname `reference-buildings/<id>/<file>.glb`, `access: 'public'`, `addRandomSuffix: false`. Keep `/reference-buildings/:id/:file.glb` via a **Next.js `rewrites()` external rewrite** (CDN reverse proxy). Do **not** proxy through a route handler. `git rm` the 52 files, gitignore + vercelignore them, restore locally by fetching the public blob URLs.

Do **not** reuse team store `s2mas-blob` (`store_g8cB9J71qBXmpbvk`, region `iad1`, project `s2mas`, 0 files). `bim` has **no connected blob store**. [VERIFIED: `vercel blob list-stores --scope matts-projects-d0677dc4`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GLB bytes at rest | CDN / Blob store | — | 470 MB must leave the app bundle and function trace |
| Public URL `/reference-buildings/:id/:file.glb` | CDN rewrite | Browser fetch | Same-origin contract; Next public/ currently serves this |
| Manifest `file` names, datasets, JSON | Frontend Server + git | — | Stay in `public/` and `loadReferenceBuildingManifest` `fs` read |
| Upload / overwrite GLBs | Operator script (CLI) | — | One-shot / rebuild; not a user-facing API |
| Local Playwright / vitest GLB reads | Developer disk | Blob HTTPS | Restore script puts files back under `public/` |
| Function tracing exclude | API / Backend build | — | Keep; not a substitute for `git rm` |

## Standard Stack

### Core

| Library / tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Vercel Blob (public store) | platform | Object storage + CDN | Locked hosting; 5 TB/file, 512 MB cache; public URL `https://<store-id>.public.blob.vercel-storage.com/<pathname>` [CITED: vercel.com/docs/vercel-blob] |
| Vercel CLI `vercel blob` | 58.9.4 (this machine) | `create-store`, `put`, `get`, `list` | Already installed; no app runtime dependency [VERIFIED: `vercel --version`] |
| Next.js `rewrites()` | next 16.2.10 | Mask blob origin behind `/reference-buildings/...` | Official external-URL rewrite; filesystem checked first so restored local files win [CITED: nextjs.org/docs/app/api-reference/config/next-config-js/rewrites] |
| `@vercel/blob` | 2.8.0 | Optional script SDK (`put`/`list`) | Official client; **devDependency only if used**. CLI is enough. [VERIFIED: npm registry + vercel.com/docs/vercel-blob/using-blob-sdk] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `fs` + `https`/`fetch` | runtime | Restore script | Fetch public blob URLs onto disk; no token |
| Existing `scripts/check-asset-budget.mjs` | in-repo | Guard dirty deploys | Fail if GLBs reappear as untracked, or if `VERCEL=1` and GLBs exist on disk |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Public Blob + rewrite | Route handler `get()` proxy | **Do not.** Streams 69.7 MB through a function; reintroduces duration/memory/Fast Data Transfer cost. Private storage docs say Functions are for private blobs. [CITED: vercel.com/docs/vercel-blob] |
| Public Blob + rewrite | Absolute blob URLs in manifests | Locked out. Breaks e2e and same-origin `baseUrl/${layer.file}` |
| New `bim` store in `icn1` | Reuse `s2mas-blob` (`iad1`) | Wrong project, wrong region, empty. Access/region cannot change after create. [CITED: vercel.com/docs/vercel-blob] |
| R2/S3 | — | Locked: only if Blob cannot serve these sizes. It can. |

**Installation (only if the planner chooses the SDK over CLI):**

```bash
# lockfile is pnpm; bare pnpm fails on this machine — use the repo's working installer
# @vercel/blob must stay a devDependency (scripts only)
```

**Version verification:** `npm view @vercel/blob version` → **2.8.0** (Apache-2.0, `github.com/vercel/storage`, created 2023-04-18, no `postinstall`). Weekly downloads 4.8M. [VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@vercel/blob` | npm | since 2023-04-18 | 4.8M/wk | github.com/vercel/storage | OK | Approved **as optional devDependency**. Prefer CLI so the Next.js bundle gains nothing. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
Browser  --GET /reference-buildings/:id/:file.glb-->  Vercel Edge
                                                      |
                         +----------------------------+----------------------------+
                         | files exist in public/ ?   | files absent (prod after   |
                         | (local restore / dirty     | git rm)                    |
                         |  tree)                     |                            |
                         v                            v                            |
                   Next public/ static         next.config rewrites()              |
                   (afterFiles lose)           destination =                       |
                                               https://<store>.public.blob.        |
                                               vercel-storage.com/                 |
                                               reference-buildings/:id/:file.glb   |
                                                                              |
Operator  --vercel blob put pathname=... -->  Public Blob store (icn1) --------+
Developer --restore script HTTPS GET ------>  same public URLs --> public/ on disk
build-reference-building.mjs --writeGlb-->   public/<id>/*.glb  then publish script
```

Viewer already composes URLs as `` `${baseUrl}/${layer.file}` `` with `baseUrl = /reference-buildings/${id}` and relative `file` (`model.glb`, `hvac.glb`, `plumbing.glb`, …). [VERIFIED: src/lib/reference-buildings/manifest.ts:556-562] [VERIFIED: src/components/reference-building/reference-model-viewer.tsx:471-472] Do not change that.

### Recommended Project Structure

```text
next.config.ts                          # add rewrites(); keep tracing excludes
vercel.json                             # regions: ["icn1"] only — no rewrite here
.gitignore                              # public/reference-buildings/**/*.glb
.vercelignore                           # same glob (CLI upload defense)
scripts/publish-reference-glbs.mjs      # vercel blob put, pathname preserved
scripts/restore-reference-glbs.mjs      # public HTTPS GET → public/<id>/*.glb
scripts/check-asset-budget.mjs          # fail VERCEL=1 if any such GLB exists
```

### Pattern 1: External rewrite, not a function

**What:** Next.js `rewrites()` with an **absolute** blob destination. Vercel documents this as a reverse-proxy / standalone CDN. [CITED: vercel.com/docs/routing/rewrites] [CITED: nextjs.org/docs/.../rewrites]
**When to use:** Always for this task. Default array form is `afterFiles`: public files win if present (local restore); rewrite fires in production after `git rm`.

```ts
// Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
// Destination host comes from env after store creation (not a secret).
async rewrites() {
  const blobBase = process.env.BLOB_PUBLIC_BASE_URL; // https://<id>.public.blob.vercel-storage.com
  if (!blobBase) return [];
  return [
    {
      source: "/reference-buildings/:id/:file([^/]+\\.glb)",
      destination: `${blobBase}/reference-buildings/:id/:file`,
    },
  ];
}
```

Put this in **`next.config.ts`**, not `vercel.json`. Playwright's webServer is `npm run dev` (`next dev`), which does not apply `vercel.json` rewrites. `vercel.json` stays `{ "regions": ["icn1"] }`.

### Pattern 2: Stable pathname, public access

```ts
// Source: https://vercel.com/docs/vercel-blob/using-blob-sdk
await put(`reference-buildings/${id}/${file}`, bytes, {
  access: "public",
  addRandomSuffix: false, // default false; MUST stay false or the rewrite misses
  allowOverwrite: true,   // rebuilds
  contentType: "model/gltf-binary",
  multipart: true,        // CLI default; recommended >100MB, harmless at 69.7MB
  cacheControlMaxAge: 60 * 60 * 24 * 30,
});
```

CLI equivalent (preferred):

```bash
vercel blob put ./public/reference-buildings/sixty5/plumbing.glb \
  --pathname reference-buildings/sixty5/plumbing.glb \
  --access public \
  --content-type model/gltf-binary \
  --allow-overwrite \
  --scope matts-projects-d0677dc4
```

Do **not** pass `--add-random-suffix`.

### Anti-Patterns to Avoid

- **Route-handler proxy of GLBs:** 69.7 MB through a function. Private-blob delivery model; wrong cost and limits.
- **`beforeFiles` rewrite:** Would hide restored local files and always hit Blob, even in `next dev`.
- **Baking `https://….blob.vercel-storage.com/…` into `manifest.json`:** Locked out; also CORS vs same-origin `GLTFLoader`.
- **`addRandomSuffix: true`:** Path becomes `model-oYnXS….glb`; rewrite and e2e 404.
- **Store in `iad1` (CLI default for `create-store`):** Functions and users are `icn1`. Region is immutable. Pass `--region icn1`. [CITED: vercel.com/docs/cli/blob]
- **Connecting `s2mas-blob` to `bim`:** Different product, `iad1`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart 70 MB upload | Custom chunked PUT | `vercel blob put` (multipart default true) | Retries per part; counts as multiple advanced ops |
| CDN cache + ETag 304 | Custom cache headers on a function | Blob `cacheControlMaxAge` + public URL | CDN caches ≤512 MB; 69.7 MB qualifies [CITED: vercel.com/docs/vercel-blob/public-storage] |
| Local copy of 52 files | Manual copy from another checkout | Restore script over public HTTPS | No token; works on a worktree |
| Auth for public meshes | Signed URLs / private store | Public store | These GLBs are already world-readable on bim-self.vercel.app |

**Key insight:** The URL contract is a **CDN rewrite**. The bytes are a **Blob put**. Mixing those into a Next.js Route Handler is how 70 MB files become function incidents.

## Runtime State Inventory

This is a file-location migration.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | 52 committed GLBs, 492,954,436 bytes under `public/reference-buildings/**/*.glb` (11 building dirs). Git history still holds them (filter out of scope). | `git rm` + ignore; upload to new Blob store; no DB migration |
| Live service config | **No blob store connected to `bim`.** Team has unused `s2mas-blob` in `iad1`. Production currently serves GLBs as Vercel static files from `public/`. | Create public store on `bim`, region `icn1`; connect Production+Preview+Development; set `BLOB_PUBLIC_BASE_URL` |
| OS-registered state | None — verified by this being static files in git, not a Windows service | none |
| Secrets/env vars | No `BLOB_*` in repo (`.env*` gitignored; grep `@vercel/blob` zero). After connect: `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN` | Token is **write** secret — never `NEXT_PUBLIC_`. `BLOB_STORE_ID` / public hostname are identifiers, not secrets [CITED: vercel.com/docs/vercel-blob] |
| Build artifacts | Vercel production static copies of the 52 files at `0abbdaf`; local `public/` copies; Enhanced Build Machines setting (keep) | New deploy after `git rm` must 200 via rewrite; old deployment keeps old static files until replaced |

## Common Pitfalls

### Pitfall 1: `public/` wins, so leftover GLBs still OOM the build
**What goes wrong:** Next.js checks `/public` **before** default rewrites. If the 52 files are gitignored but still on disk, `next build` / `vercel --prod` from this tree still packs 470 MB.
**Why it happens:** Restore script + dirty CLI deploy (AGENTS.md: working tree, not HEAD).
**How to avoid:** (1) gitignore `public/reference-buildings/**/*.glb` (2) same glob in `.vercelignore` (3) `check-asset-budget.mjs` **errors when `VERCEL=1` and any such GLB exists** (4) deploy from a clean detached worktree.
**Warning signs:** Build memory climbs; rewrite never observed; deploy log still lists `*.glb` uploads.

### Pitfall 2: Function proxy / tracing déjà vu
**What goes wrong:** A `app/reference-buildings/[id]/[file]/route.ts` that `get()`s the blob. Sixty5 plumbing is 69.7 MB.
**How to avoid:** Rewrite only. Keep `outputFileTracingExcludes` for `**/*.glb`. Do not set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`.

### Pitfall 3: Random suffix or wrong pathname
**What goes wrong:** `put('plumbing.glb')` lands at store root; rewrite looks for `reference-buildings/sixty5/plumbing.glb`.
**How to avoid:** Pathname is the URL path minus leading slash. Overwrite with `allowOverwrite: true` on republish. Default `addRandomSuffix` is **false** — leave it. [CITED: vercel.com/docs/vercel-blob/using-blob-sdk]

### Pitfall 4: Token leakage
**What goes wrong:** `BLOB_READ_WRITE_TOKEN` in a client component, `NEXT_PUBLIC_*`, or a committed `.env`.
**How to avoid:** Restore uses **unauthenticated GET** of public URLs. Upload is an operator script using OIDC on Vercel or CLI `--rw-token` locally. Token stays in Vercel env / `vercel env pull` → `.env.local` (already gitignored).

### Pitfall 5: Store region/access immutable
**What goes wrong:** `create-store` defaults to `iad1`. Access cannot be switched public↔private later.
**How to avoid:** `vercel blob create-store <name> --access public --region icn1 --yes` then connect to `bim` (Production, Preview, Development). Human checkpoint.

### Pitfall 6: Tests that `readFileSync` GLBs
**What goes wrong:** After `git rm`, these fail on a clean checkout:
- `src/lib/reference-buildings/__tests__/lossless-materials.test.ts` (`fzk-haus/material-fabric.glb`)
- `src/lib/reference-buildings/__tests__/pv-bearing-source.test.ts` (`model.glb` per id)
- `src/components/reference-building/__tests__/reference-retrofit-visuals.glb.test.ts`
- `src/components/reference-building/__tests__/reference-architectural-details.test.tsx` (layer GLB bytes)
**How to avoid:** Restore script is a documented precondition for those files. Do not weaken assertions into "file exists".

### Pitfall 7: `build-reference-building.mjs` still writes `public/`
**What goes wrong:** A later model rebuild commits 70 MB again.
**How to avoid:** Writer stays (`writeGlb(path.join(outDir, "model.glb"), …)` [VERIFIED: scripts/build-reference-building.mjs:2038]). After write, run publish script; GLBs remain gitignored.

### Pitfall 8: Rewrite open-proxy
**What goes wrong:** A greedy `/:path*` rewrite to the blob host.
**How to avoid:** Match only `/reference-buildings/:id/:file` where file ends in `.glb`. JSON/SVG/licences stay on `public/`.

## Code Examples

### URL helpers (do not change)

```ts
// [VERIFIED: src/lib/reference-buildings/manifest.ts:556-562]
export function referenceBuildingModelUrl(id: ReferenceBuildingId): string {
  return `/reference-buildings/${id}/model.glb`;
}
export function referenceBuildingBaseUrl(id: ReferenceBuildingId): string {
  return `/reference-buildings/${id}`;
}
```

### e2e contract (must still 200, magic `glTF`)

```ts
// [VERIFIED: e2e/model-anchors.spec.ts:12-14]
const response = await page.request.get(`/reference-buildings/${id}/model.glb`);
expect(response.ok()).toBe(true);
expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
```

Extend this GET to **every published layer GLB**, not only `model.glb` (Sixty5 `plumbing.glb` is the size canary).

### Manifest relative file (do not absolutize)

```json
// [VERIFIED: public/reference-buildings/sixty5/manifest.json:1236-1240]
"id": "plumbing",
"file": "plumbing.glb",
"byteLength": 69730700
```

```json
// [VERIFIED: public/reference-buildings/sixty5/manifest.json:1413-1415]
"model": {
  "file": "model.glb",
  "byteLength": 44180104
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GLBs in `public/` as Vercel static CDN | Public Blob + edge rewrite | this task | Removes 470 MB from build checkout |
| `outputFileTracingIncludes` believed to exclude | `outputFileTracingExcludes` | 2026-09-15 | Include only ADDS; keep exclude |
| 4-core/8 GB builder | Enhanced Build Machines 8/16 GB | 2026-09-15 | Load-bearing until 8 GB builder is proven green |
| `BLOB_READ_WRITE_TOKEN` as default | OIDC (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`) on Vercel | 2026 Blob docs | Use token only off-Vercel / CLI |

**Deprecated/outdated:**
- Treating `next.config.ts` "CDN" comment as a blob store — it is Vercel static file hosting. [VERIFIED: next.config.ts:56-57]
- `docs/03_Development/Development Workflow.md` "There is no `vercel.json`" — stale; file exists with `regions: ["icn1"]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vercel deploy` honors `.gitignore` for restored GLBs | Pitfall 1 | OOM returns. Mitigate with `.vercelignore` + `VERCEL=1` disk check |
| A2 | Next source `/reference-buildings/:id/:file([^/]+\\.glb)` matches hyphenated names (`architectural-details.glb`) | Pattern 1 | Preview 404. Verify on a preview URL before `git rm` lands on production |
| A3 | Hobby/Pro Blob included quota covers 470 MB storage + gallery traffic | Open Questions | Store works; bill surprises. 470 MB < Hobby 1 GB included storage [CITED: pricing] |
| A4 | `content-type model/gltf-binary` is accepted by Blob put | Pattern 2 | Fallback: omit and let `.glb` inference; GLTFLoader uses bytes not MIME |
| A5 | Project `createdAt` after 2026-04-06 means external-rewrite caching is on by default | Caching | First plumbing.glb fetch slow. Set `CDN-Cache-Control` on the rewrite path if needed |

## Open Questions

1. **Public blob hostname / `BLOB_PUBLIC_BASE_URL`**
   - What we know: no store on `bim` yet; URL form is `https://<store-id>.public.blob.vercel-storage.com/<pathname>`.
   - What's unclear: the store id until `create-store` runs.
   - Recommendation: human checkpoint to create the store; then hardcode or env the origin in `next.config.ts`. Identifier, not a secret.

2. **Spend / plan**
   - What we know: 52 puts + ~0.47 GB-month storage. Public delivery bills Blob Data Transfer + Fast Origin Transfer on cache miss. [CITED: vercel.com/docs/vercel-blob/usage-and-pricing]
   - What's unclear: this team's plan and current Blob spend.
   - Recommendation: proceed; flag spend-management if Hobby included 10 GB transfer is a concern once the gallery is hit.

3. **Rewrite vs Range/CORS**
   - What we know: same-origin rewrite avoids CORS for `GLTFLoader`.
   - What's unclear: whether the edge rewrite forwards `Range` for 70 MB files.
   - Recommendation: e2e GET of Sixty5 `plumbing.glb` must 200 with `glTF` magic; if Range is an issue it will show there.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | scripts, next | ✓ | 24.19.0 | — |
| Vercel CLI | create-store, put, deploy | ✓ | 58.9.4 | — |
| `tsc` / vitest / Playwright binaries | verification | ✓ | in `node_modules` | AGENTS.md paths |
| pnpm on PATH | adding deps | ✗ | — | avoid new deps (CLI-first); else use the repo's working installer |
| Blob store on `bim` | hosting | ✗ | — | **create** public store `--region icn1` |
| `BLOB_READ_WRITE_TOKEN` / OIDC | upload | ✗ until store connected | — | `vercel env pull` after connect |
| Enhanced Build Machines | current prod | ✓ (load-bearing) | 8 core / 16 GB | keep until 8 GB builder proven |

**Missing dependencies with no fallback:**
- Public Blob store on `bim` in `icn1` — human checkpoint, immutable choices.

**Missing dependencies with fallback:**
- `@vercel/blob` npm package — CLI covers upload; restore is public HTTPS.

## Validation Architecture

`workflow.nyquist_validation` is absent in `.planning/config.json` → treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 + Playwright ^1.58.2 |
| Config file | `vitest.config.ts` (`include: src/**/*.test.ts(x)`); `playwright.config.ts` |
| Quick run command | `node node_modules/vitest/vitest.mjs run src/lib/reference-buildings src/components/reference-building` |
| Full suite command | `node node_modules/vitest/vitest.mjs run` then `node node_modules/@playwright/test/cli.js test e2e/model-anchors.spec.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| URL-01 | `GET /reference-buildings/:id/model.glb` 200 + `glTF` magic | e2e | `node node_modules/@playwright/test/cli.js test e2e/model-anchors.spec.ts` | ✅ (hotels only — extend to all 11 ids + layer GLBs) |
| URL-02 | Layer URL `${baseUrl}/${layer.file}` still loads | e2e | same, plus Sixty5 `plumbing.glb` | ❌ Wave 0 |
| BUILD-01 | `git ls-files public/reference-buildings/**/*.glb` is empty | unit/script | `node scripts/check-asset-budget.mjs` (new assertion) | ❌ Wave 0 |
| BUILD-02 | `VERCEL=1` build fails if any GLB exists under that tree | script | same | ❌ Wave 0 |
| DISK-01 | Restore puts 52 files; lossless + pv-bearing + details tests pass | unit | vitest files listed in Pitfall 6 | ✅ (need restore first) |
| PUB-01 | Blob pathname list equals the 52 relative paths | script | `vercel blob list --prefix reference-buildings/` vs local inventory | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node node_modules/typescript/bin/tsc --noEmit` and the asset-budget script
- **Per wave merge:** vitest reference-building tests after restore; Playwright model-anchors (+ plumbing canary)
- **Phase gate:** Production `GET https://bim-self.vercel.app/reference-buildings/sixty5/plumbing.glb` 200, first four bytes `glTF`; `X-Vercel-Id` region still `icn1`; clean 8 GB builder is **evidence**, Enhanced Builds is **not** turned off until that evidence exists

### Wave 0 Gaps

- [ ] `scripts/publish-reference-glbs.mjs` and `scripts/restore-reference-glbs.mjs`
- [ ] `.gitignore` + `.vercelignore` glob `public/reference-buildings/**/*.glb`
- [ ] `next.config.ts` `rewrites()` gated on `BLOB_PUBLIC_BASE_URL`
- [ ] `check-asset-budget.mjs`: empty git index for those GLBs; `VERCEL=1` disk presence is an error
- [ ] e2e GET for every published `*.glb` (or at least every `model.glb` + Sixty5 `plumbing.glb`)
- [ ] Human: create public Blob store on `bim`, `--region icn1`, connect envs, set `BLOB_PUBLIC_BASE_URL`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public gallery meshes; already world-readable |
| V3 Session Management | no | — |
| V4 Access Control | no (public by design) | Public Blob store. Do not use a private store (would force a Function proxy) |
| V5 Input Validation | yes | Rewrite source constrained to `:id/:file` ending `.glb`; upload script enumerates known files, does not take a free pathname from users |
| V6 Cryptography | no | AES-256 at rest is platform-side [CITED: vercel.com/docs/vercel-blob/security] |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token in client bundle | Information disclosure | No `@vercel/blob` in `src/`; no `NEXT_PUBLIC_BLOB_*`; restore is public GET |
| Open reverse-proxy | Information disclosure | Fixed destination origin + `.glb` suffix only |
| Hotlinking / bandwidth theft | Denial of service | Public URLs are guessable without random suffix (required for the path contract). Optional Blob WAF rate-limit later; not this task |
| HTML hosted on Blob | Spoofing | Blob sets `content-disposition` / CSP on the blob host; we only upload `model/gltf-binary` [CITED: vercel.com/docs/vercel-blob/security] |

## Sources

### Primary (HIGH confidence — in-repo Read this session)
- `public/reference-buildings/**/*.glb` — 52 files, 492,954,436 bytes; Sixty5 `plumbing.glb` 69,730,700
- `next.config.ts:42-71` — tracing include/exclude trap
- `vercel.json:1-4` — `regions: ["icn1"]`
- `src/lib/reference-buildings/manifest.ts:556-562` — relative URL helpers
- `e2e/model-anchors.spec.ts:12-14` — GET contract
- `scripts/build-reference-building.mjs:2038` — `writeGlb(..., "model.glb")`
- `.gitignore:35-36`, `.vercelignore:13-15`
- `vercel blob list-stores` — none on `bim`; team `s2mas-blob` iad1

### Secondary (MEDIUM — official docs via Context7 + WebFetch)
- https://vercel.com/docs/vercel-blob — public vs private, 5 TB, caching, OIDC vs token
- https://vercel.com/docs/vercel-blob/using-blob-sdk — `put`, `addRandomSuffix` default false, `allowOverwrite`
- https://vercel.com/docs/vercel-blob/public-storage — URL form, 512 MB cache, robots/indexing
- https://vercel.com/docs/vercel-blob/usage-and-pricing — size limits, Hobby 1 GB storage
- https://vercel.com/docs/cli/blob — `create-store --region` default `iad1`, `--access` required
- https://vercel.com/docs/routing/rewrites — external origin reverse proxy + cache-control
- https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites — filesystem before default rewrites; absolute destinations allowed

### Tertiary
- `docs/03_Development/Development Workflow.md` still claims no `vercel.json` — stale, do not follow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official Blob/Next docs + npm legitimacy OK + CLI present
- Architecture: HIGH — in-repo URL contract and rewrite-vs-public order are documented; store id unknown until create
- Pitfalls: HIGH — this repo already hit both Vercel ceilings; dirty-tree deploy is a recorded trap

**Research date:** 2026-09-16
**Valid until:** 30 days (Blob API stable; store hostname must be filled after create)
