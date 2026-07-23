import { useAppStore } from "@/store/app-store";
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

// ─────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> | object,
  apiKeyOverride?: string,
): Promise<ApiListResponse<T>> {
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

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed (${res.status})`,
    );
  }

  return res.json() as Promise<ApiListResponse<T>>;
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
