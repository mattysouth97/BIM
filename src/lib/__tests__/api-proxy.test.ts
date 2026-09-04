import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractItems,
  fetchFromDataGoKr,
  quoteUnsafeIntegerLiterals,
} from "@/lib/api-proxy";

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

describe("fetchFromDataGoKr preserves long integer identifiers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Build an upstream body with the pk written as a bare JSON number. */
  function upstreamWithPks(...pks: string[]) {
    const items = pks
      .map(
        (pk, index) =>
          `{"mgmBldrgstPk":${pk},"bldNm":"building ${index}","platArea":123.45,"flrNo":-1}`,
      )
      .join(",");
    return `{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE"},"body":{"items":{"item":[${items}]},"totalCount":${pks.length}}}}`;
  }

  async function fetchItems(body: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );
    const result = await fetchFromDataGoKr(
      "title",
      { sigunguCd: "11680", bjdongCd: "10300" },
      "test-key",
    );
    expect(result.error).toBeNull();
    return extractItems<Record<string, unknown>>(result.data);
  }

  it("keeps every digit of a 26-digit 관리번호", async () => {
    // A mgmBldrgstPk is far past 2^53, so JSON.parse rounds it to the nearest
    // double and the register row silently becomes a different building.
    const pk = "41135106009900020000000001";
    const [item] = await fetchItems(upstreamWithPks(pk));

    expect(item?.mgmBldrgstPk).toBe(pk);
  });

  it("keeps two 관리번호 distinct when they differ only in the last digit", async () => {
    // The failure that cannot be undone downstream: as doubles these two are
    // the same value, so the rows become permanently indistinguishable and no
    // later fix can recover which building was which.
    const first = "41135106009900020000000001";
    const second = "41135106009900020000000002";
    expect(JSON.parse(first)).toBe(JSON.parse(second));

    const items = await fetchItems(upstreamWithPks(first, second));

    expect(items[0]?.mgmBldrgstPk).toBe(first);
    expect(items[1]?.mgmBldrgstPk).toBe(second);
    expect(items[0]?.mgmBldrgstPk).not.toBe(items[1]?.mgmBldrgstPk);
  });

  it("leaves numbers that survive a round trip as numbers", async () => {
    // Over-quoting would be its own bug: areas, floor numbers and counts are
    // arithmetic, and turning them into strings breaks every caller that adds
    // them up.
    const [item] = await fetchItems(upstreamWithPks("41135106009900020000000001"));

    expect(item?.platArea).toBe(123.45);
    expect(item?.flrNo).toBe(-1);
  });

  it("does not rewrite a long digit run inside a string", async () => {
    // The transform runs over raw text, so it has to know where strings are.
    // A 관리번호 quoted in a message is data, not a literal to re-quote.
    const body = `{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[{"bldNm":"pk 41135106009900020000000001 in text","mgmBldrgstPk":"41135106009900020000000009"}]},"totalCount":1}}}`;
    const [item] = await fetchItems(body);

    expect(item?.bldNm).toBe("pk 41135106009900020000000001 in text");
    expect(item?.mgmBldrgstPk).toBe("41135106009900020000000009");
  });
});

describe("quoteUnsafeIntegerLiterals", () => {
  it("leaves a long fraction and an exponent alone", () => {
    // Consuming a number token whole matters here: matching only the integer
    // part would leave the fraction digits looking like a literal of their own.
    const text = `{"a":0.12345678901234567890,"b":1.5e+300,"c":-2.5E-10}`;
    expect(quoteUnsafeIntegerLiterals(text)).toBe(text);
    expect(JSON.parse(quoteUnsafeIntegerLiterals(text))).toEqual(
      JSON.parse(text),
    );
  });

  it("is not fooled by an escaped quote inside a string", () => {
    // If the escape were mishandled the scanner would think the string ended,
    // and would start quoting digits that are prose.
    const text =
      '{"note":"he said \\"41135106009900020000000001\\" once","pk":41135106009900020000000001}';
    const parsed = JSON.parse(quoteUnsafeIntegerLiterals(text)) as {
      note: string;
      pk: string;
    };

    expect(parsed.note).toBe('he said "41135106009900020000000001" once');
    expect(parsed.pk).toBe("41135106009900020000000001");
  });

  it("quotes an unsafe negative integer and leaves safe ones", () => {
    const text = `{"big":-41135106009900020000000001,"small":-1,"edge":9007199254740991}`;
    const parsed = JSON.parse(quoteUnsafeIntegerLiterals(text)) as
      Record<string, unknown>;

    expect(parsed.big).toBe("-41135106009900020000000001");
    expect(parsed.small).toBe(-1);
    expect(parsed.edge).toBe(9007199254740991);
  });
});
