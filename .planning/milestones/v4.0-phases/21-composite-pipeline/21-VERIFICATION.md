status: passed

# Phase 21: Composite Pipeline — Verification

**Verified:** 2026-04-12
**Score:** 4/4 must-haves verified

## Criterion Results

### 1. Parallel fetch on building selection
VERIFIED. `useCompositeBuilding` hook fires ledger + footprint queries via `useQueries`. Both requests start within one render cycle. Footprint returns 200 after env var fix.

### 2. Composite renders within 3 seconds
VERIFIED. User confirmed building renders promptly after data arrival.

### 3. Graceful fallback to rectangular model
VERIFIED. When VWorld footprint returns no polygon, building renders as rectangular box with no error state. Fallback path preserved in building-scene.tsx try/catch.

### 4. Loading indicator visible during fetch
VERIFIED. Loader2 spinner with "건물 데이터 로딩 중…" visible during fetch, disappears on composite render.

## Issues Found & Fixed
- `.env` had space after `=` in `VWORLD_API_KEY` — fixed (caused footprint 500)
- SAOPass `saoKernelRadius: 50` caused dark halos on polygon geometry — disabled SAOPass entirely per user preference

## Build & Test Status
- `pnpm build`: passes (0 TypeScript errors)
- Human visual verification: approved
