# Vercel Deployment — Known Issues + Setup

**First deploy:** 2026-04-30
**Vercel project:** `matts-projects-d0677dc4/bim`
**GitHub repo:** [`mattysouth97/BIM`](https://github.com/mattysouth97/BIM) (private)
**Production branch:** `feat/digital-twin-pivot`

## What works on the deployed site

- **CAPEX/ROI simulator** (the main Twin-stage feature) — runs entirely client-side from material inference + the economic-model knapsack. No external API dependency. Works out of the box.
- **3D procedural building viewer** — pure client-side R3F rendering of inferred building geometry. Works.
- **Building search via 건축물대장** — works once the user supplies their own data.go.kr API key via the in-app settings (key is per-user, stored in Zustand persist; not a server env var).
- **Cadastral footprint via VWorld** (`/api/vworld/footprint`) — works **if** `VWORLD_DOMAIN` env var is set to the deployed domain (see below).

## Known Vercel-serverless issues

### `/api/twin-data/upload` and `/api/twin-data/[buildingId]`

Status: **Functional but ephemeral**. These routes use `fs.writeFile`/`fs.readFile` against `.twin-data/` on the local filesystem (see `src/app/api/twin-data/upload/route.ts:46-53`). On Vercel serverless, the filesystem is read-only except `/tmp`, which is per-invocation ephemeral. **Uploaded twin data is lost between requests on production.**

Fix path (deferred): migrate to Vercel Blob (`@vercel/blob`) — public + private storage now supported. ~1-2 hours of work. Not a blocker for the simulator.

### `/api/cad/convert` (DWG → DXF conversion)

Status: **Server fallback returns 501 in production**; client-side WASM (libdxfrw) is the primary path and works. The route's stated server path requires an external DWG converter binary configured via `DWG_CONVERTER_PATH` env var, which isn't installed on Vercel. The 501 response with manual-DXF-export hint is the documented graceful-degradation path.

Fix path (deferred): nothing required — the client-side WASM path handles 95%+ of DWG uploads. Server fallback only matters when WASM fails to load.

## Environment variable status (production)

| Variable | Set? | Notes |
|---|---|---|
| `VWORLD_API_KEY` | ✅ Set | Required for `/api/vworld/footprint`. Copied from local `.env` at deploy time. |
| `VWORLD_DOMAIN` | ❌ Not set | Defaults to `"localhost"` per the route code. The deployed domain (e.g. `bim-*.vercel.app`) needs to be registered with the VWorld developer portal AND set in Vercel as the value. Until both are done, the cadastral footprint API will return errors from VWorld about domain mismatch. |
| `data.go.kr` API key | N/A (per-user) | Not a server env var. Each user enters their own key via the app's API-Settings panel (stored in Zustand persist, sent via `x-api-key` header). |

## To enable VWorld cadastral footprint on production

1. After the first deploy, capture the `*.vercel.app` URL.
2. Log into the VWorld developer portal (vworld.kr → 개발자 → 인증키 관리).
3. Add the deployed domain to the API key's allowed domains list.
4. Run `vercel env add VWORLD_DOMAIN production` and supply the domain (without `https://`).
5. Trigger a re-deploy: `vercel deploy --prod`.

Until step 4 completes, the cadastral footprint route returns errors. The simulator still works — it doesn't need the cadastral data to compute retrofit scenarios.

## Auto-deploy on push

After the first manual `vercel deploy --prod`, Vercel listens to GitHub pushes on the linked branch (`feat/digital-twin-pivot` for now). Future pushes auto-deploy. To change the production branch (e.g., to `master` after merging), update the project's Production Branch in the Vercel dashboard.

## Rollback procedure

`vercel rollback` rolls the production URL back to a prior deployment without code changes. Each deploy keeps its preview URL accessible for direct comparison.

## Cost notes

- **Free tier covers**: build minutes, ~100GB bandwidth/mo, ~1M function invocations. The CAPEX simulator is mostly client-side so function load is low.
- **Paid concerns**: only kick in if you wire up Vercel Blob (paid storage) for the twin-data upload migration, or if traffic exceeds the free-tier limits.

## Vercel project metadata

```
project:   matts-projects-d0677dc4/bim
framework: Next.js 16 (auto-detected)
build:     pnpm build
deploy:    automatic on push to feat/digital-twin-pivot
runtime:   Fluid Compute (default; full Node.js)
```
