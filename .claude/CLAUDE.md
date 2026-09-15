<!-- GSD:project-start source:PROJECT.md -->

## Project

**BIMFIT — Korean Building Energy Repository**

BIMFIT turns incomplete evidence about a Korean building into a defensible energy
and retrofit assessment. The 건축물대장 (building register) is the primary entry:
pick a real building and its register row becomes a multi-storey baseline energy
model with no further input, which the user then refines toward a digital twin with
drawings, plans and MEP data while watching the energy delta move.

From v6.0 the product grows a second face. The single-building assessment becomes the
generator for a **building energy repository**: a calibrated corpus of Korean building
energy baselines, published as versioned datasets with stated provenance and error
bands, anchored by a small set of measured reference models.

**Core Value:** Every number the product states can be traced to either a cited source or a named,
visible, reversible assumption — and that guarantee holds when the same method is
applied to one building or to a population.

### Constraints

- **Tech stack**: Next.js 16.2 App Router, React 19.2, TypeScript, Three.js 0.182 with React Three Fiber 9, Zustand 5, TanStack Query 5, Tailwind 4, shadcn/ui, Vitest 4, Playwright — established and not under review this milestone
- **Product shape**: 건물 검색 → 도면 업로드 → 디지털 트윈 → 보고서 is fixed; build inside it
- **Traceability**: `createEnergyFact` throws unless a fact cites sources, names an assumption, or is explicit user input — a convenience helper that attaches register references to a defaulted value would kill the guarantee
- **Data source**: data.go.kr 건축HUB requires `bjdongCd`; the shared demo key is rate-limited per address; the four register endpoints fail independently and must never all be required
- **Deployment**: functions pinned to Seoul (`icn1`) in `vercel.json`; VWorld refuses other egress regions
- **Licensing**: no reference-building artifact ships without an established licence and rights holder
- **Test suite**: around 380 tests across 29 files exercise retrofit economics; around fifteen files loop the model registry. Changes here are contract changes

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5 - Full codebase (src/**/*.ts, src/**/*.tsx)
- JavaScript - Build configuration and configuration files (next.config.ts, eslint.config.mjs)

## Runtime

- Node.js (version specified in package.json, no explicit .nvmrc)
- pnpm v9+ - Primary package manager
- Lockfile: `pnpm-lock.yaml` (247KB, fully committed)

## Frameworks

- Next.js 16.2.1 - Full-stack React framework with App Router
- React 19.2.4 - UI component library
- React DOM 19.2.4 - DOM rendering
- Three.js 0.183.2 - WebGL 3D graphics engine (`src/components/viewer/*`)
- React Three Fiber v9.5.0 - React renderer for Three.js (`@react-three/fiber`)
- drei 10.7.7 - Useful abstractions for R3F (OrbitControls, ContactShadows, Environment, etc.)
- React Three Postprocessing 3.0.4 - Post-processing effects (SSAO, Bloom, Vignette)
- postprocessing 6.39.0 - Underlying postprocessing library
- three-stdlib 2.36.1 - Standard library utilities for Three.js
- web-ifc 0.0.77 - BIM model file parser (`src/components/viewer/ifc-loader.tsx`)
- ESLint 9 - Code linting (eslint-config-next 16.2.1)
- TypeScript compiler - Type checking and compilation

## Key Dependencies

