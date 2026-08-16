// src/lib/__tests__/twin-formatters.test.ts
// P2-15 — TDD-RED: formatKrw and formatYears must be language-aware.
// lang="ko"  → Korean 억/만/년 idiom (byte-identical to today's output).
// lang="en"  → English SI idiom: ₩250M / ₩25k / 3.0 yr — no 억/만/년 literal.

import { describe, it, expect } from "vitest";
import { formatKrw, formatYears } from "../twin-formatters";

describe("formatKrw (P2-15)", () => {
  // ── Korean output ── must match exactly what the components emit today ──────
  it("ko: 억 tier (100 000 000)", () => {
    expect(formatKrw(250_000_000, "ko")).toBe("₩2.5억");
  });
  it("ko: 억 tier — integer eok", () => {
    expect(formatKrw(100_000_000, "ko")).toBe("₩1억");
  });
  it("ko: 만 tier (10 000)", () => {
    expect(formatKrw(5_000_000, "ko")).toBe("₩500만");
  });
  it("ko: sub-만 tier", () => {
    expect(formatKrw(9_999, "ko")).toBe("₩9,999");
  });
  it("ko: negative 억", () => {
    expect(formatKrw(-300_000_000, "ko")).toBe("-₩3억");
  });

  // ── English output ── no 억/만/년 ─────────────────────────────────────────
  it("en: billions → B", () => {
    expect(formatKrw(1_000_000_000, "en")).toBe("₩1.0B");
  });
  it("en: hundreds-of-millions → M (2 decimal)", () => {
    expect(formatKrw(250_000_000, "en")).toBe("₩250M");
  });
  it("en: tens-of-millions → M", () => {
    expect(formatKrw(50_000_000, "en")).toBe("₩50M");
  });
  it("en: millions → M", () => {
    expect(formatKrw(1_000_000, "en")).toBe("₩1M");
  });
  it("en: thousands → k", () => {
    expect(formatKrw(25_000, "en")).toBe("₩25k");
  });
  it("en: sub-thousand → raw", () => {
    expect(formatKrw(999, "en")).toBe("₩999");
  });
  it("en: negative 억-range produces no 억", () => {
    const out = formatKrw(-300_000_000, "en");
    expect(out).not.toContain("억");
    expect(out).not.toContain("만");
    expect(out).toContain("-");
  });
  it("en: never contains Korean numeric suffix 억", () => {
    expect(formatKrw(250_000_000, "en")).not.toContain("억");
  });
  it("en: never contains Korean numeric suffix 만", () => {
    expect(formatKrw(500_000, "en")).not.toContain("만");
  });
});

describe("formatYears (P2-15)", () => {
  // ── Korean output ────────────────────────────────────────────────────────
  it("ko: finite years → X.X년", () => {
    expect(formatYears(3.0, "ko")).toBe("3.0년");
  });
  it("ko: non-finite → —", () => {
    expect(formatYears(Infinity, "ko")).toBe("—");
  });
  it("ko: undefined → —", () => {
    expect(formatYears(undefined, "ko")).toBe("—");
  });

  // ── English output ── no 년 ──────────────────────────────────────────────
  it("en: finite years → X.X yr", () => {
    expect(formatYears(3.0, "en")).toBe("3.0 yr");
  });
  it("en: non-finite → —", () => {
    expect(formatYears(Infinity, "en")).toBe("—");
  });
  it("en: undefined → —", () => {
    expect(formatYears(undefined, "en")).toBe("—");
  });
  it("en: never contains Korean suffix 년", () => {
    expect(formatYears(5.7, "en")).not.toContain("년");
  });
});
