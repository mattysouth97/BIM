# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Status:** Not implemented

**No test framework currently configured:**
- No Jest, Vitest, or other test runner in `devDependencies`
- No test configuration files (`jest.config.ts`, `vitest.config.ts`)
- No `.test.ts` or `.spec.ts` files in `src/`
- No test scripts in `package.json` (only `dev`, `build`, `start`, `lint`)

**Why this matters:**
- API proxy functions (`fetchFromDataGoKr`, `extractItems`) have no unit tests
- Component behavior (bilingual switching, lazy loading) not verified
- Store mutations not validated
- API integration untested

## Recommended Testing Strategy

**Priority areas for test coverage:**

1. **API Utilities** (`src/lib/api-proxy.ts`, `src/lib/api-client.ts`)
   - `fetchFromDataGoKr()` error handling (timeout, XML fallback, result codes)
   - `extractItems()` edge cases (single item vs array, missing items)
   - `extractTotalCount()` pagination extraction
   - Client-side `apiFetch()` header handling and response parsing

2. **Formatting Functions** (`src/lib/constants.ts`)
   - `formatArea()` null/zero/undefined behavior
   - `formatDate()` YYYYMMDD parsing
   - `formatPercent()` zero handling
   - `encodeBuildingId()` / `decodeBuildingId()` round-trip

3. **Store** (`src/store/app-store.ts`)
   - State mutations (setApiKey, setLanguage)
   - Persistence/hydration
   - Selector patterns

4. **Components** (React Testing Library or similar)
   - Bilingual rendering (`isKo ? Korean : English` patterns)
   - Lazy loading with Suspense boundaries
   - Form validation with react-hook-form
   - Search parameter handling

5. **API Routes** (`src/app/api/bldrgst/*`)
   - Header validation (x-api-key presence)
   - Parameter filtering and forwarding
   - Error response formatting

## Test File Organization

**Not applicable** — no existing test structure

**Recommended structure if implemented:**

```
src/
├── lib/
│   ├── api-proxy.ts
│   ├── __tests__/
│   │   ├── api-proxy.test.ts
│   │   ├── format.test.ts
│   │   └── constants.test.ts
│   └── ...
├── store/
│   ├── app-store.ts
│   └── __tests__/
│       └── app-store.test.ts
├── components/
│   ├── search/
│   │   ├── region-search-form.tsx
│   │   └── __tests__/
│   │       └── region-search-form.test.tsx
│   └── ...
└── app/
    └── api/
        └── bldrgst/
            └── __tests__/
                └── route.test.ts
```

**Pattern:** `__tests__` directories co-located with source or `.test.ts` naming convention

## Setup Pattern (Template if Implementing)

**Recommended setup using Vitest + React Testing Library:**

```typescript
// vitest.config.ts (new)
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Test setup file:**
```typescript
// src/test/setup.ts
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
```

## Async Testing Pattern (Template if Implementing)

**For API utilities using async/await:**

```typescript
// Example: src/lib/__tests__/api-proxy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchFromDataGoKr, extractItems } from '../api-proxy';

describe('fetchFromDataGoKr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns data and null error on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        response: {
          header: { resultCode: '00', resultMsg: 'Success' },
          body: { items: { item: [] }, totalCount: 0 }
        }
      }))
    });

    const result = await fetchFromDataGoKr('basis', { sigunguCd: '11110' }, 'fake-key');
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('returns null data and error message on timeout', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      new DOMException('timeout', 'TimeoutError')
    );

    const result = await fetchFromDataGoKr('basis', {}, 'fake-key');
    expect(result.data).toBeNull();
    expect(result.error).toContain('timed out');
  });

  it('handles XML error responses from API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<?xml><error>Auth failed</error>')
    });

    const result = await fetchFromDataGoKr('basis', {}, 'fake-key');
    expect(result.data).toBeNull();
    expect(result.error).toContain('XML');
  });
});
```

## Component Testing Pattern (Template if Implementing)

**For React components using React Testing Library:**

```typescript
// Example: src/components/building/building-header.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BuildingHeader } from '../building-header';
import type { BrTitleInfo } from '@/lib/types';

