# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**Korean Government Data Portal (data.go.kr):**
- Building Ledger Hub (BldRgstHubService) - Core building information API
  - SDK/Client: Custom fetch wrapper in `src/lib/api-proxy.ts`
  - Base URL: `https://apis.data.go.kr/1613000/BldRgstHubService`
  - Auth: API key passed via `serviceKey` query parameter (forwarded from `x-api-key` header in proxy routes)
  - Endpoints:
    - `getBrTitleInfo` - Main building overview (표제부)
    - `getBrRecapTitleInfo` - Summary title information (총괄표제부)
    - `getBrFlrOulnInfo` - Floor details (층별개요)
    - `getBrExposPubuseAreaInfo` - Exclusive/common area breakdown (전유공용면적)
    - `getBrBasisOulnInfo` - Basic building outline (기본개요)
    - `getBrJijiguInfo` - Zone and district info (지역지구구역)
  - Response format: JSON wrapped in standard data.go.kr envelope
  - Error handling: Returns `{data, error}` tuple from `fetchFromDataGoKr()` in `src/lib/api-proxy.ts`
  - Implementation: `src/app/api/bldrgst/*/route.ts` (server-side proxy routes)

**VWorld (Korean Spatial Data Portal):**
- Spatial data and geocoding service (vworld.kr)
  - SDK/Client: Custom fetch wrapper in `src/app/api/vworld/footprint/route.ts`
  - Base URLs:
    - Data API: `https://api.vworld.kr/req/data` (cadastral footprints, parcel data)
    - Geocoding API: `https://api.vworld.kr/req/address` (address → coordinate conversion)
  - Auth: Hardcoded API key `98E6A75B-9FA2-3B97-A78F-A80434D6BF59` passed via `key` query parameter
  - Dataset: `LP_PA_CBND_BUBUN` (연속지적도 - continuous parcel boundaries)
  - Capabilities:
    - Query by PNU (19-digit parcel number)
    - Query by coordinates with bounding box
    - Geocode Korean addresses
  - Response format: GeoJSON with MultiPolygon geometries
  - Implementation: `src/app/api/vworld/footprint/route.ts` (server-side proxy)

## Data Storage

**Databases:**
- Not detected (no database connection in codebase)

**File Storage:**
- Local filesystem only - No cloud storage integration detected
- IndexedDB for in-browser model caching:
  - Client: idb-keyval 6.2.2
  - Implementation: `src/lib/model-storage.ts`
  - Purpose: Persist uploaded IFC/GLTF models locally
  - Methods: `saveModel()`, `loadModel()`

**Caching:**
- TanStack Query (React Query) 5.95.2 - In-memory query caching for API responses
- Browser IndexedDB - Local persistence of 3D models

## Authentication & Identity

**Auth Provider:**
- Custom - No OAuth or third-party auth detected
- API Key validation at runtime:
  - User provides data.go.kr API key via dialog (`src/components/settings/api-key-dialog.tsx`)
  - Stored in Zustand persist store (localStorage) in `src/store/app-store.ts`
  - Validated by making test API request in `src/lib/api-client.ts` (function: `validateApiKey()`)
  - VWorld API key is hardcoded (not user-configurable)

**Implementation:**
- Client-side API key management in `src/store/app-store.ts`:
  - `apiKey: string` - data.go.kr API key
  - `setApiKey()` - Setter
  - `clearApiKey()` - Clearing mechanism
  - Persisted to localStorage with Zustand persist middleware
- Server-side proxy validates `x-api-key` header in all data.go.kr route handlers
- Validation endpoint: `validateApiKey()` in `src/lib/api-client.ts` (makes minimal test request)

## Monitoring & Observability

**Error Tracking:**
- Not detected

**Logs:**
- Console logging only - No structured logging or log aggregation detected

## CI/CD & Deployment

**Hosting:**
- Not explicitly configured (Next.js default suggests Vercel)

**CI Pipeline:**
- Not detected

## Environment Configuration

**Required env vars:**
- Not used - Configuration is runtime-driven:
  - data.go.kr API key: User-provided at runtime, stored in Zustand
  - VWorld API key: Hardcoded in `src/app/api/vworld/footprint/route.ts`

**Secrets location:**
- API keys: Browser localStorage (via Zustand persist middleware in `src/store/app-store.ts`)
- VWorld key: Hardcoded in source code at `src/app/api/vworld/footprint/route.ts` (line 3)

## Webhooks & Callbacks

**Incoming:**
- Not detected

**Outgoing:**
- Not detected

## Proxy Architecture

**Purpose:** Solve CORS issues by routing public Korean government APIs through Next.js server-side handlers.

**Route Structure:**
```
/api/bldrgst/*         → Forward to data.go.kr BldRgstHubService
/api/vworld/*          → Forward to VWorld spatial data API
```

**Request Flow:**
1. Client calls `/api/bldrgst/title?sigunguCd=...` with `x-api-key` header
2. Server reads API key from header, passes it as `serviceKey` query param to data.go.kr
3. Server handles errors (XML responses, timeouts, API-level errors)
4. Server normalizes response to `{items, totalCount, pageNo, numOfRows}`
5. Client receives JSON and can display/render data

**Error Handling:**
- 15-second fetch timeout in `fetchFromDataGoKr()` (line 31, `src/lib/api-proxy.ts`)
- 10-second timeout for VWorld requests
- XML error detection and extraction (data.go.kr sometimes returns XML error messages)
- Client-side error propagation via `{error}` field in response

## Regional Code Management

**Static Data Files:**
- `src/data/bjdong-codes.json` - 95K+ legal-dong codes (법정동코드, 95,375 lines)
  - Source: github.com/FinanceData gist
  - Format: Object keyed by sigunguCd, values are array of `{code, name}` objects
  - Usage: Dropdown population in region search (`src/components/search/region-search-form.tsx`)

- `src/data/region-codes.json` - 시도/시군구 hierarchy (307 lines)
  - Format: `{sigunguCd: string, name: string}`
  - Includes updated 전라북도 codes (52xxx vs old 45xxx)
  - Flattened structure, not hierarchical

- `src/data/use-type-codes.json` - Building use category codes (31 lines)
  - Format: `{code: string, ko: string, en: string}`

**Dynamic Code Mappings:**
- Constants in `src/lib/constants.ts`:
  - `USE_CODES` (29 categories) - ko/en names for mainPurpsCd values
  - `STRUCTURE_CODES` (15 types) - Building structure types
  - `ROOF_CODES` (3 types) - Roof types

---

*Integration audit: 2026-03-26*
