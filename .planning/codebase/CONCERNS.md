# Codebase Concerns

**Analysis Date:** 2026-03-26

## Security Issues

### VWorld API Key Hardcoded in Source Code
- **Risk:** API key `98E6A75B-9FA2-3B97-A78F-A80434D6BF59` is hardcoded in source and committed to git
- **Files:** `src/app/api/vworld/footprint/route.ts` (line 3)
- **Impact:** Key is exposed in git history. Anyone with repo access can use the VWorld API, potentially leading to rate-limit abuse or quota exhaustion. Key cannot be safely rotated without code change.
- **Recommendation:** Move to environment variable `VWORLD_API_KEY` in `.env.local`. Rotate the existing key immediately. Update CI/CD to inject via build-time env var.

### data.go.kr API Key Stored in Browser LocalStorage
- **Risk:** API key is persisted to browser localStorage via Zustand persist middleware
- **Files:** `src/store/app-store.ts` (persist config), `src/lib/api-client.ts` (uses from store)
- **Impact:** API key stored in plaintext in browser localStorage. Vulnerable to XSS attacks, browser history sniffing, or malicious browser extensions reading `korea-building-info-storage` key.
- **Recommendation:** For production deployment, implement server-side session storage instead. Authenticate user on backend, issue secure HttpOnly session token, send API key server-side only. Client-side key entry should be dev-only or behind explicit warning for production.

## Architecture & Hydration Issues

### Zustand Persist + SSR Hydration Mismatch
- **Issue:** Zustand `persist` middleware stores state in localStorage after mount, but initial SSR render uses default state
- **Files:** `src/store/app-store.ts` (persist config), `src/app/page.tsx` (uses `useHydration()` workaround), `src/hooks/use-hydration.ts`
- **Symptoms:** Hydration warnings in console; UI flicker when language/apiKey loads from storage on client
- **Current Workaround:** `useHydration()` hook that returns `false` until useEffect fires; UI defers store reads until hydrated (line 49 in `src/app/page.tsx` and line 152 banner)
- **Problem with Workaround:** Manual workaround scattered across components. New code using store in render could re-introduce mismatch. No centralized protection.
- **Better Approach:** Use Zustand's `useShallow()` selector pattern, or move persisted config out of Zustand to a separate client-side module that never SSR-renders, or suppress hydration warnings with explicit suppressHydrationWarning attributes.

## Missing Critical Features

### No Error Boundaries in React Tree
- **Issue:** No `error.tsx` files in app routes, no ErrorBoundary components wrapping dynamic sections
- **Files:** Missing from `src/app/`, `src/components/`
- **Risk:** Unhandled errors in viewer (Three.js), search results, or IFC loader crash entire component tree with no fallback UI. Users get blank pages or caught-off-guard crashes.
- **Impact Severity:** High - 3D viewer errors, IFC parsing errors, or API failures with no error recovery UI
- **Fix Approach:** Add error.tsx at `src/app/error.tsx` and `src/app/(building)/error.tsx`. Wrap Three.js Canvas and IFC/GLTF loaders in custom ErrorBoundary component with retry logic.

### No Test Coverage At All
- **Issue:** Zero tests for any component, hook, or utility function
- **Files:** No `.test.ts` or `.spec.tsx` files in codebase; no test config (Jest, Vitest, etc.)
- **Risk:** Refactoring, dependency updates, or API changes have no safety net. Regression bugs slip to production. Client-side filtering logic (line 61-65 in `src/app/page.tsx`) untested. Geometry generation logic never validated.
- **Critical Untested Areas:**
  - `src/lib/building-geometry.ts` — Converts API data to 3D models; mistakes produce wrong dimensions, missing floors, or bad geometry
  - `src/lib/api-client.ts` — Fetch wrapper; error handling and retry logic untested
  - `src/lib/api-proxy.ts` — Server-side fetch to data.go.kr; XML error parsing, timeout handling untested
  - `src/app/api/bldrgst/*` — Route handlers for building ledger endpoints
  - `src/components/viewer/building-scene.tsx` — Complex React Three Fiber setup; no tests for camera, controls, or model switching
- **Recommendation:** Start with vitest + React Testing Library. Priority: API client functions, building geometry, search filtering logic. ~20% coverage minimum before production release.

