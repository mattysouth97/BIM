# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
src/
├── app/                           # Next.js App Router root
│   ├── api/                       # API route handlers (proxy to data.go.kr)
│   │   ├── bldrgst/              # Building ledger endpoints
│   │   │   ├── title/            # getBrTitleInfo proxy
│   │   │   ├── recap/            # getBrRecapTitleInfo proxy
│   │   │   ├── floors/           # getBrFlrOulnInfo proxy
│   │   │   ├── areas/            # getBrExposPubuseAreaInfo proxy
│   │   │   ├── basis/            # getBrBasisOulnInfo proxy
│   │   │   └── jijugu/           # getBrJijiguInfo proxy
│   │   └── vworld/               # VWorld spatial data integration
│   │       └── footprint/        # Building polygon fetch from cadastral data
│   ├── building/
│   │   └── [id]/                 # Dynamic building detail page
│   ├── page.tsx                  # Search page (home)
│   ├── layout.tsx                # Root layout with Providers
│   └── globals.css               # Global styles (Tailwind)
│
├── components/
│   ├── ui/                        # shadcn/ui base components
│   │   ├── accordion.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── sonner.tsx             # Toast notifications
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── textarea.tsx
│   ├── viewer/                    # 3D building viewer (Three.js + React Three Fiber)
│   │   ├── building-scene.tsx     # Root viewer component (orchestrates canvas, model upload, material panel)
│   │   ├── building-model.tsx     # Renders parametric floor meshes
│   │   ├── scene-controls.tsx     # Camera controls (pan, zoom, rotate with mouse)
│   │   ├── floor-mesh.tsx         # Single floor geometry as Three.js mesh
│   │   ├── material-panel.tsx     # UI for editing material properties
│   │   ├── model-uploader.tsx     # Dialog for IFC/glTF file upload
│   │   ├── ifc-loader.tsx         # Lazy-loaded IFC parser using web-ifc
│   │   ├── gltf-loader.tsx        # glTF/GLB loader using Three.js GLTFLoader
│   │   ├── facade-generator.tsx   # Procedural facade texture generation
│   │   ├── roof-generator.tsx     # Procedural roof material generation
│   │   ├── ground-plane.tsx       # Ground/site plane mesh
│   │   ├── viewer-overlay.tsx     # Canvas overlay UI (legends, controls, labels)
│   │   └── window-texture.ts      # Procedural window texture factory
│   ├── building/                  # Building detail page components
│   │   ├── building-header.tsx    # Title, address, key attributes
│   │   ├── building-overview.tsx  # Stats grid (area, height, structure, etc.)
│   │   ├── building-tabs.tsx      # Tab container (overview, floors, areas, 3D)
│   │   ├── floor-breakdown.tsx    # Floor-by-floor table
│   │   └── area-detail.tsx        # Exclusive/common area breakdown
│   ├── search/                    # Search interface components
│   │   ├── region-search-form.tsx # Cascading dropdowns (sido → sigungu → dong)
│   │   ├── address-search-form.tsx# Form for parcel-level search
│   │   ├── search-results-table.tsx# Results table with click-to-detail navigation
│   │   └── search-pagination.tsx  # Pagination controls
│   ├── export/
│   │   └── export-dropdown.tsx    # CSV/JSON export menu
│   ├── bim/
│   │   └── bim-summary-card.tsx   # BIM/energy-related summary card
│   ├── settings/
│   │   └── api-key-dialog.tsx     # Modal for API key entry/validation
│   ├── layout/
│   │   └── header.tsx             # Top navigation bar with API key button
│   └── providers.tsx              # Client wrapper (QueryClientProvider, ThemeProvider)
│
├── hooks/                         # Custom React hooks
│   ├── use-building-search.ts     # TanStack Query hook for search results
│   ├── use-building-detail.ts     # Parallel queries for building detail (4 queries)
│   ├── use-building-footprint.ts  # VWorld footprint polygon fetch
│   ├── use-floor-data.ts          # (utility hook)
│   └── use-hydration.ts           # SSR hydration sync check
│
├── lib/                           # Pure functions, utilities, types
│   ├── types.ts                   # TypeScript interfaces for all API response types
│   ├── api-client.ts              # Client-side fetch wrapper, Zustand store integration
│   ├── api-proxy.ts               # Server-side fetch helper, extractItems/extractTotalCount
│   ├── constants.ts               # Building use/structure/roof code lookups, ID encoding
│   ├── building-geometry.ts       # Pure function: API data → 3D floor geometry
│   ├── material-types.ts          # Material property type definitions (ECO2-compatible)
│   ├── korean-building-codes.ts   # Lookup tables (U-values, floor heights, window ratios, HVAC defaults) by era
│   ├── material-inference.ts      # Pure function: API data + building era → MaterialProperties
│   ├── pbr-materials.ts           # Three.js PBR material factory
│   ├── model-storage.ts           # IndexedDB wrapper for uploaded IFC/glTF models
│   ├── export.ts                  # CSV/JSON export utilities
│   └── utils.ts                   # shadcn/ui cn() helper
│
├── store/                         # Zustand state stores
│   ├── app-store.ts               # API key, language, last search params (persisted to localStorage)
│   └── material-store.ts          # Material property overrides by building PK (non-persisted)
│
└── data/                          # Static reference data
    ├── bjdong-codes.json          # 20K+ Korean legal-dong codes (법정동)
    ├── region-codes.json          # Hierarchy: sido → sigungu → dong with codes
    └── use-type-codes.json        # Building use code catalog
