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

Validated on 2026-08-27:

- Unit: **3952 passed**, 4 skipped, 362 files
- E2E: **35 passed** (Playwright, chromium)
- `tsc --noEmit`: clean
- Production live at `https://bim-self.vercel.app`, verified against a real
  building (대청아파트306동, `11680-10300-0-0012-0000`)

## Active Systems

- Register lookup at `/` → routes picks to `/building/[id]`
- Twin workspace `/building/[id]` — stepper, layers, CAPEX→ROI, report
- Traceable energy engine — reachable at `/diagnostics/new?method=ledger&building=…`
- Sample building `/building/demo` — offline fixture, needs no API key

## Work in Progress

Nothing is mid-edit. The working tree was clean at last commit.

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
| `src/lib/energy-diagnostics/validation.ts` | 35 error-severity checks gate simulation |
| `src/lib/korean-building-codes.ts` | Era tables; every default traces here |
| `docs/work-plan/` | Referenced by name from `CLAUDE.md`; do not relocate |
| `src/app/api/bldrgst/_factory.ts` | Shared-key resolution and per-endpoint row caps |
| `public/models/` | 173 GLBs (102 authoring, 58 equipment, 13 bim-assets) |

## Recent Architectural Changes

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
