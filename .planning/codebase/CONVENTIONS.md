# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Components: PascalCase with descriptive names
  - Example: `BuildingHeader.tsx`, `RegionSearchForm.tsx`, `BimSummaryCard.tsx`
  - Directories use kebab-case: `building/`, `search/`, `export/`
- Utilities/Lib files: camelCase
  - Example: `api-proxy.ts`, `building-geometry.ts`, `korean-building-codes.ts`
- Hooks: `use` prefix in camelCase
  - Example: `useHydration.ts`, `useBuildingSearch.ts`

**Functions:**
- camelCase for all functions and methods
  - Example: `formatArea()`, `extractItems()`, `searchBuildings()`
  - Handler functions prefixed with `handle`: `handleRegionSearch()`, `handlePageChange()`, `handleExportCsv()`

**Variables:**
- camelCase for all variable names
- Constants in UPPER_SNAKE_CASE when exported globally
  - Example: `DATA_GO_KR_BASE_URL`, `API_ENDPOINTS`, `SEARCH_USE_FILTERS`, `ROW_HEIGHT`
- Store selectors use arrow functions with implicit destructuring
  - Example: `const language = useAppStore((s) => s.language)`

**Types:**
- PascalCase for all interfaces and type aliases
- API response types prefixed with source: `BrTitleInfo`, `BrFloorInfo`, `BrAreaInfo`, `DataGoKrResponse<T>`
- Component props interfaces suffixed with `Props`: `BuildingHeaderProps`, `RegionSearchFormProps`
- State/option interfaces describe their purpose: `RegionSearchValues`, `AppState`, `ApiListResponse<T>`

## Code Style

**Formatting:**
- No explicit formatter installed (Prettier or Biome not configured)
- Consistent indentation observed: 2 spaces
- Template literals used for formatting and bilingual strings
- Template literal pattern for bilingual UI: `{isKo ? "한글" : "English"}`

**Linting:**
- ESLint v9 with `eslint-config-next` (core-web-vitals + typescript presets)
- Config file: `eslint.config.mjs` (flat config format)
- Default ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

**TypeScript:**
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- Module resolution: `bundler`
- Target: ES2017
- Path alias configured: `@/*` → `./src/*`
- JSX: `react-jsx` (new JSX transform)

## Import Organization

**Order:**
1. Next.js imports (from `next/*`)
2. React imports (from `react`)
3. Third-party library imports (Zustand, React Query, React Hook Form, etc.)
4. Internal imports from `@/` prefix
5. Type imports using `import type { }`

**Example from `src/app/page.tsx`:**
```typescript
import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { Building2, AlertTriangle, MapPin, Search, Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { useHydration } from "@/hooks/use-hydration";
import { useBuildingSearch } from "@/hooks/use-building-search";
import { exportToCsv, exportToJson } from "@/lib/export";
import type { SearchBuildingsParams } from "@/lib/api-client";
```

**Path Aliases:**
- `@/*` resolves to `./src/*`
- Used consistently throughout codebase for imports

## "use client" Directive

**Pattern:** Always placed at the top of file before imports
- Used in all interactive components
- Required for:
  - Components using React hooks (`useState`, `useEffect`, `useCallback`, etc.)
  - Components using Zustand store (`useAppStore`)
  - Components using React Query (`useQuery`)
  - Components using React Hook Form (`useForm`, `Controller`)
  - Components using Next.js router (`useRouter`, `useNavigation`)

**Examples:**
- `src/app/page.tsx` - Search page with state and hooks
- `src/components/providers.tsx` - Provider setup with QueryClient and ThemeProvider
- `src/store/app-store.ts` - Zustand store definition
- `src/hooks/use-hydration.ts` - Custom hydration hook

**Server Components:**
- Root layout: `src/app/layout.tsx` (no `"use client"`, defines metadata)
- API routes use `NextRequest` and `NextResponse` directly
- Server-side data fetching in API handlers only

## Bilingual Support Pattern

**Store-based language flag:** Language stored in Zustand (`useAppStore`)
- Property: `language: "ko" | "en"`
- Selector pattern: `const language = useAppStore((s) => s.language)`
- Computed flag: `const isKo = language === "ko"`

