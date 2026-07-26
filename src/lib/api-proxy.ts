import { DATA_GO_KR_BASE_URL, API_ENDPOINTS, type EndpointKey } from "./constants";

/**
 * Normalize a data.go.kr service key before it is attached with
 * URLSearchParams (which percent-encodes it exactly once).
 *
 * The data.go.kr portal hands out two forms of every key: a raw ("Decoding")
 * form and a pre-URL-encoded ("Encoding") form containing sequences like
 * %2B / %3D. If a caller pastes the pre-encoded form, re-encoding it turns
 * %2B into %252B and the gateway rejects the mangled key with a bare
 * HTTP 401 ("API responded with status 401"). Detect percent-escapes and
 * decode once so either pasted form works.
 */
export function normalizeServiceKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(trimmed)) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    // Malformed escapes — pass through unchanged rather than throwing.
    return trimmed;
  }
}

/**
 * Server-side fetch to data.go.kr Building Ledger API.
 * Used only in Next.js API route handlers.
 */
export async function fetchFromDataGoKr(
  endpoint: EndpointKey,
  params: Record<string, string | number>,
  apiKey: string
): Promise<{ data: unknown; error: string | null }> {
  const url = new URL(DATA_GO_KR_BASE_URL + API_ENDPOINTS[endpoint]);

  // Always request JSON
  url.searchParams.set("serviceKey", normalizeServiceKey(apiKey));
  url.searchParams.set("_type", "json");

  // Add all query params
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  // Default pagination
  if (!params.numOfRows) url.searchParams.set("numOfRows", "20");
  if (!params.pageNo) url.searchParams.set("pageNo", "1");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        data: null,
        error: `API responded with status ${response.status}`,
      };
    }

    const text = await response.text();
    const normalized = text.trim();

    if (normalized === "") {
      return {
        data: null,
        error:
          "The Building Ledger API returned an empty response. Check that the service key is active for this API.",
      };
    }

    // data.go.kr sometimes returns XML error even when JSON requested
    if (normalized.startsWith("<?xml") || normalized.startsWith("<")) {
      // Try to extract error message from XML
      const msgMatch = normalized.match(
        /<returnAuthMsg>(.*?)<\/returnAuthMsg>/,
      );
      return {
        data: null,
        error: msgMatch
          ? `Auth error: ${msgMatch[1]}`
          : "API returned XML instead of JSON. Check your API key.",
      };
    }

    let json: {
      response?: {
        header?: {
          resultCode?: string;
          resultMsg?: string;
        };
      };
    };
    try {
      json = JSON.parse(normalized) as typeof json;
    } catch {
      return {
        data: null,
        error:
          "The Building Ledger API returned an invalid response. Try again or verify the service key.",
      };
    }

    // Check API-level result code
    const resultCode = json?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      const resultMsg =
        json?.response?.header?.resultMsg || "Unknown API error";
      return { data: null, error: `API error [${resultCode}]: ${resultMsg}` };
    }

    return { data: json, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { data: null, error: "Request timed out (15s)" };
    }
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

/**
 * Extract items array from data.go.kr response.
 * Handles both single-item (dict) and multi-item (array) responses.
 */
export function extractItems<T>(data: unknown): T[] {
  try {
    const response = data as {
      response?: {
        body?: { items?: { item?: T | T[] }; totalCount?: number };
      };
    };
    const items = response?.response?.body?.items?.item;
    if (!items) return [];
    if (Array.isArray(items)) return items;
    return [items];
  } catch {
    return [];
  }
}

/**
 * Extract total count from response for pagination.
 */
export function extractTotalCount(data: unknown): number {
  try {
    const response = data as {
      response?: { body?: { totalCount?: number } };
    };
    return response?.response?.body?.totalCount ?? 0;
  } catch {
    return 0;
  }
}