## Data Loading & Performance

### Large bjdong-codes.json Loaded Entirely on Client
- **Size:** 1.5MB for 20K+ law-defined dong codes (법정동 codes)
- **Files:** `src/data/bjdong-codes.json`
- **Impact:** 1.5MB of JavaScript loaded and parsed on every initial page load. Blocks main thread during parse. Increases initial bundle and memory footprint.
- **Current Usage:** Likely used in region/address search forms for autocomplete or validation
- **Improvement Path:**
  - Option 1: Move to server-side lookup via API route `/api/search/bjdong?q=` with prefix matching
  - Option 2: Code-split into separate chunk loaded only when search form appears (lazy import)
  - Option 3: Use IndexedDB to cache locally after first fetch, amortize cost over sessions
  - Immediate Fix: Verify no duplicate loads; check if it's already lazy-loaded

### No Pagination Limits on API Responses
- **Issue:** Default `numOfRows` set to 20 in `src/lib/api-proxy.ts` (line 26), but no cap on client-side requests
- **Files:** `src/lib/api-proxy.ts`, `src/app/page.tsx` (search form params)
- **Risk:** User could request `?numOfRows=10000` and hang browser or overload memory with result table rendering
- **Recommendation:** Enforce `numOfRows <= 200` at client AND server. Cap pagination at 10 pages max to prevent data.go.kr timeout.

## API Quirks & Data Issues

### data.go.kr API Ignores mainPurpsCd Filter Parameter
- **Issue:** `mainPurpsCd` parameter sent to data.go.kr is silently ignored; must filter client-side
- **Files:** `src/app/page.tsx` (line 77-78), `src/lib/api-client.ts` (param passed but ineffective)
- **Impact:** Client receives unfiltered results; filtering happens in-memory after fetch
- **Workaround:** Documented in CLAUDE.md but relies on client-side filtering. Inefficient for large result sets.
- **Risk:** If user forgets to apply filter or filters are cleared, memory bloat with large unfiltered datasets

### bjdongCd Parameter Required but Error Handling Inadequate
- **Issue:** Omitting `bjdongCd` returns empty body (not an error response) from data.go.kr; many callers may not validate this upfront
- **Files:** `src/app/api/bldrgst/*` routes, form validation in search components
- **Current State:** CLAUDE.md documents it as "REQUIRED", but validation not visible in route handlers
- **Recommendation:** Add explicit validation in each route handler: `if (!params.bjdongCd) return NextResponse.json({ error: "bjdongCd is required" }, { status: 400 })`

### Zero Values Represent Missing Data, Not Falsy
- **Issue:** API returns 0 for missing numeric fields (platArea=0, heit=0, bcRat=0)
- **Files:** `src/lib/building-geometry.ts` (line 91-92 checks with `||`), UI components display as "-" per CLAUDE.md
- **Risk:** Code using `if (value)` or `if (value > 0)` will treat 0 as missing, but 0 might be a valid measurement. Estimates will use fallbacks incorrectly.
- **Example:** Line 91 in `src/lib/building-geometry.ts`: `const totalHeight = Number(title.heit) || aboveCount * eraFloorHeight` treats heit=0 as missing and estimates instead of using 0
- **Recommendation:** Explicitly check `value === 0` vs `value == null` or `value === undefined`. Add JSDoc noting this convention.

### Duplicate Floor Keys from API
- **Issue:** API returns multiple floors with same `flrNo` (floor number); flrNo alone is not unique key
- **Files:** `src/lib/building-geometry.ts` (uses `flrNo` as identity), any component keying floors by flrNo
- **Impact:** React list key warnings if floor arrays keyed by flrNo. UI confusion if same floor listed twice.
- **Workaround:** CLAUDE.md documents: "use array index in React key"; any rendering of floors array must use index, not flrNo
- **Risk:** New code adding floor lists might forget and key by object.flrNo, causing warnings and bugs

## Three.js & WebGL Issues

