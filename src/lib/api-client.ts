import { useAppStore } from "@/store/app-store";
import { isDemoParams, isDrawingParams } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo/demo-building";
import { getDrawingResponse } from "@/lib/demo/drawing-building";
import type {
  BrTitleInfo,
  BrRecapTitleInfo,
  BrFloorInfo,
  BrAreaInfo,
  BrBasisInfo,
  BrJijiguInfo,
} from "@/lib/types";

// ─────────────────────────────────────────────
// Response shape returned by our /api/bldrgst/* routes
// ─────────────────────────────────────────────

export interface ApiListResponse<T> {
  items: T[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

async function readJsonResponse(res: Response): Promise<unknown | null> {
  const text = await res.text();
  if (text.trim() === "") return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `The server returned an invalid response (${res.status}). Try again.`,
    );
  }
}

// ─────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> | object,
  apiKeyOverride?: string,
): Promise<ApiListResponse<T>> {
  // Demo mode (데모모드): the reserved demo building is served from bundled
  // fixtures — no network, no key. See src/lib/demo/demo-building.ts.
  if (isDemoParams(params as { sigunguCd?: string; bjdongCd?: string })) {
    const demo = getDemoResponse(path);
    if (demo) return demo as ApiListResponse<T>;
  }
  if (isDrawingParams(params as { sigunguCd?: string; bjdongCd?: string })) {
    const drawing = getDrawingResponse(path);
    if (drawing) return drawing as ApiListResponse<T>;
  }

  const apiKey = apiKeyOverride ?? useAppStore.getState().apiKey;

  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  // When the visitor supplied their own key, send it (charged to their quota).
  // When they didn't, send NO x-api-key header: the same-origin proxy route
  // falls back to the embedded shared demo key (rate-limited per IP, see
  // api-shared-key.ts), so the ledger works for any visitor out of the box.
  // The shared secret never leaves the server.
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url.toString(), { headers });
  const body = await readJsonResponse(res);

  if (!res.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error ??
        `Request failed (${res.status})`,
    );
  }

  if (body === null) {
    throw new Error(
      `The server returned an empty response (${res.status}). Try again.`,
    );
  }

  return body as ApiListResponse<T>;
}

// ─────────────────────────────────────────────
// Public endpoint functions
// ─────────────────────────────────────────────

export interface SearchBuildingsParams {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd?: string;
  bun?: string;
  ji?: string;
  mainPurpsCd?: string;
  numOfRows?: number;
  pageNo?: number;
}

export function searchBuildings(params: SearchBuildingsParams) {
  return apiFetch<BrTitleInfo>("/api/bldrgst/title", params);
}

/**
 * The register caps a page at 100 rows regardless of what `numOfRows` asks for
 * — measured 2026-09-04: requesting 500 and 1000 both returned
 * `numOfRows: 100, items: 100`. So any filter that must see a whole 법정동 has
 * to page, and 청운동 alone is 358 rows.
 *
 * This exists because `mainPurpsCd` is ignored by the upstream API and has to
 * be applied client-side. Filtering a single page silently answers "no such
 * building" for a district where matches sit on page 4 — 서울청운초등학교 is
 * row 344 of 358 in 청운동, and filtering 교육연구시설 over page 1 finds none
 * of the 21 that exist there.
 *
 * `maxPages` is a guard, not a preference: without it a district with a large
 * `totalCount` would fan out into an unbounded request burst against a
 * rate-limited shared key. When the cap truncates, `truncated` says so rather
 * than letting the caller present a partial answer as complete.
 */
export const SEARCH_ALL_PAGE_SIZE = 100;
export const SEARCH_ALL_MAX_PAGES = 10;

export async function searchAllBuildings(
  params: SearchBuildingsParams,
  maxPages = SEARCH_ALL_MAX_PAGES,
): Promise<ApiListResponse<BrTitleInfo> & { truncated: boolean }> {
  const first = await apiFetch<BrTitleInfo>("/api/bldrgst/title", {
    ...params,
    numOfRows: SEARCH_ALL_PAGE_SIZE,
    pageNo: 1,
  });

  // Trust the rows we were handed over the page size we asked for: the server
  // decides both, and `numOfRows` in the response is what it actually used.
  const pageSize = first.items.length || first.numOfRows || SEARCH_ALL_PAGE_SIZE;
  const totalCount = first.totalCount ?? first.items.length;
  const neededPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 1;
  const pagesToFetch = Math.min(neededPages, maxPages);

  const items = [...first.items];
  for (let page = 2; page <= pagesToFetch; page++) {
    const next = await apiFetch<BrTitleInfo>("/api/bldrgst/title", {
      ...params,
      numOfRows: SEARCH_ALL_PAGE_SIZE,
      pageNo: page,
    });
    if (next.items.length === 0) break; // short page → nothing further to read
    items.push(...next.items);
  }

  return {
    items,
    totalCount,
    pageNo: 1,
    numOfRows: items.length,
    truncated: neededPages > pagesToFetch,
  };
}

export interface BuildingDetailParams {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd?: string;
  bun?: string;
  ji?: string;
  numOfRows?: number;
  pageNo?: number;
}

export function getRecapInfo(params: BuildingDetailParams) {
  return apiFetch<BrRecapTitleInfo>("/api/bldrgst/recap", params);
}

export function getFloorInfo(params: BuildingDetailParams) {
  return apiFetch<BrFloorInfo>("/api/bldrgst/floors", params);
}

export function getAreaInfo(params: BuildingDetailParams) {
  return apiFetch<BrAreaInfo>("/api/bldrgst/areas", params);
}

export function getBasisInfo(params: BuildingDetailParams) {
  return apiFetch<BrBasisInfo>("/api/bldrgst/basis", params);
}

export function getJijiguInfo(params: BuildingDetailParams) {
  return apiFetch<BrJijiguInfo>("/api/bldrgst/jijugu", params);
}

// ─────────────────────────────────────────────
// API key validation
// ─────────────────────────────────────────────

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    // Make a minimal search request with the provided key.
    // sigunguCd 11680 = Seoul Gangnam-gu, a district that always has data.
    await apiFetch<BrTitleInfo>(
      "/api/bldrgst/title",
      { sigunguCd: "11680", bjdongCd: "10300", numOfRows: 1, pageNo: 1 },
      key,
    );
    return true;
  } catch {
    return false;
  }
}