- @react-three/fiber v9.5.0 - 3D rendering engine bindings for React
- @react-three/drei v10.7.7 - Pre-built 3D components (cameras, controls, lights)
- Three.js v0.183.2 - Direct 3D graphics library dependency
- zustand 5.0.12 - Lightweight state management with persist middleware (`src/store/app-store.ts`)
- @tanstack/react-query 5.95.2 - Server state management for API calls
- @tanstack/react-table 8.21.3 - Headless table component (`src/components/search/search-results-table.tsx`)
- @tanstack/react-virtual 3.13.23 - Virtual scrolling for large lists
- react-hook-form 7.72.0 - Performant forms with minimal re-renders
- @hookform/resolvers 5.2.2 - Zod schema validation integration
- zod 4.3.6 - TypeScript-first schema validation
- shadcn/ui - Headless Radix UI components with Tailwind CSS styling
- radix-ui 1.4.3 - Unstyled, accessible component primitives
- class-variance-authority 0.7.1 - Type-safe CSS class composition
- clsx 2.1.1 - Utility for conditional className binding
- tailwind-merge 3.5.0 - Merge Tailwind CSS classes without conflicts
- Tailwind CSS v4 (@tailwindcss/postcss v4) - Utility-first CSS framework
- lucide-react 1.7.0 - SVG icon library
- sonner 2.0.7 - Toast notification library
- idb-keyval 6.2.2 - IndexedDB wrapper for model storage (`src/lib/model-storage.ts`)
- next-themes 0.4.6 - Theme provider (dark/light mode)
- papaparse 5.5.3 - CSV parser for data import
- @types/node 20 - Node.js type definitions
- @types/react 19 - React type definitions
- @types/react-dom 19 - React DOM type definitions
- @types/papaparse 5.5.2 - PapaParse type definitions
- @types/three 0.183.1 - Three.js type definitions

## Configuration

- No `.env` file detected at project root
- API key stored in Zustand persist store at client-side (via `useAppStore` from `src/store/app-store.ts`)
- VWorld API key embedded in `src/app/api/vworld/footprint/route.ts` (hardcoded)
- `next.config.ts` - Minimal Next.js configuration (no special options enabled)
- `tsconfig.json` - Strict mode enabled, ES2017 target, ESNext modules
- `eslint.config.mjs` - ESLint v9 flat config with Next.js core-web-vitals and TypeScript rules
- `postcss.config.mjs` - PostCSS configuration for Tailwind CSS
- `pnpm-workspace.yaml` - Monorepo workspace (currently single workspace)
- `components.json` - shadcn/ui configuration (New York style, neutral base color, custom aliases)
- `@/*` → `./src/*` - All imports use `@/` prefix

## Platform Requirements

- Node.js with pnpm
- Browser with WebGL 2.0+ support (for Three.js 0.183)
- Modern browser for React 19 + ES2017 features
- Node.js server (for Next.js App Router server components)
- Deployment: Vercel (implied by Next.js 16 and no custom deployment config)
- Static assets require: public/wasm/ (WASM for web-ifc parsing)
- Assets: public/hdr/sky.hdr (HDR environment map for 3D scene)

## Key API Routes & Proxy Structure

- `src/app/api/bldrgst/title/route.ts` - getBrTitleInfo (building overview)
- `src/app/api/bldrgst/recap/route.ts` - getBrRecapTitleInfo (summary)
- `src/app/api/bldrgst/floors/route.ts` - getBrFlrOulnInfo (floor details)
- `src/app/api/bldrgst/areas/route.ts` - getBrExposPubuseAreaInfo (area breakdown)
- `src/app/api/bldrgst/basis/route.ts` - getBrBasisOulnInfo (basic info)
- `src/app/api/bldrgst/jijugu/route.ts` - getBrJijiguInfo (zone info)
- `src/app/api/vworld/footprint/route.ts` - Spatial data API (building footprints, geocoding)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Components: PascalCase with descriptive names
- Utilities/Lib files: camelCase
- Hooks: `use` prefix in camelCase
- camelCase for all functions and methods
- camelCase for all variable names
- Constants in UPPER_SNAKE_CASE when exported globally
- Store selectors use arrow functions with implicit destructuring
- PascalCase for all interfaces and type aliases
- API response types prefixed with source: `BrTitleInfo`, `BrFloorInfo`, `BrAreaInfo`, `DataGoKrResponse<T>`
- Component props interfaces suffixed with `Props`: `BuildingHeaderProps`, `RegionSearchFormProps`
- State/option interfaces describe their purpose: `RegionSearchValues`, `AppState`, `ApiListResponse<T>`

## Code Style

- No explicit formatter installed (Prettier or Biome not configured)
- Consistent indentation observed: 2 spaces
- Template literals used for formatting and bilingual strings
- Template literal pattern for bilingual UI: `{isKo ? "한글" : "English"}`
- ESLint v9 with `eslint-config-next` (core-web-vitals + typescript presets)
- Config file: `eslint.config.mjs` (flat config format)
- Default ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- Module resolution: `bundler`
- Target: ES2017
- Path alias configured: `@/*` → `./src/*`
- JSX: `react-jsx` (new JSX transform)