**Conditional rendering in JSX:**
```typescript
{isKo ? "한글 문자열" : "English string"}
```

**In constants/data:**
- Multilingual data stored as objects with `ko` and `en` keys
- Example from `src/lib/constants.ts`:
  ```typescript
  export const USE_CODES: Record<string, { ko: string; en: string }> = {
    "01000": { ko: "단독주택", en: "Single House" },
    "02000": { ko: "공동주택", en: "Apartment" },
  };
  ```

**Translation table lookups:**
```typescript
const displayText = USE_CODES[codeValue]?.[isKo ? "ko" : "en"]
```

**Applied throughout:**
- UI labels in components
- Error messages
- Dialog titles and descriptions
- Search form labels
- Result headers and pagination labels

## Error Handling

**API errors:** Use `{data, error}` tuple pattern from `fetchFromDataGoKr()`
- Always destructure immediately: `const { data, error } = await fetch...`
- Check error before using data
- Return `null` data and meaningful error message string

**Example from `src/lib/api-proxy.ts`:**
```typescript
return { data: json, error: null };  // Success
return { data: null, error: "API error [...]" };  // Failure
```

**Client-side error display:**
- Use `Error` instance check for instanceof patterns
- Display error in dedicated error UI sections
- Use destructuring: `error instanceof Error ? error.message : String(error)`