```

## Directory Purposes

**`src/app/api/`:**
- Purpose: Next.js server-side route handlers acting as proxy middleware to data.go.kr and VWorld
- Contains: Route handler files (route.ts in each endpoint directory)
- Key files:
  - `bldrgst/title/route.ts` → proxy for title/overview data
  - `vworld/footprint/route.ts` → spatial data proxy for cadastral polygons

**`src/components/viewer/`:**
- Purpose: Three.js 3D building visualization with material property editing UI
- Contains: Canvas setup, mesh generators, loaders (IFC/glTF), procedural generators (facade, roof, windows), scene controls
- Key files:
  - `building-scene.tsx` → orchestrates all viewer logic, mounts sub-components
  - `building-model.tsx` → renders parametric floor meshes from BuildingGeometry
  - `material-panel.tsx` → UI for overriding inferred material properties
  - `ifc-loader.tsx`, `gltf-loader.tsx` → parse uploaded models

**`src/components/building/`:**
- Purpose: Building detail page layout and data display components
- Contains: Header, overview stats, tabbed interface, floor/area tables
- Key files:
  - `building-tabs.tsx` → tab container mounting BuildingScene as lazy-loaded tab

**`src/components/search/`:**
- Purpose: Building search interface (two modes: region-based and address-based)
- Contains: Form components, results table, pagination
- Key files:
  - `region-search-form.tsx` → cascading dropdowns
  - `address-search-form.tsx` → parcel-level search
  - `search-results-table.tsx` → clickable results with encoded building ID navigation

**`src/lib/`:**
- Purpose: Pure functions, type definitions, utilities
- Contains: API types, geometry generation, material inference, constants
- Key files:
  - `building-geometry.ts` → converts API data to 3D geometry representation
  - `material-types.ts` & `korean-building-codes.ts` → energy simulation property definitions
  - `material-inference.ts` → infers properties from building era, use code, structure code
  - `api-proxy.ts` → server-side data.go.kr fetch with error handling

**`src/store/`:**
- Purpose: Zustand state management
- Contains: Two stores: app state (persistent) and material state (transient)
- Key files:
  - `app-store.ts` → API key, language (persisted via localStorage)
  - `material-store.ts` → material property overrides keyed by building PK

**`src/data/`:**
- Purpose: Static reference data for cascading selects and code lookups
- Contains: JSON files with Korean administrative/building code hierarchies
- Key files:
  - `region-codes.json` → sido/sigungu/dong hierarchy for search forms
  - `bjdong-codes.json` → 20K+ legal-dong codes from FinanceData gist

## Key File Locations

**Entry Points:**
- `src/app/page.tsx` — Search page (home route `/`)
- `src/app/building/[id]/page.tsx` — Building detail page (dynamic route)
- `src/app/layout.tsx` — Root layout wrapping all pages with Providers

**Configuration:**
- `src/lib/constants.ts` — data.go.kr API URLs, code lookup tables, building ID encoding
- `.env` — API keys (not in repo, set via environment)
- `components.json` — shadcn/ui component metadata

**Core Logic:**
- `src/lib/building-geometry.ts` — Parametric 3D geometry generation from API data
- `src/lib/material-inference.ts` — Energy property inference from Korean building codes
- `src/lib/api-proxy.ts` — Server-side fetch to data.go.kr with error handling
- `src/lib/api-client.ts` — Client-side fetch wrapper with Zustand integration

**Testing:**
- No test files present in repo (testing framework not yet integrated)

## Naming Conventions

**Files:**
- Component files: `kebab-case.tsx` (e.g., `building-header.tsx`, `region-search-form.tsx`)
- Utility/hook files: `kebab-case.ts` (e.g., `use-building-search.ts`, `api-client.ts`)
- Data files: `kebab-case.json` (e.g., `bjdong-codes.json`, `region-codes.json`)

**Directories:**
- Features: singular lowercase (e.g., `viewer`, `search`, `building`)
- API routes: mirror data.go.kr endpoint structure (e.g., `bldrgst/title`, `vworld/footprint`)

**TypeScript:**
- Interfaces: PascalCase, prefixed with `Br` for data.go.kr types (e.g., `BrTitleInfo`, `BrFloorInfo`)
- Application types: PascalCase (e.g., `BuildingRecord`, `FloorGeometry`)
- Functions: camelCase (e.g., `generateBuildingGeometry`, `inferMaterialProperties`)
- Variables/constants: camelCase for variables, UPPER_SNAKE_CASE for constants (e.g., `DATA_GO_KR_BASE_URL`)

## Where to Add New Code

**New Feature (e.g., new building data endpoint):**
- API proxy route: `src/app/api/bldrgst/new-endpoint/route.ts`
- Type definition: add interface to `src/lib/types.ts`
- Client fetch function: add to `src/lib/api-client.ts`
- Hook: create `src/hooks/use-new-data.ts` wrapping fetch function with TanStack Query
- Component: create or update relevant component in `src/components/building/` or `src/components/search/`

**New 3D Component (e.g., new parametric generator):**
- Implementation: `src/components/viewer/new-generator.tsx`
- Import and mount in: `src/components/viewer/building-scene.tsx` or `src/components/viewer/building-model.tsx`
- Material properties: update `src/lib/material-types.ts` if needed
- Integration: add to rendering pipeline in building-model.tsx or building-scene.tsx

**New Material Property:**
- Type definition: update `MaterialProperties` interface in `src/lib/material-types.ts`
- Inference logic: update `src/lib/material-inference.ts` with new lookup tables or calculation
- Lookup tables: add to `src/lib/korean-building-codes.ts` if era/use-code dependent
- UI editor: update `src/components/viewer/material-panel.tsx` with new form field

**New Search Filter/Form:**
- Component: `src/components/search/new-search-form.tsx`
- Type: add `SearchParams` type to `src/lib/types.ts` if needed
- Fetch function: add to `src/lib/api-client.ts`
- Mount: add TabsTrigger + TabsContent in `src/app/page.tsx`

**Utilities/Helpers:**
- Pure functions: `src/lib/new-utility.ts`
- React hooks: `src/hooks/use-new-hook.ts`
- Constants: add to `src/lib/constants.ts` if shared, otherwise inline

## Special Directories

**`src/data/`:**
- Purpose: Static JSON reference files
- Generated: No (manually maintained)
- Committed: Yes (used at runtime, imported in components)

**`src/app/api/`:**
- Purpose: Next.js API route handlers
- Generated: No
- Committed: Yes

**`public/`:**
- Purpose: Static assets (samples, HDR textures for 3D viewer)
- Generated: No (some assets may be user-provided samples)
- Committed: Partially (repo has `public/samples/` and `public/wasm/`)

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes (via `pnpm build`)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (via `pnpm install`)
- Committed: No (in .gitignore)

## Dynamic Route Segments

**`src/app/building/[id]/page.tsx`:**
- Route param: `id` — encoded building identifier in format `sigunguCd-bjdongCd-platGbCd-bun-ji`
- Decoding: `decodeBuildingId(id)` in `src/lib/constants.ts`
- Used to fetch: title, recap, floors, areas via four parallel TanStack Query queries

## File Organization Patterns

**Component Composition:**
- Large features (viewer, building detail) organized into dedicated directories
- Shared UI components isolated in `src/components/ui/` (shadcn/ui imports)
- Cross-feature utilities in `src/lib/`

**API Routes:**
- Each data.go.kr endpoint gets dedicated directory: `src/app/api/bldrgst/{endpoint}/route.ts`
- Each route imports `fetchFromDataGoKr()` from `src/lib/api-proxy.ts`
- Response shape standardized: `{ items: T[], totalCount: number, pageNo, numOfRows }`

**Hooks:**
- One hook per query pattern (search, detail, footprint, floor data)
- Each hook wraps `useQuery` or `useQueries` from TanStack Query
- Pure client-side hooks for non-query logic (e.g., `useHydration`)

**Stores:**
- `app-store.ts` — persistent (API key, language)
- `material-store.ts` — transient (property overrides per session)
- Both use Zustand `create()` pattern with middleware (persist only for app-store)