## Import Organization

- `@/*` resolves to `./src/*`
- Used consistently throughout codebase for imports

## "use client" Directive

- Used in all interactive components
- Required for:
- `src/app/page.tsx` - Search page with state and hooks
- `src/components/providers.tsx` - Provider setup with QueryClient and ThemeProvider
- `src/store/app-store.ts` - Zustand store definition
- `src/hooks/use-hydration.ts` - Custom hydration hook
- Root layout: `src/app/layout.tsx` (no `"use client"`, defines metadata)
- API routes use `NextRequest` and `NextResponse` directly
- Server-side data fetching in API handlers only

## Bilingual Support Pattern

- Property: `language: "ko" | "en"`
- Selector pattern: `const language = useAppStore((s) => s.language)`
- Computed flag: `const isKo = language === "ko"`
- Multilingual data stored as objects with `ko` and `en` keys
- Example from `src/lib/constants.ts`:
- UI labels in components
- Error messages
- Dialog titles and descriptions
- Search form labels
- Result headers and pagination labels

## Error Handling

- Always destructure immediately: `const { data, error } = await fetch...`
- Check error before using data
- Return `null` data and meaningful error message string
- Use `Error` instance check for instanceof patterns
- Display error in dedicated error UI sections
- Use destructuring: `error instanceof Error ? error.message : String(error)`
- Zod v4 for schema validation (in `@hookform/resolvers`)
- Plain TypeScript interfaces for form values (avoid Zod's type inference issues noted in CLAUDE.md)
- React Hook Form with `Controller` component for form state

## Logging

- No explicit logging guards in production
- Console not used extensively in codebase (clean production logs)
- Removed before commit per ESLint config-next rules

## Comments

- API response structure explanations (in `src/lib/types.ts`)
- Section headers using Unicode box drawings: `// ─────────────────────────────────────────────`
- Purpose of complex utility functions (e.g., JSDoc-style comments above `extractItems()`, `formatArea()`)
- Brief function descriptions above utility functions
- Parameter types already in TypeScript signature
- Return type descriptions

## Function Design

- `extractItems()`, `formatArea()`, `formatDate()` are 5-10 lines each
- Component render functions decomposed into sub-components
- Example: `FormSkeleton()` extracted in `src/app/page.tsx`
- Use typed objects for multiple params instead of positional args
- Example: `searchBuildings(params: SearchBuildingsParams)` with interface defining all options
- API routes use `const params: Record<string, string | number> = {}` to collect query params
- Return structured objects: `{ data, error }` pattern
- Return typed arrays from extraction functions: `T[]`
- Use `Promise<Type>` for async functions
- Return UI elements from component functions (JSX)

## Module Design

- Named exports preferred: `export function functionName()`, `export const CONSTANT =`
- Default exports used for React components and pages only
- `export type` for TypeScript interfaces
- Not extensively used; imports target specific files
- Example: `@/lib/export`, `@/lib/api-proxy` rather than `@/lib/index`
- `types.ts` — All API response and domain types
- `constants.ts` — All constants, codes, enums, and formatting functions
- `api-proxy.ts` — Server-side fetch logic
- `api-client.ts` — Client-side fetch wrapper
- Specialized files: `building-geometry.ts`, `korean-building-codes.ts`, `material-inference.ts`
- Subdirectories by feature: `building/`, `search/`, `export/`, `settings/`, `layout/`, `ui/`
- `ui/` contains shadcn/ui components
- Feature components handle domain logic

## API Route Pattern

- Path: `/api/bldrgst/[endpoint]` routes
- Method: GET
- Header: `x-api-key` passed by client (from Zustand store)

## Lazy Loading & Code Splitting

- Search forms: `RegionSearchForm`, `AddressSearchForm`
- Results table: `SearchResultsTable`
- Pagination: `SearchPagination`
- Three.js 3D viewer components

## shadcn/ui Component Usage

- `button.tsx` — uses class-variance-authority for variants
- `badge.tsx` — display status/category
- `card.tsx` — container styling
- `dialog.tsx` — modal dialogs
- `dropdown-menu.tsx` — dropdown menus
- `label.tsx` — form labels
- `select.tsx` — select dropdowns
- `skeleton.tsx` — loading placeholder
- `sonner.tsx` — toast notifications
- `table.tsx` — data tables
- `tabs.tsx` — tab navigation

## Format Function Pattern

- `formatArea(value): string` — Returns `"-"` if undefined, null, or 0; else `"1,234.50 m²"`
- `formatDate(dateStr): string` — Returns `"-"` if empty/invalid; else formats `"YYYYMMDD"` to `"YYYY-MM-DD"`
- `formatPercent(value): string` — Returns `"-"` if undefined, null, or 0; else `"12.50%"`

## Zustand Persist Store

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Pattern Overview

- API proxy layer decouples frontend from data.go.kr (solves CORS, handles error cases)
- Pure functional pipeline: building ledger data → 3D geometry → material properties → Three.js visualization
- Zustand stores for persistent state (API key, language, material overrides)
- TanStack Query for client-side caching and request deduplication
- Real building footprint polygons from VWorld cadastral API override parametric estimates
- IndexedDB lazy storage for user-uploaded IFC/glTF models
- Material property system compatible with ECO2 energy simulation input format

## Layers

- Purpose: Broker requests between client and data.go.kr BldRgstHubService, handle authentication, transform responses
- Location: `src/app/api/bldrgst/*` (six route handlers), `src/app/api/vworld/footprint/route.ts`
- Contains: Next.js API route handlers using `fetchFromDataGoKr()` helper
- Depends on: `src/lib/api-proxy.ts` (server-side fetch), request headers (x-api-key)
- Used by: Client-side `src/lib/api-client.ts` (via fetch to /api/* routes)
- Purpose: Client-side fetch wrappers around API routes, request queuing, header management
- Location: `src/lib/api-client.ts`, `src/hooks/use-building-search.ts`, `src/hooks/use-building-detail.ts`
- Contains: Typed fetch functions (`searchBuildings()`, `getFloorInfo()`, etc.), TanStack Query hooks
- Depends on: Zustand `useAppStore` for API key, TanStack Query for caching
- Used by: Page components and detail pages
- Purpose: Pure functions converting raw API data into 3D geometry specs and material properties
- Location: `src/lib/building-geometry.ts`, `src/lib/material-inference.ts`, `src/lib/material-types.ts`, `src/lib/korean-building-codes.ts`
- Contains: Type definitions, classification functions, lookup tables for building eras, floor heights, window ratios, U-values
- Depends on: Input types (`BrTitleInfo`, `BrFloorInfo`), permit date parsing
- Used by: `src/components/viewer/building-scene.tsx` for 3D generation and material store initialization
- Purpose: Three.js canvas rendering with React Three Fiber, material property UI, model upload/switching
- Location: `src/components/viewer/*` (BuildingScene, BuildingModel, SceneControls, MaterialPanel, loaders)
- Contains: Canvas setup, floor mesh generation, IFC/glTF loaders, material override UI, scene controls (pan/zoom/rotate)
- Depends on: Geometry from building-geometry.ts, material store, uploaded models from IndexedDB
- Used by: `src/components/building/building-tabs.tsx` as a tabbed view
- Purpose: Search forms, results tables, building detail pages, UI composition
- Location: `src/app/page.tsx`, `src/app/building/[id]/page.tsx`, `src/components/search/*`, `src/components/building/*`
- Contains: React components with form handling, data display, navigation
- Depends on: Hooks (useQuery, useHydration), stores (Zustand), UI components (shadcn/ui)
- Used by: Next.js routing
- Purpose: Persist API key and language preference, manage material property overrides
- Location: `src/store/app-store.ts`, `src/store/material-store.ts`
- Contains: Zustand stores with persist middleware
- Depends on: localStorage (via Zustand persist)
- Used by: All client components via hooks

## Data Flow

- API key stored in Zustand persist store, read on client startup
- Material properties stored in non-persisted store, keyed by building PK
- User overrides to material properties update store and trigger component re-renders
- Search parameters cached in app store for session restoration

## Key Abstractions

- Purpose: Represents parametric 3D building as layered floors with positions, dimensions, structural use codes
- Examples: `src/lib/building-geometry.ts` → `generateBuildingGeometry()` produces `BuildingGeometry` type
- Pattern: Pure function taking API types (BrTitleInfo, BrFloorInfo[]) → output geometry with calculated floor heights, color coding by use type, era classification
- Purpose: Energy simulation input format compatible with ECO2, includes envelope (walls, roof, windows, foundation), HVAC, lighting, occupancy
- Examples: `src/lib/material-types.ts` defines interface, `material-inference.ts` infers from building era + use code + structure code
- Pattern: Inference driven by lookup tables (WALL_U_VALUES, WINDOW_RATIOS, GLAZING_TYPE keyed by BuildingEra), insulation thickness scaled by era
- Purpose: Standardized response wrapper from all API routes (title, floors, areas, etc.)
- Examples: `src/lib/api-client.ts` defines interface, returned by each proxy endpoint
- Pattern: Consistent shape allows reusable TanStack Query hooks
- Purpose: Compress multi-part building identifier (sigunguCd, bjdongCd, platGbCd, bun, ji) into URL-safe string
- Examples: `src/lib/constants.ts` → `encodeBuildingId()`, `decodeBuildingId()`
- Pattern: Hyphen-delimited string passed as dynamic route param `[id]`
- Purpose: Single-floor 3D representation with type, position (y), height, footprint (width/depth), use code, color
- Examples: `src/lib/building-geometry.ts`, array produced by generateBuildingGeometry()
- Pattern: Used as intermediate format between API and Three.js mesh generation in BuildingModel

## Entry Points

- Location: `src/app/page.tsx`
- Triggers: User navigates to `/` or initial app load
- Responsibilities: Render two search modes (region/address), display results table, lazy-load form components, show error banner if no API key
- Location: `src/app/building/[id]/page.tsx`
- Triggers: User clicks building row in search results, navigates to `/building/sigunguCd-bjdongCd-...`
- Responsibilities: Decode ID, fetch four building datasets in parallel, render tabs (overview, floors, areas, 3D viewer)
- Location: `src/components/viewer/building-scene.tsx`
- Triggers: BuildingTabs mounts viewer tab, BuildingScene mounts on demand
- Responsibilities: Initialize canvas with Three.js, fetch VWorld footprint, generate parametric geometry, infer materials, manage model upload/switching, render material panel

## Error Handling

## Cross-Cutting Concerns

- Input validation at form level with `react-hook-form` (address-search-form, region-search-form)
- API response validation in extractItems/extractTotalCount (defensive type guards)
- Building ID decoding validates split result length
- API key stored in Zustand persist (localStorage)
- Validated on entry via `validateApiKey()` in api-client.ts (minimal validation — just checks if key works)
- Passed in `x-api-key` header to all proxy routes
- No OAuth or user accounts; single-key per browser session
- TanStack Query: 5 min default staleTime, configurable per query
- VWorld footprint cached 30 min
- IndexedDB: unlimited storage for uploaded models until user deletes
- `useHydration()` hook in `src/hooks/use-hydration.ts` used in `src/app/page.tsx` to avoid SSR/client mismatch on Zustand store reads
- API key banner only renders after hydration complete

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| pm-architect | Expert project manager orchestrating backlog-curator, work-delegator, workstream-coordinator, and roadmap-strategist sub-skills. Coordinates complex software projects through delegation and strategic oversight. Activates when managing projects, coordinating work, or tracking overall progress. | `.claude/skills/pm-architect/SKILL.md` |
| threejs-builder | > Creates simple Three.js web apps with scene setup, lighting, geometries, materials, animations, and responsive rendering. Use for: "Create a threejs scene/app/showcase" or when user wants 3D web content. Supports ES modules, modern Three.js r150+ APIs. | `.claude/skills/threejs-builder/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