**Form validation:**
- Zod v4 for schema validation (in `@hookform/resolvers`)
- Plain TypeScript interfaces for form values (avoid Zod's type inference issues noted in CLAUDE.md)
- React Hook Form with `Controller` component for form state

## Logging

**Framework:** Native `console` methods (no dedicated logging library)

**Patterns:**
- No explicit logging guards in production
- Console not used extensively in codebase (clean production logs)
- Removed before commit per ESLint config-next rules

## Comments

**When to Comment:**
- API response structure explanations (in `src/lib/types.ts`)
- Section headers using Unicode box drawings: `// ─────────────────────────────────────────────`
- Purpose of complex utility functions (e.g., JSDoc-style comments above `extractItems()`, `formatArea()`)

**JSDoc/TSDoc:**
- Brief function descriptions above utility functions
- Parameter types already in TypeScript signature
- Return type descriptions

**Example from `src/lib/api-proxy.ts`:**
```typescript
/**
 * Server-side fetch to data.go.kr Building Ledger API.
 * Used only in Next.js API route handlers.
 */
export async function fetchFromDataGoKr(...)
```

## Function Design

**Size:** Utility functions kept small and focused
- `extractItems()`, `formatArea()`, `formatDate()` are 5-10 lines each
- Component render functions decomposed into sub-components
- Example: `FormSkeleton()` extracted in `src/app/page.tsx`

**Parameters:**
- Use typed objects for multiple params instead of positional args
- Example: `searchBuildings(params: SearchBuildingsParams)` with interface defining all options
- API routes use `const params: Record<string, string | number> = {}` to collect query params

**Return Values:**
- Return structured objects: `{ data, error }` pattern
- Return typed arrays from extraction functions: `T[]`
- Use `Promise<Type>` for async functions
- Return UI elements from component functions (JSX)

## Module Design

**Exports:**
- Named exports preferred: `export function functionName()`, `export const CONSTANT =`
- Default exports used for React components and pages only
- `export type` for TypeScript interfaces

**Barrel Files:**
- Not extensively used; imports target specific files
- Example: `@/lib/export`, `@/lib/api-proxy` rather than `@/lib/index`

**Organization in `src/lib/`:**
- `types.ts` — All API response and domain types
- `constants.ts` — All constants, codes, enums, and formatting functions
- `api-proxy.ts` — Server-side fetch logic
- `api-client.ts` — Client-side fetch wrapper
- Specialized files: `building-geometry.ts`, `korean-building-codes.ts`, `material-inference.ts`

**Component Organization:**
- Subdirectories by feature: `building/`, `search/`, `export/`, `settings/`, `layout/`, `ui/`
- `ui/` contains shadcn/ui components
- Feature components handle domain logic

## API Route Pattern

**Pattern:** Next.js App Router API routes with "use client" integration

**Request:**
- Path: `/api/bldrgst/[endpoint]` routes
- Method: GET
- Header: `x-api-key` passed by client (from Zustand store)

**Handler Flow:**
1. Read `x-api-key` from request headers
2. Validate header presence, return 401 if missing
3. Extract query parameters from `request.nextUrl.searchParams`
4. Filter params using whitelist of allowed keys
5. Call `fetchFromDataGoKr(endpoint, params, apiKey)`
6. Destructure response: `const { data, error } = await fetch...`
7. Check error, extract items/totalCount from response structure
8. Return `NextResponse.json({ items, totalCount, pageNo, numOfRows })`

**Example from `src/app/api/bldrgst/basis/route.ts`:**
```typescript
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
  }

  const { data, error } = await fetchFromDataGoKr("basis", params, apiKey);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "No data returned" }, { status: 502 });
  }

  const items = extractItems(data);
  const totalCount = extractTotalCount(data);
  return NextResponse.json({ items, totalCount, pageNo, numOfRows });
}
```

## Lazy Loading & Code Splitting

**Pattern:** React.lazy + Suspense for heavy components

**Where used:**
- Search forms: `RegionSearchForm`, `AddressSearchForm`
- Results table: `SearchResultsTable`
- Pagination: `SearchPagination`
- Three.js 3D viewer components

**Imports in `src/app/page.tsx`:**
```typescript
const RegionSearchForm = lazy(() =>
  import("@/components/search/region-search-form").then((m) => ({ default: m.RegionSearchForm }))
);
```

**Fallback:** Custom `<FormSkeleton>` component shows loading state
```typescript
<Suspense fallback={<FormSkeleton />}>
  <RegionSearchForm onSearch={handleRegionSearch} isLoading={isLoading} />
</Suspense>
```

## shadcn/ui Component Usage

**Available components in `src/components/ui/`:**
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

**Button variants pattern:**
```typescript
const buttonVariants = cva(
  "base styles...",
  {
    variants: {
      variant: { default: "...", outline: "...", ghost: "..." },
      size: { default: "...", sm: "...", lg: "..." }
    }
  }
);
```

**Usage:**
```typescript
<Button variant="outline" size="sm">Click me</Button>
<Button asChild><a href="#">Link button</a></Button>
```

## Format Function Pattern

**Three utility formatters treat zero as null:**
- `formatArea(value): string` — Returns `"-"` if undefined, null, or 0; else `"1,234.50 m²"`
- `formatDate(dateStr): string` — Returns `"-"` if empty/invalid; else formats `"YYYYMMDD"` to `"YYYY-MM-DD"`
- `formatPercent(value): string` — Returns `"-"` if undefined, null, or 0; else `"12.50%"`

**Purpose:** In Korean building data, zero values indicate "unavailable" not actual zero

**Located in:** `src/lib/constants.ts` (lines 111-129)

**Example usage:**
```typescript
<span>{formatArea(building.archArea)}</span>  // Shows "-" if 0
<span>{formatDate(building.useAprDay)}</span>   // Shows "-" if empty
<span>{formatPercent(building.bcRat)}</span>    // Shows "-" if 0
```

## Zustand Persist Store

**Pattern:** Zustand with persistence middleware

**Location:** `src/store/app-store.ts`

**State shape:**
```typescript
interface AppState {
  apiKey: string;
  language: "ko" | "en";
  lastSearchParams: Record<string, string> | null;
  // Methods...
}
```

**Usage:**
```typescript
const store = create<AppState>()(
  persist(
    (set) => ({ /* actions */ }),
    {
      name: "korea-building-info-storage",
      partialize: (state) => ({ apiKey: state.apiKey, language: state.language })
    }
  )
);
```

**SSR Hydration:** Use `useHydration()` hook before reading persisted store on render to prevent hydration mismatch (documented in CLAUDE.md)

---

*Convention analysis: 2026-03-26*
