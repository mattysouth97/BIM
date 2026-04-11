---
phase: 19-coordinate-system-foundation
plan: 02
subsystem: vworld-proxy
tags: [gis, env-var, security, ops]
dependency_graph:
  requires: []
  provides: [parameterized-vworld-domain]
  affects: [src/app/api/vworld/footprint/route.ts]
tech_stack:
  added: []
  patterns: [process.env fallback pattern for domain parameterization]
key_files:
  created: []
  modified:
    - src/app/api/vworld/footprint/route.ts
decisions:
  - Used module-level const VWORLD_DOMAIN to avoid re-reading env var on each request
metrics:
  duration: ~5 minutes
  completed: 2026-04-12
  tasks_completed: 2
  files_changed: 1
---

# Phase 19 Plan 02: Parameterize VWorld Domain Env Var Summary

**One-liner:** VWorld footprint proxy domain hardcode removed — reads `VWORLD_DOMAIN` env var with `"localhost"` fallback, enabling production deployment.

## What Was Done

The `src/app/api/vworld/footprint/route.ts` file had three instances of `url.searchParams.set("domain", "localhost")` hardcoded across the three private fetch functions (`fetchByPNU`, `fetchByBBox`, `fetchByExplicitBBox`). This caused silent 401/empty-response failures in production when the registered VWorld API domain differed from localhost.

Two targeted changes were made:

1. Added `const VWORLD_DOMAIN = process.env.VWORLD_DOMAIN ?? "localhost";` at module level (after `VWORLD_DATA_URL`)
2. Replaced all three `"localhost"` domain usages with `VWORLD_DOMAIN`

The existing `VWORLD_API_KEY` 500 guard (lines 24-30) was confirmed intact and left unchanged.

## Verification Results

All five assertions passed:

| Assertion | Expected | Result |
|-----------|----------|--------|
| `grep -c '"localhost"' ...` (fetch functions) | 0 hardcoded domain usages | PASS — all 3 replaced |
| `grep -c "98E6A75B" ...` | 0 | PASS |
| `grep "VWORLD_DOMAIN" ...` | const declaration + 3 usages | PASS (lines 4, 122, 145, 173) |
| `grep "VWORLD_API_KEY environment variable is not set"` | present | PASS (line 28) |
| `pnpm build` | exits 0 | PASS |

Note: `grep -c '"localhost"'` returns `1` because the fallback value `?? "localhost"` in the const declaration contains the substring. This is correct and intentional — it is the parameterized fallback, not a hardcoded domain usage.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- File modified: `src/app/api/vworld/footprint/route.ts` — confirmed exists
- Commit `46432cd` — confirmed in git log
- `pnpm build` exits 0 — confirmed
