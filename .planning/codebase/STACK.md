# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5 - Full codebase (src/**/*.ts, src/**/*.tsx)

**Secondary:**
- JavaScript - Build configuration and configuration files (next.config.ts, eslint.config.mjs)

## Runtime

**Environment:**
- Node.js (version specified in package.json, no explicit .nvmrc)

**Package Manager:**
- pnpm v9+ - Primary package manager
- Lockfile: `pnpm-lock.yaml` (247KB, fully committed)

## Frameworks

**Core:**
- Next.js 16.2.1 - Full-stack React framework with App Router
- React 19.2.4 - UI component library
- React DOM 19.2.4 - DOM rendering

**3D Graphics & Visualization:**
- Three.js 0.183.2 - WebGL 3D graphics engine (`src/components/viewer/*`)
- React Three Fiber v9.5.0 - React renderer for Three.js (`@react-three/fiber`)
- drei 10.7.7 - Useful abstractions for R3F (OrbitControls, ContactShadows, Environment, etc.)
- React Three Postprocessing 3.0.4 - Post-processing effects (SSAO, Bloom, Vignette)
- postprocessing 6.39.0 - Underlying postprocessing library
- three-stdlib 2.36.1 - Standard library utilities for Three.js

**IFC File Parsing:**
- web-ifc 0.0.77 - BIM model file parser (`src/components/viewer/ifc-loader.tsx`)

**Build/Dev:**
- ESLint 9 - Code linting (eslint-config-next 16.2.1)
- TypeScript compiler - Type checking and compilation

## Key Dependencies

**Critical:**
- @react-three/fiber v9.5.0 - 3D rendering engine bindings for React
- @react-three/drei v10.7.7 - Pre-built 3D components (cameras, controls, lights)
- Three.js v0.183.2 - Direct 3D graphics library dependency

**State Management:**
- zustand 5.0.12 - Lightweight state management with persist middleware (`src/store/app-store.ts`)

**Data Fetching & Querying:**
- @tanstack/react-query 5.95.2 - Server state management for API calls
- @tanstack/react-table 8.21.3 - Headless table component (`src/components/search/search-results-table.tsx`)
- @tanstack/react-virtual 3.13.23 - Virtual scrolling for large lists

**Form Handling:**
- react-hook-form 7.72.0 - Performant forms with minimal re-renders
- @hookform/resolvers 5.2.2 - Zod schema validation integration
- zod 4.3.6 - TypeScript-first schema validation

**UI Components & Styling:**
- shadcn/ui - Headless Radix UI components with Tailwind CSS styling
- radix-ui 1.4.3 - Unstyled, accessible component primitives
- class-variance-authority 0.7.1 - Type-safe CSS class composition
- clsx 2.1.1 - Utility for conditional className binding
- tailwind-merge 3.5.0 - Merge Tailwind CSS classes without conflicts
- Tailwind CSS v4 (@tailwindcss/postcss v4) - Utility-first CSS framework

**Icons:**
- lucide-react 1.7.0 - SVG icon library

**Notifications:**
- sonner 2.0.7 - Toast notification library

**Data Storage:**
- idb-keyval 6.2.2 - IndexedDB wrapper for model storage (`src/lib/model-storage.ts`)

**Utilities:**
- next-themes 0.4.6 - Theme provider (dark/light mode)
- papaparse 5.5.3 - CSV parser for data import

**Development Tools:**
- @types/node 20 - Node.js type definitions
- @types/react 19 - React type definitions
- @types/react-dom 19 - React DOM type definitions
- @types/papaparse 5.5.2 - PapaParse type definitions
- @types/three 0.183.1 - Three.js type definitions

## Configuration

**Environment:**
- No `.env` file detected at project root
- API key stored in Zustand persist store at client-side (via `useAppStore` from `src/store/app-store.ts`)
- VWorld API key embedded in `src/app/api/vworld/footprint/route.ts` (hardcoded)

**Build:**
- `next.config.ts` - Minimal Next.js configuration (no special options enabled)
- `tsconfig.json` - Strict mode enabled, ES2017 target, ESNext modules
- `eslint.config.mjs` - ESLint v9 flat config with Next.js core-web-vitals and TypeScript rules
- `postcss.config.mjs` - PostCSS configuration for Tailwind CSS
- `pnpm-workspace.yaml` - Monorepo workspace (currently single workspace)
- `components.json` - shadcn/ui configuration (New York style, neutral base color, custom aliases)

**Path Aliases (tsconfig.json):**
- `@/*` → `./src/*` - All imports use `@/` prefix

## Platform Requirements

**Development:**
- Node.js with pnpm
- Browser with WebGL 2.0+ support (for Three.js 0.183)
- Modern browser for React 19 + ES2017 features

**Production:**
- Node.js server (for Next.js App Router server components)
- Deployment: Vercel (implied by Next.js 16 and no custom deployment config)
- Static assets require: public/wasm/ (WASM for web-ifc parsing)
- Assets: public/hdr/sky.hdr (HDR environment map for 3D scene)

## Key API Routes & Proxy Structure

**data.go.kr Proxies** (server-side fetch, CORS-safe):
- `src/app/api/bldrgst/title/route.ts` - getBrTitleInfo (building overview)
- `src/app/api/bldrgst/recap/route.ts` - getBrRecapTitleInfo (summary)
- `src/app/api/bldrgst/floors/route.ts` - getBrFlrOulnInfo (floor details)
- `src/app/api/bldrgst/areas/route.ts` - getBrExposPubuseAreaInfo (area breakdown)
- `src/app/api/bldrgst/basis/route.ts` - getBrBasisOulnInfo (basic info)
- `src/app/api/bldrgst/jijugu/route.ts` - getBrJijiguInfo (zone info)

**VWorld Proxy:**
- `src/app/api/vworld/footprint/route.ts` - Spatial data API (building footprints, geocoding)

---

*Stack analysis: 2026-03-26*