describe('BuildingHeader', () => {
  it('displays building name and badges', () => {
    const title: BrTitleInfo = {
      mgmBldrgstPk: '1',
      bldNm: 'Test Building',
      mainPurpsCdNm: 'Office',
      regstrKindCdNm: 'New',
      // ... other required fields
    };

    render(<BuildingHeader title={title} loading={false} />);

    expect(screen.getByText('Test Building')).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('returns null when loading without title', () => {
    const { container } = render(<BuildingHeader title={null} loading={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('displays fallback message when title is null', () => {
    render(<BuildingHeader title={null} loading={false} />);
    expect(screen.getByText(/정보를 찾을 수 없습니다/)).toBeInTheDocument();
  });
});
```

## Mocking Pattern (Template if Implementing)

**Mock data for API responses:**

```typescript
// src/test/mocks/building-data.ts
import type { BrTitleInfo } from '@/lib/types';

export const mockBuildingTitle: BrTitleInfo = {
  mgmBldrgstPk: '11110-12345-0-1-1',
  bldNm: 'Sample Building',
  platPlcNm: 'Seoul, Gangnam-gu',
  newPlatPlc: '서울시 강남구 강남대로',
  sigunguCd: '11110',
  bjdongCd: '12345',
  platGbCd: '0',
  bun: '1',
  ji: '1',
  mainPurpsCd: '14000',
  mainPurpsCdNm: 'Office',
  etcPurps: '',
  strctCd: '11',
  strctCdNm: 'Reinforced Concrete',
  etcStrct: '',
  grndFlrCnt: 10,
  ugrndFlrCnt: 2,
  totArea: 50000,
  archArea: 5000,
  platArea: 8000,
  bcRat: 62.5,
  vlRat: 600,
  useAprDay: '20200101',
  pmsDay: '20190601',
  stcnsDay: '20190501',
  roofCd: '1',
  roofCdNm: 'Flat Roof',
  heit: 35.5,
  regstrGbCd: '1',
  regstrGbCdNm: 'Main',
  regstrKindCd: '10',
  regstrKindCdNm: 'Building',
};

export const mockApiResponse = {
  response: {
    header: { resultCode: '00', resultMsg: 'Success' },
    body: {
      items: { item: [mockBuildingTitle] },
      numOfRows: 20,
      pageNo: 1,
      totalCount: 1
    }
  }
};
```

**Mock Zustand store:**
```typescript
// src/test/mocks/app-store.ts
import { create } from 'zustand';
import type { AppState } from '@/store/app-store';

export function createMockStore(initialState?: Partial<AppState>) {
  return create<AppState>((set) => ({
    apiKey: initialState?.apiKey ?? 'test-key-12345',
    setApiKey: (key) => set({ apiKey: key }),
    clearApiKey: () => set({ apiKey: '' }),
    language: initialState?.language ?? 'ko',
    setLanguage: (lang) => set({ language: lang }),
    lastSearchParams: initialState?.lastSearchParams ?? null,
    setLastSearchParams: (params) => set({ lastSearchParams: params }),
  }));
}
```

## Formatting Function Testing Pattern

**Test zero-as-null behavior:**

```typescript
// src/lib/__tests__/constants.test.ts
import { describe, it, expect } from 'vitest';
import { formatArea, formatDate, formatPercent } from '../constants';

describe('formatArea', () => {
  it('returns "-" for zero values', () => {
    expect(formatArea(0)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatArea(undefined)).toBe('-');
  });

  it('formats valid areas with locale', () => {
    expect(formatArea(1234.56)).toBe('1,234.56 m²');
  });

  it('handles string input', () => {
    expect(formatArea('1234.56')).toBe('1,234.56 m²');
  });
});

describe('formatDate', () => {
  it('returns "-" for empty/invalid dates', () => {
    expect(formatDate('')).toBe('-');
    expect(formatDate('123')).toBe('-');
  });

  it('converts YYYYMMDD to YYYY-MM-DD', () => {
    expect(formatDate('20200101')).toBe('2020-01-01');
  });
});

describe('formatPercent', () => {
  it('returns "-" for zero values', () => {
    expect(formatPercent(0)).toBe('-');
  });

  it('formats percentages to 2 decimals', () => {
    expect(formatPercent(62.5)).toBe('62.50%');
  });
});
```

## Store Testing Pattern

**Test Zustand store mutations:**

```typescript
// src/store/__tests__/app-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../app-store';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      apiKey: '',
      language: 'ko',
      lastSearchParams: null,
    });
  });

  it('sets and gets API key', () => {
    useAppStore.getState().setApiKey('test-key-123');
    expect(useAppStore.getState().apiKey).toBe('test-key-123');
  });

  it('clears API key', () => {
    useAppStore.getState().setApiKey('test-key-123');
    useAppStore.getState().clearApiKey();
    expect(useAppStore.getState().apiKey).toBe('');
  });

  it('toggles language between ko and en', () => {
    expect(useAppStore.getState().language).toBe('ko');
    useAppStore.getState().setLanguage('en');
    expect(useAppStore.getState().language).toBe('en');
  });

  it('persists to localStorage', () => {
    const state = useAppStore.getState();
    state.setApiKey('persisted-key');
    state.setLanguage('en');

    // Simulate page reload by checking what would be persisted
    const persisted = useAppStore.getState();
    expect(persisted.apiKey).toBe('persisted-key');
    expect(persisted.language).toBe('en');
  });
});
```

## API Route Testing Pattern

**Test Next.js API handlers:**

```typescript
// src/app/api/bldrgst/__tests__/basis.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../basis/route';
import { NextRequest } from 'next/server';

