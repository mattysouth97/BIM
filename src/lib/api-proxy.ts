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
 * Quote integer literals that `JSON.parse` cannot represent, before parsing.
 *
 * A 건축물대장 관리번호 (`mgmBldrgstPk`) is a 25-26 digit integer, and
 * data.go.kr sends it as a bare JSON number. JavaScript numbers are IEEE-754
 * doubles, so every digit past the 15th or so is lost the instant it is
 * parsed — and the loss is silent. Measured on one 법정동: 16 of 358 rows came
 * back altered, and three of the rounded values were each shared by two
 * different buildings, at which point the rows are permanently
 * indistinguishable and no downstream code can recover which was which.
 *
 * The fix has to happen on the raw text, because by the time there is an
 * object the digits are already gone. Only integer literals that fail
 * `Number.isSafeInteger` are quoted: areas, floor numbers and counts are
 * arithmetic and must stay numbers, so over-quoting would trade this bug for a
 * different one.
 *
 * Written as a scanner rather than a regular expression for two reasons a
 * pattern gets wrong. First, a long digit run inside a *string* — a 관리번호
 * quoted in an error message — is data, and re-quoting it would corrupt the
 * document. Second, a number token has to be consumed whole: matching only the
 * integer part of `0.12345678901234567890` would leave the fraction digits
 * looking like an integer literal of their own.
 */
export function quoteUnsafeIntegerLiterals(text: string): string {
  let out = "";
  let index = 0;
  let inString = false;

  const isDigit = (char: string | undefined) =>
    char !== undefined && char >= "0" && char <= "9";

  while (index < text.length) {
    const char = text[index]!;

    if (inString) {
      // A backslash escapes the next character, including a quote — consume
      // both so an escaped quote does not look like the end of the string.
      if (char === "\\") {
        out += char + (text[index + 1] ?? "");
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      out += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    // In JSON a "-" outside a string can only begin a number.
    if (char === "-" || isDigit(char)) {
      let end = index;
      if (text[end] === "-") end += 1;
      while (isDigit(text[end])) end += 1;

      let isInteger = true;
      if (text[end] === ".") {
        isInteger = false;
        end += 1;
        while (isDigit(text[end])) end += 1;
      }
      if (text[end] === "e" || text[end] === "E") {
        isInteger = false;
        end += 1;
        if (text[end] === "+" || text[end] === "-") end += 1;
        while (isDigit(text[end])) end += 1;
      }

      const literal = text.slice(index, end);
      out +=
        isInteger && !Number.isSafeInteger(Number(literal))
          ? `"${literal}"`
          : literal;
      index = end;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
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
      json = JSON.parse(quoteUnsafeIntegerLiterals(normalized)) as typeof json;
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
