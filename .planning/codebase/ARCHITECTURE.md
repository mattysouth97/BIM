# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Multi-layer Next.js 16 App Router with server-side proxy to Korean government APIs, 3D parametric geometry generation, material property inference from building codes, and optional model upload (IFC/glTF).

**Key Characteristics:**
- API proxy layer decouples frontend from data.go.kr (solves CORS, handles error cases)
- Pure functional pipeline: building ledger data → 3D geometry → material properties → Three.js visualization
- Zustand stores for persistent state (API key, language, material overrides)
- TanStack Query for client-side caching and request deduplication
- Real building footprint polygons from VWorld cadastral API override parametric estimates
- IndexedDB lazy storage for user-uploaded IFC/glTF models
- Material property system compatible with ECO2 energy simulation input format

## Layers

**API Proxy Layer:**
- Purpose: Broker requests between client and data.go.kr BldRgstHubService, handle authentication, transform responses
- Location: `src/app/api/bldrgst/*` (six route handlers), `src/app/api/vworld/footprint/route.ts`
- Contains: Next.js API route handlers using `fetchFromDataGoKr()` helper
- Depends on: `src/lib/api-proxy.ts` (server-side fetch), request headers (x-api-key)
- Used by: Client-side `src/lib/api-client.ts` (via fetch to /api/* routes)

**Data Access Layer:**
- Purpose: Client-side fetch wrappers around API routes, request queuing, header management
- Location: `src/lib/api-client.ts`, `src/hooks/use-building-search.ts`, `src/hooks/use-building-detail.ts`
- Contains: Typed fetch functions (`searchBuildings()`, `getFloorInfo()`, etc.), TanStack Query hooks
- Depends on: Zustand `useAppStore` for API key, TanStack Query for caching
- Used by: Page components and detail pages

**Geometry & Material Inference:**
- Purpose: Pure functions converting raw API data into 3D geometry specs and material properties
- Location: `src/lib/building-geometry.ts`, `src/lib/material-inference.ts`, `src/lib/material-types.ts`, `src/lib/korean-building-codes.ts`
- Contains: Type definitions, classification functions, lookup tables for building eras, floor heights, window ratios, U-values
- Depends on: Input types (`BrTitleInfo`, `BrFloorInfo`), permit date parsing
- Used by: `src/components/viewer/building-scene.tsx` for 3D generation and material store initialization

**3D Viewer Layer:**
- Purpose: Three.js canvas rendering with React Three Fiber, material property UI, model upload/switching
- Location: `src/components/viewer/*` (BuildingScene, BuildingModel, SceneControls, MaterialPanel, loaders)
- Contains: Canvas setup, floor mesh generation, IFC/glTF loaders, material override UI, scene controls (pan/zoom/rotate)
- Depends on: Geometry from building-geometry.ts, material store, uploaded models from IndexedDB
- Used by: `src/components/building/building-tabs.tsx` as a tabbed view

**Page & Component Layer:**
- Purpose: Search forms, results tables, building detail pages, UI composition
- Location: `src/app/page.tsx`, `src/app/building/[id]/page.tsx`, `src/components/search/*`, `src/components/building/*`
- Contains: React components with form handling, data display, navigation
- Depends on: Hooks (useQuery, useHydration), stores (Zustand), UI components (shadcn/ui)
- Used by: Next.js routing

**State Management:**
- Purpose: Persist API key and language preference, manage material property overrides
- Location: `src/store/app-store.ts`, `src/store/material-store.ts`
- Contains: Zustand stores with persist middleware
- Depends on: localStorage (via Zustand persist)
- Used by: All client components via hooks

## Data Flow

**Search → Display:**

1. User submits region or address search form → `src/app/page.tsx`
2. Form handler calls `useBuildingSearch()` hook → `src/hooks/use-building-search.ts`
3. Hook dispatches `searchBuildings(params)` → `src/lib/api-client.ts`
4. Client fetch to `/api/bldrgst/title` with `x-api-key` header
5. Server route handler `src/app/api/bldrgst/title/route.ts` extracts apiKey from header
6. Calls `fetchFromDataGoKr()` → `src/lib/api-proxy.ts` (server-side fetch to data.go.kr)
7. Handles XML/error responses, extracts items and totalCount
8. Returns `{ items, totalCount, pageNo, numOfRows }` to client
9. TanStack Query caches response, component re-renders with results table `src/components/search/search-results-table.tsx`
10. User clicks building → navigates to `/building/[id]` with encoded building ID

**Building Detail → 3D View:**

1. `src/app/building/[id]/page.tsx` decodes building ID, calls `useBuildingDetail()` hook
2. Hook runs four parallel queries: title, recap, floors, areas
3. Each query calls `apiFetch()` → `/api/bldrgst/*` routes → server-side data.go.kr fetch
4. Results cached by TanStack Query (5 min default staleTime)
5. Component renders `BuildingTabs` with floors/areas data in table views
6. Third tab mounts `BuildingScene` component (lazy-loaded)
7. BuildingScene calls:
   - `generateBuildingGeometry(title, floors)` → produces FloorGeometry[] with positions, dimensions, colors
   - `useBuildingFootprint(address)` hook to fetch real polygon from VWorld
   - `inferMaterialProperties(title, floors)` → generates comprehensive MaterialProperties
   - Stores material properties in `useMaterialStore` keyed by building PK
8. Geometry + footprint passed to `BuildingModel` child component
9. BuildingModel renders parametric floor meshes using Three.js, applies VWorld polygon override if available
10. User can upload IFC/glTF model → stored in IndexedDB via `src/lib/model-storage.ts`
11. Scene switches to uploaded model or falls back to parametric

**State Management:**

- API key stored in Zustand persist store, read on client startup
- Material properties stored in non-persisted store, keyed by building PK
- User overrides to material properties update store and trigger component re-renders
- Search parameters cached in app store for session restoration

## Key Abstractions

**BuildingGeometry:**
- Purpose: Represents parametric 3D building as layered floors with positions, dimensions, structural use codes
- Examples: `src/lib/building-geometry.ts` → `generateBuildingGeometry()` produces `BuildingGeometry` type
- Pattern: Pure function taking API types (BrTitleInfo, BrFloorInfo[]) → output geometry with calculated floor heights, color coding by use type, era classification

**MaterialProperties:**
- Purpose: Energy simulation input format compatible with ECO2, includes envelope (walls, roof, windows, foundation), HVAC, lighting, occupancy
- Examples: `src/lib/material-types.ts` defines interface, `material-inference.ts` infers from building era + use code + structure code
- Pattern: Inference driven by lookup tables (WALL_U_VALUES, WINDOW_RATIOS, GLAZING_TYPE keyed by BuildingEra), insulation thickness scaled by era

**ApiListResponse:**
- Purpose: Standardized response wrapper from all API routes (title, floors, areas, etc.)
- Examples: `src/lib/api-client.ts` defines interface, returned by each proxy endpoint
- Pattern: Consistent shape allows reusable TanStack Query hooks

**BuildingId encoding:**
- Purpose: Compress multi-part building identifier (sigunguCd, bjdongCd, platGbCd, bun, ji) into URL-safe string
- Examples: `src/lib/constants.ts` → `encodeBuildingId()`, `decodeBuildingId()`
- Pattern: Hyphen-delimited string passed as dynamic route param `[id]`

**FloorGeometry:**
- Purpose: Single-floor 3D representation with type, position (y), height, footprint (width/depth), use code, color
- Examples: `src/lib/building-geometry.ts`, array produced by generateBuildingGeometry()
- Pattern: Used as intermediate format between API and Three.js mesh generation in BuildingModel

## Entry Points

**Search Page:**
- Location: `src/app/page.tsx`
- Triggers: User navigates to `/` or initial app load
- Responsibilities: Render two search modes (region/address), display results table, lazy-load form components, show error banner if no API key

**Building Detail Page:**
- Location: `src/app/building/[id]/page.tsx`
- Triggers: User clicks building row in search results, navigates to `/building/sigunguCd-bjdongCd-...`
- Responsibilities: Decode ID, fetch four building datasets in parallel, render tabs (overview, floors, areas, 3D viewer)

**3D Viewer Root:**
- Location: `src/components/viewer/building-scene.tsx`
- Triggers: BuildingTabs mounts viewer tab, BuildingScene mounts on demand
- Responsibilities: Initialize canvas with Three.js, fetch VWorld footprint, generate parametric geometry, infer materials, manage model upload/switching, render material panel

## Error Handling

**Strategy:** Try-catch wrapping, explicit error states in TanStack Query, fallback values for missing data, XML/JSON detection for API responses

**Patterns:**

1. **API Proxy (`src/lib/api-proxy.ts`):**
   - Detects XML responses from data.go.kr (error case) vs. JSON
   - Extracts error message from XML `<returnAuthMsg>` tag
   - Returns `{ data: null, error: "..." }` tuple
   - Timeout: 15s per request

2. **Geometry Generation (`src/lib/building-geometry.ts`):**
   - Fallback floor heights by era and use category
   - Zero values (platArea=0, heit=0) treated as missing data, not errors
   - Parametric footprint estimation if actual area missing
   - Default colors for unmapped use codes

3. **Component Level:**
   - TanStack Query error state shown in `src/app/building/[id]/page.tsx` detail error box
   - Search page shows banner + inline error message
   - Graceful fallback: if VWorld footprint fails, uses parametric polygon

4. **Material Inference:**
   - Defaults for unrecognized structure/use codes
   - Era classification based on permit date; defaults to "2020+" if missing
   - Ground temperature lookup by sido prefix with fallback to 13.5°C

## Cross-Cutting Concerns

**Logging:** No structured logging framework; console use for debugging in development only. Production uses browser console if needed.

**Validation:**
- Input validation at form level with `react-hook-form` (address-search-form, region-search-form)
- API response validation in extractItems/extractTotalCount (defensive type guards)
- Building ID decoding validates split result length

**Authentication:**
- API key stored in Zustand persist (localStorage)
- Validated on entry via `validateApiKey()` in api-client.ts (minimal validation — just checks if key works)
- Passed in `x-api-key` header to all proxy routes
- No OAuth or user accounts; single-key per browser session

**Caching:**
- TanStack Query: 5 min default staleTime, configurable per query
- VWorld footprint cached 30 min
- IndexedDB: unlimited storage for uploaded models until user deletes

**Hydration:**
- `useHydration()` hook in `src/hooks/use-hydration.ts` used in `src/app/page.tsx` to avoid SSR/client mismatch on Zustand store reads
- API key banner only renders after hydration complete