### Potential Three.js Deprecation Warnings
- **Issue:** Three.js 0.183.2 has deprecated Clock and PCFSoftShadowMap (among others)
- **Files:** `src/components/viewer/building-scene.tsx`, `src/components/viewer/ifc-loader.tsx`, viewer components generally
- **Current State:** Not actively using deprecated Clock or shadow map enums in visible code, but future use could trigger warnings
- **Recommendation:** Check browser console during `pnpm dev` and `pnpm build` for deprecation notices. Switch to replacements if found. Pin Three.js minor version in package-lock.yaml until verified non-deprecated.

## Turbopack & Module Resolution

### web-ifc WASM Path Resolution Issues with Turbopack
- **Issue:** Turbopack (Next.js 16 bundler) has different path resolution than webpack for WASM file loading
- **Files:** `src/components/viewer/ifc-loader.tsx` (lines 23-35, custom WASM loader)
- **Current Workaround:** Custom `locateFile` handler that serves WASM from `/wasm/` public path manually
- **Risk:** If WASM file not present at `public/wasm/web-ifc.wasm`, loader fails silently or hangs. Build step must copy WASM from node_modules manually.
- **Symptoms:** IFC model upload hangs or returns "WASM not loaded" error
- **Recommendation:** Add explicit build step in `package.json`: `"postinstall": "cp node_modules/web-ifc/web-ifc.wasm public/wasm/"`. Add `public/wasm/` to .gitignore and verify in CI/CD that file exists before deploy.

## Code Quality & Type Safety

### Zod v4 zodResolver Type Inference Issues
- **Issue:** Zod v4's `zodResolver` from `@hookform/resolvers` has incomplete type inference with TypeScript
- **Files:** Form components likely using Zod for validation; documented in CLAUDE.md as known issue
- **Workaround:** CLAUDE.md documents: "use plain TS interfaces for form values" instead of inferring from Zod schema
- **Impact:** Loses compile-time type safety; forms fall back to runtime validation only
- **Recommendation:** Verify all form components (`src/components/search/region-search-form.tsx`, `src/components/settings/api-key-dialog.tsx`, etc.) use plain interfaces. If Zod schema updates, forms won't auto-update.

### Three.js drei OrbitControls Type Conflict
- **Issue:** `three-stdlib` types conflict with drei v10 OrbitControls ref type
- **Files:** `src/components/viewer/scene-controls.tsx` (SceneControlsRef type)
- **Workaround:** CLAUDE.md documents: "use `any` ref type"; presumably `useRef<any>(null)` for controls ref
- **Impact:** Loss of type safety on controls ref; refactoring at risk
- **Location:** Check if `SceneControlsRef` uses `any` or has proper typing

### Large Component Files
- **Files with high line counts:**
  - `src/components/search/search-results-table.tsx` — 310 lines
  - `src/components/search/region-search-form.tsx` — 269 lines
  - `src/components/viewer/building-scene.tsx` — 268 lines
  - `src/app/page.tsx` — 255 lines
  - `src/components/search/address-search-form.tsx` — 242 lines
- **Risk:** Hard to test, high cognitive load, violates single-responsibility principle
- **Recommendation:** Extract form logic into custom hooks (useRegionSearch, useAddressSearch, etc.); extract table columns into separate module; split building-scene into smaller stateful components

## Integration Points at Risk

### VWorld Geocoding Non-Critical But No Fallback
- **Issue:** Geocoding address to coordinates (line 109-135 in `src/app/api/vworld/footprint/route.ts`) silently fails and returns null
- **Files:** `src/app/api/vworld/footprint/route.ts`, `src/hooks/use-building-footprint.ts`
- **Impact:** Building footprint enhancement degrades gracefully, but users don't know why footprint unavailable; no error message or retry UI
- **Recommendation:** Log failures server-side for monitoring. Add client-side toast notification if geocoding times out

## Missing Validation

### No Input Validation on Exported Components/Utilities
- **Issue:** Many pure functions in `src/lib/` (e.g., `generateBuildingGeometry`, `extractItems`) don't validate inputs
- **Files:** `src/lib/building-geometry.ts`, `src/lib/api-proxy.ts`, `src/lib/api-client.ts`
- **Risk:** Invalid or null inputs could produce undefined behavior or silent failures
- **Example:** `generateBuildingGeometry(title, floors)` at line 79 doesn't check if title/floors are undefined
- **Recommendation:** Add runtime validation for public API functions using Zod or similar

---

*Concerns audit: 2026-03-26*
