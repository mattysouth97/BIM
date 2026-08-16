// src/lib/__tests__/i18n.test.ts
// P2-06 — the single i18n helper picks by the language store and updates on
// setLanguage.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { pick, useT } from "../i18n";
import { useAppStore } from "@/store/app-store";

describe("pick (P2-06)", () => {
  it("returns ko or en by language", () => {
    expect(pick("ko", "가", "A")).toBe("가");
    expect(pick("en", "가", "A")).toBe("A");
  });
});

describe("useT (P2-06)", () => {
  beforeEach(() => {
    useAppStore.setState({ language: "ko" });
  });

  it("picks the store language and re-renders on setLanguage", () => {
    const { result } = renderHook(() => useT());
    expect(result.current.t("한국어", "English")).toBe("한국어");
    expect(result.current.lang).toBe("ko");

    act(() => useAppStore.getState().setLanguage("en"));
    expect(result.current.t("한국어", "English")).toBe("English");
    expect(result.current.lang).toBe("en");
  });
});
