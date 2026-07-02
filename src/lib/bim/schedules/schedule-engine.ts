// src/lib/bim/schedules/schedule-engine.ts
// Pure schedule execution engine.
// Takes a ScheduleDefinition + array of elements → produces a ScheduleResult.
// No React, no DOM, no side effects.

import type {
  ScheduleDefinition,
  ScheduleFilter,
  ScheduleResult,
  ScheduleRow,
} from "./schedule-types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Apply a single filter predicate.
 * Compares extracted string | number values against filter.value.
 * Returns true if the row passes (should be kept).
 */
function applyFilter(
  row: ScheduleRow,
  filter: ScheduleFilter
): boolean {
  const cellValue = row[filter.column];
  if (cellValue === undefined || cellValue === null) return false;

  const { op, value } = filter;

  switch (op) {
    case "eq":
      return String(cellValue) === String(value);
    case "neq":
      return String(cellValue) !== String(value);
    case "gt":
      return Number(cellValue) > Number(value);
    case "lt":
      return Number(cellValue) < Number(value);
    case "contains":
      return String(cellValue)
        .toLowerCase()
        .includes(String(value).toLowerCase());
    default:
      return true;
  }
}

/**
 * Compare two cell values for sorting.
 * Numbers are compared numerically; everything else lexicographically.
 */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "ko", {
    numeric: true,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a schedule definition against an array of raw element objects.
 *
 * Processing pipeline:
 *   1. Extract column values from each element via `column.accessor`.
 *   2. Apply all filters (AND semantics — all filters must pass).
 *   3. Sort by `definition.sortBy` (prefix "-" for descending).
 *   4. Insert group-header sentinel rows when `definition.groupBy` is set.
 *
 * @param definition - The schedule template describing columns/filters/sort.
 * @param elements   - Raw element data (any shape; accessors handle extraction).
 * @returns ScheduleResult with flattened rows ready for rendering or CSV export.
 */
export function runSchedule(
  definition: ScheduleDefinition,
  elements: unknown[]
): ScheduleResult {
  // Step 1 — Extract column values into flat row objects.
  const rawRows: ScheduleRow[] = elements.map((el) => {
    const row: ScheduleRow = {};
    for (const col of definition.columns) {
      try {
        row[col.id] = col.accessor(el);
      } catch {
        row[col.id] = "-";
      }
    }
    return row;
  });

  // Step 2 — Filter (all filters must pass — AND semantics).
  const filters = definition.filters ?? [];
  const filteredRows = filters.length === 0
    ? rawRows
    : rawRows.filter((row) =>
        filters.every((f) => applyFilter(row, f))
      );

  // Step 3 — Sort.
  const sortedRows = [...filteredRows];
  if (definition.sortBy) {
    const descending = definition.sortBy.startsWith("-");
    const colId = descending
      ? definition.sortBy.slice(1)
      : definition.sortBy;

    sortedRows.sort((a, b) => {
      const cmp = compareValues(a[colId], b[colId]);
      return descending ? -cmp : cmp;
    });
  }

  // Step 4 — Group (insert sentinel header rows between groups).
  const rowCount = sortedRows.length;
  let finalRows: ScheduleRow[] = sortedRows;

  if (definition.groupBy) {
    const groupColId = definition.groupBy;
    const grouped: ScheduleRow[] = [];
    let lastGroup: string | undefined;

    for (const row of sortedRows) {
      const groupValue = String(row[groupColId] ?? "");
      if (groupValue !== lastGroup) {
        grouped.push({
          _isGroupHeader: true,
          _groupValue: groupValue,
        });
        lastGroup = groupValue;
      }
      grouped.push(row);
    }
    finalRows = grouped;
  }

  return {
    definition,
    rows: finalRows,
    rowCount,
  };
}