describe('GET /api/bldrgst/basis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when x-api-key header missing', async () => {
    const request = new NextRequest('http://localhost/api/bldrgst/basis', {
      method: 'GET',
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toContain('x-api-key');
  });

  it('extracts query params and forwards to data.go.kr', async () => {
    const url = new URL('http://localhost/api/bldrgst/basis');
    url.searchParams.set('sigunguCd', '11110');
    url.searchParams.set('bjdongCd', '12345');
    url.searchParams.set('numOfRows', '50');

    const request = new NextRequest(url, {
      method: 'GET',
      headers: { 'x-api-key': 'test-key' },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('items');
    expect(json).toHaveProperty('totalCount');
  });

  it('returns 502 on API error', async () => {
    // Mock fetchFromDataGoKr to return error
    // Response should be 502 with error message
  });
});
```

## Coverage Requirements

**Target:** Not currently enforced, but recommended coverage goals:

- **Utilities & lib files:** 80%+ (high value, easy to test)
- **Components:** 70%+ (harder to reach 80% due to visual logic)
- **Store:** 90%+ (pure functions, should be highly testable)
- **API routes:** 85%+ (include error path testing)
- **Overall:** 75%+ (balanced across all categories)

**View coverage (once implemented):**
```bash
pnpm test -- --coverage
```

## Known Issues for Testing

**From CLAUDE.md:**
- Zustand persist + SSR hydration mismatch — use `useHydration()` hook before reading store in render
  - Test component hydration with mock store
  - Test SSR behavior separately from client behavior

- Zod v4 `zodResolver` has type inference issues — use plain TS interfaces for form values
  - Mock form data with TypeScript interfaces, not Zod schemas
  - Test form submission separately from validation schema

- Three.js `three-stdlib` types conflict with drei v10 OrbitControls — use `any` ref type
  - Use `any` in tests for three.js refs to match codebase pattern
  - Focus integration tests on geometry output, not ref types

- Duplicate floor keys from API — floors can have same flrNo, use array index in React key
  - Test key uniqueness in floor lists
  - Verify no console warnings about duplicate keys

---

*Testing analysis: 2026-03-26*
