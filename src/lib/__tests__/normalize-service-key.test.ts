// src/lib/__tests__/normalize-service-key.test.ts
// The data.go.kr portal issues both a raw ("Decoding") and a pre-URL-encoded
// ("Encoding") form of every service key. URLSearchParams encodes exactly
// once, so a pre-encoded key must be decoded first or the gateway rejects the
// double-encoded result with a bare HTTP 401.

import { describe, it, expect } from "vitest";
import { normalizeServiceKey } from "../api-proxy";

describe("normalizeServiceKey", () => {
  it("returns a raw (already-decoded) key unchanged", () => {
    const raw = "AbCd1234+xYz/==QwErTy";
    expect(normalizeServiceKey(raw)).toBe(raw);
  });

  it("decodes a pre-encoded key once so URLSearchParams re-encodes correctly", () => {
    const encoded = "AbCd1234%2BxYz%2F%3D%3DQwErTy";
    expect(normalizeServiceKey(encoded)).toBe("AbCd1234+xYz/==QwErTy");
  });

  it("round-trips through URLSearchParams to the exact raw key", () => {
    const raw = "K+y/1=";
    const encoded = encodeURIComponent(raw);
    for (const pasted of [raw, encoded]) {
      const url = new URL("https://apis.data.go.kr/x");
      url.searchParams.set("serviceKey", normalizeServiceKey(pasted));
      expect(url.searchParams.get("serviceKey")).toBe(raw);
    }
  });

  it("trims surrounding whitespace from pasted keys", () => {
    expect(normalizeServiceKey("  AbCd1234  ")).toBe("AbCd1234");
  });

  it("passes malformed percent-escapes through unchanged instead of throwing", () => {
    const malformed = "AbCd%ZZ123%2B";
    expect(normalizeServiceKey(malformed)).toBe(malformed);
  });
});
