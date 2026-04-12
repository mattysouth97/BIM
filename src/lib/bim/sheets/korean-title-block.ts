// src/lib/bim/sheets/korean-title-block.ts
// Pure function that returns @react-pdf/renderer JSX for the Korean GX audit
// standard title block.  The caller is responsible for registering a Korean
// font before rendering (e.g. Noto Sans KR) — this file does not register
// fonts to avoid side-effects at import time.

import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { TitleBlockConfig } from "./sheet-types";

// ---------------------------------------------------------------------------
// Bilingual label maps
// ---------------------------------------------------------------------------

const LABELS = {
  ko: {
    project: "프로젝트명",
    building: "건물명",
    architect: "설계자",
    auditor: "감사자",
    date: "작성일",
    sheet: "도면 번호",
    revision: "개정",
    scale: "척도",
    titleBlockHeader: "건축물 에너지 효율 BIM 플랫폼",
  },
  en: {
    project: "Project",
    building: "Building",
    architect: "Architect",
    auditor: "Auditor",
    date: "Date",
    sheet: "Sheet No.",
    revision: "Rev.",
    scale: "Scale",
    titleBlockHeader: "Building Energy Efficiency BIM Platform",
  },
} as const;

// ---------------------------------------------------------------------------
// Styles (all units in pt — @react-pdf/renderer uses pt, not mm)
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  // Outer frame — fill the bottom-right stamp area
  frame: {
    borderWidth: 1,
    borderColor: "#1a1a1a",
    flexDirection: "column",
    backgroundColor: "#ffffff",
  },

  // Top banner: platform header
  banner: {
    backgroundColor: "#1e3a5f",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  bannerText: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    letterSpacing: 0.5,
  },

  // Main info block: two-column grid rows
  infoSection: {
    flexDirection: "column",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    minHeight: 18,
  },
  rowLast: {
    flexDirection: "row",
    minHeight: 18,
  },
  labelCell: {
    width: 60,
    paddingVertical: 3,
    paddingHorizontal: 5,
    backgroundColor: "#f3f4f6",
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    justifyContent: "center",
  },
  labelText: {
    fontSize: 7,
    color: "#6b7280",
    fontFamily: "Helvetica-Bold",
  },
  valueCell: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 5,
    justifyContent: "center",
  },
  valueText: {
    fontSize: 8,
    color: "#111827",
  },

  // Bottom stamp row: sheet number / revision / date
  stampRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },
  stampCell: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: "#d1d5db",
    alignItems: "center",
  },
  stampCellLast: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 5,
    alignItems: "center",
  },
  stampLabel: {
    fontSize: 6,
    color: "#9ca3af",
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  stampValue: {
    fontSize: 9,
    color: "#111827",
    fontFamily: "Helvetica-Bold",
  },

  // GX accent stripe
  accentStripe: {
    height: 3,
    backgroundColor: "#2563eb",
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a React element (using @react-pdf/renderer primitives) that renders
 * the Korean GX audit standard title block.
 *
 * @param config  Title block content (names, dates, sheet number, etc.)
 * @param locale  Override locale — defaults to config.locale
 */
export function renderKoreanTitleBlock(
  config: TitleBlockConfig,
  locale?: "ko" | "en"
): React.ReactElement {
  const L = LABELS[locale ?? config.locale];

  const mainRows: Array<{ label: string; value: string; last?: boolean }> = [
    { label: L.project, value: config.projectName },
    { label: L.building, value: config.buildingName },
    { label: L.architect, value: config.architectName },
    { label: L.auditor, value: config.auditorName },
  ];

  return React.createElement(
    View,
    { style: s.frame },

    // GX blue accent stripe at top
    React.createElement(View, { style: s.accentStripe }),

    // Platform header banner
    React.createElement(
      View,
      { style: s.banner },
      React.createElement(Text, { style: s.bannerText }, L.titleBlockHeader)
    ),

    // Main info rows
    React.createElement(
      View,
      { style: s.infoSection },
      ...mainRows.map((r, i) =>
        React.createElement(
          View,
          { style: i === mainRows.length - 1 ? s.rowLast : s.row, key: r.label },
          React.createElement(
            View,
            { style: s.labelCell },
            React.createElement(Text, { style: s.labelText }, r.label)
          ),
          React.createElement(
            View,
            { style: s.valueCell },
            React.createElement(Text, { style: s.valueText }, r.value)
          )
        )
      )
    ),

    // Bottom stamp row: sheet / revision / date
    React.createElement(
      View,
      { style: s.stampRow },
      React.createElement(
        View,
        { style: s.stampCell },
        React.createElement(Text, { style: s.stampLabel }, L.sheet),
        React.createElement(Text, { style: s.stampValue }, config.sheetNumber)
      ),
      React.createElement(
        View,
        { style: s.stampCell },
        React.createElement(Text, { style: s.stampLabel }, L.revision),
        React.createElement(Text, { style: s.stampValue }, config.revision)
      ),
      React.createElement(
        View,
        { style: s.stampCellLast },
        React.createElement(Text, { style: s.stampLabel }, L.date),
        React.createElement(Text, { style: s.stampValue }, config.date)
      )
    )
  );
}
