// src/lib/__tests__/api-client.test.ts
// Embedded shared-key support: a visitor with NO key of their own must still
// be able to query the ledger. The client sends no `x-api-key` header in that
// case, so the same-origin proxy route falls back to the embedded shared demo
// key (see api-shared-key.ts). A visitor WITH a key still sends it (own quota).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchBuildings, validateApiKey } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";

function okResponse() {
  const body = { items: [], totalCount: 0, pageNo: 1, numOfRows: 20 };
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

/** Read the headers object passed to the mocked fetch call. */
function headersFromCall(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

describe("api-client apiFetch — embedded shared-key support", () => {
  beforeEach(() => {
    useAppStore.setState({ apiKey: "" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ apiKey: "" });
  });

  it("does not throw when no key is set — the request proceeds to the shared-key route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" }),
    ).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("omits the x-api-key header when no key is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" });

    expect(headersFromCall(fetchMock)["x-api-key"]).toBeUndefined();
  });

  it("sends the visitor's own x-api-key header when a key is set", async () => {
    useAppStore.setState({ apiKey: "my-own-key" });
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" });

    expect(headersFromCall(fetchMock)["x-api-key"]).toBe("my-own-key");
  });

  it("honors an explicit key override even when the store is empty (validateApiKey path)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await validateApiKey("override-key");

    expect(headersFromCall(fetchMock)["x-api-key"]).toBe("override-key");
  });

  it("reports an actionable error for an empty successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" }),
    ).rejects.toThrow("The server returned an empty response (200). Try again.");
  });

  it("does not leak a JSON parser error for a malformed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "{",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" }),
    ).rejects.toThrow(
      "The server returned an invalid response (200). Try again.",
    );
  });

  it("falls back to the HTTP status when an error response has no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchBuildings({ sigunguCd: "11680", bjdongCd: "10300" }),
    ).rejects.toThrow("Request failed (502)");
  });
});
