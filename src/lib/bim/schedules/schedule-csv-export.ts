// src/lib/bim/schedules/schedule-csv-export.ts
// Serialize a ScheduleResult to a UTF-8 BOM CSV string.
// Follows the same pattern as src/lib/export/csv-export.ts:
//   - UTF-8 BOM prefix for Korean Excel compatibility
//   - RFC 4180 field escaping (double-quote wrapping + "" for internal quotes)
//   - Header row derived from ScheduleColumn.label fields
//   - Group-header sentinel rows (rows with _isGroupHeader) are emitted as
//     merged single-column section dividers enclosed in brackets.
// Pure function — no React, no DOM, no side effects.

import type { ScheduleResult, ScheduleRow } from "./schedule-types";

/** UTF-8 BOM prefix for Korean Excel compatibility */
const BOM = "\uFEFF";

/**
 * Escape a single CSV field value per RFC 4180.
 * Wraps in double-quotes when the value contains a comma, double-quote, or newline.
 * Internal double-quotes are escaped by doubling them.
 */
function escapeField(value: string | number | unknown): string {
  const str = String(value ?? "");
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert a ScheduleResult to a UTF-8 BOM CSV string.
 *
 * - First row: column labels from `result.definition.columns`.
 * - Data rows: one row per non-header entry in `result.rows`.
 * - Group-header sentinel rows (`_isGroupHeader: true`) are emitted as a
 *   single bracketed string in column 1, remaining cells empty — this keeps
 *   the column count consistent for spreadsheet import while surfacing groups.
 *
 * @param result - The ScheduleResult produced by `runSchedule`.
 * @returns UTF-8 BOM CSV string ready for `Blob` download or file write.
 */
export function scheduleToCsv(result: ScheduleResult): string {
  const { definition, rows } = result;
  const colCount = definition.columns.length;

  // Header row
  const headerRow = definition.columns
    .map((col) => escapeField(col.label))
    .join(",");

  if (rows.length === 0) {
    return BOM + headerRow + "\n";
  }

  const dataLines = rows.map((row: ScheduleRow) => {
    // Group-header sentinel row
    if (row._isGroupHeader) {
      const groupLabel = escapeField(`[${row._groupValue ?? ""}]`);
      const emptyCells = Array(colCount - 1).fill("").join(",");
      return colCount > 1 ? `${groupLabel},${emptyCells}` : groupLabel;
    }

    // Regular data row: extract value for each column in order
    return definition.columns
      .map((col) => escapeField(row[col.id]))
      .join(",");
  });

  return BOM + [headerRow, ...dataLines].join("\n") + "\n";
}
