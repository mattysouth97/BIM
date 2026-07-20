// src/lib/report/__tests__/pdf-renderer.test.tsx
// P0-03 — Korean PDF rendering: a CJK font (Noto Sans KR) must be registered
// before any render, and a report containing Hangul must render to a
// non-empty document. Uses pdf().toBlob() — the exact path report-stage.tsx
// drives — with the font sourced from the bundled files in public/fonts/
// (offline-deterministic; no network).

import { describe, it, expect } from "vitest";
import React from "react";
import { pdf, Font } from "@react-pdf/renderer";
import { ReportPDF } from "../pdf-renderer";
import type { ReportData } from "../report-types";

function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    type: "energy-audit",
    buildingName: "서울에너지빌딩",
    buildingAddress: "서울특별시 중구 세종대로 110",
    generatedAt: "2026-07-21",
    fidelityLevel: 1,
    sections: [
      {
        title: "Building Overview",
        titleKo: "건물 개요",
        content: {
          type: "key-value",
          items: [{ label: "에너지효율등급", value: "1++" }],
        },
      },
      {
        title: "Summary",
        titleKo: "요약",
        content: { type: "text", text: "본 보고서는 시뮬레이션 결과를 요약합니다." },
      },
    ],
    disclaimer: "본 보고서는 참고용이며 법적 효력이 없습니다.",
    ...overrides,
  };
}

describe("PDF font registration (P0-03)", () => {
  it("registers the NotoSansKR family before any render", () => {
    // Importing ../pdf-renderer must side-effect-register the CJK font.
    const families = Font.getRegisteredFontFamilies();
    expect(families).toContain("NotoSansKR");
  });

  it("registers both regular and bold weights", () => {
    const registered = Font.getRegisteredFonts() as Record<
      string,
      { sources: { fontWeight?: number }[] }
    >;
    const entry = registered["NotoSansKR"];
    expect(entry).toBeDefined();
    const weights = entry.sources.map((s) => s.fontWeight);
    expect(weights).toContain(400);
    expect(weights).toContain(700);
  });
});

describe("ReportPDF Korean rendering (P0-03)", () => {
  it("renders a report with Hangul building name and sections to a non-empty document", async () => {
    const blob = await pdf(<ReportPDF data={makeReportData()} />).toBlob();
    expect(blob.size).toBeGreaterThan(0);

    // The PDF's font descriptors must reference the embedded NotoSansKR
    // (BaseFont appears uncompressed in the object dictionaries) — proof the
    // Hangul glyphs are drawn with the registered font, not a WinAnsi fallback.
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.includes("NotoSansKR")).toBe(true);
  }, 30000);

  it("still renders an ASCII-only report (Latin coverage)", async () => {
    const blob = await pdf(
      <ReportPDF
        data={makeReportData({
          buildingName: "Seoul Energy Tower",
          buildingAddress: "110 Sejong-daero, Jung-gu, Seoul",
          sections: [
            {
              title: "Building Overview",
              titleKo: "Overview",
              content: { type: "text", text: "ASCII only content." },
            },
          ],
          disclaimer: "For reference only.",
        })}
      />
    ).toBlob();
    expect(blob.size).toBeGreaterThan(0);
  }, 30000);
});
