import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFromDataGoKr } from "@/lib/api-proxy";

describe("fetchFromDataGoKr response parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["", " \n\t"])(
    "turns an empty upstream body into an actionable error",
    async (body) => {
    vi.stubGlobal(
      "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );

    const result = await fetchFromDataGoKr(
      "title",
      { sigunguCd: "11680", bjdongCd: "10300" },
      "test-key",
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "The Building Ledger API returned an empty response. Check that the service key is active for this API.",
    );
    },
  );

  it("does not expose a JSON parser error for malformed upstream data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{", { status: 200 })),
    );

    const result = await fetchFromDataGoKr(
      "title",
      { sigunguCd: "11680", bjdongCd: "10300" },
      "test-key",
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "The Building Ledger API returned an invalid response. Try again or verify the service key.",
    );
    expect(result.error).not.toContain("Unexpected end of JSON input");
  });

  it("keeps valid JSON responses unchanged", async () => {
    const payload = {
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
        body: { items: { item: [] }, totalCount: 0 },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      ),
    );

    await expect(
      fetchFromDataGoKr(
        "title",
        { sigunguCd: "11680", bjdongCd: "10300" },
        "test-key",
      ),
    ).resolves.toEqual({ data: payload, error: null });
  });

  it("explicitly requests JSON because the upstream returns an empty body without Accept", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromDataGoKr(
      "title",
      { sigunguCd: "11680", bjdongCd: "10300" },
      "test-key",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });
});
